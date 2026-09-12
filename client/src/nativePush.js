// Registering the device for notifications when it has no service worker.
//
// Inside the app's own WebView there is no Web Push subscription to make: a
// WebView has no service worker, so PushManager does not exist and the whole
// path push.js takes — permission, subscribe, endpoint, VAPID — has nothing to
// stand on. What it has instead is an FCM registration token, handed over by
// the native side through the bridge.
//
// The server end of this is a peer, not a replacement. jobs.js decides exactly
// what it decided before; only the address changes, from an endpoint to a
// token. Every browser, desktop and iOS home-screen install still goes through
// push.js, untouched.

import { PUSH_API } from './apiHosts.js'
import { getPushPrefs } from './push'

const bridge = () => {
  try {
    const b = typeof window !== 'undefined' ? window.AndroidBridge : null
    return b && typeof b.pushToken === 'function' ? b : null
  } catch { return null }
}

// The runtime's own description of a failure, trimmed to something a settings
// line can carry. "Failed to fetch", "Load failed" and a CSP refusal are three
// different problems wearing one sentence without it.
function detailOf(e) {
  return String(e?.message || e || '').trim().slice(0, 120)
}

/** Whether this device registers over FCM rather than Web Push. */
export function usesNativePush() {
  return bridge() !== null
}

/**
 * The device's token, asking the native side to fetch one if it has none.
 *
 * `ensurePushToken` covers the case onNewToken cannot: a device that already
 * had a token before this code shipped never fires that callback, so without
 * the pull it would hold an address it never tells anyone about.
 */
export function nativePushToken() {
  const b = bridge()
  if (!b) return ''
  try {
    const token = b.pushToken() || ''
    if (!token && typeof b.ensurePushToken === 'function') b.ensurePushToken()
    return token
  } catch { return '' }
}

/**
 * Register this device with the push worker.
 *
 * Idempotent by design and cheap to call on every launch, because the native
 * side tracks whether the server already knows the token it holds. FCM rotates
 * tokens on its own schedule — a restore to a new device, a data clear, a
 * token it judges stale — and a rotated one is the FCM equivalent of an
 * expired endpoint: the server goes on sending to an address nobody is at, and
 * nothing fails loudly enough to notice. So the flag is cleared when a new
 * token arrives and only then does this re-POST.
 *
 * @param {{force?: boolean, watch?: Array, setup?: object, lang?: string, tz?: number}} opts
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
/**
 * Can this device reach the push service at all?
 *
 * Deliberately the plainest request that exists: GET, no custom headers, no
 * body. That makes it a CORS "simple request", which is never preflighted — so
 * it isolates reachability from whether a preflight would have been allowed.
 * Only called after a failure, never on the happy path.
 */
async function canReachServer() {
  try {
    const res = await fetch(`${PUSH_API}/health`, { method: 'GET' })
    return res.ok
  } catch { return false }
}

export async function registerNativePush(opts = {}) {
  const b = bridge()
  if (!b) return { ok: false, reason: 'not-in-shell' }

  const token = nativePushToken()
  if (!token) return { ok: false, reason: 'no-token' }

  // Already registered, and the token has not changed since.
  if (!opts.force) {
    try { if (b.pushTokenSynced && b.pushTokenSynced()) return { ok: true, reason: 'already' } }
    catch { /* treat an unreadable flag as "not synced" and re-register */ }
  }

  // Serialised BEFORE the request, and deliberately outside the try below.
  //
  // It used to be built inline in the fetch call, inside that try — so a
  // throw from JSON.stringify (a circular value, a BigInt, a getter that
  // raises) came back as `unreachable`, and the screen told the user to check
  // their connection about a request that was never attempted. This is the
  // same trap registrationFields() was written to escape on the web path.
  //
  // `alerts` and `zakatDue` are sent because the server reads both and the
  // callers have always passed them: without alerts a price target is stored
  // on the device and never armed on the server, and without zakatDue the
  // reminder has no date to count down to. They were being dropped here, one
  // layer below the function whose whole comment says they must not be.
  let body
  try {
    body = JSON.stringify({
      transport: 'fcm',
      fcmToken: token,
      alerts: opts.alerts,
      watch: opts.watch,
      setup: opts.setup,
      prefs: opts.prefs ?? getPushPrefs(),
      // An explicit null is meaningful here — the year lapsed, or zakat was
      // paid — and the server honours it, so it is not filtered out.
      zakatDue: opts.zakatDue,
      lang: opts.lang,
      tz: opts.tz,
    })
  } catch (e) {
    return { ok: false, reason: 'payload', detail: detailOf(e) }
  }

  try {
    const res = await fetch(`${PUSH_API}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (!res.ok) return { ok: false, reason: `http-${res.status}` }
  } catch (e) {
    // Keep the runtime's own words, and then answer the question they do not.
    //
    // "Failed to fetch" is one string for two unrelated faults: the device
    // cannot reach the host at all, or it reached it and the browser refused
    // the request before sending it — a failed CORS preflight, a connect-src
    // the page's own policy blocks. They have nothing in common and neither is
    // visible from inside a WebView, where there is no console to open.
    //
    // So ask a question that cannot preflight. A GET with no custom headers is
    // a simple request; if it comes back while the POST did not, the network
    // is fine and the POST was stopped on its way out. That is a fault on our
    // side, and the user should not be told to check their connection.
    return { ok: false, reason: 'unreachable', detail: detailOf(e), reachedServer: await canReachServer() }
  }

  // Marked only after the server accepted it. Marking on the attempt would
  // mean one failed launch leaves the device permanently believing it is
  // registered, and the flag exists precisely to stop that being invisible.
  try { b.markPushTokenSynced && b.markPushTokenSynced() } catch { /* best effort */ }
  return { ok: true }
}

/**
 * Ask Android for notification permission.
 *
 * ONE dialog, and the reason it is here rather than in the page: in the shell
 * the browser's Notification.requestPermission() grants something a WebView
 * can never act on — there is no service worker to deliver to — and the user
 * then meets Android's own dialog for the permission that actually decides
 * whether anything appears. Two prompts, different wording, one decision, and
 * the first of them inert.
 *
 * Fire-and-forget: the answer arrives in the app's own state, not in a promise
 * this could return. Callers poll nativeNotificationsAllowed().
 */
export function requestNativeNotificationPermission() {
  const b = bridge()
  if (!b || typeof b.requestNotificationPermission !== 'function') return false
  try { b.requestNotificationPermission(); return true } catch { return false }
}

/**
 * Whether the system will still show a permission dialog.
 *
 * "granted" | "can-ask" | "blocked". Android stops showing the dialog after
 * two refusals — requestPermissions then returns having displayed nothing —
 * and firing it anyway is how a tap on Enable came to do nothing at all.
 *
 * Older shells have no such method; they report "can-ask", which is the
 * behaviour they had before this existed.
 */
export function nativeNotificationAskState() {
  const b = bridge()
  if (!b || typeof b.notificationAskState !== 'function') return 'can-ask'
  try { return b.notificationAskState() || 'can-ask' } catch { return 'can-ask' }
}

/** Open this app's notification settings — the only route left when blocked. */
export function openNativeNotificationSettings() {
  const b = bridge()
  if (!b || typeof b.openNotificationSettings !== 'function') return false
  try { return !!b.openNotificationSettings() } catch { return false }
}

/** Whether the OS will currently let a notification through. */
export function nativeNotificationsAllowed() {
  const b = bridge()
  if (!b || typeof b.notificationsAllowed !== 'function') return false
  try { return !!b.notificationsAllowed() } catch { return false }
}
