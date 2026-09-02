// WalletLens Google Drive token proxy.
//
// Prevents Drive backup sessions from expiring by running the OAuth token
// exchange on a server that can hold the client_secret. The client stores a
// long-lived refresh_token and calls /refresh to get fresh access tokens
// silently — no popup, no Custom Tab, no session expiry.

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const CLIENT_ID = '630094688874-rilioqqic8004hk57skqi6oi2bs0g078.apps.googleusercontent.com'

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
    try {
      if (url.pathname === '/exchange') return await exchange(request, env)
      if (url.pathname === '/refresh') return await refresh(request, env)
      return json({ ok: true, service: 'walletlens-drive-auth' })
    } catch (e) {
      return json({ error: 'internal error', error_description: String(e?.message || e) }, 500)
    }
  },
}
