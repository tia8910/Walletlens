// Minimal stale-while-revalidate service worker. Caches the app shell
// so subsequent loads work offline / instantly. Bump SW_VERSION to
// invalidate the cache on each deploy.
const SW_VERSION = 'v1'
const SHELL = `walletlens-shell-${SW_VERSION}`
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS).catch(() => {})))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// SWR strategy for same-origin GETs only. Network-first with cache fallback;
// successful network responses refresh the cache. Skips API origins so
// price data is always live, never stale-from-SW.
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // never cache 3rd-party APIs/CDNs

  e.respondWith((async () => {
    const cache = await caches.open(SHELL)
    try {
      const fresh = await fetch(req)
      if (fresh && fresh.ok) cache.put(req, fresh.clone())
      return fresh
    } catch {
      const cached = await cache.match(req) || await cache.match('/')
      return cached || new Response('Offline', { status: 503, statusText: 'Offline' })
    }
  })())
})
