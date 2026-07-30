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

/**
 * Open a walletlens:// URL without touching the page the user is looking at.
 *
 * A hidden iframe rather than location.href: these are background handoffs,
 * and assigning to location would navigate the app away — or strand the user
 * on an error page if no activity claims the scheme (older builds, or the
 * site opened in a normal browser).
 *
 * @param {string} url  a walletlens:// URL
 * @returns {boolean}   whether the intent was fired
 */
export function fireNativeIntent(url) {
  try {
    if (typeof document === 'undefined') return false
    const frame = document.createElement('iframe')
    frame.style.display = 'none'
    frame.src = url
    document.body.appendChild(frame)
    setTimeout(() => { try { frame.remove() } catch { /* already gone */ } }, 1500)
    return true
  } catch {
    return false
  }
}
