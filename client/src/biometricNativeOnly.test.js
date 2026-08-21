// App Lock is a feature of the Android app, and only of the Android app.
//
// The bug this guards against was reported from a device: opening the site in
// a browser showed "WalletLens is locked" with nothing that could unlock it.
// The TWA and Chrome share one origin's localStorage, so switching the lock on
// in the app also set the flag a browser tab reads — and the browser had no
// credential to authenticate against, because the app's lock is a native
// prompt that stores nothing WebAuthn can use.
//
// There is no component harness here, so this reads the source. That is weaker
// than rendering, but it covers the thing that actually went wrong: a lock
// trigger that fires without checking where it is running.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'components/BiometricLock.jsx'),
  'utf8',
)

describe('App Lock always has a way out', () => {
  it('arms the escape hatch on a timer, not only on failed attempts', () => {
    // Reported from a device, with Android's own toast on screen: "screen
    // touches may be delayed or not recognised". The unlock needs a tap, the
    // tap never lands, so no attempt ever fails — and an escape hatch keyed on
    // failures is unreachable. The data is local, so there is no other device
    // to log in from. Being stuck here means losing the portfolio.
    expect(src).toContain('RECOVER_AFTER_MS')
    expect(src).toMatch(/setTimeout\(\(\) => setRecover\(true\), RECOVER_AFTER_MS\)/)
  })

  it('keeps the hatch reachable after repeated cancels too', () => {
    expect(src).toMatch(/attemptCount\.current >= 2\) setRecover\(true\)/)
  })

  it('leaves a way to disable the lock and get back in', () => {
    expect(src).toMatch(/function recoverEntry[\s\S]{0,200}?removeItem\('wl_biometric_enabled'\)/)
  })
})

describe('App Lock is native-only', () => {
  it('offers the lock only inside the Android app', () => {
    // Was `isAndroidTWA || supportsWebAuthn()`, which is what put the lock in
    // front of browser users in the first place.
    expect(src).toMatch(/const \[available\] = useState\(\(\) => isAndroidTWA\)/)
    expect(src).not.toContain('supportsWebAuthn')
  })

  it('guards every path that can set locked = true', () => {
    // Three of them, and each one alone is enough to strand a browser user:
    // cold open, re-lock on return, and the ?biometric_auth= result.
    const guards = [...src.matchAll(/if \(!isAndroidTWA\) return/g)]
    expect(guards.length).toBeGreaterThanOrEqual(3)
  })

  it('refuses to render the lock screen or the Settings row outside the app', () => {
    expect(src).toMatch(/export function BiometricLockScreen[\s\S]{0,400}?if \(!isAndroidTWA\) return null/)
    expect(src).toMatch(/export function BiometricToggle[\s\S]{0,400}?if \(!isAndroidTWA\) return null/)
  })
})
