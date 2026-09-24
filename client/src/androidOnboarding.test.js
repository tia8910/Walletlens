import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// NativeOnboarding is Android-only. The Windows Store (MSIX) build launches in
// display-mode: standalone, so isInstalledApp() is true there and the phone
// onboarding — swipe/arrow-key navigation, no mouse controls — used to take
// over the welcome flow for desktop users, who reported it as a freeze.
// Non-Android users get the mouse-friendly browser welcome instead. Both
// flows record the same `wl_welcomed_v2` key, so existing completions carry
// over and nothing downstream (NotificationPrimer, push) can tell the
// difference.

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, 'App.jsx'), 'utf8')
const bridge = readFileSync(join(here, 'nativeBridge.js'), 'utf8')

describe('native onboarding is Android-only', () => {
  it('exports an Android gate that does not consult display-mode', () => {
    expect(bridge).toMatch(/export function isAndroidApp\(\)/)
    const body = bridge.slice(bridge.indexOf('export function isAndroidApp'))
    expect(body).toMatch(/AndroidBridge/)
    expect(body).toMatch(/isAndroidTWA\(\)/)
    expect(body).not.toMatch(/matchMedia/)
    expect(body).not.toMatch(/display-mode/)
  })

  it('renders NativeOnboarding only when installed AND Android', () => {
    expect(app).toMatch(/isStandalone && isAndroid && !onboardDone/)
    expect(app).toMatch(/<NativeOnboarding/)
  })

  it('renders the browser welcome for everyone else', () => {
    expect(app).toMatch(/\(!isStandalone \|\| !isAndroid\)/)
    expect(app).toMatch(/<WelcomeModal/)
  })
})
