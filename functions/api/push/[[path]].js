/**
 * Serverless function — /api/push/*
 *
 * Hands every push-service request to walletlens-push, from the edge.
 *
 * WHY THIS EXISTS
 * A connection check run from the app returned this:
 *
 *     data worker (control): threw — Failed to fetch
 *     push worker GET:       threw — Failed to fetch
 *     push worker POST:      threw — Failed to fetch
 *
 * All three, on a device that had just loaded the site. Every client request
 * went to a *.workers.dev hostname, and workers.dev is abused for phishing
 * often enough to sit on plenty of DNS and ISP blocklists — a machine that
 * deploys the worker resolves it, a phone on a filtered resolver does not.
 * From inside a browser that is a bare TypeError, indistinguishable from every
 * other cause, which is why it survived a night of CORS, preflight, allowlist,
 * D1 and VAPID theories about a request that never reached the host.
 *
 * The block is on the DEVICE's resolver, not on Cloudflare's edge. So this
 * function does the last hop instead: the browser talks to walletlens.live,
 * which it plainly reaches and which already serves /api/stocks the same way,
 * and the edge talks to workers.dev, which it has no trouble with.
 *
 * Same origin as the page, so CORS, the preflight and the worker's origin
 * allowlist are all out of the picture for the browser.
 *
 * Note this is a FALLBACK, not the only path: workers/push/wrangler.toml also
 * declares a route on walletlens.live/api/push/*, and a Worker route wins over
 * Pages. When that route is applied the worker answers directly and this file
 * never runs; index.js strips the prefix so both doors reach the same
 * handlers. Until it is applied — a script upload carries bindings and crons
 * but never creates routes — Pages served /api/push/subscribe as a static
 * asset and refused the POST with 405, which is exactly what the toggle said.
 */

// The worker's own hostname. Reached from Cloudflare's edge, never from a
// device, which is the whole point of this file.
const PUSH_ORIGIN = 'https://walletlens-push.tarek-abdelhameed.workers.dev'

const json = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

export async function onRequest(context) {
  const { request, params } = context
  const url = new URL(request.url)

  // [[path]] is a catch-all: /api/push/subscribe gives ['subscribe'], and
  // /api/push on its own gives undefined, which maps to the worker's root —
  // its health route, and the right answer for a bare visit.
  const rest = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '')
  const target = `${PUSH_ORIGIN}/${rest}${url.search}`

  // A deliberately small header set, built rather than forwarded. Passing the
  // original Headers sends Host, CF-* and cookies to another origin for no
  // reason; the worker reads the content type, the origin and nothing else.
  const headers = new Headers({ Accept: 'application/json' })
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)
  // The site's own origin, which is on the worker's allowlist. Without it the
  // worker would answer an allowlist fallback that matches nothing.
  headers.set('Origin', url.origin)

  const method = request.method
  // Read the body rather than streaming it: a streamed request body needs
  // duplex support that is not worth depending on for payloads this size.
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.text()

  let res
  try {
    res = await fetch(target, { method, headers, body })
  } catch (e) {
    // 502, not a thrown error. The app can read a status and say something
    // true about it; a TypeError in the page is what cost this whole
    // diagnosis, and it must not be reintroduced one layer up.
    return json({ error: 'push_unreachable', detail: String(e?.message || e).slice(0, 160) }, 502)
  }

  // Pass the worker's own status and body straight through — /subscribe's 400
  // codes and /status's JSON are what the app reasons about. The worker's CORS
  // headers are dropped: this is same-origin now and they mean nothing here.
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
