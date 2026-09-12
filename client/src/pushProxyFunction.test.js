import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onRequest } from '../../functions/api/push/[[path]].js'
import { PUSH_API, PUSH_HOST, SITE_ORIGIN } from './apiHosts.js'

// The last hop, done at the edge instead of on the device.
//
// A connection check from the app had every *.workers.dev host throwing
// "Failed to fetch" on a phone that had just loaded the site — a DNS or ISP
// blocklist, which nothing in the app can fix. The block is on the device's
// resolver, not on Cloudflare's, so the browser talks to walletlens.live and
// the edge talks to workers.dev.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '../../functions/api/push/[[path]].js'), 'utf8')
// Built from the constant rather than written out: apiHosts.js is the only
// place a backend hostname may be spelled, and apiHosts.test.js enforces it.
const WORKER = `https://${PUSH_HOST}`

const call = (path, init = {}) => onRequest({
  request: new Request(`${SITE_ORIGIN}/api/push/${path}`, init),
  params: { path: path.split('?')[0].split('/').filter(Boolean) },
})

afterEach(() => { vi.unstubAllGlobals() })

describe('the push proxy', () => {
  it('answers the path the client actually builds', () => {
    // PUSH_API + '/subscribe' has to land on this function's route.
    expect(PUSH_API).toBe(`${SITE_ORIGIN}/api/push`)
    expect(new URL(`${PUSH_API}/subscribe`).pathname).toBe('/api/push/subscribe')
  })

  it('forwards the method, the path and the query to the worker', async () => {
    let seen
    vi.stubGlobal('fetch', async (u, init) => { seen = { u, init }; return new Response('{}', { status: 200 }) })
    await onRequest({
      request: new Request(`${SITE_ORIGIN}/api/push/status?endpoint=abc`),
      params: { path: ['status'] },
    })
    expect(seen.u).toBe(`${WORKER}/status?endpoint=abc`)
    expect(seen.init.method).toBe('GET')
  })

  it('sends the site origin, so the worker allowlist matches', async () => {
    let seen
    vi.stubGlobal('fetch', async (u, init) => { seen = init; return new Response('{}') })
    await call('subscribe', { method: 'POST', body: '{"transport":"fcm"}', headers: { 'Content-Type': 'text/plain' } })
    expect(seen.headers.get('Origin')).toBe(SITE_ORIGIN)
    expect(seen.body).toBe('{"transport":"fcm"}')
  })

  it('does not leak the visitor’s cookies or Cloudflare headers upstream', async () => {
    let seen
    vi.stubGlobal('fetch', async (u, init) => { seen = init; return new Response('{}') })
    await call('subscribe', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'text/plain', Cookie: 'session=secret', 'CF-Connecting-IP': '1.2.3.4' },
    })
    expect(seen.headers.get('Cookie')).toBeNull()
    expect(seen.headers.get('CF-Connecting-IP')).toBeNull()
  })

  it('passes the worker’s own status through, refusals included', async () => {
    // /subscribe answers 400 missing_subscription and the app reasons about
    // that code. Flattening it to 200 or 500 would break the toggle's message.
    vi.stubGlobal('fetch', async () => new Response('{"error":"missing_subscription"}', { status: 400 }))
    const res = await call('subscribe', { method: 'POST', body: '{}' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'missing_subscription' })
  })

  it('turns an unreachable worker into a status, never a thrown error', async () => {
    // A TypeError in the page is precisely what made this take a night to
    // find. It must not come back one layer up.
    vi.stubGlobal('fetch', async () => { throw new Error('connection refused') })
    const res = await call('health')
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('push_unreachable')
  })

  it('maps a bare /api/push to the worker root', async () => {
    let seen
    vi.stubGlobal('fetch', async (u) => { seen = u; return new Response('{}') })
    await onRequest({ request: new Request(`${SITE_ORIGIN}/api/push`), params: {} })
    expect(seen).toBe(`${WORKER}/`)
  })

  it('sends no body on a GET', async () => {
    let seen
    vi.stubGlobal('fetch', async (u, init) => { seen = init; return new Response('{}') })
    await call('health')
    expect(seen.body).toBeUndefined()
  })

  it('is never cached \u2014 a device status is not a static asset', () => {
    expect(src).toMatch(/'Cache-Control': 'no-store'/)
  })

  it('targets the host apiHosts.js names, and nothing else', () => {
    // The function cannot import the constant: Pages Functions are bundled
    // separately from the app, and reaching into client/src from here would
    // make a push registration depend on that bundling working. So the
    // literal stays, and this pins it to the constant instead.
    expect(src).toContain(PUSH_HOST)
  })
})
