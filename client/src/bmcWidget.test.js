import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onRequestGet, UPSTREAM } from '../../functions/api/bmc.js'

// The Buy Me a Coffee widget: a tag in index.html whose script comes from
// /api/bmc, a same-origin relay, so the page does not depend on the device
// reaching cdnjs.buymeacoffee.com. Diagnostics → "support widget" checks the
// same pieces this does.

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
  it('is in the page, loads from the relay, and runs before DOMContentLoaded', () => {
    expect(tag).toContain('src="/api/bmc"')
    expect(tag).toMatch(/\sdefer\s/)
    expect(tag).toContain('data-id="Walletlens"')
    expect(tag).toContain('data-color="#40DCA5"')
  })
  it('sits above the chat button and bottom bar', () => {
    expect(Number(tag.match(/data-y_margin="(\d+)"/)[1])).toBeGreaterThanOrEqual(150)
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
