// Notifications the page raises itself, while it is running.
//
// Distinct from push (push.js + sw.js), which is the only thing that can reach
// a phone with the app closed. These are the in-app alerts: a watchlist target
// crossed while you are looking at the screen, a Smart Alert firing, a streak.
//
// ── Why this file exists ────────────────────────────────────────────────────
//
// Four places did this:
//
//     try { new Notification(title, { body, icon }) } catch {}
//
// which does nothing at all on the phone. Android Chrome has never supported
// the Notification constructor — it throws
//
//     TypeError: Failed to construct 'Notification': Illegal constructor.
//     Use ServiceWorkerRegistration.showNotification() instead.
//
// and every one of those call sites swallowed it. So on desktop the alerts
// worked, on Android they were silently absent, and the code read as though
// notifications were handled everywhere. The `catch {}` is what made it
// invisible: there was no failure to see, just nothing happening.
//
// showNotification() on the service worker registration is the API that works
// in both places, so it is tried first. The constructor stays as a fallback
// for a browser with no service worker controlling the page — a fresh first
// load before the worker activates, or a browser with SW disabled.

/**
 * The bridge, when this page runs inside the app's own WebView.
 *
 * A WebView implements no part of the Notification API — not the constructor,
 * not a service worker to fall back to — so in the shell every path below is a
 * silent no-op, which is the exact failure this file was written to end, one
 * platform later. The app can post a notification perfectly well; it just has
 * to be asked in Java.
 */
function shell() {
  try {
    const b = typeof window !== 'undefined' ? window.AndroidBridge : null
    return b && typeof b.showLocalNotification === 'function' ? b : null
  } catch { return null }
}

/** Whether we can show anything at all. */
export function canNotify() {
  const b = shell()
  if (b) {
    try { return !!b.notificationsAllowed() } catch { return false }
  }
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

/**
 * Ask for permission to show these, from inside the tap that wants it.
 *
 * One dialog either way: the browser's where there is a browser, Android's in
 * the shell. The shell's answer does not arrive in a promise — it is decided
 * by a system dialog over a separate Activity — so this resolves on what the
 * OS says once the user is back, and callers repaint from canNotify().
 */
export async function requestNotifyPermission() {
  const b = shell()
  if (b) {
    if (canNotify()) return true
    try { b.requestNotificationPermission() } catch { return false }
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline && !canNotify()) {
      await new Promise(r => setTimeout(r, 300))
    }
    return canNotify()
  }

  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  try { return (await Notification.requestPermission()) === 'granted' } catch { return false }
}

/**
 * Show one notification from the page. Resolves true if it was shown.
 *
 * Never throws: a notification that cannot be shown must not take down the
 * alert-checking loop that asked for it.
 */
export async function showLocalNotification(title, options = {}) {
  if (!canNotify()) return false

  const b = shell()
  if (b) {
    try {
      b.showLocalNotification(title, options.body || '', options.data?.url || '')
      return true
    } catch { return false }
  }

  // The path that works on Android. `ready` resolves only once a worker is
  // active, so this is also the check for "is there one".
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    try {
      const reg = await navigator.serviceWorker.ready
      if (reg?.showNotification) {
        await reg.showNotification(title, options)
        return true
      }
    } catch { /* fall through to the constructor */ }
  }

  try {
    new Notification(title, options)
    return true
  } catch { return false }
}
