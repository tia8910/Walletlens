// Service worker — tiered caching strategy:
// • HTML: always network-first (never stale app shell)
// • /assets/ (hashed JS/CSS): cache-first (content-hash guarantees immutability)
// • Google Fonts: cache-first (immutable font files, long-lived stylesheet)
// • Price APIs: stale-while-revalidate with 5-min TTL for offline use
// • Everything else: network with cache fallback
const SW_VERSION = 'v159'
const STATIC = `walletlens-static-${SW_VERSION}`
const API_CACHE = `walletlens-api-${SW_VERSION}`
// CDN assets (coin icons, Google Fonts) are content-addressed and never change,
// so they live in a version-independent cache that survives SW updates.
// Without this, every deployment causes ~100 coin icons to be re-fetched.
const CDN_CACHE = 'walletlens-cdn-v1'

// Static files to pre-cache at install time for instant first-load.
// stock-prices.json is updated every 30 min by GitHub Actions; caching it
// avoids a network round-trip on the first price fetch after install.
const PRECACHE_URLS = ['/news.json', '/stock-prices.json', '/manifest.webmanifest']

// Price/market API origins we want to cache for offline fallback
const PRICE_API_PATTERNS = [
  'api.coingecko.com',
  'api.binance.com',
  'rest.coincap.io',
  'api.coinpaprika.com',
  // Metals & FX
  'api.gold-api.com',
  'open.er-api.com',
  'api.frankfurter.app',
  // Stock price sources
  'stooq.com',
  'min-api.cryptocompare.com',
  'blockchain.info',
  // Deno proxy — first CORS proxy tried for every external price fetch;
  // caching its responses means the SW serves repeat requests from cache
  // rather than round-tripping through the proxy on every price poll.
  'walletlens-voice-parse.tia8910.deno.net',
]

// Static CDN assets (coin icons, images) — cached indefinitely in version-independent
// CDN cache. These are content-addressed by symbol and never change, so they should
// survive SW updates rather than being busted every deploy like the price API cache.
const STATIC_CDN_PATTERNS = [
  'cdn.jsdelivr.net/npm/cryptocurrency-icons',
  // CoinCap icon CDN — primary coin logo source
  'assets.coincap.io',
  // LiveCoinWatch CDN — first fallback for coin logos
  'lcw.nyc3.cdn.digitaloceanspaces.com',
  // spothq GitHub CDN — second fallback for coin logos
  'raw.githubusercontent.com/spothq/cryptocurrency-icons',
]

const API_TTL_MS = 5 * 60 * 1000    // 5 minutes (price APIs)
const NEWS_TTL_MS = 10 * 60 * 1000  // 10 min (news.json RSS feed)
const STOCK_TTL_MS = 25 * 60 * 1000 // 25 min (stock-prices.json — matches GH Actions interval)

// Set gives O(1) exact-hostname lookup; only fall through to subdomain scan
// when no direct hit — avoids O(n) .some() on every intercepted request.
const PRICE_API_SET = new Set(PRICE_API_PATTERNS)
function isPriceApi(url) {
  const h = url.hostname
  if (PRICE_API_SET.has(h)) return true
  // Handle subdomains: www.stooq.com → parent 'stooq.com' must be in the set.
  const dot = h.indexOf('.')
  return dot !== -1 && PRICE_API_SET.has(h.slice(dot + 1))
}

function isStaticCdn(url) {
  return STATIC_CDN_PATTERNS.some(p => url.href.includes(p))
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC)
      .then(cache => Promise.all(PRECACHE_URLS.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  )
})

const API_CACHE_MAX = 120 // max entries before oldest are evicted
const CDN_CACHE_MAX = 500 // coin icons: large but bounded (one per asset)

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== STATIC && k !== API_CACHE && k !== CDN_CACHE).map(k => caches.delete(k))
      ))
      .then(async () => {
        // Trim API cache to prevent unbounded growth across long sessions.
        const cache = await caches.open(API_CACHE)
        const keys = await cache.keys()
        if (keys.length > API_CACHE_MAX) {
          await Promise.all(keys.slice(0, keys.length - API_CACHE_MAX).map(k => cache.delete(k)))
        }
      })
      .then(async () => {
        // Trim CDN cache (coin icons, Google Fonts) — unbounded without a cap
        // as users add new assets over time.
        const cdnCache = await caches.open(CDN_CACHE)
        const cdnKeys = await cdnCache.keys()
        if (cdnKeys.length > CDN_CACHE_MAX) {
          await Promise.all(cdnKeys.slice(0, cdnKeys.length - CDN_CACHE_MAX).map(k => cdnCache.delete(k)))
        }
      })
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // ── HTML: always network-first, offline fallback to cached shell
  if (req.headers.get('accept')?.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(req)
        .then(res => { if (res?.ok) caches.open(STATIC).then(c => c.put(req, res.clone())); return res })
        .catch(() => caches.match(req) || caches.match('/') || new Response('Offline', { status: 503 }))
    )
    return
  }

  // ── Hashed assets (/assets/): cache-first (content-hash guarantees immutability)
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(STATIC).then(async cache => {
        const cached = await cache.match(req)
        if (cached) return cached
        try {
          const fresh = await fetch(req)
          if (fresh?.ok) {
            cache.put(req, fresh.clone())
          } else if (fresh?.status === 404) {
            // Chunk no longer exists — new deployment. Tell all clients to reload.
            self.clients.matchAll({ includeUncontrolled: true }).then(clients =>
              clients.forEach(c => c.postMessage({ type: 'CHUNK_404' }))
            )
          }
          return fresh
        } catch {
          return new Response('Asset unavailable offline', { status: 503 })
        }
      })
    )
    return
  }

  // ── Google Fonts: cache-first in version-independent CDN cache
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CDN_CACHE).then(async cache => {
        const cached = await cache.match(req)
        if (cached) return cached
        const fresh = await fetch(req)
        if (fresh?.ok) cache.put(req, fresh.clone())
        return fresh
      })
    )
    return
  }

  // ── Static CDN assets (e.g. coin icons): cache-first in version-independent CDN cache
  if (isStaticCdn(url)) {
    e.respondWith(
      caches.open(CDN_CACHE).then(async cache => {
        const cached = await cache.match(req)
        if (cached) return cached
        const fresh = await fetch(req)
        if (fresh?.ok) cache.put(req, fresh.clone())
        return fresh
      })
    )
    return
  }

  // ── Price/market APIs: stale-while-revalidate with TTL
  if (isPriceApi(url)) {
    e.respondWith(
      caches.open(API_CACHE).then(async cache => {
        const cached = await cache.match(req)
        const now = Date.now()

        // Serve cached if fresh enough
        if (cached) {
          const cachedAt = parseInt(cached.headers.get('sw-cached-at') || '0', 10)
          if (now - cachedAt < API_TTL_MS) return cached
        }

        // Try network, update cache
        try {
          const fresh = await fetch(req)
          if (fresh?.ok) {
            // Clone with custom header to track cache time
            const headers = new Headers(fresh.headers)
            headers.set('sw-cached-at', String(now))
            const body = await fresh.clone().arrayBuffer()
            cache.put(req, new Response(body, { status: fresh.status, statusText: fresh.statusText, headers }))
          }
          return fresh
        } catch {
          // Offline — return stale cache if available, regardless of TTL
          return cached || new Response(JSON.stringify({ error: 'offline' }), {
            status: 503, headers: { 'Content-Type': 'application/json' }
          })
        }
      })
    )
    return
  }

  // ── Periodically-updated same-origin JSON feeds: stale-while-revalidate
  // news.json refreshes via RSS worker; stock-prices.json via GitHub Actions.
  // Serve stale instantly then revalidate in background for fast perceived UX.
  const feedTtl = url.pathname === '/news.json' ? NEWS_TTL_MS
    : url.pathname === '/stock-prices.json' ? STOCK_TTL_MS
    : null
  if (url.origin === self.location.origin && feedTtl !== null) {
    e.respondWith(
      caches.open(API_CACHE).then(async cache => {
        const cached = await cache.match(req)
        const now = Date.now()
        async function revalidate() {
          try {
            const fresh = await fetch(req)
            if (fresh?.ok) {
              const headers = new Headers(fresh.headers)
              headers.set('sw-cached-at', String(now))
              const body = await fresh.clone().arrayBuffer()
              cache.put(req, new Response(body, { status: fresh.status, statusText: fresh.statusText, headers }))
            }
            return fresh
          } catch { return null }
        }
        if (cached) {
          const age = now - parseInt(cached.headers.get('sw-cached-at') || '0', 10)
          if (age < feedTtl) return cached  // fresh — skip network
          revalidate()                      // stale — serve immediately, refresh in background
          return cached
        }
        return await revalidate() || new Response('{}', { status: 503 })
      })
    )
    return
  }

  // ── Same-origin static files (icons, manifest, etc): network with cache fallback
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => { if (res?.ok) caches.open(STATIC).then(c => c.put(req, res.clone())); return res })
        .catch(() => caches.match(req))
    )
  }
})
