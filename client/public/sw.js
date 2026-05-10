// Service worker — network-first for HTML, cache-first for assets.
// Never cache index.html so users always get the latest app shell.
const SW_VERSION = 'v5'
const STATIC = `walletlens-static-${SW_VERSION}`

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
      fetch(req).catch(async () => {
        const cached = await caches.match('/')
        return cached ?? new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      })
    )
    return
  }

  // Hashed assets (JS/CSS with content hash in filename): cache-first
  if (url.pathname.startsWith('/assets/')) {
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

  // Everything else: network with cache fallback
  e.respondWith(
    fetch(req).then(res => {
      if (res?.ok) caches.open(STATIC).then(c => c.put(req, res.clone()))
      return res
    }).catch(async () => {
      const cached = await caches.match(req)
      return cached ?? new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    })
  )
})
