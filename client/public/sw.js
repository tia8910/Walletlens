// Service worker — network-first for HTML, cache-first for hashed assets,
// stale-while-revalidate for semi-static JSON (news, stock prices).
// Never cache index.html so users always get the latest app shell.
const SW_VERSION = 'v6'
const STATIC = `walletlens-static-${SW_VERSION}`

// Semi-static JSON files updated by CI on a schedule. Serve from cache
// instantly while revalidating in the background (stale-while-revalidate).
const SEMI_STATIC = new Set(['/news.json', '/stock-prices.json'])

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== STATIC).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Always fetch HTML fresh — never serve from cache
  if (req.headers.get('accept')?.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(req).catch(() => caches.match('/') || new Response('Offline', { status: 503 }))
    )
    return
  }

  // Hashed assets (JS/CSS with content hash in filename): network-first so
  // new deployments always serve fresh chunks; fall back to cache if offline.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      fetch(req).then(fresh => {
        if (fresh?.ok) caches.open(STATIC).then(c => c.put(req, fresh.clone()))
        return fresh
      }).catch(() => caches.match(req))
    )
    return
  }

  // Semi-static JSON files (news.json, stock-prices.json): stale-while-revalidate.
  // Return cached version immediately (fast), then update cache in the background.
  if (SEMI_STATIC.has(url.pathname)) {
    e.respondWith(
      caches.open(STATIC).then(cache =>
        cache.match(req).then(cached => {
          const revalidate = fetch(req).then(fresh => {
            if (fresh?.ok) cache.put(req, fresh.clone())
            return fresh
          }).catch(() => cached)
          return cached || revalidate
        })
      )
    )
    return
  }

  // Everything else: network with cache fallback
  e.respondWith(
    fetch(req).then(res => {
      if (res?.ok) caches.open(STATIC).then(c => c.put(req, res.clone()))
      return res
    }).catch(() => caches.match(req))
  )
})
