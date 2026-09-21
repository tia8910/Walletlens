/**
 * Serverless function — /api/drive/*
 *
 * The Google Drive token worker, reached through walletlens.live.
 *
 * WHY
 * Google's OAuth redirect lands on /drive-callback with ?code=…, and the app
 * POSTs that code to the drive-auth worker to be exchanged for tokens — the
 * worker holds the client_secret, which is the whole reason it exists. That
 * worker lives on workers.dev, and on a device behind a filtering resolver the
 * POST simply never completes: the fetch throws, the catch fires, and the
 * screen reads "Sign-in did not complete. Try again from Settings." Trying
 * again from Settings does the same thing, for the same reason.
 *
 * This is the fifth thing to fail that way — push registration, the datasets,
 * the news, the coin icons — and it has the same fix. The device reaches
 * walletlens.live; the edge reaches workers.dev.
 *
 * Not an open proxy: the upstream is a fixed constant and only the two routes
 * the worker actually answers are forwarded.
 */

// Must match DRIVE_AUTH_HOST in client/src/apiHosts.js.
const DRIVE_AUTH = 'https://walletlens-drive-auth.tarek-abdelhameed.workers.dev'

// The worker answers these and nothing else.
const ROUTES = new Set(['exchange', 'refresh'])

const json = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

export async function onRequest(context) {
  const { request, params } = context
  const rest = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '')
  if (!ROUTES.has(rest)) return json({ error: 'not_found' }, 404)

  // Built, not forwarded. This request carries an OAuth authorization code or
  // a refresh token; it must not also carry the visitor's cookies or their IP
  // to another origin.
  const headers = new Headers({ Accept: 'application/json' })
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)

  const method = request.method
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.text()

  let res
  try {
    res = await fetch(`${DRIVE_AUTH}/${rest}`, { method, headers, body })
  } catch {
    // A status the caller can act on, rather than a TypeError in the page.
    // Deliberately no detail: the body of this request is a secret and nothing
    // about it belongs in an error string.
    return json({ error: 'drive_auth_unreachable' }, 502)
  }

  // The worker's own status and body, which is what googleDrive.js reasons
  // about. Never cached: these are one-time codes and short-lived tokens.
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
