import { SITE_ORIGIN } from './site.js'

// Delivery over Firebase Cloud Messaging.
//
// WHY THERE ARE TWO TRANSPORTS NOW
// Every notification is DECIDED in jobs.js — the channels, thresholds,
// cooldowns and day gates — and was DELIVERED by Web Push to a service worker
// in Chrome. That worked because the Android app was a Trusted Web Activity,
// which is to say it was Chrome.
//
// The app renders itself in a WebView now, so its storage is its own. A
// WebView has no service worker, so the Web Push subscription simply does not
// exist there and the delivery half has to become FCM. Nothing above it moves.
//
// Web Push is NOT going away: it is still how every browser, every desktop and
// every iOS home-screen install is reached. A subscription says which
// transport it wants and the sender dispatches on that, so the two run side by
// side and no existing subscriber is disturbed by the arrival of the new one.

/** FCM HTTP v1, the only one that still exists — legacy died 2024-06-20. */
export const FCM_ENDPOINT = (projectId) =>
  `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

// ── Access tokens ───────────────────────────────────────────────────────────

/**
 * OAuth access tokens, cached in module scope.
 *
 * A Worker isolate serves many requests, and minting one of these costs an
 * RSA signature plus a network round trip to Google. The crons run every
 * minute; paying that per notification would dominate the cost of sending one.
 *
 * Refreshed a minute early, because a token that expires between the check and
 * the send is a 401 on a notification that had already been decided.
 */
let cached = { token: '', expires: 0 }

/** Test seam — the cache is module state and would leak between cases. */
export function resetTokenCache() {
  cached = { token: '', expires: 0 }
}

function b64url(bytes) {
  let s = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** PEM private key → a CryptoKey that can sign RS256. */
async function importKey(pem) {
  const body = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  if (!body) throw new Error('service account has no private_key')
  const raw = Uint8Array.from(atob(body), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8', raw,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  )
}

/**
 * A Google access token for the messaging scope.
 *
 * The service account JSON is signed into a JWT and exchanged. Done by hand
 * rather than with the Admin SDK because that SDK does not run on Workers —
 * it wants Node's crypto and filesystem — and the whole exchange is forty
 * lines of WebCrypto.
 *
 * @param {{client_email:string, private_key:string}} account
 * @param {number} now epoch ms
 */
export async function accessToken(account, now = Date.now()) {
  if (cached.token && now < cached.expires) return cached.token

  if (!account?.client_email || !account?.private_key) {
    throw new Error('FCM_SERVICE_ACCOUNT is missing client_email or private_key')
  }

  const iat = Math.floor(now / 1000)
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claim = b64url(new TextEncoder().encode(JSON.stringify({
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat,
    exp: iat + 3600,
  })))
  const signingInput = `${header}.${claim}`

  const key = await importKey(account.private_key)
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput),
  )
  const jwt = `${signingInput}.${b64url(sig)}`

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    throw new Error(`token exchange failed ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const body = await res.json()
  if (!body?.access_token) throw new Error('token exchange returned no access_token')

  // A minute early. A token that expires between this check and the send is a
  // 401 on a notification that had already been decided and cannot be redone.
  cached = {
    token: body.access_token,
    expires: now + Math.max(0, (Number(body.expires_in) || 3600) - 60) * 1000,
  }
  return cached.token
}

// ── The message ─────────────────────────────────────────────────────────────

/**
 * An FCM v1 message for one of our payloads.
 *
 * DATA-ONLY, deliberately. A `notification` block is drawn by the system,
 * which ignores the channels this app already defines, ignores the deep link,
 * and — the part that matters — is not handed to the app's own service at all
 * while the app is backgrounded. Sending data means the app decides how every
 * notification looks and where a tap lands, in every app state.
 *
 * Every value in `data` must be a string: FCM rejects the message outright if
 * one is a number or null, and a rejected message is a notification that
 * silently never arrives.
 */
export function buildMessage({ token, payload, urgency, ttl }) {
  const data = {}
  for (const [k, v] of Object.entries(payload || {})) {
    if (v === undefined || v === null) continue
    data[k] = typeof v === 'string' ? v : String(v)
  }

  // The native app only follows a URL on its own origin, checked in
  // WalletLensMessagingService with a startsWith(SITE_ORIGIN + "/").
  // Payload urls are relative by design down in jobs.js (assetUrl returns
  // '/asset/?id=bitcoin', tips return '/academy?tab=hacks'), and Web Push's
  // sw.js resolves them against the page origin — so they land fine there. FCM
  // data messages have no page to resolve against: without this prefix every
  // notification opened the dashboard instead of the page it was about.
  if (data.url && !data.url.startsWith('http')) {
    data.url = SITE_ORIGIN + (data.url.startsWith('/') ? '' : '/') + data.url
  }

  return {
    message: {
      token,
      data,
      android: {
        // HIGH for everything, and the reasoning changed with the transport.
        //
        // This used to mirror the Web Push urgency table — high for a price,
        // normal for a hack or an academy question — which is right for Web
        // Push, where low urgency saves battery and the message still arrives.
        // FCM's NORMAL is not that. A NORMAL data message is DEFERRED while
        // the device is in Doze, which is most of the time a phone is idle
        // with the app closed. So the scheduled channels — the daily read, the
        // morning brief, the academy question, the hacks — arrived hours late
        // or in a clump when something else happened to wake the phone.
        //
        // Every message this app sends exists to be drawn as a notification;
        // there is no silent data sync here. That is exactly the case Google
        // names for HIGH, and the throttling they warn about is for apps that
        // send high priority for work the user never sees.
        //
        // `urgency` still decides the TTL below and the Web Push header, which
        // is where the distinction continues to earn its keep.
        priority: 'HIGH',
        // Seconds, and FCM wants the trailing `s`. This is the same TTL the
        // Web Push transport sends, and it exists for the same reason: a
        // phone that was off for a few days must not come back to a price
        // alert from last Tuesday.
        ttl: `${Math.max(0, Number(ttl) || 0)}s`,
      },
    },
  }
}

/**
 * Whether FCM is telling us this token is dead.
 *
 * The equivalent of Web Push's 404/410, and it has to be recognised for the
 * same reason: it is the only way the subscription table ever shrinks on its
 * own. Left unhandled, a reinstalled or wiped device is sent to for ever.
 *
 * UNREGISTERED is the token being gone. INVALID_ARGUMENT on a send is almost
 * always a malformed token — a real transient fault comes back as 429 or 5xx,
 * which must NOT drop the subscription.
 */
export function isDeadToken(status, body) {
  if (status === 404) return true
  if (status !== 400 && status !== 403) return false
  const text = typeof body === 'string' ? body : JSON.stringify(body || '')
  return /UNREGISTERED|INVALID_ARGUMENT|Requested entity was not found/i.test(text)
}
