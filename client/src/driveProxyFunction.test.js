import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onRequest } from '../../functions/api/drive/[[path]].js'
import { DRIVE_API, DRIVE_AUTH_HOST, SITE_ORIGIN } from './apiHosts.js'

// Google Drive sign-in, through the edge instead of from the device.
//
// Google's redirect lands on /drive-callback?code=..., the app posts that code
// to the drive-auth worker, and the worker — which holds the client_secret —
// exchanges it. The worker is on workers.dev, the fetch threw on a device
// behind a filtering resolver, and the only thing the person saw was
// "Sign-in did not complete. Try again from Settings.", which then did the
// same thing again. Push, the datasets, the news and the coin icons all failed
// the same way and all have the same fix.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '../../functions/api/drive/[[path]].js'), 'utf8')
const driveJs = readFileSync(join(here, 'googleDrive.js'), 'utf8')
// Built from the constant: apiHosts.js is the only place a backend hostname
// may be spelled, and apiHosts.test.js enforces that.
const WORKER = `https://${DRIVE_AUTH_HOST}`

const call = (path, init = {}) => onRequest({
  request: new Request(`${SITE_ORIGIN}/api/drive/${path}`, init),
  params: { path: path.split('/').filter(Boolean) },
})

afterEach(() => { vi.unstubAllGlobals() })

describe('the drive-auth proxy', () => {
  it('answers the two paths googleDrive.js actually builds', () => {
    expect(DRIVE_API).toBe(`${SITE_ORIGIN}/api/drive`)
    expect(new URL(`${DRIVE_API}/exchange`).pathname).toBe('/api/drive/exchange')
    expect(driveJs).toContain('${AUTH_WORKER}/exchange')
    expect(driveJs).toContain('${AUTH_WORKER}/refresh')
  })

  it('stops naming the worker host in the browser bundle', () => {
    // The literal is what made the sign-in unreachable. If it comes back, the
    // device talks to workers.dev again and the failure returns silently.
    expect(driveJs).not.toContain(DRIVE_AUTH_HOST)
    expect(driveJs).toContain('const AUTH_WORKER = import.meta.env?.VITE_DRIVE_AUTH_URL || DRIVE_API')
  })

  it('forwards the authorization code to the worker unchanged', async () => {
    let seen
    vi.stubGlobal('fetch', async (u, init) => { seen = { u, init }; return new Response('{}', { status: 200 }) })
    await call('exchange', {
      method: 'POST',
      body: '{"code":"4/abc","redirectUri":"https://walletlens.live/drive-callback"}',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(seen.u).toBe(`${WORKER}/exchange`)
    expect(seen.init.method).toBe('POST')
    expect(seen.init.body).toBe('{"code":"4/abc","redirectUri":"https://walletlens.live/drive-callback"}')
    expect(seen.init.headers.get('Content-Type')).toBe('application/json')
  })

  it('forwards a refresh the same way', async () => {
    let seen
    vi.stubGlobal('fetch', async (u) => { seen = u; return new Response('{}') })
    await call('refresh', { method: 'POST', body: '{"refreshToken":"1//x"}' })
    expect(seen).toBe(`${WORKER}/refresh`)
  })

  it('is not an open proxy: anything but those two routes is a 404', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    for (const p of ['', 'health', 'exchange/../evil', 'anything']) {
      const res = await call(p, { method: 'POST', body: '{}' })
      expect(res.status, `/${p} must not be forwarded`).toBe(404)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not leak the visitor cookies or Cloudflare headers upstream', async () => {
    let seen
    vi.stubGlobal('fetch', async (u, init) => { seen = init; return new Response('{}') })
    await call('exchange', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json', Cookie: 'session=secret', 'CF-Connecting-IP': '1.2.3.4' },
    })
    expect(seen.headers.get('Cookie')).toBeNull()
    expect(seen.headers.get('CF-Connecting-IP')).toBeNull()
  })

  it('passes the worker status and body through, refusals included', async () => {
    // googleDrive.js reads data.error_description off a 400 and surfaces it.
    // Flattening the status would throw away the only diagnosis there is.
    vi.stubGlobal('fetch', async () => new Response(
      '{"error":"invalid_grant","error_description":"Code was already redeemed"}', { status: 400 }))
    const res = await call('exchange', { method: 'POST', body: '{}' })
    expect(res.status).toBe(400)
    expect((await res.json()).error_description).toBe('Code was already redeemed')
  })

  it('turns an unreachable worker into a status, never a thrown error', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('connection refused') })
    const res = await call('exchange', { method: 'POST', body: '{}' })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('drive_auth_unreachable')
  })

  it('says nothing about the request it could not send', async () => {
    // The body is a one-time authorization code. No part of it belongs in an
    // error string that the page logs.
    vi.stubGlobal('fetch', async () => { throw new Error('connect ECONNREFUSED 4/the-code') })
    const res = await call('exchange', { method: 'POST', body: '{"code":"4/the-code"}' })
    expect(JSON.stringify(await res.json())).not.toContain('4/the-code')
  })

  it('never caches: these are one-time codes and short-lived tokens', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }))
    const res = await call('refresh', { method: 'POST', body: '{}' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(src).not.toMatch(/max-age/)
  })

  it('targets the host apiHosts.js names, and nothing else', () => {
    // Pages Functions are bundled separately from the app, so the function
    // cannot import the constant. This pins the literal to it instead.
    expect(src).toContain(DRIVE_AUTH_HOST)
    const hosts = [...src.matchAll(/https:\/\/([a-z0-9.-]*workers\.dev)/g)].map((m) => m[1])
    expect([...new Set(hosts)]).toEqual([DRIVE_AUTH_HOST])
  })
})
