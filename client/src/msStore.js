// The Microsoft Store edition.
//
// The Store package is this same web app in its own window. Microsoft Store
// policy 10.1.5 forbids an app from promoting another platform, so inside that
// window nothing may point to Google Play or the Chrome Web Store, and the
// marketing pages (which exist to send people to those stores) are skipped.
//
// The package opens with ?store=msstore in its start URL, and that is
// remembered inside the installed app window, so every later navigation still
// knows. As a fallback for a package built before the parameter existed, a
// Windows window running as an installed app counts too: on Windows that is the
// Store build or a PWA installed from Edge, and hiding other stores from either
// is harmless.
//
// A browser tab is never affected for longer than one page load: opening
// ?store=msstore in a tab (to test the Store link, say) used to stick for good,
// hiding every store link and the Bybit offer from that browser. The flag is
// now only kept in an app window, and a stale one in a tab is cleared.

export const MS_STORE_PARAM = 'store'
export const MS_STORE_VALUE = 'msstore'
const KEY = 'wl_store'

// Marketing pages that only exist to send people to a store or into the app.
// Inside the Store edition they open the app instead.
export const MS_STORE_SKIP_PATHS = new Set([
  '/', '/tour', '/ecosystem', '/free-net-worth-tracker', '/crypto-and-stock-portfolio-tracker',
  '/portfolio-tracker-no-account', '/import-portfolio-from-screenshot', '/add-holdings-by-voice',
])

/** Whether the page runs in its own installed app window, not a browser tab. */
function appWindow(win) {
  try {
    const mm = win.matchMedia
    return !!(mm && (mm('(display-mode: standalone)').matches || mm('(display-mode: window-controls-overlay)').matches))
  } catch { return false }
}

function installedWindowsApp(win) {
  try { return /Windows/i.test(win.navigator?.userAgent || '') && appWindow(win) } catch { return false }
}

/** Decides once per page load, and remembers a positive answer. */
export function detectMsStore(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return false
  let stored = null
  try { stored = win.localStorage.getItem(KEY) } catch {}
  let param = null
  try { param = new URLSearchParams(win.location.search).get(MS_STORE_PARAM) } catch {}
  const app = appWindow(win)
  const yes = param === MS_STORE_VALUE || (stored === MS_STORE_VALUE && app) || installedWindowsApp(win)
  if (yes && app && stored !== MS_STORE_VALUE) {
    try { win.localStorage.setItem(KEY, MS_STORE_VALUE) } catch {}
  }
  // A flag left behind in a browser tab: forget it, so the site works normally.
  if (stored === MS_STORE_VALUE && !app) {
    try { win.localStorage.removeItem(KEY) } catch {}
  }
  return yes
}

let cached
export function isMsStore() {
  if (cached === undefined) cached = detectMsStore()
  return cached
}

/** True for a marketing page the Store edition opens the app in place of. */
export function msStoreSkips(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '').replace(/^\/ar(?=\/)/, '') || '/'
  return MS_STORE_SKIP_PATHS.has(path)
}

/** Test hook. */
export function _resetMsStore() { cached = undefined }

/**
 * Runs before React mounts: marks <html> so the stylesheet can drop any store
 * link that slips through, and sends a marketing page straight to the app.
 * Returns true when it navigated away, so the caller can skip mounting.
 */
export function applyMsStore(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win || !isMsStore()) return false
  win.document.documentElement.classList.add('wl-msstore')
  if (msStoreSkips(win.location.pathname)) {
    win.location.replace('/dashboard' + win.location.search)
    return true
  }
  return false
}
