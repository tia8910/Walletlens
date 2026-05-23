// Service worker — tiered caching strategy:
// • HTML: always network-first (never stale app shell)
// • /assets/ (hashed JS/CSS): network-first, cache fallback
// • Google Fonts: cache-first (immutable font files, long-lived stylesheet)
// • Price APIs: stale-while-revalidate with 5-min TTL for offline use
// • Everything else: network with cache fallback
const SW_VERSION = 'v122'
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
]

// Static CDN assets (icons, images) — cached indefinitely in STATIC cache
const STATIC_CDN_PATTERNS = [
  'cdn.jsdelivr.net/npm/cryptocurrency-icons',
]

const API_TTL_MS = 5 * 60 * 1000 // 5 minutes

function isPriceApi(url) {
  return PRICE_API_PATTERNS.some(p => url.hostname.includes(p) || url.href.includes(p))
}

function isStaticCdn(url) {
  return STATIC_CDN_PATTERNS.some(p => url.href.includes(p))
}

self.addEventListener('install', e => e.waitUntil(self.skipWaiting()))

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
        .then(res => {
          if (res?.ok) {
            caches.open(STATIC).then(c => c.put(req, res.clone()))
          } else if (res?.status === 404) {
            // Chunk no longer exists — new deployment. Tell all clients to reload.
            self.clients.matchAll({ includeUncontrolled: true }).then(clients =>
              clients.forEach(c => c.postMessage({ type: 'CHUNK_404' }))
            )
          }
          return res
        })
        .catch(() => caches.match(req))
    )
    return
  }

  // ── Google Fonts: cache-first (font files are content-addressed / immutable)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(STATIC).then(async cache => {
        const cached = await cache.match(req)
        if (cached) return cached
        const fresh = await fetch(req)
        if (fresh?.ok) cache.put(req, fresh.clone())
        return fresh
      })
    )
    return
  }

  // ── Static CDN assets (e.g. coin icons): cache-first, indefinitely
  if (isStaticCdn(url)) {
    e.respondWith(
      caches.open(STATIC).then(async cache => {
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

  // ── Same-origin static files (icons, manifest, etc): network with cache fallback
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => { if (res?.ok) caches.open(STATIC).then(c => c.put(req, res.clone())); return res })
        .catch(() => caches.match(req))
    )
  }
})
