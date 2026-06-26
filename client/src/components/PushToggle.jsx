import { useState, useEffect } from 'react'
import { isPushSupported, isPushEnabled, enablePush, disablePush, sendTestPush } from '../push'
import { track } from '../analytics'

// Master toggle for server-sent push notifications (delivered even when the
// app is closed). Lives at the top of the Settings → Notifications section.
export default function PushToggle() {
  const [supported] = useState(() => isPushSupported())
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tested, setTested] = useState(false)

  useEffect(() => { isPushEnabled().then(setEnabled).catch(() => {}) }, [])

  async function toggle() {
    if (busy) return
    setBusy(true); setError('')
    try {
      if (enabled) {
        await disablePush()
        setEnabled(false)
        track('push_disabled')
      } else {
        await enablePush()
        setEnabled(true)
        track('push_enabled')
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setError(''); setTested(false)
    try { await sendTestPush(); setTested(true) }
    catch (e) { setError(e?.message || 'Test failed.') }
  }

  if (!supported) {
    return (
      <div className="settings-hint" style={{ padding: '0.4rem 0' }}>
        Background notifications aren’t available on this device or browser.
      </div>
    )
  }

  return (
    <div>
      <div className="settings-row settings-row-toggle">
        <div className="settings-label">
          <span>Push notifications {enabled && <span style={{ color: 'var(--g-ink)' }}>· on</span>}</span>
          <span className="settings-hint">Get price-target alerts even when WalletLens is closed</span>
        </div>
        <button className={`settings-toggle ${enabled ? 'on' : ''}`} onClick={toggle} disabled={busy}>
          <span className="settings-toggle-thumb" />
        </button>
      </div>
      {enabled && (
        <button
          onClick={test}
          style={{
            marginTop: '0.4rem', background: 'rgba(var(--g-rgb),0.08)', color: 'var(--g-ink)',
            border: '1px solid rgba(var(--g-rgb),0.25)', borderRadius: '8px',
            padding: '0.4rem 0.85rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
          }}>
          {tested ? '✓ Sent — check your notifications' : 'Send a test notification'}
        </button>
      )}
      {error && <div className="settings-hint" style={{ color: '#f87171', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
