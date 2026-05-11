// Service worker — network-first for HTML, cache-first for assets.
// Never cache index.html so users always get the latest app shell.
const SW_VERSION = 'v5'
const STATIC = `walletlens-static-${SW_VERSION}`

// Only cache immutable hashed assets (JS/CSS bundles), not HTML.
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

  // Everything else: network with cache fallback
  e.respondWith(
    fetch(req).then(res => {
      if (res?.ok) caches.open(STATIC).then(c => c.put(req, res.clone()))
      return res
    }).catch(() => caches.match(req))
  )
})
