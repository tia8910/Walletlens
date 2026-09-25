/**
 * Serverless function — /api/bmc
 * Serves the Buy Me a Coffee widget script from the site's own origin.
 *
 * index.html loads the widget as <script data-name="BMC-Widget" src="/api/bmc">.
 * Relaying it means the page never depends on a device being able to reach
 * cdnjs.buymeacoffee.com (some networks and ad-blocking DNS resolvers drop
 * it), and the CSP's script-src stays 'self' for it. The widget reads its
 * settings from that tag's data-* attributes, so where the code came from
 * does not matter to it.
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
