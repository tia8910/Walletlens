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

/** Whether the browser will show us anything at all. */
export function canNotify() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

/**
 * Show one notification from the page. Resolves true if it was shown.
 *
 * Never throws: a notification that cannot be shown must not take down the
 * alert-checking loop that asked for it.
 */
export async function showLocalNotification(title, options = {}) {
  if (!canNotify()) return false

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
