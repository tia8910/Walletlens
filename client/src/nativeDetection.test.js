import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// isAndroidTWA() is the switch under the whole native bridge: the widget sync,
// the review prompt, App Lock in Settings, and the security slide in
// onboarding. All four are SUPPOSED to be absent off Android, so when the
// switch is wrong they do not fail — they simply vanish, and each absence
// reads as its own separate bug.
//
// THE BUG: the function opened with `if (!/android/i.test(ua)) return false`.
// That reads as a cheap early-out and is really a single point of failure. Any
// user-agent without an Android token — Chrome's "Desktop site", which
// persists per site and applies inside the TWA's Custom Tab, or any
// UA-reducing setting — took the entire bridge down, while the referrer sitting
// right there proved the app had launched the page.

const here = dirname(fileURLToPath(import.meta.url))

const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
const APP_REFERRER = 'android-app://live.walletlens.twa'

/** Load a fresh copy of the module under a given UA and referrer. */
async function detect({ ua, referrer }) {
  vi.resetModules()
  vi.stubGlobal('navigator', { userAgent: ua })
  Object.defineProperty(globalThis.document, 'referrer', {
    value: referrer, configurable: true,
  })
  try { sessionStorage.clear() } catch { /* not always present */ }
  const mod = await import('./nativeBridge.js')
  return mod.isAndroidTWA()
}

describe('detecting the installed app', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it('trusts the app referrer even when the user-agent says desktop', () => {
    // The case that broke everything. Desktop site is a display preference;
    // it does not stop the app being the app.
    return expect(detect({ ua: DESKTOP_UA, referrer: APP_REFERRER })).resolves.toBe(true)
  })

  it('still recognises the ordinary Android launch', () => {
    return expect(detect({ ua: ANDROID_UA, referrer: APP_REFERRER })).resolves.toBe(true)
  })

  it('is false in a plain browser, on either user-agent', async () => {
    await expect(detect({ ua: ANDROID_UA, referrer: '' })).resolves.toBe(false)
    await expect(detect({ ua: DESKTOP_UA, referrer: '' })).resolves.toBe(false)
  })

  it('does not accept another app’s referrer', () => {
    // Chrome sets an android-app:// referrer for ANY Custom Tab opened by ANY
    // app. Matching the scheme alone made every link shared from WhatsApp or
    // Telegram look like the installed app.
    return expect(detect({ ua: ANDROID_UA, referrer: 'android-app://com.whatsapp' }))
      .resolves.toBe(false)
  })
})

describe('the readout that explains the others', () => {
  it('shows the widgets panel whenever the app is detected', () => {
    // Gating this on the user-agent alone hid it in precisely the case it
    // exists to diagnose.
    const settings = readFileSync(join(here, 'pages', 'Settings.jsx'), 'utf8')
    const decl = /const isAndroid = [\s\S]*?\n(?=\n)/.exec(settings)?.[0] || ''
    expect(decl).toMatch(/isAndroidTWA\(\)/)
  })
})
