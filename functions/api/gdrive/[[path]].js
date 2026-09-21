/**
 * Serverless function — /api/gdrive/*
 *
 * Google Drive's own API, reached through walletlens.live.
 *
 * WHY
 * /diag on the reporting device returned this:
 *
 *   OK   drive route  431ms      FAIL drive host reachable  5ms
 *   OK   push route   468ms      FAIL drive CORS            4ms
 *   OK   news dataset 430ms      FAIL workers.dev direct    4ms
 *
 * Same-origin answers in ~430ms; every cross-origin host fails in 3-5ms.
 * Nothing reaches DNS in 4ms, so those requests never left the phone — the
 * device refuses cross-origin outright, uniformly, whatever the host. It is
 * not a per-host block and nothing in the app or the site's headers can
 * change it.
 *
 * THIS IS A FALLBACK, NOT THE PATH
 * googleDrive.js tries www.googleapis.com directly first and only comes here
 * when that fails. On a working network nothing changes: no extra hop, and
 * the access token never leaves the device. On a device like the one above it
 * is the difference between Drive working and Drive not existing.
 *
 * WHAT THIS SEES
 * The access token, because Drive requires it and there is no way to proxy an
 * authenticated call without it. It is forwarded and never logged. The backup
 * body is ciphertext — backupEncryption.js encrypts before upload and the key
 * never leaves the device — so the contents stay unreadable here, exactly as
 * they are to Google.
 *
 * Not an open proxy: one fixed upstream, and only the three Drive paths the
 * app actually calls.
 */

const UPSTREAM = 'https://www.googleapis.com'

// files            → list and metadata
// files/<id>       → read one, or overwrite it
// upload/... files → create and update content
const ALLOWED = [/^drive\/v3\/files(\/[A-Za-z0-9_-]+)?$/, /^upload\/drive\/v3\/files(\/[A-Za-z0-9_-]+)?$/]

const json = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

export async function onRequest(context) {
  const { request, params } = context
  const rest = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '')
  if (!ALLOWED.some((re) => re.test(rest))) return json({ error: 'not_found' }, 404)

  // Built, not forwarded. The visitor's cookies and their IP are no business
  // of Google's, and a forwarded Cookie header on an authenticated call is how
  // a proxy turns into a tracking hop.
  const headers = new Headers()
  for (const h of ['authorization', 'content-type']) {
    const v = request.headers.get(h)
    if (v) headers.set(h, v)
  }
  headers.set('Accept', 'application/json')

  const url = new URL(request.url)
  const method = request.method
  const body = method === 'GET' || method === 'HEAD' ? undefined : request.body

  let res
  try {
    res = await fetch(`${UPSTREAM}/${rest}${url.search}`, {
      method,
      headers,
      body,
      // A backup upload is a single stream; buffering it here would double the
      // memory for no gain.
      ...(body ? { duplex: 'half' } : {}),
    })
  } catch {
    // Deliberately no detail: this request carries a live credential and
    // nothing about it belongs in an error string.
    return json({ error: 'drive_unreachable' }, 502)
  }

  // Drive's own status and body, which is what driveFetch reasons about — a
  // 401 has to stay a 401 or the refresh-and-retry path never runs.
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
