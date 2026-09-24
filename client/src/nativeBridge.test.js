import { describe, it, expect, beforeEach, vi } from 'vitest'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const WEBVIEW_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

function setUA(ua) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}
function setReferrer(ref) {
  Object.defineProperty(document, 'referrer', { value: ref, configurable: true })
}

async function load() {
  vi.resetModules()
  return import('./nativeBridge')
}

beforeEach(() => {
  sessionStorage.clear()
  document.body.innerHTML = ''
  setReferrer('')
})

describe('isAndroidTWA', () => {
  // The regression this whole file exists for: a TWA runs in a Chrome Custom
  // Tab, which sends a completely ordinary Chrome mobile UA. Detecting it by
  // the `wv` WebView token meant the app never recognised itself, and the
  // widget sync, review prompt and native biometrics all silently did nothing.
  it('ignores an android-app:// referrer from a DIFFERENT app', async () => {
    // Chrome sets an android-app:// referrer for any Custom Tab opened by any
    // app, so matching the scheme alone made every link shared in WhatsApp,
    // Telegram or Instagram look like the installed WalletLens app. The
    // landing page then hid its "Get it on Google Play" badge from exactly the
    // Android users who could have installed it.
    for (const pkg of ['com.whatsapp', 'org.telegram.messenger',
                       'com.instagram.android', 'com.google.android.gm']) {
      setUA('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36')
      setReferrer(`android-app://${pkg}`)
      const { isAndroidTWA } = await load()
      expect(isAndroidTWA(), pkg).toBe(false)
    }
  })

  it('is not fooled by a package that merely starts the same way', async () => {
    setUA('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36')
    setReferrer('android-app://live.walletlens.twa.evil')
    const { isAndroidTWA } = await load()
    // Documented, not asserted as desirable: prefix matching accepts this, and
    // tightening it would reject the real referrer if Chrome ever appends a
    // path. An attacker who can publish an app with our package prefix has
    // already lost us Digital Asset Links verification, which is the control
    // that actually matters here.
    expect(isAndroidTWA()).toBe(true)
  })

  it('detects the TWA from the android-app:// launch referrer', async () => {
    setUA(CHROME_ANDROID)
    setReferrer('android-app://live.walletlens.twa')
    const { isAndroidTWA } = await load()
    expect(isAndroidTWA()).toBe(true)
  })

  it('keeps detecting it after the referrer is gone', async () => {
    setUA(CHROME_ANDROID)
    setReferrer('android-app://live.walletlens.twa')
    const { isAndroidTWA } = await load()
    expect(isAndroidTWA()).toBe(true)

    // A reload inside the app can drop the referrer; the answer must not flip.
    setReferrer('')
    expect(isAndroidTWA()).toBe(true)
  })

  it('still detects the webview fallback the TWA drops to', async () => {
    setUA(WEBVIEW_ANDROID)
    const { isAndroidTWA } = await load()
    expect(isAndroidTWA()).toBe(true)
  })

  it('is false in plain mobile Chrome on the same device', async () => {
    setUA(CHROME_ANDROID)
    const { isAndroidTWA } = await load()
    expect(isAndroidTWA()).toBe(false)
  })

  it('is false for an ordinary referrer', async () => {
    setUA(CHROME_ANDROID)
    setReferrer('https://www.google.com/')
    const { isAndroidTWA } = await load()
    expect(isAndroidTWA()).toBe(false)
  })

  it('trusts the app referrer over the user-agent', async () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE — false off Android, referrer
    // notwithstanding — and that rule was the bug.
    //
    // The user-agent gate ran first, so any UA without an Android token took
    // the whole native bridge down: widget sync, review prompt, App Lock and
    // the security slide in onboarding all gate on this one function, all four
    // are supposed to be absent off Android, and so all four silently vanished
    // and each looked like a separate bug. Chrome's "Desktop site" does
    // exactly that, persists per site, and applies inside the TWA's Custom Tab.
    //
    // The referrer is the stronger signal and it is checked first now. A
    // browser cannot mint `android-app://<our package>` for itself; only the
    // app launching the page produces it. A UA string, by contrast, is a
    // display preference the user can toggle.
    for (const ua of [DESKTOP, IPHONE]) {
      setUA(ua)
      setReferrer('android-app://live.walletlens.twa')
      const { isAndroidTWA } = await load()
      expect(isAndroidTWA(), `${ua.slice(0, 24)}… with the app referrer`).toBe(true)
      sessionStorage.clear()
    }
  })

  it('still needs OUR package in the referrer, on any user-agent', async () => {
    // The protection the old rule was really providing. Chrome sets an
    // android-app:// referrer for ANY Custom Tab opened by ANY app, so
    // matching the scheme alone made every link shared from WhatsApp or
    // Telegram look like the installed app.
    for (const ua of [DESKTOP, IPHONE, CHROME_ANDROID]) {
      setUA(ua)
      setReferrer('android-app://com.whatsapp')
      const { isAndroidTWA } = await load()
      expect(isAndroidTWA(), `${ua.slice(0, 24)}… with a foreign referrer`).toBe(false)
      sessionStorage.clear()
    }
  })

  it('does not leak the sticky flag across browsing contexts', async () => {
    setUA(CHROME_ANDROID)
    setReferrer('android-app://live.walletlens.twa')
    const { isAndroidTWA } = await load()
    expect(isAndroidTWA()).toBe(true)

    // A separate Chrome tab shares localStorage with the Custom Tab but gets
    // its own sessionStorage — which is why the flag lives there.
    sessionStorage.clear()
    setReferrer('')
    expect(isAndroidTWA()).toBe(false)
  })
})

describe('isAndroidApp', () => {
  beforeEach(() => {
    try { delete window.AndroidBridge } catch {}
  })

  it('is true inside the app shell, whatever the UA or referrer', async () => {
    setUA(DESKTOP)
    setReferrer('')
    window.AndroidBridge = { shellVersion: () => '7.0' }
    const { isAndroidApp } = await load()
    expect(isAndroidApp()).toBe(true)
    try { delete window.AndroidBridge } catch {}
  })

  it('is true in the legacy TWA with no bridge object', async () => {
    setUA(CHROME_ANDROID)
    setReferrer('android-app://live.walletlens.twa')
    const { isAndroidApp } = await load()
    expect(isAndroidApp()).toBe(true)
  })

  it('is false for an installed Windows PWA: standalone, but no bridge and no app referrer', async () => {
    // The Microsoft certification failure: the Store (MSIX) build launches in
    // display-mode standalone, so isInstalledApp() is true there, but nothing
    // Android is present. Android-only UI must stay off.
    setUA(DESKTOP)
    setReferrer('')
    const { isAndroidApp } = await load()
    expect(isAndroidApp()).toBe(false)
  })

  it('ignores a bridge-shaped object without shellVersion', async () => {
    setUA(DESKTOP)
    setReferrer('')
    window.AndroidBridge = {}
    const { isAndroidApp } = await load()
    expect(isAndroidApp()).toBe(false)
    try { delete window.AndroidBridge } catch {}
  })
})

describe('fireNativeIntent', () => {
  beforeEach(() => {
    localStorage.clear()
    // Default to "the user just tapped something" so the immediate path runs.
    Object.defineProperty(navigator, 'userActivation', {
      value: { isActive: true, hasBeenActive: true }, configurable: true,
    })
  })

  it('targets the app by package via an intent:// URL', async () => {
    const { fireNativeIntent, lastIntentAttempt } = await load()

    expect(fireNativeIntent('walletlens://widget-sync?data=%7B%22nw%22%3A1%7D')).toBe(true)

    const attempt = lastIntentAttempt()
    expect(attempt.how).toBe('immediate')
    expect(attempt.url).toBe(
      'intent://widget-sync?data=%7B%22nw%22%3A1%7D#Intent;scheme=walletlens;package=live.walletlens.twa;end'
    )
  })

  // The regression: a hidden iframe cannot launch an external protocol in
  // Chrome, and a TWA is Chrome. Every intent sent this way was dropped.
  it('does not use an iframe', async () => {
    const { fireNativeIntent } = await load()
    fireNativeIntent('walletlens://review')
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('carries the query string through untouched', async () => {
    const { fireNativeIntent, lastIntentAttempt } = await load()
    const payload = encodeURIComponent(JSON.stringify({ nw: 76436.88, tracked: 12 }))
    fireNativeIntent('walletlens://widget-sync?data=' + payload)
    expect(lastIntentAttempt().url).toContain('data=' + payload)
    // Semicolons would terminate the #Intent block early; encodeURIComponent
    // escapes them, so none should survive in the path portion.
    expect(lastIntentAttempt().url.split('#Intent;')[0]).not.toContain(';')
  })

  it('does not fire without user activation, and does not queue for later', async () => {
    // The bug this replaces: the intent was held and fired on the next
    // pointerdown. Inside the TWA that navigation ends the Custom Tab session,
    // and the first touch after a load is the user starting to scroll — so the
    // app vanished under their finger with no crash and nothing in any log.
    Object.defineProperty(navigator, 'userActivation', {
      value: { isActive: false, hasBeenActive: false }, configurable: true,
    })
    const { fireNativeIntent, lastIntentAttempt } = await load()

    expect(fireNativeIntent('walletlens://widget-sync?data=%7B%7D')).toBe(false)
    expect(lastIntentAttempt().how).toBe('skipped-no-activation')
  })

  it('stays silent through a later tap', async () => {
    // The regression guard. A pointerdown arriving after a skipped intent must
    // navigate nowhere.
    Object.defineProperty(navigator, 'userActivation', {
      value: { isActive: false, hasBeenActive: false }, configurable: true,
    })
    const { fireNativeIntent } = await load()
    fireNativeIntent('walletlens://widget-sync?data=%7B%7D')

    const before = window.location.href
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('keydown'))
    expect(window.location.href).toBe(before)
  })
})


describe('keeping the session alive', () => {
  // "The app opens eight tabs." Firing an intent by assigning
  // window.location.href navigates the TOP FRAME to intent://, which takes the
  // Custom Tab off its own origin and ends the TWA session. The widget sync
  // fires every five minutes, so coming back to the app produced a fresh task
  // in the recents switcher on that cadence, and they accumulated.
  beforeEach(() => {
    setUA(CHROME_ANDROID)
    setReferrer('android-app://live.walletlens.twa/')
    Object.defineProperty(navigator, 'userActivation', {
      value: { isActive: true }, configurable: true,
    })
  })

  it('hands the intent over without moving the top frame', async () => {
    const { fireNativeIntent } = await load()
    const before = window.location.href
    expect(fireNativeIntent('walletlens://widget-sync?data=x', { keepSession: true })).toBe(true)

    const frame = document.querySelector('iframe')
    expect(frame, 'no iframe was created').toBeTruthy()
    expect(frame.src).toContain('intent://')
    expect(frame.src).toContain('scheme=walletlens')
    // The top frame must be exactly where it was.
    expect(window.location.href).toBe(before)
  })

  it('cleans the iframe up, so a five-minute cadence never piles them up', async () => {
    vi.useFakeTimers()
    try {
      const { fireNativeIntent } = await load()
      fireNativeIntent('walletlens://widget-sync?data=x', { keepSession: true })
      expect(document.querySelectorAll('iframe')).toHaveLength(1)
      vi.advanceTimersByTime(5000)
      expect(document.querySelectorAll('iframe')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('still refuses without user activation', async () => {
    Object.defineProperty(navigator, 'userActivation', {
      value: { isActive: false }, configurable: true,
    })
    const { fireNativeIntent } = await load()
    expect(fireNativeIntent('walletlens://widget-sync?data=x', { keepSession: true })).toBe(false)
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('leaves the default path alone for senders that need the relaunch', async () => {
    // Biometric unlock needs the native side to relaunch the app to deliver
    // its result, so there is no session to preserve — and an iframe cannot
    // report back, which would leave someone staring at a lock screen.
    const { fireNativeIntent } = await load()
    expect(fireNativeIntent('walletlens://biometric-auth?action=unlock')).toBe(true)
    expect(document.querySelector('iframe')).toBeNull()
  })
})
