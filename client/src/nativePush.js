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

  try {
    const res = await fetch(`${PUSH_API}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transport: 'fcm',
        fcmToken: token,
        watch: opts.watch,
        setup: opts.setup,
        prefs: opts.prefs ?? getPushPrefs(),
        lang: opts.lang,
        tz: opts.tz,
      }),
    })
    if (!res.ok) return { ok: false, reason: `http-${res.status}` }
  } catch {
    return { ok: false, reason: 'unreachable' }
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

/** Whether the OS will currently let a notification through. */
export function nativeNotificationsAllowed() {
  const b = bridge()
  if (!b || typeof b.notificationsAllowed !== 'function') return false
  try { return !!b.notificationsAllowed() } catch { return false }
}
