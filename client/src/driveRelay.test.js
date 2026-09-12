import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onRequest } from '../../functions/api/gdrive/[[path]].js'
import { GDRIVE_API, SITE_ORIGIN } from './apiHosts.js'

// Drive's own API, through the site, for a device that cannot reach it.
//
// /diag on the reporting device: same-origin answered in ~430ms, every
// cross-origin host failed in 3-5ms. Nothing reaches DNS in 4ms, so those
// requests never left the phone — the device refuses cross-origin outright,
// whatever the host. Four of the five things that had broken this month were
// already behind walletlens.live; Drive's API was the one left outside.
//
// The relay is a fallback and must stay one: on a working network the token
// goes to Google and nowhere else.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '../../functions/api/gdrive/[[path]].js'), 'utf8')

const call = (path, init = {}) => onRequest({
  request: new Request(`${SITE_ORIGIN}/api/gdrive/${path}`, init),
  params: { path: path.split('?')[0].split('/').filter(Boolean) },
})

const validToken = () => localStorage.setItem('wl_drive_token', JSON.stringify({
  token: 'at-1', expiry: Date.now() + 30 * 60_000,
}))

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('the Drive relay function', () => {
  it('forwards the three Drive paths the app actually calls', async () => {
    for (const p of ['drive/v3/files', 'drive/v3/files/abc123', 'upload/drive/v3/files']) {
      let seen
      vi.stubGlobal('fetch', async (u) => { seen = u; return new Response('{}') })
      const res = await call(p, { headers: { Authorization: 'Bearer at-1' } })
      expect(res.status, p).toBe(200)
      expect(seen).toBe(`https://www.googleapis.com/${p}`)
    }
  })

  it('is not an open proxy', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    for (const p of ['', 'oauth2/v4/token', 'drive/v3/about', 'drive/v3/files/a/b', 'gmail/v1/users']) {
      const res = await call(p)
      expect(res.status, `/${p} must not be forwarded`).toBe(404)
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('carries the credential through, because Drive cannot work without it', async () => {
    let seen
    vi.stubGlobal('fetch', async (_u, init) => { seen = init; return new Response('{}') })
    await call('drive/v3/files', { headers: { Authorization: 'Bearer at-1' } })
    expect(seen.headers.get('authorization')).toBe('Bearer at-1')
  })

  it('never forwards the visitor cookies or IP alongside it', async () => {
    // An authenticated call that also carries a Cookie header is how a proxy
    // turns into a tracking hop.
    let seen
    vi.stubGlobal('fetch', async (_u, init) => { seen = init; return new Response('{}') })
    await call('drive/v3/files', {
      headers: { Authorization: 'Bearer at-1', Cookie: 'session=secret', 'CF-Connecting-IP': '1.2.3.4' },
    })
    expect(seen.headers.get('cookie')).toBeNull()
    expect(seen.headers.get('cf-connecting-ip')).toBeNull()
  })

  it('keeps the query string, which carries the whole Drive query', async () => {
    let seen
    vi.stubGlobal('fetch', async (u) => { seen = u; return new Response('{}') })
    await onRequest({
      request: new Request(`${SITE_ORIGIN}/api/gdrive/drive/v3/files?q=name%3D'x'&spaces=drive`),
      params: { path: ['drive', 'v3', 'files'] },
    })
    // The parser re-encodes ' as %27, which decodes to the same query. What
    // matters is that every parameter survives the hop.
    const q = new URL(seen).searchParams
    expect(seen.startsWith('https://www.googleapis.com/drive/v3/files?')).toBe(true)
    expect(q.get('q')).toBe("name='x'")
    expect(q.get('spaces')).toBe('drive')
  })

  it('passes a 401 through, or refresh-and-retry never runs', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":"invalid"}', { status: 401 }))
    const res = await call('drive/v3/files')
    expect(res.status).toBe(401)
  })

  it('says nothing about a request it could not send', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('boom at Bearer at-1') })
    const res = await call('drive/v3/files', { headers: { Authorization: 'Bearer at-1' } })
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('at-1')
  })

  it('never caches a backup or a listing', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}'))
    const res = await call('drive/v3/files')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(src).not.toMatch(/max-age/)
  })

  it('has exactly one upstream, spelled once', () => {
    const hosts = [...src.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1])
    expect([...new Set(hosts)]).toEqual(['www.googleapis.com'])
  })
})

describe('choosing direct or relayed', () => {
  it('goes straight to Google when the device can manage it', async () => {
    validToken()
    const { findBackup } = await import('./googleDrive')
    const seen = []
    vi.stubGlobal('fetch', async (u) => { seen.push(u); return new Response('{"files":[]}') })
    await findBackup()
    // The token stays off every server but Google's on a working network.
    expect(seen[0]).toContain('https://www.googleapis.com/')
    expect(seen.join()).not.toContain('/api/gdrive')
  })

  it('falls back to the relay when the device cannot', async () => {
    validToken()
    const { findBackup } = await import('./googleDrive')
    const seen = []
    vi.stubGlobal('fetch', async (u) => {
      seen.push(u)
      if (String(u).startsWith('https://www.googleapis.com')) throw new TypeError('Failed to fetch')
      return new Response('{"files":[]}')
    })
    await findBackup()
    expect(seen[0]).toContain('https://www.googleapis.com/')
    expect(seen[1]).toContain(`${GDRIVE_API}/drive/v3/files`)
  })

  it('stops paying the failure on every call once it knows', async () => {
    validToken()
    const { findBackup } = await import('./googleDrive')
    const seen = []
    vi.stubGlobal('fetch', async (u) => {
      seen.push(String(u))
      if (String(u).startsWith('https://www.googleapis.com')) throw new TypeError('Failed to fetch')
      return new Response('{"files":[]}')
    })
    await findBackup()
    await findBackup()
    const direct = seen.filter((u) => u.startsWith('https://www.googleapis.com'))
    expect(direct, 'retried the dead route on the second call').toHaveLength(1)
  })

  it('does not remember a relay that failed too', async () => {
    // Both paths failing is a network problem, not proof that the direct route
    // is the broken one — and pinning to the relay on that evidence would keep
    // a healthy device on the slow path for half a day.
    validToken()
    const { findBackup } = await import('./googleDrive')
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch') })
    await findBackup().catch(() => {})
    expect(localStorage.getItem('wl_drive_relay_until')).toBeNull()
  })

  it('forgets after half a day, because a network is not a permanent fact', async () => {
    validToken()
    localStorage.setItem('wl_drive_relay_until', String(Date.now() - 1000))
    const { findBackup } = await import('./googleDrive')
    const seen = []
    vi.stubGlobal('fetch', async (u) => { seen.push(String(u)); return new Response('{"files":[]}') })
    await findBackup()
    expect(seen[0]).toContain('https://www.googleapis.com/')
  })
})
