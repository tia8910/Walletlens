// Shared plumbing for talking to the native Android shell.
//
// walletlens.live renders inside a Chrome Custom Tab in the TWA, so the page
// and the native code are in different processes and share no storage. The
// only channel between them is a custom-scheme intent: the page opens a
// walletlens:// URL, and an activity in the manifest picks it up.
//
// Everything here is a no-op outside the installed Android app.

/**
 * True inside the WalletLens TWA.
 *
 * The Custom Tab that renders the app reports itself as an Android webview,
 * which is what separates it from plain Chrome on the same device.
 */
export function isAndroidTWA() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /android/i.test(ua) && (/wv\)/.test(ua) || /; wv/.test(ua))
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
