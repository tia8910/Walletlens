import { describe, it, expect } from 'vitest'
import worker from '../../workers/drive-auth/index.js'

/**
 * The Drive token proxy's CORS behaviour.
 *
 * Google Drive sign-in failed with a bare "Failed to fetch" on the callback
 * screen. The worker had no CORS handling at all: both endpoints are POSTed
 * with content-type application/json, which is not a CORS-simple content
 * type, so the browser sends a preflight OPTIONS first. That preflight fell
 * through to exchange(), which answered "405 POST required" with no
 * Access-Control-Allow-Origin, and the browser reported the whole exchange as
 * a network failure — so the console pointed away from the missing header.
 *
 * Sign-in could not have worked from any browser since the switch to the auth
 * code flow. These tests are what make that observable without deploying.
 */

const APP = 'https://walletlens.live'

/**
 * A request double.
 *
 * `Origin` is a forbidden header name, so a spec-compliant Request drops it
 * when set by hand — happy-dom does, and the whole point here is what the
 * worker does with that header. The worker touches four things: method, url,
 * headers.get and json, so those are what this provides.
 */
function req(path, { method = 'GET', origin, body } = {}) {
  return {
    method,
    url: `https://walletlens-drive-auth.example.workers.dev${path}`,
    headers: { get: (name) => (name.toLowerCase() === 'origin' ? origin ?? null : null) },
    json: async () => JSON.parse(body ?? 'null'),
  }
}

describe('drive-auth CORS', () => {
  it('answers the preflight before any handler rejects the method', async () => {
    const res = await worker.fetch(
      req('/exchange', { method: 'OPTIONS', origin: APP }),
      {},
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(APP)
    expect(res.headers.get('access-control-allow-headers')).toContain('content-type')
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('allows the origin on a successful response', async () => {
    const res = await worker.fetch(req('/', { origin: APP }), {})
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(APP)
  })

  it('allows the origin on an error response too', async () => {
    // Without the header here, a clean 400 ("missing code") reaches the user
    // as "Failed to fetch" and the actual reason never leaves the worker.
    const res = await worker.fetch(
      req('/exchange', { method: 'POST', origin: APP, body: '{}' }),
      {},
    )
    expect(res.status).toBe(400)
    expect(res.headers.get('access-control-allow-origin')).toBe(APP)
    expect((await res.json()).error).toBe('missing code')
  })

  it('admits a Pages preview deployment, which is where the site is checked', async () => {
    const preview = 'https://98ebb63b.walletlenslive1.pages.dev'
    const res = await worker.fetch(req('/', { origin: preview }), {})
    expect(res.headers.get('access-control-allow-origin')).toBe(preview)
  })

  it('refuses an origin that is not ours', async () => {
    // These endpoints spend the client secret. A code is still bound by Google
    // to this client_id and a registered redirect URI, so a wildcard would not
    // by itself hand anyone tokens — but nothing else should reach them.
    const res = await worker.fetch(
      req('/', { origin: 'https://walletlens.live.evil.example' }),
      {},
    )
    expect(res.headers.get('access-control-allow-origin')).toBe(null)
  })

  it('varies on Origin so one origin\'s response is not replayed for another', async () => {
    const res = await worker.fetch(req('/', { origin: APP }), {})
    expect(res.headers.get('vary')).toContain('Origin')
  })

  it('still refuses a GET on the token endpoints', async () => {
    const res = await worker.fetch(req('/exchange', { origin: APP }), {})
    expect(res.status).toBe(405)
    expect(res.headers.get('access-control-allow-origin')).toBe(APP)
  })
})
