import { useState, useEffect, useRef } from 'react'
import { useLanguage } from '../LanguageContext'
import Icon from './Icon'
import { track } from '../analytics'
import { fireNativeIntent, isAndroidTWA as detectAndroidTWA } from '../nativeBridge'

const ENABLED_KEY  = 'wl_biometric_enabled'  // also stored in native SharedPrefs
const SESSION_KEY  = 'wl_biometric_unlocked'
const CRED_KEY     = 'wl_biometric_cred'   // base64url of the registered credential id
const HIDDEN_AT    = 'wl_biometric_hidden_at'  // timestamp the app was last backgrounded

// Grace period: returning within this window (quick app-switch, screen blink,
// the OS biometric sheet backgrounding us) does NOT re-prompt. A real absence
// still locks. Matches how banking apps behave.
const RELOCK_GRACE_MS = 60 * 1000

/**
 * How long the lock screen may sit there before it offers a way out.
 *
 * Long enough that it is not the first thing a user reaches for, short enough
 * that being stuck is a nuisance rather than a lockout.
 */
const RECOVER_AFTER_MS = 12 * 1000

/** Where the last unlock request is stamped; see unlock(). */
const UNLOCK_SENT_KEY = 'wl_biometric_unlock_at'

/**
 * How long an unlock counts as still in flight.
 *
 * Comfortably longer than the transient user activation that let the loop run
 * (a few seconds), and short enough that a genuine retry after a cancelled
 * prompt is not held up for long — and a user tap overrides it regardless.
 */
const UNLOCK_IN_FLIGHT_MS = 15 * 1000

function unlockJustRequested() {
  try {
    return Date.now() - Number(localStorage.getItem(UNLOCK_SENT_KEY) || 0) < UNLOCK_IN_FLIGHT_MS
  } catch { return false }
}

function noteUnlockRequested() {
  try { localStorage.setItem(UNLOCK_SENT_KEY, String(Date.now())) } catch { /* private mode */ }
}

// Module-level guard: true while a WebAuthn prompt is on screen. The system
// biometric sheet briefly backgrounds the page (visibilitychange → hidden),
// which would otherwise re-lock us mid-authentication and loop forever.
let authInProgress = false

// ── Android TWA detection ─────────────────────────────────────────────────
//
// Inside the Android TWA we can use native intent URLs
// (walletlens://biometric-auth) to trigger the platform BiometricPrompt
// instead of WebAuthn, giving a true native app feel.
//
// This used to sniff the user agent for `wv` here, described as "the Chromium
// Custom Tab token". It isn't — `wv` marks an Android WebView, and a TWA is a
// Custom Tab running real Chrome, so the check was always false in the app and
// this component silently fell back to WebAuthn. Detection now lives in
// nativeBridge, which uses the android-app:// launch referrer.
const isAndroidTWA = detectAndroidTWA()

/**
 * Launch the native BiometricActivity via a custom scheme intent URL.
 * The TWA's AndroidManifest routes walletlens://biometric-auth URIs to
 * our BiometricActivity which shows the system BiometricPrompt dialog.
 */
// Routed through fireNativeIntent rather than assigning window.location
// directly, which is what this used to do.
//
// Firing a custom-scheme URL navigates the top frame off the Custom Tab's own
// origin, and inside the TWA that ends the session — the app simply vanishes,
// with nothing in any log because nothing crashed. nativeBridge refuses to do
// it outside a real user gesture for exactly that reason, and this file had
// its own copy that skipped the check.
//
// It matters most here: the lock screen auto-prompts on mount, which is by
// definition not a gesture. Returns false when it declined, so the caller can
// fall back to asking the user to tap.
/**
 * Set the app's own App Lock flag through the bridge.
 *
 * Returns false when there is no bridge — a TWA install, or a browser — and
 * the caller falls back to the intent. Read straight off window rather than
 * through nativeShell.js, which imports the backup code and with it half the
 * app; this file is loaded on the lock screen, before anything else.
 *
 * @returns {boolean} whether the app was actually told
 */
/**
 * Ask the app to raise the fingerprint prompt.
 *
 * @returns {boolean} whether the app was reached at all — false in a TWA
 *   install or a browser, where the caller falls back to the intent.
 */
function promptNativeAppLock() {
  try {
    const b = window.AndroidBridge
    if (!b || typeof b.promptAppLock !== 'function') return false
    b.promptAppLock()
    return true
  } catch { return false }
}

/**
 * Ask the app to raise the unlock prompt.
 *
 * @returns {boolean} whether the app was reached — false in a TWA install or a
 *   browser, where the caller falls back to the intent.
 */
function promptNativeUnlock() {
  try {
    const b = window.AndroidBridge
    if (!b || typeof b.promptAppUnlock !== 'function' || typeof b.appUnlocked !== 'function') {
      return false
    }
    b.promptAppUnlock()
    return true
  } catch { return false }
}

/**
 * Wait for the app to report itself unlocked.
 *
 * A minute: a fingerprint that will not read is retried, a face that is not
 * presented times out, and the person doing it is standing between their
 * portfolio and the screen. Giving up returns false, which the caller reports
 * as declined rather than as unlocked.
 */
async function waitForUnlock() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try { if (window.AndroidBridge.appUnlocked()) return true } catch { return false }
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

/** Whether the app can be asked about its own App Lock flag. */
function appLockReadable() {
  try { return typeof window.AndroidBridge?.appLockEnabled === 'function' } catch { return false }
}

/**
 * Wait for the app to report the lock as on.
 *
 * The prompt is a system dialog over a separate Activity, so its outcome lands
 * in the app's own state rather than in anything JavaScript can await. Polling
 * with a deadline is the honest shape of that; giving up returns false, which
 * the caller reports as "not enabled" rather than claiming a lock that is not
 * armed.
 */
async function waitForAppLock() {
  // Long enough for a considered fingerprint, short enough that a prompt which
  // never appeared reports back rather than holding the button indefinitely.
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try { if (window.AndroidBridge.appLockEnabled()) return true } catch { return false }
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

function setNativeAppLock(on) {
  try {
    const b = window.AndroidBridge
    if (!b || typeof b.setAppLock !== 'function') return false
    b.setAppLock(!!on)
    return true
  } catch { return false }
}

function sendNativeIntent(action, redirectUrl) {
  const base = 'walletlens://biometric-auth?action=' + encodeURIComponent(action)
  const url = redirectUrl
    ? base + '&redirect=' + encodeURIComponent(redirectUrl)
    : base
  return fireNativeIntent(url)
}

/**
 * Where the native side should send us back to.
 *
 * Only the unlock path needs this: it genuinely does relaunch the TWA, because
 * the result is delivered as a ?biometric_auth= parameter on a fresh page load.
 * Without a redirect the activity falls back to a hard-coded /dashboard, which
 * moves a user who locked the app while reading, say, an asset page.
 *
 * enable/disable deliberately pass nothing — they no longer relaunch at all.
 */
function currentUrlForReturn() {
  try {
    // Strip any stale biometric_auth so a second unlock can't inherit the
    // first one's result and skip the prompt.
    const u = new URL(window.location.href)
    u.searchParams.delete('biometric_auth')
    return u.toString()
  } catch {
    return ''
  }
}

// ── base64url <-> ArrayBuffer helpers (for storing/restoring the credential id)
function bufToB64url(buf) {
  let s = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlToBuf(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  const bin = atob(b64 + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

// Detect WebAuthn platform-authenticator support
export function useBiometricLock() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(ENABLED_KEY) === '1')
  const [locked, setLocked] = useState(false)
  // App Lock is a feature of the Android app, and only of the Android app.
  //
  // It used to be offered in any browser with WebAuthn. That produced a
  // genuinely bad screen: the TWA and Chrome share one origin's localStorage
  // on a device, so turning the lock on in the app also set the flag Chrome
  // reads — and opening walletlens.live in a tab then showed "WalletLens is
  // locked" with no credential to authenticate against, because the app's
  // lock is a native prompt and stores nothing WebAuthn can use. The tab
  // offered a recovery flow for a lock the user had never set there.
  //
  // Everything below is gated on the same flag, so outside the app the lock
  // is not merely hidden — it never engages.
  const [available] = useState(() => isAndroidTWA)
  const [supported, setSupported] = useState(false)

  // Nothing to probe any more: the only supported context is the app, where
  // the native prompt is the authority. The old async
  // isUserVerifyingPlatformAuthenticatorAvailable() check only ever mattered
  // for the browser path this no longer has.
  useEffect(() => { setSupported(isAndroidTWA) }, [])

  // Cold open / new tab: lock if there's no unlocked session token.
  useEffect(() => {
    // The flag is shared with Chrome on the same device; only the app acts on it.
    if (!isAndroidTWA) return
    if (localStorage.getItem(ENABLED_KEY) === '1' && !sessionStorage.getItem(SESSION_KEY)) {
      setLocked(true)
    }
  }, [])

  // Re-lock when the app is backgrounded for longer than the grace period.
  // On hide we only record the timestamp; on return we lock only if the app
  // was away long enough — so a quick app-switch (or the OS biometric sheet
  // itself backgrounding us) doesn't demand a fresh unlock every time.
  // Reads localStorage live so enabling the lock in Settings takes effect
  // immediately, without a reload.
  useEffect(() => {
    function onVisibility() {
      if (!isAndroidTWA) return
      if (localStorage.getItem(ENABLED_KEY) !== '1') return
      if (authInProgress) return
      if (document.visibilityState === 'hidden') {
        try { sessionStorage.setItem(HIDDEN_AT, String(Date.now())) } catch {}
        return
      }
      // Became visible again — lock only if we were away past the grace window.
      const away = Date.now() - parseInt(sessionStorage.getItem(HIDDEN_AT) || '0', 10)
      if (away >= RELOCK_GRACE_MS) {
        sessionStorage.removeItem(SESSION_KEY)
        setLocked(true)

        // Show the lock and stop. This used to fire an unlock intent here too,
        // which is a third automatic sender bypassing both guards in unlock()
        // — and every one it fired left a task behind.
        //
        // It is also the wrong moment for one. The intent is a top-frame
        // navigation, and firing it the instant the app becomes visible is
        // firing it before the user has done anything: nativeBridge would
        // refuse for want of activation anyway, or worse, catch a stale
        // activation and detonate. The lock screen's own auto-attempt handles
        // the prompt, once, under the guards.
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // ── Listen for biometric_auth URL parameter (native auth result) ──────
  //
  // After the native BiometricActivity authenticates, it redirects back to
  // the web app with ?biometric_auth=success|cancel in the URL. We pick
  // this up, set the session token, and clear the URL parameter.
  useEffect(() => {
    // Only the app produces this parameter. Acting on it in a browser would
    // let a shared or pasted link set locked=true on a tab with no way out.
    if (!isAndroidTWA) return
    const params = new URLSearchParams(window.location.search)
    const result = params.get('biometric_auth')
    if (!result) return

    // Clean the URL parameter so it doesn't stick around on refresh
    const cleanUrl = window.location.pathname + window.location.hash
    window.history.replaceState({}, '', cleanUrl)

    // The round trip is over however it went, so the next attempt — automatic
    // or not — is free to fire.
    authInProgress = false
    try { localStorage.removeItem(UNLOCK_SENT_KEY) } catch { /* private mode */ }

    if (result === 'success') {
      sessionStorage.setItem(SESSION_KEY, '1')
      setLocked(false)
      track('biometric_unlock_success')
    } else {
      track('biometric_unlock_cancel')
      // User cancelled — show the lock screen so they can retry
      setLocked(true)
    }
  }, [])

  // ── Enable (native TWA path vs WebAuthn) ──────────────────────────────
  //
  // On Android TWA we send a native intent to store the enabled flag in
  // SharedPreferences, then fall through to the localStorage flow. On
  // non-Android devices we use WebAuthn as before.
  async function enable() {
    // Native path: prove the fingerprint works, THEN turn the lock on.
    //
    // This used to write the flag, tell the app, and return true — without
    // anything being verified and without a prompt ever appearing. Tapping
    // "Enable" on the onboarding slide therefore asked for nothing and showed
    // nothing, which is exactly how it was reported. Worse, it armed a lock
    // nobody had confirmed the user could pass: one stale enrolled fingerprint
    // and the next cold start is a locked portfolio.
    //
    // NOT setNativeAppLock(true), deliberately, even though the bridge is
    // right there. That writes the preference outright, which is the
    // unverified behaviour under a new name. The intent raises the prompt, and
    // the app writes the flag itself once it has been passed.
    if (isAndroidTWA) {
      // The bridge where there is one. sendNativeIntent can refuse silently —
      // it needs a live user activation — and that is how this ended up
      // sitting on "Setting up…" waiting for a prompt nobody had asked for.
      if (!promptNativeAppLock()) sendNativeIntent('enable')

      // Wait for the app to say the lock is on. Only reachable through the
      // bridge; a TWA install has no way to answer, so it keeps the old
      // optimistic behaviour rather than failing on a question it cannot ask.
      if (appLockReadable()) {
        const passed = await waitForAppLock()
        if (!passed) {
          track('biometric_enable_cancelled')
          return false
        }
      }

      localStorage.setItem(ENABLED_KEY, '1')
      sessionStorage.setItem(SESSION_KEY, '1')
      setEnabled(true)
      setLocked(false)
      track('biometric_enabled')
      return true
    }

    // Gate on the API being present, not on the (sometimes false-negative)
    // platform-authenticator probe. If the device genuinely can't, the
    // create() call below throws and we return false cleanly.
    if (!available) return false
    authInProgress = true
    try {
      // Register a platform passkey bound to this device + origin.
      // residentKey:'required' makes it a DISCOVERABLE credential and we also
      // store the credential id, so unlock() can target it explicitly — this is
      // why a freshly enabled lock can actually be found on the same device.
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'WalletLens', id: location.hostname },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: 'WalletLens User',
            displayName: 'WalletLens User',
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'required',
            requireResidentKey: true,
            userVerification: 'required',
          },
          timeout: 60000,
        },
      })
      if (cred?.rawId) localStorage.setItem(CRED_KEY, bufToB64url(cred.rawId))
      localStorage.setItem(ENABLED_KEY, '1')
      sessionStorage.setItem(SESSION_KEY, '1')
      setEnabled(true)
      setLocked(false)
      track('biometric_enabled')
      return true
    } catch (e) {
      if (e.name !== 'NotAllowedError') console.warn('Biometric enable:', e)
      return false
    } finally {
      authInProgress = false
    }
  }

  // ── Unlock (native TWA path vs WebAuthn) ──────────────────────────────
  //
  // On Android TWA, send a native intent to open the system BiometricPrompt
  // dialog. The result comes back via the biometric_auth URL parameter
  // listener above.
  async function unlock({ auto = false } = {}) {
    if (isAndroidTWA) {
      // Refuse to fire a second unlock on our own initiative while one is
      // still in flight. This is what turned one fingerprint into eight cards
      // in the recents switcher.
      //
      // The native unlock relaunches the app to deliver its result, so the
      // page that fired the intent is replaced by a fresh load — and the fresh
      // lock screen auto-prompts on mount. The user's tap grants transient
      // activation lasting a few seconds, which SURVIVES that relaunch, so the
      // automatic attempt was allowed to fire too. Relaunch, auto-fire,
      // relaunch, auto-fire, until the activation finally expired, leaving a
      // task behind on every pass.
      //
      // The stamp is in localStorage on purpose: the relaunch is a cold start,
      // so module state and sessionStorage are both gone by the time the next
      // auto-attempt runs. Only a user tap may override it — an explicit
      // request is never the loop.
      if (auto && unlockJustRequested()) {
        const err = new Error('unlock-in-flight')
        err.name = 'NeedsGestureError'
        throw err
      }

      // Set BEFORE firing, and only on this path in the original code — which
      // was the bug's other half. authInProgress exists to stop the
      // visibility handler re-locking while authentication is happening, and
      // the native prompt is the one path that actually backgrounds the app.
      // Without it, being covered by the system sheet counted as "away", and
      // coming back fired an unlock intent of its own.
      authInProgress = true
      noteUnlockRequested()

      // The bridge where there is one, and this is the path that matters most.
      //
      // The intent below delivers its result by RELAUNCHING the app with
      // ?biometric_auth=success on the URL: an intent that needs a live user
      // activation, a top-frame navigation, and a cold start that has to carry
      // the parameter through. Any one of those failing leaves someone staring
      // at a lock screen that will not open, with their portfolio right there
      // and unreachable. That is the worst failure this app has, and it was
      // reported.
      //
      // Through the bridge nothing is delivered: the app records the unlock
      // where it already keeps it, and this asks.
      if (promptNativeUnlock()) {
        try {
          const opened = await waitForUnlock()
          if (opened) {
            sessionStorage.setItem(SESSION_KEY, '1')
            setLocked(false)
            track('biometric_unlock_success')
            return
          }
          track('biometric_unlock_fail')
          const err = new Error('unlock-declined')
          err.name = 'NeedsGestureError'
          throw err
        } finally {
          authInProgress = false
        }
      }

      if (!sendNativeIntent('unlock', currentUrlForReturn())) {
        authInProgress = false
        const err = new Error('needs-gesture')
        err.name = 'NeedsGestureError'
        throw err
      }
      return
    }

    authInProgress = true
    try {
      // Target the exact credential we registered (works even if the platform
      // didn't keep it discoverable). Fall back to discoverable lookup if we
      // somehow have no stored id (e.g. enabled before this fix).
      const savedId = localStorage.getItem(CRED_KEY)
      const allowCredentials = savedId
        ? [{ id: b64urlToBuf(savedId), type: 'public-key', transports: ['internal'] }]
        : undefined
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: location.hostname,
          allowCredentials,
          userVerification: 'required',
          timeout: 60000,
        },
      })
      sessionStorage.setItem(SESSION_KEY, '1')
      setLocked(false)
      track('biometric_unlock_success')
    } catch (e) {
      track('biometric_unlock_fail')
      throw e
    } finally {
      authInProgress = false
    }
  }

  // ── Disable ───────────────────────────────────────────────────────────
  function disable() {
    // Native path: clear the app's own flag too. Left set, the app would go on
    // demanding a fingerprint for a lock the user had just switched off — the
    // worse direction of the two to get wrong.
    if (isAndroidTWA) {
      if (!setNativeAppLock(false)) sendNativeIntent('disable')
    }
    // Also clear local state regardless of platform
    localStorage.removeItem(ENABLED_KEY)
    localStorage.removeItem(CRED_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    setEnabled(false)
    setLocked(false)
    track('biometric_disabled')
  }

  return { enabled, locked, supported, available, enable, unlock, disable }
}

// Full-screen lock overlay. Auto-prompts on mount for a native app feel.
//
// Belt and braces: useBiometricLock never sets `locked` outside the app, so
// this should already be unreachable there. It refuses anyway, because the
// failure mode is a user staring at "WalletLens is locked" in a browser tab
// with nothing that can unlock it.
export function BiometricLockScreen({ onUnlock }) {
  if (!isAndroidTWA) return null
  return <BiometricLockScreenInner onUnlock={onUnlock} />
}

function BiometricLockScreenInner({ onUnlock }) {
  const { t } = useLanguage()
  const [trying, setTrying] = useState(false)
  const [error, setError] = useState('')
  const [recover, setRecover] = useState(false)
  const attemptCount = useRef(0)
  const autoRan = useRef(false)

  async function attempt({ auto = false } = {}) {
    setTrying(true)
    setError('')
    try {
      await onUnlock({ auto })
    } catch (e) {
      attemptCount.current += 1
      // The native prompt was declined for want of a gesture, not by the
      // device or the user. Nothing is wrong; it just needs a tap.
      if (e?.name === 'NeedsGestureError') {
        setError(t('blTapToUnlock'))
        // Deliberately does not count toward the retry ceiling — nothing has
        // failed, it just needs a tap. The escape hatch is armed by the timer
        // below instead, because this branch is exactly the one that leaves a
        // user stuck: if taps are not registering at all (Android's own "screen
        // touches may be delayed or not recognised" case), no amount of
        // waiting produces a second failed attempt, and recovery keyed only on
        // failures is unreachable.
        return
      }
      const noPasskeys =
        (e?.message || '').toLowerCase().includes('no passkeys') ||
        (e?.message || '').toLowerCase().includes('no credentials') ||
        e?.name === 'InvalidStateError'
      if (noPasskeys || (e?.name && e.name !== 'NotAllowedError')) {
        // Device has no registered passkey for this origin, or authenticator error → escape hatch
        setRecover(true)
        setError(t('blNoPasskey'))
      } else {
        // NotAllowedError = user cancelled/timed out
        setError(t('blCancelled'))
        // Show escape hatch after 2 failed attempts so user is never truly stuck
        if (attemptCount.current >= 2) setRecover(true)
      }
    } finally {
      setTrying(false)
    }
  }

  // Nobody stays locked out of their own portfolio.
  //
  // Every other route to the escape hatch depends on something happening: two
  // failed attempts, or an authenticator error. A device that is not
  // registering taps produces neither, and the data is local — there is no
  // "log in on another device" to fall back on. So the hatch also appears on a
  // timer, whatever else has or has not happened.
  useEffect(() => {
    const timer = setTimeout(() => setRecover(true), RECOVER_AFTER_MS)
    return () => clearTimeout(timer)
  }, [])

  // Auto-trigger the biometric prompt once when the lock screen appears.
  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    // If the lock was enabled before a usable credential was stored on this
    // device (older build / cross-context), there is nothing to authenticate
    // against — skip the futile prompt and offer recovery straight away.
    if (!isAndroidTWA && !localStorage.getItem(CRED_KEY)) {
      setRecover(true)
      setError(t('blNoPasskeyDevice'))
      return
    }
    attempt({ auto: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function recoverEntry() {
    // Last-resort: only reachable when the device genuinely can't authenticate.
    localStorage.removeItem('wl_biometric_enabled')
    sessionStorage.removeItem('wl_biometric_unlocked')
    // And tell the app, which keeps the flag of record. Clearing only the web
    // copy left the two disagreeing: the lock screen was gone, but Settings
    // still showed App Lock as on and the app still believed it, so the next
    // time the web flag was written back the user was locked out again by a
    // lock they had already escaped.
    setNativeAppLock(false)
    window.location.reload()
  }

  return (
    <div className="bl-screen">
      <BiometricLockStyles />

      {/* The same world as the loading screen: soft light, grain, dust. */}
      <div className="bl-glow" aria-hidden="true" />
      <div className="bl-rays" aria-hidden="true" />
      <div className="bl-grain" aria-hidden="true" />

      <div className="bl-content">
        <div className="bl-word" aria-hidden="true"><span className="bl-chrome">WalletLens</span><i className="bl-dot" /><span className="bl-live">live</span></div>

        {/* The lens: gold bezel, glass, and the fingerprint under a scanning light. Tapping it unlocks. */}
        <button
          className={`bl-lens${trying ? ' is-busy' : ''}${error && !trying ? ' is-err' : ''}`}
          onClick={() => attempt()}
          disabled={trying}
          aria-label={t('atUnlockFingerprint')}
        >
          <svg className="bl-bezel" viewBox="0 0 230 230" fill="none" aria-hidden="true"><circle cx="115" cy="115" r="111" stroke="rgba(253,230,138,.35)" strokeWidth=".8"/><circle cx="115" cy="115" r="109" stroke="rgba(253,230,138,.25)" strokeWidth="4" strokeDasharray="1 10.414" transform="rotate(-90.3 115 115)"/><circle cx="115" cy="115" r="107.5" stroke="rgba(253,230,138,.55)" strokeWidth="7" strokeDasharray="1.1 55.187" transform="rotate(-90.3 115 115)"/><circle cx="115" cy="115" r="106" stroke="rgba(253,230,138,.9)" strokeWidth="10" strokeDasharray="1.6 164.904" transform="rotate(-90.5 115 115)"/></svg>
          <span className="bl-spark" aria-hidden="true" />
          <span className="bl-glass" aria-hidden="true">
            <svg className="bl-print" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <defs>
                <linearGradient id="blFp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d1fae5"/><stop offset="1" stopColor="#22c55e"/></linearGradient>
              </defs>
              <g stroke="url(#blFp)" strokeWidth="1.5">
                <path pathLength="1" d="M12 11a1 1 0 0 0-1 1v1a7 7 0 0 0 .5 2.6" />
                <path pathLength="1" d="M12 7a5 5 0 0 1 5 5v1a13 13 0 0 0 .4 3.2" />
                <path pathLength="1" d="M8 6.5A5 5 0 0 0 7 12v1a8 8 0 0 1-.5 2.8" />
                <path pathLength="1" d="M12 3a9 9 0 0 1 9 9v1" />
                <path pathLength="1" d="M3 13v-1a9 9 0 0 1 4-7.5" />
                <path pathLength="1" d="M9.5 13.5a2.5 2.5 0 0 1 5 0v.5a17 17 0 0 0 .3 3.3" />
                <path pathLength="1" d="M12 19.5v.5" />
              </g>
            </svg>
            <span className="bl-scan" />
          </span>
        </button>

        <div className="bl-titles">
          <h1 className="bl-title">{t('blWelcome')}</h1>
          <p className="bl-sub">{trying ? t('blVerifying') : t('blLockedSub')}</p>
        </div>

        {error && (
          <div className="bl-error">
            <div className="bl-error-text">{error}</div>
            {recover && (
              <button className="bl-recover" onClick={recoverEntry}>{t('blDisableContinue')}</button>
            )}
          </div>
        )}

        {!trying && (
          <button className="bl-cta" onClick={() => attempt()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 11a1 1 0 0 0-1 1v1a7 7 0 0 0 .5 2.6" /><path d="M12 7a5 5 0 0 1 5 5v1a13 13 0 0 0 .4 3.2" />
              <path d="M8 6.5A5 5 0 0 0 7 12v1a8 8 0 0 1-.5 2.8" /><path d="M12 3a9 9 0 0 1 9 9v1" /><path d="M3 13v-1a9 9 0 0 1 4-7.5" />
            </svg>
            {t('blUnlock')}
          </button>
        )}
      </div>
    </div>
  )
}

// Inline CSS for the lock screen (scoped to .bl-* classes)
// ── Biometric Toggle (used in Dashboard settings) ────────────────────────
export function BiometricToggle() {
  // Hidden rather than disabled. A greyed-out row invites "why can't I turn
  // this on?", and the honest answer — install the Android app — is not
  // something a Settings row should be arguing for.
  if (!isAndroidTWA) return null
  return <BiometricToggleInner />
}

function BiometricToggleInner() {
  const { enabled, supported, available, enable, disable } = useBiometricLock()
  const [busy, setBusy] = useState(false)

  async function onToggle() {
    if (busy) return
    setBusy(true)
    try {
      if (enabled) disable()
      else await enable()
    } finally {
      setBusy(false)
    }
  }

  const unavailable = !supported && !available

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '0.75rem',
      padding: '0.85rem 1rem',
      background: 'rgba(var(--g-rgb),0.05)',
      border: '1px solid rgba(var(--g-rgb),0.15)',
      borderRadius: '12px',
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
          <Icon name="lock" size={14} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />App Lock — Fingerprint / Face
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
          {unavailable
            ? 'Not available on this device or browser'
            : enabled
              ? 'Requires your fingerprint each time you open the app'
              : 'Require your fingerprint to open WalletLens'}
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={unavailable || busy}
        style={{
          flexShrink: 0,
          background: enabled ? 'linear-gradient(135deg, #047857, #10b981)' : 'var(--surface-2)',
          color: enabled ? '#fff' : 'var(--text-muted)',
          border: enabled ? 'none' : '1px solid var(--border)', borderRadius: '10px',
          boxShadow: enabled ? '0 2px 8px rgba(5,150,105,0.35)' : 'none',
          padding: '0.45rem 0.95rem',
          fontWeight: 800, fontSize: '0.82rem',
          cursor: (unavailable || busy) ? 'not-allowed' : 'pointer',
          opacity: unavailable ? 0.5 : 1,
          transition: 'all 0.2s',
        }}>
        {busy ? '...' : enabled ? 'Enabled ✓' : 'Enable'}
      </button>
    </div>
  )
}

function BiometricLockStyles() {
  return (
    <style>{`
      .bl-screen{
        position:fixed; inset:0; z-index:2147483000;
        display:flex; align-items:center; justify-content:center; overflow:hidden;
        background:radial-gradient(90% 70% at 50% 42%,#0b1f14 0%,#050d08 55%,#020604 100%);
        color:#fff; font-family:'Sora','Plus Jakarta Sans',system-ui,sans-serif; -webkit-font-smoothing:antialiased;
        padding:calc(env(safe-area-inset-top,0px) + 24px) 20px calc(env(safe-area-inset-bottom,0px) + 24px);
      }
      .bl-glow{position:absolute;left:50%;top:40%;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;pointer-events:none;
        background:radial-gradient(circle,rgba(34,227,138,.16),transparent 62%);animation:bl-breathe 5s ease-in-out infinite}
      .bl-rays{position:absolute;width:900px;height:900px;left:50%;top:40%;margin:-450px 0 0 -450px;pointer-events:none;
        background:conic-gradient(from 0deg,transparent 0 20deg,rgba(34,227,138,.09) 32deg,transparent 46deg,transparent 180deg,rgba(34,227,138,.07) 200deg,transparent 216deg);
        -webkit-mask:radial-gradient(circle,#000 0,transparent 60%);mask:radial-gradient(circle,#000 0,transparent 60%);animation:bl-turn 24s linear infinite}
      .bl-grain{position:absolute;inset:0;opacity:.07;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

      .bl-content{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;width:100%;max-width:360px;text-align:center;animation:bl-rise .6s cubic-bezier(.2,1,.3,1) both}
      .bl-word{display:flex;align-items:center;font-size:17px;font-weight:700;letter-spacing:-.03em;margin-bottom:34px}
      .bl-chrome{background:linear-gradient(100deg,#9aa9a1 0%,#fff 30%,#c9d6cf 45%,#fff 50%,#8e9d95 70%,#f4fbf7 100%);background-size:250% 100%;
        -webkit-background-clip:text;background-clip:text;color:transparent;animation:bl-metal 5s linear infinite}
      .bl-dot{width:5px;height:5px;border-radius:50%;background:#22e38a;margin:0 3px;box-shadow:0 0 10px #22e38a}
      .bl-live{background:linear-gradient(180deg,#86efac,#16c47a);-webkit-background-clip:text;background-clip:text;color:transparent}

      /* The lens. Reset first: the app paints bare buttons as green pills. */
      .bl-lens{position:relative;width:230px;height:230px;padding:0!important;border:0!important;border-radius:50%!important;
        background:none!important;box-shadow:none!important;cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent;
        transition:transform .2s ease}
      .bl-lens:active{transform:scale(.97)}
      .bl-lens:disabled{cursor:default}
      .bl-bezel{position:absolute;inset:0;width:100%!important;height:100%!important;max-width:none!important;animation:bl-turn 60s linear infinite}
      .bl-spark{position:absolute;inset:4px;border-radius:50%;
        background:conic-gradient(from 0deg,transparent 0 300deg,rgba(253,230,138,.9) 356deg,#fff 360deg);
        -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 1.5px),#000 calc(100% - 1px));mask:radial-gradient(farthest-side,transparent calc(100% - 1.5px),#000 calc(100% - 1px));
        animation:bl-turn 3.2s cubic-bezier(.45,.05,.55,.95) infinite}
      .bl-glass{position:absolute;inset:38px;border-radius:50%;overflow:hidden;display:grid;place-items:center;
        background:radial-gradient(circle at 50% 45%,rgba(34,227,138,.20),rgba(4,20,12,.6) 70%);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -20px 40px rgba(0,0,0,.35),0 20px 60px -10px rgba(34,227,138,.35);
        border:1px solid rgba(255,255,255,.08)}
      .bl-glass::after{content:'';position:absolute;inset:-30%;background:linear-gradient(115deg,transparent 42%,rgba(255,255,255,.14) 50%,transparent 58%);
        animation:bl-spec 4.2s ease-in-out infinite}
      .bl-print{width:82px!important;height:82px!important;max-width:none!important;filter:drop-shadow(0 0 10px rgba(34,227,138,.45))}
      .bl-print path{stroke-dasharray:1;stroke-dashoffset:0}
      /* a band of light passing over the print, like a reader */
      .bl-scan{position:absolute;left:0;right:0;height:34px;top:-40px;
        -webkit-mask-image:linear-gradient(90deg,transparent,#000 30%,#000 70%,transparent);mask-image:linear-gradient(90deg,transparent,#000 30%,#000 70%,transparent);
        background:linear-gradient(180deg,transparent,rgba(134,239,172,.28) 45%,rgba(209,250,229,.55) 50%,rgba(134,239,172,.28) 55%,transparent);
        filter:blur(1px);animation:bl-scan 2.8s cubic-bezier(.45,.05,.55,.95) infinite}

      /* reading: the print traces itself, the spark and the scan speed up */
      .bl-lens.is-busy .bl-print path{animation:bl-trace 1.2s ease-in-out infinite}
      .bl-lens.is-busy .bl-spark{animation-duration:1.1s}
      .bl-lens.is-busy .bl-scan{animation-duration:1.1s}
      .bl-lens.is-busy .bl-glass{box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -20px 40px rgba(0,0,0,.35),0 20px 70px -6px rgba(34,227,138,.6)}
      .bl-lens.is-err .bl-glass{animation:bl-shake .45s ease}

      .bl-titles{margin-top:30px}
      .bl-title{margin:0;font-size:26px;font-weight:700;letter-spacing:-.035em;color:#f4fbf7}
      .bl-sub{margin:8px 0 0;font-family:'Manrope','Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;color:rgba(209,250,229,.6)}

      .bl-cta{margin-top:26px;display:inline-flex;align-items:center;gap:8px;min-height:0!important;width:auto!important;
        padding:12px 26px!important;border-radius:999px!important;cursor:pointer;
        font:600 15px 'Sora','Plus Jakarta Sans',system-ui,sans-serif;letter-spacing:-.01em;color:#f4fbf7!important;
        background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03))!important;
        border:1px solid rgba(253,230,138,.38)!important;box-shadow:0 10px 30px -12px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.12)!important;
        -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);transition:transform .15s ease,border-color .2s ease}
      .bl-cta svg{color:#fde68a;max-width:none}
      .bl-cta:active{transform:scale(.97)}

      .bl-error{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:22px;animation:bl-rise .3s ease both}
      .bl-error-text{font-family:'Manrope','Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;line-height:1.5;color:#fde68a;
        padding:8px 14px;border-radius:12px;background:rgba(250,204,21,.07);border:1px solid rgba(250,204,21,.2);max-width:300px}
      .bl-recover{min-height:0!important;width:auto!important;padding:6px 10px!important;border:0!important;background:none!important;box-shadow:none!important;
        font:600 13px 'Manrope','Plus Jakarta Sans',system-ui,sans-serif;color:rgba(209,250,229,.6)!important;text-decoration:underline;text-underline-offset:3px;cursor:pointer}

      @keyframes bl-turn{to{transform:rotate(360deg)}}
      @keyframes bl-breathe{0%,100%{transform:scale(.94);opacity:.8}50%{transform:scale(1.06);opacity:1}}
      @keyframes bl-metal{to{background-position:-250% 0}}
      @keyframes bl-spec{0%{transform:translateX(-70%)}45%,100%{transform:translateX(70%)}}
      @keyframes bl-scan{0%{top:-40px}50%{top:calc(100% + 6px)}100%{top:-40px}}
      @keyframes bl-trace{0%{stroke-dashoffset:1}60%,100%{stroke-dashoffset:0}}
      @keyframes bl-shake{20%{transform:translateX(-6px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
      @keyframes bl-rise{from{opacity:0;transform:translateY(10px)}}
      @media (prefers-reduced-motion:reduce){
        .bl-screen *,.bl-screen *::after{animation:none!important}
        .bl-scan{display:none}
      }
    `}</style>
  )
}
