// Google Drive backup: auth and the three Drive calls we need.
//
// Scope is drive.file — "only the files this app creates". WalletLens cannot
// see anything else in the user's Drive, and Google's own consent screen says
// so, which matters for an app whose pitch is that it doesn't touch your data.
//
// The backup lands in the user's Drive, encrypted (see backupEncryption.js).
// We run no server, store nothing, and never see the contents.

const CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID
  // Web OAuth client IDs are public by design: they appear in the page source of
  // every site that uses Google sign-in. There is no client secret in the token
  // flow. What actually guards this is the authorized JavaScript origin list in
  // the Cloud console, which is why the ID being visible here is not a leak.
  || '630094688874-rilioqqic8004hk57skqi6oi2bs0g078.apps.googleusercontent.com'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const FILE_NAME = 'walletlens-backup.wl3'
const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

/** Feature switch: without a client ID the whole thing stays invisible. */
export function isDriveConfigured() {
  return typeof CLIENT_ID === 'string' && CLIENT_ID.endsWith('.apps.googleusercontent.com')
}

// The token is persisted, and that reversed an earlier decision. The old note
// here said memory-only was free because "Google hands out a fresh one
// silently while the session is alive" — true in a normal browser, false in
// the Android app.
//
// Inside a TWA there is no opener for GIS to postMessage back to, so its
// "silent" prompt:'none' call surfaces as a visible accounts.google.com tab
// that spins and never completes. With the token discarded on every app start,
// every automatic backup reached for a new one and opened that tab — and
// closing it fired visibilitychange, which triggered another backup, which
// opened it again. A loop, roughly once a minute, that never backed anything
// up.
//
// So the token now survives a restart and is used until it expires. It is a
// bearer credential on disk for up to an hour, scoped to drive.file — only
// files this app created. The device already stores the key that decrypts the
// backup itself, so this does not widen what a compromised device gives up,
// and it is what makes an uninterrupted automatic backup possible at all.
const TOKEN_KEY = 'wl_drive_token'

let accessToken = null
let tokenExpiry = 0
let tokenClient = null

try {
  const saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')
  if (saved?.token && saved.expiry > Date.now()) {
    accessToken = saved.token
    tokenExpiry = saved.expiry
  }
} catch { /* unreadable or private mode: carry on tokenless */ }

function rememberToken(token, expiresInSec) {
  accessToken = token
  tokenExpiry = Date.now() + Number(expiresInSec || 3600) * 1000
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiry: tokenExpiry }))
  } catch { /* private mode: it still works for this session */ }
}

function forgetToken() {
  accessToken = null
  tokenExpiry = 0
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* nothing to clear */ }
}

/**
 * A token we already hold, or null. Never contacts Google.
 *
 * This is the only door an automatic background task may use. Everything else
 * can show UI, and a backup nobody asked for must never do that.
 */
export function storedAccessToken() {
  return haveValidToken() ? accessToken : null
}

let gisPromise = null
function loadGis() {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not reach Google sign-in'))
    document.head.appendChild(s)
  })
  return gisPromise
}

function haveValidToken() {
  return accessToken && Date.now() < tokenExpiry - 60_000
}

// ── Redirect flow ───────────────────────────────────────────────────────────
// Google's identity library completes its popup flow with a postMessage back
// to the window that opened it. Mobile browsers routinely open the "popup" as
// a full tab and drop the opener, at which point the token has nowhere to
// return and the library reports "Popup window closed" — which is exactly what
// happened on the first real device test. A TWA Custom Tab has the same shape.
//
// So on touch devices the interactive sign-in is a full-page navigation to
// Google and back to /drive-callback (the redirect URI registered on the OAuth
// client). No popup, no opener, nothing for the browser to lose.

const REDIRECT_PATH = '/drive-callback'
const STATE_KEY = 'wl_drive_oauth_state'
const RETURN_KEY = 'wl_drive_return'

function isLikelyMobile() {
  if (typeof navigator === 'undefined') return false
  return /android|iphone|ipad|mobile/i.test(navigator.userAgent || '')
}

/** Exported for tests; beginRedirectSignIn is just this plus a navigation. */
export function buildAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: window.location.origin + REDIRECT_PATH,
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
  })
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString()
}

export function beginRedirectSignIn() {
  // The state parameter round-trips through Google and is checked on return,
  // so a token fragment planted by someone else's page is rejected.
  const state = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2)
  try {
    sessionStorage.setItem(STATE_KEY, state)
    sessionStorage.setItem(RETURN_KEY, window.location.pathname || '/settings')
  } catch { /* private mode: state check will fail closed on return */ }
  window.location.assign(buildAuthUrl(state))
}

/**
 * Called by the /drive-callback route with location.hash. Validates state,
 * stores the token in memory, and says where to send the user back to.
 * The caller must scrub the hash from the URL and history immediately.
 */
export function completeRedirectSignIn(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''))
  let expected = null
  let returnTo = '/settings'
  try {
    expected = sessionStorage.getItem(STATE_KEY)
    returnTo = sessionStorage.getItem(RETURN_KEY) || '/settings'
    sessionStorage.removeItem(STATE_KEY)
    sessionStorage.removeItem(RETURN_KEY)
  } catch { /* fall through: no stored state means the check below fails */ }

  const err = params.get('error')
  if (err) throw new Error(err === 'access_denied' ? 'Sign-in was cancelled' : `Google sign-in failed: ${err}`)
  if (!expected || params.get('state') !== expected) {
    throw new Error('Sign-in state mismatch — please try connecting again')
  }
  const token = params.get('access_token')
  if (!token) throw new Error('Google did not return a token')
  rememberToken(token, params.get('expires_in'))
  return { returnTo }
}

/**
 * Get an access token, prompting the user only when necessary.
 *
 * @param {boolean} interactive false to attempt a silent refresh and give up
 *                              quietly, which is what a background auto-backup
 *                              wants: it must never throw a consent popup at
 *                              someone who didn't tap anything.
 */
export async function getAccessToken({ interactive = true } = {}) {
  if (haveValidToken()) return accessToken
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured')

  // Interactive sign-in on a touch device: navigate, don't pop up. The
  // returned promise never settles because the page is about to unload.
  if (interactive && isLikelyMobile()) {
    beginRedirectSignIn()
    return new Promise(() => {})
  }

  await loadGis()

  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (res) => {
        if (res.error) return reject(new Error(res.error_description || res.error))
        rememberToken(res.access_token, res.expires_in)
        resolve(accessToken)
      },
      error_callback: (err) => {
        // Desktop popup blocked or torn down: fall back to the redirect flow
        // rather than surfacing "Popup window closed" at the user.
        if (interactive && /popup/i.test(err?.type || err?.message || '')) {
          beginRedirectSignIn()
          return // navigating away; leave the promise pending
        }
        reject(new Error(err?.message || 'Sign-in was cancelled'))
      },
    })
    // prompt:'' reuses an existing grant without showing anything. On the very
    // first run there is no grant, so a non-interactive call correctly fails
    // instead of silently doing nothing the caller can detect.
    tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' })
  })
}

export function signOut() {
  const t = accessToken
  forgetToken()
  try { if (t) window.google?.accounts?.oauth2?.revoke(t, () => {}) } catch { /* already gone */ }
}

export function isSignedIn() {
  return haveValidToken()
}

/** Thrown when Drive work needs a sign-in that only a user gesture may start. */
export const NEEDS_SIGNIN = 'NEEDS_SIGNIN'

async function driveFetch(url, init = {}) {
  // Silent only, deliberately. Escalating to interactive here would navigate
  // the page to Google in the middle of a backup, losing the passphrase the
  // user just typed and completing nothing. Sign-in belongs to Connect, which
  // is a button press with nothing else in flight.
  const token = await getAccessToken({ interactive: false })
    .catch(() => { throw new Error(NEEDS_SIGNIN) })
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    // Rejected by Drive: the stored copy is no better than none.
    forgetToken()
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
