/**
 * Serverless function — /api/icon?sym=btc[&url=…]
 *
 * Coin icons, fetched at the edge and served from walletlens.live.
 *
 * WHY
 * CoinLogo walks a ladder of image sources and every one of them is somewhere
 * else: jsdelivr, coincap, a DigitalOcean space, raw.githubusercontent, and a
 * proxy on workers.dev. On a device behind a filtering resolver — the same one
 * that made every workers.dev request fail earlier — all of them fail, the
 * ladder runs out, and every holding renders as the generated letter badge.
 * A screen recording of that is what this exists to fix: WL, AR, AP on
 * coloured discs, for assets whose logos are perfectly available from any
 * unfiltered network.
 *
 * The device reaches walletlens.live. So the last hop happens here instead,
 * from Cloudflare's edge, which has no such trouble — exactly the arrangement
 * /api/push and the dataset routes already use.
 *
 * Cached hard at the edge: an icon for a given symbol does not change, and
 * this must not become a per-render fetch.
 */

// Where an icon may come from. An allowlist, not an open proxy: this endpoint
// is reachable by anyone and must not be usable to fetch arbitrary URLs.
const ALLOWED_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'assets.coincap.io',
  'lcw.nyc3.cdn.digitaloceanspaces.com',
  'raw.githubusercontent.com',
  'coin-images.coingecko.com',
  'assets.coingecko.com',
])

// Tried in order. The first that answers 200 wins.
const sources = (sym) => [
  `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${sym}.svg`,
  `https://assets.coincap.io/assets/icons/${sym}@2x.png`,
  `https://lcw.nyc3.cdn.digitaloceanspaces.com/production/currencies/64/${sym}.webp`,
  `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${sym}.png`,
]

const YEAR = 'public, max-age=31536000, immutable'

export async function onRequestGet(context) {
  const { request } = context
  const url = new URL(request.url)

  const sym = (url.searchParams.get('sym') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24)
  const want = url.searchParams.get('url') || ''

  const candidates = []
  if (want) {
    try {
      const u = new URL(want)
      if (u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname)) candidates.push(u.toString())
    } catch { /* not a URL; fall through to the symbol */ }
  }
  if (sym) candidates.push(...sources(sym))
  if (!candidates.length) return new Response('sym or url required', { status: 400 })

  // One edge cache entry per resolved request, shared by every visitor.
  const cache = caches.default
  const cacheKey = new Request(`https://icon.cache/${sym || 'x'}?u=${encodeURIComponent(want)}`, { method: 'GET' })
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  for (const src of candidates) {
    try {
      const res = await fetch(src, {
        headers: { Accept: 'image/*' },
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) continue
      const type = res.headers.get('content-type') || ''
      // A CDN that answers an HTML error page with 200 would otherwise be
      // cached for a year as though it were an icon.
      if (!type.startsWith('image/')) continue

      const out = new Response(res.body, {
        status: 200,
        headers: { 'Content-Type': type, 'Cache-Control': YEAR },
      })
      context.waitUntil(cache.put(cacheKey, out.clone()))
      return out
    } catch { /* try the next source */ }
  }

  // Short cache on a miss: a symbol with no icon today may have one next week,
  // and the caller falls back to its generated badge either way.
  return new Response('no icon', { status: 404, headers: { 'Cache-Control': 'public, max-age=3600' } })
}
