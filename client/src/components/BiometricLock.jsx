import { useState, useEffect, useRef } from 'react'
import { track } from '../analytics'

const ENABLED_KEY  = 'wl_biometric_enabled'
const SESSION_KEY  = 'wl_biometric_unlocked'
const CRED_KEY     = 'wl_biometric_cred'   // base64url of the registered credential id

// Module-level guard: true while a WebAuthn prompt is on screen. The system
// biometric sheet briefly backgrounds the page (visibilitychange → hidden),
// which would otherwise re-lock us mid-authentication and loop forever.
let authInProgress = false

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
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    if (!supportsWebAuthn()) return
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(available => setSupported(available))
      .catch(() => {})
  }, [])

  // Cold open / new tab: lock if there's no unlocked session token.
  useEffect(() => {
    if (localStorage.getItem(ENABLED_KEY) === '1' && !sessionStorage.getItem(SESSION_KEY)) {
      setLocked(true)
    }
  }, [])

  // Re-lock whenever the app is backgrounded (switch apps, lock phone, etc.).
  // Reads localStorage live so enabling the lock in Settings takes effect
  // immediately on the next background, without a reload.
  useEffect(() => {
    function onHide() {
      if (document.visibilityState !== 'hidden') return
      if (authInProgress) return
      if (localStorage.getItem(ENABLED_KEY) !== '1') return
      sessionStorage.removeItem(SESSION_KEY)
      setLocked(true)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  async function enable() {
    if (!supported) return false
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

  async function unlock() {
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

  function disable() {
    localStorage.removeItem(ENABLED_KEY)
    localStorage.removeItem(CRED_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    setEnabled(false)
    setLocked(false)
    track('biometric_disabled')
  }

  return { enabled, locked, supported, enable, unlock, disable }
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
    if (!localStorage.getItem(CRED_KEY)) {
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'linear-gradient(135deg, #040d0a 0%, #061410 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '1.5rem', padding: '1.5rem',
    }}>
      <div style={{ fontSize: '3.5rem' }}>🔒</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.4rem' }}>
          WalletLens is locked
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Authenticate to view your portfolio
        </div>
      </div>
      <button
        onClick={attempt}
        disabled={trying}
        style={{
          background: 'var(--g)', color: '#000', border: 'none',
          borderRadius: '50px', padding: '0.85rem 2.5rem',
          fontWeight: 700, fontSize: '1rem', cursor: trying ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          opacity: trying ? 0.7 : 1,
        }}>
        <span style={{ fontSize: '1.2rem' }}>👆</span>
        {trying ? 'Verifying…' : 'Unlock with fingerprint'}
      </button>
      {error && (
        <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)', marginBottom: recover ? '0.75rem' : 0 }}>
            {error}
          </div>
          {recover && (
            <button onClick={recoverEntry} style={{
              background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: '8px', padding: '0.5rem 1.1rem',
              fontSize: '0.85rem', cursor: 'pointer', marginTop: '0.25rem',
            }}>
              Disable lock &amp; enter app
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Settings toggle — embed in the Data/Security panel.
export function BiometricToggle() {
  const { enabled, supported, enable, disable } = useBiometricLock()
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

  const unavailable = !supported

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
          🔒 App Lock — Fingerprint / Face
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
          background: enabled ? 'var(--g)' : 'rgba(255,255,255,0.08)',
          color: enabled ? '#000' : 'rgba(255,255,255,0.6)',
          border: 'none', borderRadius: '8px',
          padding: '0.4rem 0.9rem',
          fontWeight: 700, fontSize: '0.82rem',
          cursor: (unavailable || busy) ? 'not-allowed' : 'pointer',
          opacity: unavailable ? 0.5 : 1,
          transition: 'all 0.2s',
        }}>
        {busy ? '…' : enabled ? 'Enabled ✓' : 'Enable'}
      </button>
    </div>
  )
}
