/**
 * Serverless function — /api/bmc
 * Serves the Buy Me a Coffee widget script from the site's own origin.
 *
 * index.html loads the widget straight from cdnjs.buymeacoffee.com. This
 * fetches the same script through the edge, so the Diagnostics page can tell
 * "this device cannot reach buymeacoffee" from "nothing can". It can also
 * stand in as the tag's src (the widget reads its settings from the tag's
 * data-* attributes, not from where the code came from) if some networks
 * turn out to block the CDN.
 *
 * The Diagnostics page ("support widget" row) calls this route directly and
 * reports what it returned when the button fails to draw.
 */

export const UPSTREAM = 'https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js'
const CACHE_SECONDS = 86400

export async function onRequestGet(context) {
  const cacheKey = new Request('https://bmc.cache/widget.prod.min.js', { method: 'GET' })
  const cache = caches.default
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  let res
  try {
    res = await fetch(UPSTREAM, { signal: AbortSignal.timeout(6000) })
  } catch (err) {
    return new Response(`upstream unreachable: ${err?.name || 'error'}`, { status: 502, headers: { 'Content-Type': 'text/plain' } })
  }
  const body = res.ok ? await res.text() : ''
  // A real widget is tens of KB of JavaScript; anything tiny is an error page.
  if (!res.ok || body.length < 500) {
    return new Response(`upstream ${res.status}, ${body.length} bytes`, { status: 502, headers: { 'Content-Type': 'text/plain' } })
  }
  const response = new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  })
  context.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}
