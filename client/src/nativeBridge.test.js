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
  it('opens the URL in a hidden iframe rather than navigating', async () => {
    const { fireNativeIntent } = await load()
    const before = window.location.href

    expect(fireNativeIntent('walletlens://widget-sync?data=%7B%7D')).toBe(true)

    const frames = [...document.querySelectorAll('iframe')]
    expect(frames).toHaveLength(1)
    expect(frames[0].getAttribute('src')).toBe('walletlens://widget-sync?data=%7B%7D')
    expect(frames[0].style.display).toBe('none')
    expect(window.location.href).toBe(before)
  })
})
