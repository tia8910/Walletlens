// Google Drive backup: auth and the three Drive calls we need.
//
// Scope is drive.file — "only the files this app creates". WalletLens cannot
// see anything else in the user's Drive, and Google's own consent screen says
// so, which matters for an app whose pitch is that it doesn't touch your data.
//
// The backup lands in the user's Drive, encrypted (see backupEncryption.js).
// We run no server, store nothing, and never see the contents.
//
// WHY THE SESSION USED TO EXPIRE
//
// The old flow used Google's implicit grant (response_type=token), which
// hands back a one-hour access token and NO refresh token.  On the web
// Google silently renews it behind the scenes via a hidden iframe, but
// inside the Android TWA there is no opener for that iframe to talk to —
// so every automatic backup after the first hour silently failed, and the
// only fix was a manual re-sign-in.
//
// THE FIX: Authorization code flow + lightweight Cloudflare Worker proxy.
//
// Google now returns a one-time authorization code.  A tiny Cloudflare
// Worker (workers/drive-auth) holds the OAuth client_secret and exchanges
// the code for an access_token AND a long-lived refresh_token.  The
// refresh_token is stored on the device and is used by the worker to
// silently obtain fresh access_tokens indefinitely — no user interaction,
// no popup, no Custom Tab spin, no session expiry.
//
// Privacy is preserved: the worker sees only OAuth tokens, never holdings.
// The refresh_token never leaves the device except to this one endpoint.
// Nothing is stored server-side.

const CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID
  || '630094688874-rilioqqic8004hk57skqi6oi2bs0g078.apps.googleusercontent.com'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FILE_NAME = 'walletlens-backup.wl3'
const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

// The worker that holds GOOGLE_CLIENT_SECRET and does the token dance.
const AUTH_WORKER = import.meta.env?.VITE_DRIVE_AUTH_URL
  || 'https://walletlens-drive-auth.tarek-abdelhameed.workers.dev'

/** Feature switch: without a client ID the whole thing stays invisible. */
export function isDriveConfigured() {
  return typeof CLIENT_ID === 'string' && CLIENT_ID.endsWith('.apps.googleusercontent.com')
}

// ── Token storage ───────────────────────────────────────────────────────────
//
// access_token:  ~1-hour bearer credential, kept in memory + localStorage.
// refresh_token: long-lived credential issued by Google on first sign-in.
//   Used ONLY to obtain fresh access tokens via the worker.  Never stored
//   outside this file, never sent anywhere except the worker /refresh
//   endpoint.  This is what makes automatic backups可持续 (sustainable)
//   across hours, days, and device restarts.

const TOKEN_KEY    = 'wl_drive_token'
const REFRESH_KEY  = 'wl_drive_refresh'
const STATE_KEY    = 'wl_drive_oauth_state'
const RETURN_KEY   = 'wl_drive_return'
const REDIRECT_PATH = '/drive-callback'

let accessToken   = null
let tokenExpiry   = 0
let refreshToken  = null
let refreshing    = null   // dedup concurrent refresh calls

try {
  const saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')
  if (saved?.token && saved.expiry > Date.now()) {
    accessToken = saved.token
    tokenExpiry = saved.expiry
  }
} catch { /* unreadable or private mode */ }

try { refreshToken = localStorage.getItem(REFRESH_KEY) || null } catch { /* private mode */ }

function rememberToken(token, expiresInSec) {
  accessToken = token
  tokenExpiry = Date.now() + Number(expiresInSec || 3600) * 1000
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiry: tokenExpiry }))
  } catch { /* private mode */ }
}

function rememberRefreshToken(rt) {
  refreshToken = rt
  try { localStorage.setItem(REFRESH_KEY, rt) } catch { /* private mode */ }
}

function forgetTokens() {
  accessToken = null
  tokenExpiry = 0
  refreshToken = null
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch { /* nothing to clear */ }
}

function haveValidToken() {
  return accessToken && Date.now() < tokenExpiry - 60_000
}

/**
 * A token we already hold, or null.  Never contacts Google or the worker.
 * This is the only door an automatic background task may use.
 */
export function storedAccessToken() {
  return haveValidToken() ? accessToken : null
}

function isLikelyMobile() {
  if (typeof navigator === 'undefined') return false
  return /android|iphone|ipad|mobile/i.test(navigator.userAgent || '')
}

// ── Silent refresh via the Cloudflare Worker ────────────────────────────────
//
// This is the whole reason sessions stopped expiring.  The worker holds the
// client_secret (which must never live in a browser) and uses the
// refresh_token to obtain a fresh access_token.  The token is returned
// directly to this page; the worker sees nothing else.

async function silentRefresh() {
  if (!refreshToken) return false
  // Dedup: if two callers hit this at the same time, only one network round
  // trip happens.
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const res = await fetch(`${AUTH_WORKER}/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      const data = await res.json()
      if (!res.ok || !data.access_token) {
        // Refresh token revoked or expired — user must re-sign-in.
        forgetTokens()
        return false
      }
      rememberToken(data.access_token, data.expires_in)
      return true
    } catch {
      // Network error — try again next time, don't nuke the token.
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

// ── Redirect sign-in flow ──────────────────────────────────────────────────
//
// On mobile/TWA, Google's GIS library cannot complete its popup flow: there
// is no opener for postMessage, so the popup spins forever.  The redirect
// flow is a full-page navigation to Google and back to /drive-callback.
// Google sends the authorization code as a query parameter, not a fragment.

/** Exported for tests */
export function buildAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: window.location.origin + REDIRECT_PATH,
    response_type: 'code',                          // ← authorization code, not token
    scope: SCOPE,
    state,
    access_type: 'offline',                         // ← ask Google for a refresh_token
    prompt: 'consent',                              // ← force consent so refresh_token is always issued
  })
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString()
}

export function beginRedirectSignIn() {
  const state = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2)
  try {
    sessionStorage.setItem(STATE_KEY, state)
    sessionStorage.setItem(RETURN_KEY, window.location.pathname || '/settings')
  } catch { /* private mode */ }

  const url = buildAuthUrl(state)

  // In a TWA the navigation must leave the WebView — Google REFUSES OAuth
  // inside a WebView (accounts.google.com answers disallowed_useragent).
  // The bridge opens a Custom Tab, which IS the user's browser and which
  // Google accepts.  Google redirects back to /drive-callback; the app
  // catches that deep link and loads it into this WebView — so
  // sessionStorage is still here, and the DriveCallback page picks up the
  // authorization code.
  try {
    const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null
    if (bridge && typeof bridge.openExternal === 'function' && bridge.openExternal(url)) return
  } catch { /* fall through to the ordinary navigation */ }

  window.location.assign(url)
}

/**
 * Called by the DriveCallback page once it has the authorization code.
 * Exchanges it for tokens via the worker, stores them, and says where
 * to send the user back to.
 */
export async function completeRedirectSignInWithCode(code) {
  let expected = null
  let returnTo = '/settings'
  try {
    expected = sessionStorage.getItem(STATE_KEY)
    returnTo = sessionStorage.getItem(RETURN_KEY) || '/settings'
    sessionStorage.removeItem(STATE_KEY)
    sessionStorage.removeItem(RETURN_KEY)
  } catch { /* private mode */ }

  const redirectUri = window.location.origin + REDIRECT_PATH
  const res = await fetch(`${AUTH_WORKER}/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token exchange failed')

  rememberToken(data.access_token, data.expires_in)
  if (data.refresh_token) rememberRefreshToken(data.refresh_token)

  return { returnTo }
}

// Keep the old hash-based entry point for backward compat (in case any
// code path or cached page still sends a fragment).  Stripped of the
// implicit grant logic; it now tries to read a code from the hash.
/**
 * Exchange an authorization code or handle a legacy hash fragment for tokens.
 *
 * Accepts:
 *   - A raw authorization code string ("4/0AX4XfWh...")
 *   - A query string "code=...&state=..."
 *   - A fragment "#access_token=...&expires_in=..."  (legacy implicit grant)
 *
 * Always returns { returnTo } where to redirect the user after sign-in.
 */
export async function completeRedirectSignIn(codeOrHash) {
  if (!codeOrHash) throw new Error('No authorization code received from Google')

  // ── Legacy implicit grant fallback ──────────────────────────────────
  // Fragment like #access_token=...&expires_in=...
  // This path is kept only for backward compat with sessions that started
  // under the old implicit grant.  It does not get a refresh_token.
  if (codeOrHash.startsWith('#') && codeOrHash.includes('access_token=')) {
    const params = new URLSearchParams(codeOrHash.slice(1))

    // State check — prevents a token planted by another page.
    let expected = null
    try { expected = sessionStorage.getItem(STATE_KEY) } catch { /* private mode */ }
    if (!expected || params.get('state') !== expected) {
      throw new Error('Sign-in state mismatch — please try connecting again')
    }

    const token = params.get('access_token')
    if (token) {
      rememberToken(token, params.get('expires_in') || 3600)
      let returnTo = '/settings'
      try {
        returnTo = sessionStorage.getItem(RETURN_KEY) || '/settings'
        sessionStorage.removeItem(RETURN_KEY)
        sessionStorage.removeItem(STATE_KEY)
      } catch { /* private mode */ }
      return { returnTo }
    }
    throw new Error('No authorization code received from Google')
  }

  // ── New authorization code flow ─────────────────────────────────────
  // Could be a raw code string or a query string "code=...&state=..."
  let code = codeOrHash
  if (codeOrHash.startsWith('?') || codeOrHash.includes('code=')) {
    const params = new URLSearchParams(
      codeOrHash.startsWith('?') ? codeOrHash.slice(1) : codeOrHash
    )
    code = params.get('code') || codeOrHash
  }
  return completeRedirectSignInWithCode(code)
}

// ── getAccessToken: the single source of truth ──────────────────────────────
//
// Returns a valid access token.  Order of attempts:
//   1. Already have a valid token (cached from <1 h ago)
//   2. Silent refresh via the Cloudflare Worker (uses refresh_token — silent, fast, no UI)
//   3. Interactive sign-in (user sees Google consent screen)

export async function getAccessToken({ interactive = true } = {}) {
  // Fast path: token still valid
  if (haveValidToken()) return accessToken

  // Have a refresh token?  Try silent refresh first — no UI, no redirect,
  // no Custom Tab.  This is the fix for sessions expiring.
  if (refreshToken) {
    const ok = await silentRefresh()
    if (ok) return accessToken
  }

  if (!isDriveConfigured()) throw new Error('Google Drive is not configured')

  // Background tasks (auto-backup) must never show a sign-in prompt.
  if (!interactive) return null

  // Interactive sign-in on a touch device: navigate, don't pop up.
  beginRedirectSignIn()
  return new Promise(() => {})
}

// ── Public API ──────────────────────────────────────────────────────────────

export function signOut() {
  forgetTokens()
}

export function isSignedIn() {
  return haveValidToken() || !!refreshToken   // can refresh next time backup runs
}

/** Thrown when Drive work needs a sign-in that only a user gesture may start. */
export const NEEDS_SIGNIN = 'NEEDS_SIGNIN'

async function driveFetch(url, init = {}) {
  // If the token is expired but we have a refresh token, try refresh first.
  // This is the code path that previously returned null and broke auto-backup.
  let token = storedAccessToken()
  if (!token && refreshToken) {
    const ok = await silentRefresh()
    if (ok) token = storedAccessToken()
  }
  if (!token) throw new Error(NEEDS_SIGNIN)

  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    // Rejected by Drive — try one refresh, then give up.
    if (refreshToken) {
      const ok = await silentRefresh()
      if (ok) {
        token = storedAccessToken()
        const retry = await fetch(url, {
          ...init,
          headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
        })
        if (retry.ok) return retry
      }
    }
    forgetTokens()
    throw new Error('Google sign-in expired, please connect again')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Drive error ${res.status}: ${body.slice(0, 200)}`)
  }
  return res
}

/**
 * Find the backup this app previously wrote.
 *
 * With drive.file the listing only ever contains files WalletLens created, so
 * this cannot see or match anything else the user owns. The grant is recorded
 * per user and app rather than per device, which is what makes the file
 * visible after signing in on a new phone.
 */
export async function findBackup() {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)
  const fields = encodeURIComponent('files(id,name,modifiedTime,size)')
  const res = await driveFetch(`${API}?q=${q}&spaces=drive&fields=${fields}&orderBy=modifiedTime desc`)
  const data = await res.json()
  return data.files?.[0] || null
}

/** Create or overwrite the backup. Returns the file id. */
export async function uploadBackup(content, existingFileId = null) {
  const boundary = 'wl' + Math.random().toString(36).slice(2)
  const metadata = existingFileId
    ? { name: FILE_NAME }
    : { name: FILE_NAME, description: 'Encrypted WalletLens portfolio backup' }

  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/plain\r\n\r\n` +
    `${content}\r\n--${boundary}--`

  const url = existingFileId
    ? `${UPLOAD}/${existingFileId}?uploadType=multipart&fields=id`
    : `${UPLOAD}?uploadType=multipart&fields=id`

  const res = await driveFetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return (await res.json()).id
}

export async function downloadBackup(fileId) {
  const res = await driveFetch(`${API}/${fileId}?alt=media`)
  return res.text()
}
