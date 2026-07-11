import { useState, useEffect, useRef } from 'react'
import Icon from './Icon'
import { track } from '../analytics'

const ENABLED_KEY  = 'wl_biometric_enabled'  // also stored in native SharedPrefs
const SESSION_KEY  = 'wl_biometric_unlocked'
const CRED_KEY     = 'wl_biometric_cred'   // base64url of the registered credential id
const HIDDEN_AT    = 'wl_biometric_hidden_at'  // timestamp the app was last backgrounded

// Grace period: returning within this window (quick app-switch, screen blink,
// the OS biometric sheet backgrounding us) does NOT re-prompt. A real absence
// still locks. Matches how banking apps behave.
const RELOCK_GRACE_MS = 60 * 1000

// Module-level guard: true while a WebAuthn prompt is on screen. The system
// biometric sheet briefly backgrounds the page (visibilitychange → hidden),
// which would otherwise re-lock us mid-authentication and loop forever.
let authInProgress = false

// ── Android TWA detection ─────────────────────────────────────────────────
//
// Checks whether the web app is running inside the Android TWA (Trusted Web
// Activity) by looking for the Chromium Custom Tab user-agent token and the
// Android package name. When inside the TWA we can use native intent URLs
// (walletlens://biometric-auth) to trigger the platform BiometricPrompt
// instead of WebAuthn, giving a true native app feel.
const isAndroidTWA = (() => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isAndroid = /android/i.test(ua)
  const isWebView = /wv\)/.test(ua) || /; wv/.test(ua)
  return isAndroid && isWebView
})()

/**
 * Launch the native BiometricActivity via a custom scheme intent URL.
 * The TWA's AndroidManifest routes walletlens://biometric-auth URIs to
 * our BiometricActivity which shows the system BiometricPrompt dialog.
 */
function sendNativeIntent(action, redirectUrl) {
  const base = 'walletlens://biometric-auth?action=' + encodeURIComponent(action)
  const url = redirectUrl
    ? base + '&redirect=' + encodeURIComponent(redirectUrl)
    : base
  window.location.href = url
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
const supportsWebAuthn = () =>
  typeof window !== 'undefined' &&
  window.PublicKeyCredential !== undefined &&
  typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'

export function useBiometricLock() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(ENABLED_KEY) === '1')
  const [locked, setLocked] = useState(false)
  // `available` = WebAuthn API exists at all (synchronous, reliable).
  // `supported` = platform authenticator confirmed present (async, can be a
  // false negative inside some Android webviews / TWAs). We OFFER the lock
  // whenever the API is available and let navigator.credentials.create() be
  // the real source of truth — pre-hiding the option on the async check left
  // capable devices stuck on "not available on this device".
  const [available] = useState(() => isAndroidTWA || supportsWebAuthn())
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    if (isAndroidTWA) {
      setSupported(true)
      return
    }
    if (!supportsWebAuthn()) return
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(avail => setSupported(avail))
      .catch(() => {})
  }, [])

  // Cold open / new tab: lock if there's no unlocked session token.
  useEffect(() => {
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

        // In Android TWA, also send native intent to trigger BiometricPrompt
        if (isAndroidTWA) {
          sendNativeIntent('unlock')
        }
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
    const params = new URLSearchParams(window.location.search)
    const result = params.get('biometric_auth')
    if (!result) return

    // Clean the URL parameter so it doesn't stick around on refresh
    const cleanUrl = window.location.pathname + window.location.hash
    window.history.replaceState({}, '', cleanUrl)

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
    // Native TWA path: store enabled flag locally AND tell the native app
    if (isAndroidTWA) {
      localStorage.setItem(ENABLED_KEY, '1')
      sessionStorage.setItem(SESSION_KEY, '1')
      setEnabled(true)
      setLocked(false)
      track('biometric_enabled')
      // Fire-and-forget: tell the native app to persist the flag
      sendNativeIntent('enable')
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
  async function unlock() {
    if (isAndroidTWA) {
      sendNativeIntent('unlock')
      // Don't await — the page will reload after auth
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
    // Native TWA path: tell the native app to clear the SharedPrefs flag
    if (isAndroidTWA) {
      sendNativeIntent('disable')
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
export function BiometricLockScreen({ onUnlock }) {
  const [trying, setTrying] = useState(false)
  const [error, setError] = useState('')
  const [recover, setRecover] = useState(false)
  const attemptCount = useRef(0)
  const autoRan = useRef(false)

  async function attempt() {
    setTrying(true)
    setError('')
    try {
      await onUnlock()
    } catch (e) {
      attemptCount.current += 1
      const noPasskeys =
        (e?.message || '').toLowerCase().includes('no passkeys') ||
        (e?.message || '').toLowerCase().includes('no credentials') ||
        e?.name === 'InvalidStateError'
      if (noPasskeys || (e?.name && e.name !== 'NotAllowedError')) {
        // Device has no registered passkey for this origin, or authenticator error → escape hatch
        setRecover(true)
        setError('No passkey found for this app. Disable the lock to continue.')
      } else {
        // NotAllowedError = user cancelled/timed out
        setError('Authentication cancelled. Tap to try again.')
        // Show escape hatch after 2 failed attempts so user is never truly stuck
        if (attemptCount.current >= 2) setRecover(true)
      }
    } finally {
      setTrying(false)
    }
  }

  // Auto-trigger the biometric prompt once when the lock screen appears.
  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    // If the lock was enabled before a usable credential was stored on this
    // device (older build / cross-context), there is nothing to authenticate
    // against — skip the futile prompt and offer recovery straight away.
    if (!isAndroidTWA && !localStorage.getItem(CRED_KEY)) {
      setRecover(true)
      setError('No passkey is registered on this device. Disable the lock to continue, then re-enable it from Data → Security.')
      return
    }
    attempt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function recoverEntry() {
    // Last-resort: only reachable when the device genuinely can't authenticate.
    localStorage.removeItem('wl_biometric_enabled')
    sessionStorage.removeItem('wl_biometric_unlocked')
    window.location.reload()
  }

  return (
    <div className="bl-screen">
      <BiometricLockStyles />

      {/* Ambient brand glow + grid texture */}
      <div className="bl-glow" aria-hidden="true" />
      <div className="bl-grid" aria-hidden="true" />

      <div className="bl-content">
        {/* Brand wordmark */}
        <div className="bl-brand">
          <span className="bl-brand-dot" />
          WALLETLENS
        </div>

        {/* Animated fingerprint with concentric pulse rings */}
        <button
          className={`bl-fp${trying ? ' bl-fp-busy' : ''}`}
          onClick={attempt}
          disabled={trying}
          aria-label="Unlock with fingerprint"
        >
          <span className="bl-ring bl-ring-1" aria-hidden="true" />
          <span className="bl-ring bl-ring-2" aria-hidden="true" />
          <span className="bl-ring bl-ring-3" aria-hidden="true" />
          <span className="bl-fp-core">
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 11a1 1 0 0 0-1 1v1a7 7 0 0 0 .5 2.6" />
              <path d="M12 7a5 5 0 0 1 5 5v1a13 13 0 0 0 .4 3.2" />
              <path d="M8 6.5A5 5 0 0 0 7 12v1a8 8 0 0 1-.5 2.8" />
              <path d="M12 3a9 9 0 0 1 9 9v1" />
              <path d="M3 13v-1a9 9 0 0 1 4-7.5" />
              <path d="M9.5 13.5a2.5 2.5 0 0 1 5 0v.5a17 17 0 0 0 .3 3.3" />
              <path d="M12 19.5v.5" />
            </svg>
          </span>
        </button>

        {/* Title + subtitle */}
        <div className="bl-titles">
          <div className="bl-title">WalletLens is locked</div>
          <div className="bl-sub">
            {trying ? 'Verifying your identity…' : 'Authenticate to view your portfolio'}
          </div>
        </div>

        {/* Error / recovery */}
        {error && (
          <div className="bl-error">
            <div className="bl-error-text">{error}</div>
            {recover && (
              <button className="bl-recover" onClick={recoverEntry}>
                Disable lock &amp; continue
              </button>
            )}
          </div>
        )}

        {/* Fallback CTA when biometric prompt doesn't auto-show (some Android TWA versions) */}
        {!trying && !error && (
          <button className="bl-cta" onClick={attempt}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a5 5 0 0 0-5 5v3h10V7a5 5 0 0 0-5-5z"/>
              <path d="M19 10v3a7 7 0 0 1-14 0v-3"/>
            </svg>
            Tap to authenticate
          </button>
        )}
      </div>
    </div>
  )
}

// Inline CSS for the lock screen (scoped to .bl-* classes)
// ── Biometric Toggle (used in Dashboard settings) ────────────────────────
export function BiometricToggle() {
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
        display:flex; align-items:center; justify-content:center;
        background:#020d08; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        -webkit-font-smoothing:antialiased;
        overflow:hidden;
      }
      .bl-glow{
        position:absolute; inset:0; pointer-events:none;
        background:radial-gradient(circle at 50% 50%, rgba(0,200,83,0.22), rgba(0,200,83,0) 60%);
        filter:blur(20px); pointer-events:none;
      }
      .bl-grid{
        position:absolute; inset:0; pointer-events:none; opacity:.5;
        background-image:
          linear-gradient(rgba(0,200,83,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,200,83,0.05) 1px, transparent 1px);
        background-size:42px 42px;
        mask-image:radial-gradient(circle at 50% 38%, #000 0%, transparent 72%);
        -webkit-mask-image:radial-gradient(circle at 50% 38%, #000 0%, transparent 72%);
      }
      .bl-content{
        position:relative; z-index:2;
        display:flex; flex-direction:column; align-items:center;
        gap:1.4rem; width:100%; max-width:340px; text-align:center;
      }
      .bl-brand{
        display:flex; align-items:center; gap:.45rem;
        font-size:.72rem; font-weight:800; letter-spacing:.32em;
        color:rgba(180,220,200,0.7); margin-bottom:.2rem;
      }
      .bl-brand-dot{
        width:7px; height:7px; border-radius:50%;
        background:#00e676; box-shadow:0 0 10px #00e676;
        animation:bl-blink 2.4s ease-in-out infinite;
      }
      @keyframes bl-blink{ 0%,100%{opacity:1} 50%{opacity:.35} }

      /* Fingerprint button + rings */
      .bl-fp{
        position:relative; width:150px; height:150px;
        background:none; border:none; cursor:pointer; padding:0;
        display:flex; align-items:center; justify-content:center;
        -webkit-tap-highlight-color:transparent;
      }
      .bl-fp:disabled{ cursor:default; }
      .bl-ring{
        position:absolute; border-radius:50%;
        border:1.5px solid rgba(0,230,118,0.4);
      }
      .bl-ring-1{ inset:0; animation:bl-pulse 2.6s ease-out infinite; }
      .bl-ring-2{ inset:14px; animation:bl-pulse 2.6s ease-out infinite .5s; border-color:rgba(0,230,118,0.28); }
      .bl-ring-3{ inset:28px; animation:bl-pulse 2.6s ease-out infinite 1s; border-color:rgba(0,230,118,0.18); }
      @keyframes bl-pulse{
        0%{ transform:scale(.85); opacity:.0 }
        30%{ opacity:.9 }
        100%{ transform:scale(1.18); opacity:0 }
      }
      .bl-fp-core{
        position:relative; z-index:2;
        width:96px; height:96px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        color:#7dffb4;
        background:
          radial-gradient(circle at 50% 35%, rgba(0,230,118,0.18), rgba(0,230,118,0.04) 70%),
          rgba(255,255,255,0.03);
        border:1.5px solid rgba(0,230,118,0.45);
        box-shadow:
          0 0 0 1px rgba(0,230,118,0.12),
          0 0 32px rgba(0,200,83,0.35),
          inset 0 0 24px rgba(0,200,83,0.18);
        backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
        transition:transform .2s ease, box-shadow .2s ease;
      }
      .bl-fp:active .bl-fp-core{ transform:scale(.93); }
      .bl-fp-busy .bl-fp-core{
        animation:bl-breathe 1.1s ease-in-out infinite;
        box-shadow:0 0 0 1px rgba(0,230,118,0.2), 0 0 46px rgba(0,200,83,0.55), inset 0 0 26px rgba(0,200,83,0.28);
      }
      @keyframes bl-breathe{ 0%,100%{ transform:scale(1) } 50%{ transform:scale(1.06) } }

      .bl-titles{ display:flex; flex-direction:column; gap:.35rem; }
      .bl-title{ font-size:1.32rem; font-weight:800; color:#f2fff8; letter-spacing:-.01em; }
      .bl-sub{ font-size:.9rem; color:rgba(170,205,188,0.75); }

      .bl-cta{
        margin-top:.2rem;
        display:flex; align-items:center; justify-content:center; gap:.5rem;
        padding:.9rem 2.6rem; border:none; border-radius:50px;
        font-size:1rem; font-weight:800; color:#012; cursor:pointer;
        background:linear-gradient(135deg, #00e676 0%, #00c853 50%, #00a040 100%);
        box-shadow:0 6px 24px rgba(0,200,83,0.45), inset 0 1px 0 rgba(255,255,255,0.3);
        transition:transform .15s ease, box-shadow .15s ease, opacity .15s ease;
      }
      .bl-cta:hover{ transform:translateY(-1px); box-shadow:0 8px 30px rgba(0,200,83,0.55), inset 0 1px 0 rgba(255,255,255,0.3); }
      .bl-cta:active{ transform:translateY(0) scale(.98); }
      .bl-cta:disabled{ opacity:.65; cursor:default; }

      .bl-error{ display:flex; flex-direction:column; align-items:center; gap:.7rem; margin-top:.25rem; animation:bl-fade .3s ease both; }
      .bl-error-text{ font-size:.83rem; color:rgba(200,215,208,0.8); line-height:1.5; max-width:300px; }
      .bl-recover{
        background:rgba(255,255,255,0.06); color:rgba(220,235,228,0.85);
        border:1px solid rgba(255,255,255,0.14); border-radius:10px;
        padding:.6rem 1.3rem; font-size:.85rem; font-weight:600; cursor:pointer;
        transition:background .15s ease;
      }
      .bl-recover:hover{ background:rgba(255,255,255,0.12); }

      @media (prefers-reduced-motion:reduce){
        .bl-ring,.bl-brand-dot,.bl-fp-busy .bl-fp-core{ animation:none !important; }
        .bl-ring{ opacity:.4; }
      }
    `}</style>
  )
}
