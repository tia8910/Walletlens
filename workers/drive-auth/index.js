// WalletLens Google Drive token proxy.
//
// The whole point of this worker is to make Google Drive backup sessions stop
// expiring. A normal website can silently refresh its Google access token, but
// the WalletLens Android app is a TWA WebView: Google rejects OAuth inside a
// WebView, so the app signs in through a Custom Tab, and there is no hidden
// iframe/opener for Google Identity Services to silently refresh against.
// Result: the old one-hour access token ran out, auto-backup could not ask for
// a new one without opening a visible tab, and the backup quietly stopped.
//
// This worker fixes that by running the OAuth exchange where a client secret
// is allowed to live. Google hands back a long-lived refresh_token, we hand it
// to the app, and the app calls /refresh whenever it needs a fresh access
// token — no popup, no Custom Tab, no user gesture.
//
// Privacy stays intact: the refresh token never leaves the user's device
// except to this worker, which immediately swaps it for an access token and
// does not store either. Nothing about the user's portfolio is ever visible
// here — we only ever see OAuth tokens, never holdings.

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'

// The OAuth client id the app was built with. Must match the redirect URI and
// the origin authorized in the Google Cloud console.
const CLIENT_ID = '630094688874-rilioqqic8004hk57skqi6oi2bs0g078.apps.googleusercontent.com'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function method(request, name) {
  if (request.method !== name) {
    return json({ error: `method ${request.method} not allowed (expected ${name})` }, 405)
  }
}

// POST /exchange
//   body: { code, redirectUri }
//   -> { access_token, refresh_token, expires_in }
// Called once, right after the user finishes signing in on accounts.google.com
// and the app lands back on /drive-callback?code=...
export async function exchange(request, env) {
  method(request, 'POST')
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
  if (!res.ok) {
    return json({ error: data.error || 'token exchange failed', error_description: data.error_description }, 400)
  }
  // Pass the refresh token through only on first sign-in, when Google issues
  // it. A refreshed access token alone never carries one.
  return json({
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_in: data.expires_in || 3600,
    scope: data.scope || '',
  })
}

// POST /refresh
//   body: { refreshToken }
//   -> { access_token, expires_in }
// Called by the app's background auto-backup whenever its access token is
// close to expiry. Silent, fast, and never shows UI.
export async function refresh(request, env) {
  method(request, 'POST')
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
  if (!res.ok) {
    return json({ error: data.error || 'refresh failed', error_description: data.error_description }, 400)
  }
  return json({ access_token: data.access_token, expires_in: data.expires_in || 3600 })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/exchange') return await exchange(request, env)
      if (url.pathname === '/refresh') return await refresh(request, env)
      return json({ ok: true, service: 'walletlens-drive-auth' })
    } catch (e) {
      return json({ error: 'internal error', error_description: String(e?.message || e) }, 500)
    }
  },
}
