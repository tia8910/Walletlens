import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onRequestGet } from '../../functions/api/icon.js'

// A screen recording showed every holding rendering as the generated letter
// badge. The ladder's sources are jsdelivr, coincap, a DigitalOcean space,
// raw.githubusercontent and a proxy on workers.dev — all of them somewhere a
// filtered resolver blocks, and none of them walletlens.live, which the device
// plainly reaches. So the last hop moves to the edge.

const here = dirname(fileURLToPath(import.meta.url))
const logo = readFileSync(join(here, 'components/CoinLogo.jsx'), 'utf8')

globalThis.caches ??= { default: { match: async () => undefined, put: async () => {} } }
const ctx = (url) => ({ request: new Request(url), waitUntil: () => {} })
const png = (body = 'x') => new Response(body, { status: 200, headers: { 'Content-Type': 'image/png' } })

afterEach(() => { vi.unstubAllGlobals() })

describe('/api/icon', () => {
  it('serves the first source that answers with an image', async () => {
    const tried = []
    vi.stubGlobal('fetch', async (u) => {
      tried.push(u)
      return u.includes('jsdelivr') ? new Response('', { status: 404 }) : png()
    })
    const res = await onRequestGet(ctx('https://walletlens.live/api/icon?sym=btc'))
    expect(res.status).toBe(200)
    expect(tried[0]).toContain('jsdelivr')
    expect(tried[1]).toContain('coincap')
  })

  it('refuses a 200 that is not actually an image', async () => {
    // A CDN answering an HTML error page would otherwise be cached for a year
    // as though it were an icon.
    vi.stubGlobal('fetch', async () => new Response('<html>nope</html>', {
      status: 200, headers: { 'Content-Type': 'text/html' },
    }))
    expect((await onRequestGet(ctx('https://walletlens.live/api/icon?sym=btc'))).status).toBe(404)
  })

  it('is not an open proxy', async () => {
    let called = false
    vi.stubGlobal('fetch', async () => { called = true; return png() })
    const res = await onRequestGet(ctx('https://walletlens.live/api/icon?url=' +
      encodeURIComponent('https://evil.example.com/x.png')))
    expect(called, 'must not fetch a host outside the allowlist').toBe(false)
    expect(res.status).toBe(400)
  })

  it('does fetch an allowlisted url', async () => {
    let seen
    vi.stubGlobal('fetch', async (u) => { seen = u; return png() })
    await onRequestGet(ctx('https://walletlens.live/api/icon?url=' +
      encodeURIComponent('https://coin-images.coingecko.com/coins/1/large/btc.png')))
    expect(seen).toContain('coin-images.coingecko.com')
  })

  it('sanitises the symbol rather than trusting it in a URL', async () => {
    let seen
    vi.stubGlobal('fetch', async (u) => { seen = u; return png() })
    await onRequestGet(ctx('https://walletlens.live/api/icon?sym=' + encodeURIComponent('../../etc/passwd')))
    expect(seen).not.toContain('..')
  })

  it('caches a hit for a year and a miss only briefly', async () => {
    vi.stubGlobal('fetch', async () => png())
    const ok = await onRequestGet(ctx('https://walletlens.live/api/icon?sym=eth'))
    expect(ok.headers.get('cache-control')).toMatch(/immutable/)

    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    const miss = await onRequestGet(ctx('https://walletlens.live/api/icon?sym=zzzz'))
    expect(miss.status).toBe(404)
    expect(miss.headers.get('cache-control')).toMatch(/max-age=3600/)
  })

  it('needs something to work from', async () => {
    expect((await onRequestGet(ctx('https://walletlens.live/api/icon'))).status).toBe(400)
  })
})

describe('the ladder prefers our own origin', () => {
  it('tries /api/icon before any third-party host', () => {
    const stages = logo.slice(logo.indexOf('const STAGES = useMemo'))
    const list = stages.slice(0, stages.indexOf('].filter(Boolean)'))
    expect(list.indexOf('origin:')).toBeLessThan(list.indexOf('jsdelivr:'))
    expect(list.indexOf('origin:')).toBeLessThan(list.indexOf('dproxy:'))
  })

  it('routes the API-provided URL through it too', () => {
    // coin-images.coingecko.com is no more reachable than the rest on a
    // filtered network.
    expect(logo).toMatch(/src=\{`\/api\/icon\?url=\$\{encodeURIComponent\(currentStage\.slice\(10\)\)\}`\}/)
  })

  it('is dispatched by the bundled Pages worker', () => {
    const entry = readFileSync(join(here, '../scripts/pages-worker-entry.js'), 'utf8')
    expect(entry).toMatch(/'\/api\/icon': icon,/)
  })
})
