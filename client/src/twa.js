// Detection for the Google Play (Trusted Web Activity) app context.
//
// The Play build must not expose the $LENZ token / airdrop pages: Google
// Play's financial-features and contest policies treat token-reward programs
// far more strictly than a portfolio tracker, and a reviewer finding them
// can reclassify or reject the app. The web app is unaffected.
//
// The TWA launches with an `android-app://<package>` referrer on the first
// navigation only, so index.html persists the flag before the app boots and
// this module re-checks as a fallback for non-standard boot paths.

const TWA_KEY = 'wl_twa'
const TWA_REFERRER = 'android-app://live.walletlens.twa'

export function isTwa() {
  try {
    if (localStorage.getItem(TWA_KEY) === '1') return true
    if (typeof document !== 'undefined' && document.referrer.startsWith(TWA_REFERRER)) {
      localStorage.setItem(TWA_KEY, '1')
      return true
    }
  } catch {}
  return false
}
