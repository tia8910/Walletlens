// Service worker — tiered caching strategy:
// • HTML: always network-first (never stale app shell)
// • /assets/ (hashed JS/CSS): network-first, cache fallback
// • Price APIs: stale-while-revalidate with 5-min TTL for offline use
// • Everything else: network with cache fallback
const SW_VERSION = 'v80'
const STATIC = `walletlens-static-${SW_VERSION}`
const API_CACHE = `walletlens-api-${SW_VERSION}`

// Price/market API origins we want to cache for offline fallback
const PRICE_API_PATTERNS = [
  'api.coingecko.com',
  'api.binance.com',
  'rest.coincap.io',
  'api.coinpaprika.com',
  'assets.coincap.io',
  'lcw.nyc3.cdn.digitaloceanspaces.com',
  'cdn.jsdelivr.net/npm/cryptocurrency-icons',
]

const API_TTL_MS = 5 * 60 * 1000 // 5 minutes

function isPriceApi(url) {
  return PRICE_API_PATTERNS.some(p => url.hostname.includes(p) || url.href.includes(p))
}

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== STATIC && k !== API_CACHE).map(k => caches.delete(k))
      ))
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
        .then(res => { caches.open(STATIC).then(c => c.put(req, res.clone())); return res })
        .catch(() => caches.match(req) || caches.match('/') || new Response('Offline', { status: 503 }))
    )
    return
  }

  // ── Hashed assets (/assets/): network-first, long-lived cache fallback
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    e.respondWith(
      fetch(req)
        .then(res => { if (res?.ok) caches.open(STATIC).then(c => c.put(req, res.clone())); return res })
        .catch(() => caches.match(req))
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

  // ── Same-origin static files (icons, manifest, etc): network with cache fallback
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => { if (res?.ok) caches.open(STATIC).then(c => c.put(req, res.clone())); return res })
        .catch(() => caches.match(req))
    )
  }
})
