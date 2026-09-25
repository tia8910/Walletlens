import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onRequestGet, UPSTREAM } from '../../functions/api/bmc.js'

// The Buy Me a Coffee widget: the studio's tag, as given, in index.html.
// /api/bmc relays the same script through the edge; Diagnostics → "support
// widget" asks it when the launcher does not draw, to tell "the device
// cannot reach buymeacoffee" from "nothing can".

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(here, '../index.html'), 'utf8')
const headers = readFileSync(join(here, '../public/_headers'), 'utf8')
const entry = readFileSync(join(here, '../scripts/pages-worker-entry.js'), 'utf8')

function stub(fetchImpl) {
  const store = new Map()
  vi.stubGlobal('caches', { default: { match: async (r) => store.get(r.url), put: async (r, res) => { store.set(r.url, res) } } })
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  return store
}
const call = async () => {
  const pending = []
  const res = await onRequestGet({ request: new Request('https://walletlens.live/api/bmc'), waitUntil: (p) => pending.push(p) })
  await Promise.all(pending)
  return res
}
afterEach(() => { vi.unstubAllGlobals() })

describe('the widget tag', () => {
  const tag = html.match(/<script data-name="BMC-Widget"[^>]*>/)?.[0] || ''
  it('is the studio tag, loading its script through the same-origin relay', () => {
    // Straight from the CDN it drew on the previews but never on walletlens.live.
    expect(tag).toContain('defer src="/api/bmc"')
    expect(tag).toContain('data-id="Walletlens"')
    expect(tag).toContain('data-color="#40DCA5"')
    expect(tag).toContain('data-position="Right" data-x_margin="18" data-y_margin="18"')
  })
  it('may load its script under both CSPs', () => {
    for (const policy of [html, headers]) expect(policy).toMatch(/script-src 'self'/)
  })
  it('records CSP refusals from the first request, for Diagnostics', () => {
    const head = html.slice(html.indexOf('<head>'), html.indexOf('<head>') + 600)
    expect(head).toContain("addEventListener('securitypolicyviolation'")
    expect(readFileSync(join(here, 'pages/Diagnostics.jsx'), 'utf8')).toContain('window.__cspViolations')
  })
  it('stays hidden until onboarding is done and an asset is added', () => {
    const css = readFileSync(join(here, 'index.css'), 'utf8')
    expect(css).toMatch(/html:not\(\.wl-bmc-ready\) #bmc-wbtn,/)
    expect(readFileSync(join(here, 'bmcWidget.js'), 'utf8')).toMatch(/export function initBmcDrag\(\) \{\s+if \(typeof document === 'undefined'\) return\s+watchReady\(\)/)
  })
  it('sits above the bottom bar and chat button inside the app', () => {
    const css = readFileSync(join(here, 'v2.css'), 'utf8')
    expect(css).toMatch(/html\.wl-v2 body:has\(\.wl-bottom-nav\) #bmc-wbtn \{ bottom: calc\(160px/)
    expect(css).toMatch(/html\.wl-v2 body:has\(\.twa-mode\) #bmc-wbtn,/)
  })
  it('lets the widget open its panel under both CSPs', () => {
    for (const policy of [html, headers]) expect(policy).toMatch(/frame-src [^;]*https:\/\/www\.buymeacoffee\.com/)
  })
  it('routes /api/bmc (and /api/candles) in the bundled worker too', () => {
    expect(entry).toContain("'/api/bmc': bmc")
    expect(entry).toContain("'/api/candles': candles")
  })
})

describe('the /api/bmc relay', () => {
  it('serves the widget as JavaScript and caches it', async () => {
    const store = stub(async () => new Response('x'.repeat(5000)))
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('javascript')
    expect(fetch.mock.calls[0][0]).toBe(UPSTREAM)
    expect(store.size).toBe(1)
  })
  it('says what went wrong instead of serving an error page as script', async () => {
    const store = stub(async () => new Response('Forbidden', { status: 403 }))
    const res = await call()
    expect(res.status).toBe(502)
    expect(await res.text()).toContain('upstream 403')
    expect(store.size).toBe(0)
  })
})
