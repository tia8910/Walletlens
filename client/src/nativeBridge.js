// Shared plumbing for talking to the native Android shell.
//
// walletlens.live renders inside a Chrome Custom Tab in the TWA, so the page
// and the native code are in different processes and share no storage. The
// only channel between them is a custom-scheme intent: the page opens a
// walletlens:// URL, and an activity in the manifest picks it up.
//
// Everything here is a no-op outside the installed Android app.

// Remembers a positive detection for the rest of the browsing context.
// sessionStorage rather than localStorage on purpose: the TWA's Custom Tab
// shares Chrome's profile, so a persisted flag would leak into ordinary
// browser tabs on the same device and make the site think it was the app.
const TWA_FLAG = 'wl_is_twa'

/**
 * True inside the WalletLens TWA.
 *
 * DO NOT sniff for the `wv` user-agent token here. That token marks an Android
 * *WebView*, and a TWA is not a WebView — it renders in a Chrome Custom Tab,
 * which sends an ordinary Chrome mobile UA. Testing for `wv` is what made this
 * function return false inside the real app, silently disabling the widget
 * sync, the review prompt and the native biometric path all at once.
 *
 * The reliable signal is the referrer: a Trusted Web Activity launches its
 * start URL with `document.referrer` set to `android-app://<package>`. That
 * only holds for the launch navigation, so a positive result is remembered —
 * client-side routing never changes the referrer, but a reload can.
 *
 * The `wv` check is kept as a secondary signal, for the webview fallback the
 * TWA drops to when no Custom Tab provider is available.
 */
export function isAndroidTWA() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (!/android/i.test(ua)) return false

  try {
    if (sessionStorage.getItem(TWA_FLAG) === '1') return true
  } catch { /* storage blocked; fall through to the live checks */ }

  const referrer = (typeof document !== 'undefined' && document.referrer) || ''
  const launchedByApp = referrer.startsWith('android-app://')
  const webViewFallback = /wv\)/.test(ua) || /; wv/.test(ua)

  if (launchedByApp || webViewFallback) {
    try { sessionStorage.setItem(TWA_FLAG, '1') } catch { /* fine, re-detect */ }
    return true
  }
  return false
}

const PACKAGE = 'live.walletlens.twa'
const LAST_INTENT_KEY = 'wl_last_intent'

/**
 * Rewrite walletlens://host?query as the intent:// form Chrome understands.
 *
 * Naming the package matters: Chrome routes a packaged intent:// straight to
 * that app instead of treating it as an unknown external protocol, and it does
 * not navigate the page when the activity resolves — the Custom Tab is simply
 * backgrounded while the activity runs and finishes.
 *
 * No S.browser_fallback_url on purpose. A fallback would fire on every failure,
 * and for the background widget sync that means a reload loop. Callers only
 * reach here when isAndroidTWA() is true, so the app is installed.
 */
function toIntentUrl(url) {
  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(url)
  if (!m) return url
  return `intent://${m[2]}#Intent;scheme=${m[1]};package=${PACKAGE};end`
}

/** Last intent we attempted, for the Settings readout. */
export function lastIntentAttempt() {
  try { return JSON.parse(localStorage.getItem(LAST_INTENT_KEY) || 'null') } catch { return null }
}

function record(url, how) {
  try {
    localStorage.setItem(LAST_INTENT_KEY, JSON.stringify({ at: Date.now(), url, how }))
  } catch { /* diagnostics only */ }
}

/**
 * Hand a walletlens:// URL to the native app.
 *
 * THIS USED TO USE A HIDDEN IFRAME. It doesn't work: Chrome blocks external
 * protocol launches from iframes, and a TWA is Chrome — the page renders in a
 * Custom Tab, not a WebView. Every intent this app has ever sent was dropped
 * on the floor, which is why the widgets stayed empty and the review card
 * never appeared even though the web side reported success.
 *
 * Top-frame navigation to an intent:// URL is what actually works. Chrome also
 * wants a user activation for external protocols, so when there isn't one —
 * the background widget sync runs from an effect, not a tap — the launch is
 * deferred to the next interaction rather than being thrown away.
 *
 * @param {string} url  a walletlens:// URL
 * @returns {boolean}   whether the launch was issued or queued
 */
export function fireNativeIntent(url) {
  try {
    if (typeof window === 'undefined') return false
    const target = toIntentUrl(url)

    // navigator.userActivation is Chrome 72+; when it's missing, assume we're
    // allowed and let the navigation itself be the test.
    const activation = typeof navigator !== 'undefined' ? navigator.userActivation : null
    if (activation && !activation.isActive) {
      // Do not fire, and above all do not queue this for the next tap.
      //
      // Firing an intent means navigating the top frame to intent://, which
      // takes the Custom Tab off its own origin. Inside the TWA that ends the
      // session and the app disappears — no crash, nothing in any log, because
      // nothing crashed.
      //
      // This used to wait for the next pointerdown and fire then. The first
      // touch after a page load is almost always the user starting to scroll,
      // so a sync requested during load detonated under their finger a second
      // later. It read exactly like "the app closes when I scroll", and it was
      // invisible on the web, where isAndroidTWA() is false and none of this
      // runs at all.
      //
      // A navigation this disruptive may only happen in the same gesture the
      // user actually made. If there is no activation, the caller's payload is
      // already stored; Settings → Sync now can push it deliberately.
      record(target, 'skipped-no-activation')
      return false
    }

    record(target, 'immediate')
    try { window.location.href = target } catch { /* scheme rejected */ }
    return true
  } catch {
    return false
  }
}
