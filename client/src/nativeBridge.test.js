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

  it('is false off Android, referrer notwithstanding', async () => {
    for (const ua of [DESKTOP, IPHONE]) {
      setUA(ua)
      setReferrer('android-app://live.walletlens.twa')
      const { isAndroidTWA } = await load()
      expect(isAndroidTWA()).toBe(false)
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
