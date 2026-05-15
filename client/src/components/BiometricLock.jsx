import { useState, useEffect } from 'react'
import { track } from '../analytics'

const ENABLED_KEY  = 'wl_biometric_enabled'
const LOCKED_KEY   = 'wl_biometric_locked'
const SESSION_KEY  = 'wl_biometric_unlocked'

// Detect WebAuthn support
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

  useEffect(() => {
    if (!enabled) return
    // Lock if session token is missing (new tab / cold open)
    if (!sessionStorage.getItem(SESSION_KEY)) setLocked(true)
  }, [enabled])

  async function enable() {
    if (!supported) return
    try {
      // Register a passkey credential bound to this device
      await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'WalletLens', id: location.hostname },
          user: {
            id: new TextEncoder().encode('walletlens-user'),
            name: 'WalletLens User',
            displayName: 'WalletLens User',
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
        },
      })
      localStorage.setItem(ENABLED_KEY, '1')
      sessionStorage.setItem(SESSION_KEY, '1')
      setEnabled(true)
      setLocked(false)
      track('biometric_enabled')
    } catch (e) {
      if (e.name !== 'NotAllowedError') console.warn('Biometric enable:', e)
    }
  }

  async function unlock() {
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: location.hostname,
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
    }
  }

  function disable() {
    localStorage.removeItem(ENABLED_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    setEnabled(false)
    setLocked(false)
    track('biometric_disabled')
  }

  return { enabled, locked, supported, enable, unlock, disable }
}

// Full-screen lock overlay
export function BiometricLockScreen({ onUnlock }) {
  const [trying, setTrying] = useState(false)
  const [failed, setFailed] = useState(false)

  async function attempt() {
    setTrying(true)
    setFailed(false)
    try {
      await onUnlock()
    } catch {
      setFailed(true)
    }
    setTrying(false)
  }

  function disableAndEnter() {
    localStorage.removeItem('wl_biometric_enabled')
    sessionStorage.removeItem('wl_biometric_unlocked')
    window.location.reload()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'linear-gradient(135deg, #040d0a 0%, #061410 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '1.5rem',
    }}>
      <div style={{ fontSize: '3.5rem' }}>🔒</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'white', marginBottom: '0.4rem' }}>
          WalletLens is locked
        </div>
        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)' }}>
          Authenticate to view your portfolio
        </div>
      </div>
      <button
        onClick={attempt}
        disabled={trying}
        style={{
          background: '#34d399', color: '#000', border: 'none',
          borderRadius: '50px', padding: '0.85rem 2.5rem',
          fontWeight: 700, fontSize: '1rem', cursor: trying ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          opacity: trying ? 0.7 : 1,
        }}>
        <span style={{ fontSize: '1.2rem' }}>👆</span>
        {trying ? 'Verifying…' : 'Use Face ID / Touch ID'}
      </button>
      {failed && (
        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.75rem' }}>
            Passkey not available on this device
          </div>
          <button onClick={disableAndEnter} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.45)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px', padding: '0.45rem 1rem',
            fontSize: '0.82rem', cursor: 'pointer',
          }}>
            Disable lock &amp; enter
          </button>
        </div>
      )}
    </div>
  )
}

// Settings toggle (embed in Settings/Data page)
export function BiometricToggle() {
  const { enabled, supported, enable, disable } = useBiometricLock()

  if (!supported) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.85rem 1rem',
      background: 'rgba(52,211,153,0.05)',
      border: '1px solid rgba(52,211,153,0.15)',
      borderRadius: '12px',
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'white' }}>
          🔒 Face ID / Touch ID Lock
        </div>
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.15rem' }}>
          {enabled ? 'App locks when you switch away' : 'Require biometrics to open WalletLens'}
        </div>
      </div>
      <button
        onClick={enabled ? disable : enable}
        style={{
          background: enabled ? '#34d399' : 'rgba(255,255,255,0.08)',
          color: enabled ? '#000' : 'rgba(255,255,255,0.6)',
          border: 'none', borderRadius: '8px',
          padding: '0.4rem 0.9rem',
          fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
          transition: 'all 0.2s',
        }}>
        {enabled ? 'Enabled ✓' : 'Enable'}
      </button>
    </div>
  )
}
