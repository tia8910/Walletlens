import { useState, useEffect, useCallback } from 'react'
import { track } from '../analytics'

const ENDPOINT = 'https://walletlens-voice-parse.tia8910.deno.net/'
const GUARDIAN_KEY = 'wl_guardian'
const DEVICE_ID_KEY = 'wl_guardian_device_id'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
      // Generate a random 24-char alphanumeric id
      id = Array.from(crypto.getRandomValues(new Uint8Array(18)))
        .map(b => b.toString(36)).join('').slice(0, 24)
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch { return 'wl-' + Date.now().toString(36) }
}

function loadGuardianLocal() {
  try { return JSON.parse(localStorage.getItem(GUARDIAN_KEY) || 'null') } catch { return null }
}
function saveGuardianLocal(data) {
  try { localStorage.setItem(GUARDIAN_KEY, JSON.stringify(data)) } catch {}
}
function clearGuardianLocal() {
  try { localStorage.removeItem(GUARDIAN_KEY) } catch {}
}

function getPortfolioSnapshot() {
  try {
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]')
    const prices = JSON.parse(localStorage.getItem('crypto_tracker_price_cache_v1') || '{}')
    const settings = JSON.parse(localStorage.getItem('wl_settings') || '{}')
    const currency = settings.currency || 'USD'

    const holdings = {}
    for (const tx of txs) {
      if (!holdings[tx.coin_id]) holdings[tx.coin_id] = { symbol: tx.coin_symbol || tx.coin_id, amount: 0 }
      if (tx.type === 'buy' || tx.type === 'deposit') holdings[tx.coin_id].amount += Number(tx.amount) || 0
      else if (tx.type === 'sell' || tx.type === 'withdraw') holdings[tx.coin_id].amount -= Number(tx.amount) || 0
    }

    let totalUsd = 0
    const symbols = []
    for (const [id, h] of Object.entries(holdings)) {
      if (h.amount <= 0.00000001) continue
      symbols.push((h.symbol || id).toUpperCase())
      totalUsd += h.amount * (prices[id]?.usd || 0)
    }

    return { totalUsd: Math.round(totalUsd), assetSymbols: symbols.slice(0, 20), currency }
  } catch {
    return { totalUsd: 0, assetSymbols: [], currency: 'USD' }
  }
}

function daysUntilDeadline(lastCheckin, intervalDays) {
  if (!lastCheckin) return intervalDays
  const elapsed = (Date.now() - new Date(lastCheckin).getTime()) / 86400000
  return Math.max(0, intervalDays - elapsed)
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}

// ── Guardian API calls ────────────────────────────────────────────────────────

async function apiCall(body) {
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data.error) throw new Error(data.error || 'network_error')
  return data
}

// Silent check-in — called on every app open if guardian is active.
// No UI feedback on success, console.error on failure.
export async function silentCheckin() {
  const local = loadGuardianLocal()
  if (!local?.active) return
  const deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) return
  try {
    const portfolioSummary = getPortfolioSnapshot()
    const data = await apiCall({ mode: 'guardian_checkin', deviceId, portfolioSummary })
    if (data.ok) {
      saveGuardianLocal({ ...local, lastCheckin: data.lastCheckin || new Date().toISOString() })
    }
  } catch (e) {
    console.error('Guardian checkin failed:', e.message)
  }
}

// ── Reusable form field components ───────────────────────────────────────────

function Field({ label, hint, error, children }) {
  return (
    <div className="pg-field">
      <label className="pg-field-label">
        {label}
        {hint && <span className="pg-field-hint">{hint}</span>}
      </label>
      {children}
      {error && <span className="pg-field-error">{error}</span>}
    </div>
  )
}

function HeirRow({ idx, heir, onChange, onRemove, showRemove }) {
  return (
    <div className="pg-heir-row">
      <div className="pg-heir-num">{idx + 1}</div>
      <div className="pg-heir-inputs">
        <input
          type="text"
          className="pg-input"
          placeholder="Full name"
          value={heir.name}
          maxLength={80}
          onChange={e => onChange(idx, { ...heir, name: e.target.value })}
        />
        <input
          type="email"
          className="pg-input"
          placeholder="email@example.com"
          value={heir.email}
          onChange={e => onChange(idx, { ...heir, email: e.target.value })}
        />
      </div>
      {showRemove && (
        <button type="button" className="pg-heir-remove" onClick={() => onRemove(idx)} title="Remove heir">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  )
}

// ── Setup Form ───────────────────────────────────────────────────────────────

function SetupForm({ onSuccess }) {
  const [heirs, setHeirs] = useState([{ name: '', email: '' }])
  const [message, setMessage] = useState('')
  const [intervalDays, setIntervalDays] = useState(90)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | saving | error

  function validate() {
    const errs = {}
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const validHeirs = heirs.filter(h => h.email.trim())
    if (validHeirs.length === 0) errs.heirs = 'Add at least one heir email.'
    for (const h of validHeirs) {
      if (!emailRe.test(h.email.trim())) {
        errs.heirs = `"${h.email.trim()}" is not a valid email.`
        break
      }
    }
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({}); setStatus('saving')
    const deviceId = getOrCreateDeviceId()
    const cleanHeirs = heirs.filter(h => h.email.trim())
    const portfolioSummary = getPortfolioSnapshot()
    try {
      const data = await apiCall({
        mode: 'guardian_setup', deviceId,
        heirs: cleanHeirs, message: message.trim(),
        intervalDays, portfolioSummary,
      })
      const record = {
        active: true, deviceId,
        heirs: cleanHeirs, message: message.trim(),
        intervalDays: data.interval || intervalDays,
        lastCheckin: new Date().toISOString(),
      }
      saveGuardianLocal(record)
      track('guardian_setup', { heirs: cleanHeirs.length, intervalDays })
      onSuccess(record)
    } catch (err) {
      setStatus('error')
      setErrors({ submit: 'Could not save — check your connection and try again.' })
    }
  }

  function updateHeir(idx, updated) {
    const next = heirs.map((h, i) => i === idx ? updated : h)
    setHeirs(next)
    if (errors.heirs) setErrors(e => ({ ...e, heirs: undefined }))
  }
  function removeHeir(idx) { setHeirs(h => h.filter((_, i) => i !== idx)) }
  function addHeir() { if (heirs.length < 3) setHeirs(h => [...h, { name: '', email: '' }]) }

  const portfolio = getPortfolioSnapshot()

  return (
    <form className="pg-form" onSubmit={handleSubmit} noValidate>
      <p className="pg-intro">
        Portfolio Guardian sends your chosen heirs an email with your personal message and portfolio information if you stop opening WalletLens for your chosen interval.
        No wallet keys or private data are ever shared — only the total value and asset list you confirm below.
      </p>

      {portfolio.assetSymbols.length > 0 && (
        <div className="pg-portfolio-preview">
          <span className="pg-portfolio-label">Portfolio detected</span>
          <span className="pg-portfolio-assets">{portfolio.assetSymbols.join(' · ')}</span>
          {portfolio.totalUsd > 0 && (
            <span className="pg-portfolio-value">≈ ${portfolio.totalUsd.toLocaleString()}</span>
          )}
        </div>
      )}

      <Field label="Heirs" hint="Up to 3 people to notify" error={errors.heirs}>
        <div className="pg-heirs-list">
          {heirs.map((h, i) => (
            <HeirRow key={i} idx={i} heir={h} onChange={updateHeir} onRemove={removeHeir} showRemove={heirs.length > 1} />
          ))}
        </div>
        {heirs.length < 3 && (
          <button type="button" className="pg-add-heir" onClick={addHeir}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add another heir
          </button>
        )}
      </Field>

      <Field label="Personal message" hint="Optional — shown in the notification email (max 500 chars)">
        <textarea
          className="pg-input pg-textarea"
          placeholder="A message for your heirs to read…"
          value={message}
          onChange={e => setMessage(e.target.value.slice(0, 500))}
          rows={3}
        />
        <span className="pg-char-count">{message.length}/500</span>
      </Field>

      <Field label="Check-in interval">
        <div className="pg-interval-chips">
          {[1, 7, 30, 90, 180].map(d => (
            <button
              key={d} type="button"
              className={`pg-interval-chip ${intervalDays === d ? 'active' : ''}`}
              onClick={() => setIntervalDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
        <p className="pg-interval-hint">
          If you don't open WalletLens for <b>{intervalDays} day{intervalDays !== 1 ? 's' : ''}</b>, your heirs will be notified.
        </p>
      </Field>

      {errors.submit && <p className="pg-error">{errors.submit}</p>}

      <button type="submit" className="pg-submit" disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving…' : 'Activate Portfolio Guardian'}
      </button>
    </form>
  )
}

// ── Active Status Card ────────────────────────────────────────────────────────

function StatusCard({ config, onCheckin, onCancel }) {
  const daysLeft = daysUntilDeadline(config.lastCheckin, config.intervalDays)
  const isWarning = daysLeft <= 7
  const isUrgent  = daysLeft <= 2
  const [checking, setChecking] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [checkedIn, setCheckedIn] = useState(false)

  async function handleCheckin() {
    setChecking(true)
    const deviceId = localStorage.getItem(DEVICE_ID_KEY)
    if (!deviceId) { setChecking(false); return }
    try {
      const portfolioSummary = getPortfolioSnapshot()
      const data = await apiCall({ mode: 'guardian_checkin', deviceId, portfolioSummary })
      if (data.ok) {
        const updated = { ...config, lastCheckin: data.lastCheckin || new Date().toISOString() }
        saveGuardianLocal(updated)
        setCheckedIn(true)
        onCheckin(updated)
        track('guardian_checkin_manual')
      }
    } catch (e) {
      alert('Check-in failed — check your connection and try again.')
    } finally { setChecking(false) }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel Portfolio Guardian? Your heirs will no longer be notified.')) return
    setCancelling(true)
    const deviceId = localStorage.getItem(DEVICE_ID_KEY)
    try {
      if (deviceId) await apiCall({ mode: 'guardian_cancel', deviceId }).catch(() => {})
      clearGuardianLocal()
      track('guardian_cancel')
      onCancel()
    } catch { clearGuardianLocal(); onCancel() }
    finally { setCancelling(false) }
  }

  return (
    <div className="pg-status-card">
      <div className="pg-status-header">
        <div className="pg-status-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div>
          <div className="pg-status-title">Portfolio Guardian Active</div>
          <div className="pg-status-subtitle">Last check-in: {fmtDate(config.lastCheckin)}</div>
        </div>
        <div className={`pg-days-badge ${isUrgent ? 'urgent' : isWarning ? 'warning' : ''}`}>
          <span className="pg-days-num">{Math.ceil(daysLeft)}</span>
          <span className="pg-days-label">days left</span>
        </div>
      </div>

      {(isWarning || isUrgent) && (
        <div className={`pg-deadline-banner ${isUrgent ? 'urgent' : 'warning'}`}>
          {isUrgent
            ? `Your heirs will be notified in ${Math.ceil(daysLeft)} day${Math.ceil(daysLeft) !== 1 ? 's' : ''}. Tap "I'm here" to reset the clock.`
            : `${Math.ceil(daysLeft)} days until your heirs are notified. Check in to reset the deadline.`
          }
        </div>
      )}

      <div className="pg-heirs-summary">
        <span className="pg-heirs-label">Heirs</span>
        <div className="pg-heirs-chips">
          {config.heirs.map((h, i) => (
            <span key={i} className="pg-heir-chip">
              {h.name || h.email.split('@')[0]}
            </span>
          ))}
        </div>
      </div>

      <div className="pg-status-meta">
        <span>Interval: {config.intervalDays} days</span>
        {config.message && <span>· Personal message set</span>}
      </div>

      <div className="pg-actions">
        <button
          className="pg-checkin-btn"
          onClick={handleCheckin}
          disabled={checking || checkedIn}
        >
          {checking ? 'Checking in…' : checkedIn ? "You're checked in ✓" : "I'm here — reset deadline"}
        </button>
        <button className="pg-cancel-btn" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? 'Cancelling…' : 'Cancel Guardian'}
        </button>
      </div>
    </div>
  )
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function PortfolioGuardian() {
  const [config, setConfig] = useState(() => loadGuardianLocal())
  const [showSetup, setShowSetup] = useState(false)

  const handleSuccess = useCallback((record) => {
    setConfig(record)
    setShowSetup(false)
  }, [])

  const handleCheckin = useCallback((updated) => {
    setConfig(updated)
  }, [])

  const handleCancel = useCallback(() => {
    setConfig(null)
    setShowSetup(false)
  }, [])

  if (config?.active && !showSetup) {
    return (
      <div className="pg-wrapper">
        <StatusCard config={config} onCheckin={handleCheckin} onCancel={handleCancel} />
        <button className="pg-reconfigure-link" onClick={() => setShowSetup(true)}>
          Edit heirs or settings
        </button>
      </div>
    )
  }

  if (showSetup || !config?.active) {
    return (
      <div className="pg-wrapper">
        {config?.active && (
          <button className="pg-back-link" onClick={() => setShowSetup(false)}>
            ← Back to status
          </button>
        )}
        <SetupForm onSuccess={handleSuccess} />
      </div>
    )
  }

  return (
    <div className="pg-wrapper">
      <button className="pg-activate-btn" onClick={() => setShowSetup(true)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Set Up Portfolio Guardian
      </button>
    </div>
  )
}
