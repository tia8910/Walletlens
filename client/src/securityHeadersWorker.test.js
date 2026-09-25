import { describe, it, expect, vi, afterEach } from 'vitest'
import worker from '../../workers/security-headers/index.js'

// The route-bound worker in front of walletlens.live used to overwrite the
// CSP from client/public/_headers with an older copy (frame-src 'none'), which
// broke the Buy Me a Coffee widget on the live domain only. It must now leave
// every header the origin already sends alone.

afterEach(() => { vi.unstubAllGlobals() })

describe('the security-headers worker', () => {
  it("keeps the site's own CSP and only fills missing headers", async () => {
    const own = "default-src 'self'; frame-src https://www.buymeacoffee.com"
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { headers: { 'Content-Security-Policy': own } })))
    const res = await worker.fetch(new Request('https://walletlens.live/dashboard'))
    expect(res.headers.get('Content-Security-Policy')).toBe(own)
    expect(res.headers.get('Strict-Transport-Security')).toMatch(/max-age=/)
  })

  it('still adds its CSP when the origin sends none', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')))
    const res = await worker.fetch(new Request('https://walletlens.live/'))
    expect(res.headers.get('Content-Security-Policy')).toMatch(/frame-ancestors 'none'/)
  })
})
