// WalletLens Google Drive token proxy.
//
// Prevents Drive backup sessions from expiring by running the OAuth token
// exchange on a server that can hold the client_secret. The client stores a
// long-lived refresh_token and calls /refresh to get fresh access tokens
// silently — no popup, no Custom Tab, no session expiry.

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const CLIENT_ID = '630094688874-rilioqqic8004hk57skqi6oi2bs0g078.apps.googleusercontent.com'

// ── CORS ─────────────────────────────────────────────────────────────────
//
// The app calls this from walletlens.live, so every request here is
// cross-origin. Both endpoints POST application/json, which is not a
// CORS-simple content type, so the browser sends a preflight OPTIONS first.
//
// Without this block that preflight fell through to exchange(), which
// answered "405 POST required" with no Access-Control-Allow-Origin, and the
// browser reported the whole thing as a bare "Failed to fetch" — pointing at
// the network rather than at the missing header. Drive sign-in could not have
// worked from a browser at all.
//
// An allowlist rather than '*': these endpoints spend the client secret. A
// code is still bound by Google to this client_id and a registered redirect
// URI, so '*' would not by itself hand anyone tokens, but there is no reason
// for any other site to be able to reach the endpoint at all.
const ALLOWED_ORIGINS = new Set([
  'https://walletlens.live',
  'https://www.walletlens.live',
  'https://walletlenslive1.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173',
])

// Cloudflare Pages gives every deployment its own <hash>.<project>.pages.dev
// hostname, which is where the site is checked before a promote.
const ALLOWED_SUFFIX = '.walletlenslive1.pages.dev'

function allowedOrigin(origin) {
  if (!origin) return null
  if (ALLOWED_ORIGINS.has(origin)) return origin
  if (origin.startsWith('https://') && origin.endsWith(ALLOWED_SUFFIX)) return origin
  return null
}

function corsHeaders(origin) {
  // Vary matters even when the origin is refused: without it a cached
  // response for one origin gets replayed for another.
  const headers = { vary: 'Origin' }
  if (origin) headers['access-control-allow-origin'] = origin
  return headers
}

function withCors(res, origin) {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function exchange(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405)
  let body
  try { body = await request.json() } catch { return json({ error: 'invalid json' }, 400) }
  if (!body?.code) return json({ error: 'missing code' }, 400)
  if (!env.GOOGLE_CLIENT_SECRET) return json({ error: 'server not configured' }, 500)

  const params = new URLSearchParams({
    code: body.code,
    client_id: CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: body.redirectUri || '',
    grant_type: 'authorization_code',
  })

  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!res.ok) return json({ error: data.error || 'token exchange failed', error_description: data.error_description }, 400)
  return json({
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_in: data.expires_in || 3600,
    scope: data.scope || '',
  })
}

async function refresh(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405)
  let body
  try { body = await request.json() } catch { return json({ error: 'invalid json' }, 400) }
  if (!body?.refreshToken) return json({ error: 'missing refreshToken' }, 400)
  if (!env.GOOGLE_CLIENT_SECRET) return json({ error: 'server not configured' }, 500)

  const params = new URLSearchParams({
    refresh_token: body.refreshToken,
    client_id: CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  })

  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!res.ok) return json({ error: data.error || 'refresh failed', error_description: data.error_description }, 400)
  return json({ access_token: data.access_token, expires_in: data.expires_in || 3600 })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = allowedOrigin(request.headers.get('Origin'))

    // Preflight is answered before anything else. It has to be: the browser
    // sends it with no body and no credentials, and every handler below
    // rejects a non-POST.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
        },
      })
    }

    let res
    try {
      if (url.pathname === '/exchange') res = await exchange(request, env)
      else if (url.pathname === '/refresh') res = await refresh(request, env)
      else res = json({ ok: true, service: 'walletlens-drive-auth' })
    } catch (e) {
      res = json({ error: 'internal error', error_description: String(e?.message || e) }, 500)
    }
    // Errors need the header as much as successes do: without it the browser
    // hides a clean 400 behind "Failed to fetch" and the real reason is lost.
    return withCors(res, origin)
  },
}
