import { useState, useEffect, useCallback } from 'react'
import { track } from '../analytics'
import { loadSnapshots } from '../snapshots'

const ENDPOINT = 'https://walletlens-voice-parse.tia8910.deno.net/'
const GUARDIAN_KEY = 'wl_guardian'
const DEVICE_ID_KEY = 'wl_guardian_device_id'

// ── Helpers ──────────────────────────────────────────────────────────────────

// Turn a server/Resend failure reason into a message that tells the user what
// to actually fix, instead of the misleading "check the addresses".
function explainMailReason(reason) {
  const r = String(reason || '').toLowerCase()
  if (r.includes('mail_not_configured'))
    return 'Email isn\'t set up on the server yet (missing RESEND_API_KEY). Add it in the Deno project settings.'
  if (r.includes('not verified') || r.includes('domain'))
    return 'The walletlens.live email domain isn\'t verified in Resend yet, so mail can only go to the account owner. Verify the domain in the Resend dashboard, then try again.'
  if (r.includes('network'))
    return 'Couldn\'t reach the email service. Check your connection and try again.'
  return 'Couldn\'t send the test email. Double-check the heir addresses and try again.'
}

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
    // Crypto quotes live in the crypto price cache; stocks, metals and cash
    // (fiat) are tracked as manual prices — the old code only read the crypto
    // cache, so every non-crypto asset was valued at $0 and the detected total
    // came out far below the real net worth shown on the dashboard.
    const cryptoPrices = JSON.parse(localStorage.getItem('crypto_tracker_price_cache_v1') || '{}')
    const manualPrices = JSON.parse(localStorage.getItem('crypto_tracker_manual_prices') || '{}')
    const settings = JSON.parse(localStorage.getItem('wl_settings') || '{}')
    const currency = settings.currency || 'USD'

    const holdings = {}
    for (const tx of txs) {
      const id = tx.coin_id
      if (!holdings[id]) holdings[id] = { symbol: tx.coin_symbol || id, amount: 0 }
      if (tx.coin_symbol) holdings[id].symbol = tx.coin_symbol
      if (tx.type === 'buy' || tx.type === 'deposit') holdings[id].amount += Number(tx.amount) || 0
      else if (tx.type === 'sell' || tx.type === 'withdraw') holdings[id].amount -= Number(tx.amount) || 0
    }

    let computedUsd = 0
    const symbols = []
    for (const [id, h] of Object.entries(holdings)) {
      if (h.amount <= 0.00000001) continue
      symbols.push((h.symbol || id).toUpperCase())
      const usd = cryptoPrices[id]?.usd ?? cryptoPrices[id]?.price ?? manualPrices[id]?.usd ?? 0
      computedUsd += h.amount * usd
    }

    // The dashboard persists the exact USD net worth it displays as a snapshot.
    // Prefer the most recent snapshot as the source of truth so the figure heirs
    // see always matches what the user sees on screen; the per-asset computation
    // above is the fallback for a device that hasn't opened the dashboard yet.
    let totalUsd = computedUsd
    try {
      const snaps = loadSnapshots()
      const last = snaps[snaps.length - 1]
      if (last && Number(last.v) > 0) totalUsd = Number(last.v)
    } catch { /* keep computed fallback */ }

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

// Silent check-in — called on every app open (i.e. every time the user "logs
// in" to WalletLens) if guardian is active. It resets the dead-man's-switch
// countdown so simply using the app keeps heirs from being notified.
//
// The local deadline is reset optimistically FIRST, so the countdown the user
// sees resets the moment they open the app even if they're offline or the
// server is slow. The server sync then persists the check-in; if it fails we
// keep the optimistic local reset (the cron is server-side and will still fire
// on the previous deadline, but a following successful open re-syncs it).
export async function silentCheckin() {
  const local = loadGuardianLocal()
  if (!local?.active) return
  const deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) return
  // Optimistic local reset on open.
  const nowIso = new Date().toISOString()
  saveGuardianLocal({ ...local, lastCheckin: nowIso })
  try {
    const portfolioSummary = getPortfolioSnapshot()
    const data = await apiCall({ mode: 'guardian_checkin', deviceId, portfolioSummary })
    if (data.ok) {
      saveGuardianLocal({ ...loadGuardianLocal(), lastCheckin: data.lastCheckin || nowIso })
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
        <input
          type="tel"
          className="pg-input pg-heir-wa"
          placeholder="WhatsApp e.g. +14155552671 (optional)"
          value={heir.whatsapp || ''}
          onChange={e => onChange(idx, { ...heir, whatsapp: e.target.value })}
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

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phoneRe = /^\+?[1-9]\d{7,14}$/
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '')
  const e164 = digits.startsWith('+') ? digits : '+' + digits
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : ''
}

// Keep only heirs that have at least one valid contact channel, cleaned for the
// API. Email and/or WhatsApp — either is enough.
function cleanHeirList(heirs) {
  return heirs
    .map(h => {
      const email = h.email.trim().toLowerCase()
      const whatsapp = normalizePhone(h.whatsapp)
      const out = { name: h.name.trim() }
      if (email && emailRe.test(email)) out.email = email
      if (whatsapp) out.whatsapp = whatsapp
      return out
    })
    .filter(h => h.email || h.whatsapp)
}

function SetupForm({ onSuccess }) {
  const [ownerName, setOwnerName] = useState('')
  const [heirs, setHeirs] = useState([{ name: '', email: '', whatsapp: '' }])
  const [message, setMessage] = useState('')
  const [intervalDays, setIntervalDays] = useState(90)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | saving | error
  const [testStatus, setTestStatus] = useState('idle') // idle | sending | sent | error
  const [testErr, setTestErr] = useState('')

  function validate() {
    const errs = {}
    // A row counts if it has any contact detail entered.
    const touched = heirs.filter(h => h.email.trim() || String(h.whatsapp || '').trim())
    if (touched.length === 0) {
      errs.heirs = 'Add at least one heir with an email or WhatsApp number.'
      return errs
    }
    for (const h of touched) {
      const email = h.email.trim()
      const wa = String(h.whatsapp || '').trim()
      if (email && !emailRe.test(email)) { errs.heirs = `"${email}" is not a valid email.`; break }
      if (wa && !phoneRe.test(wa.replace(/[\s()-]/g, ''))) {
        errs.heirs = `"${wa}" is not a valid phone number — use the full international format, e.g. +14155552671.`; break
      }
      if (!email && !wa) { errs.heirs = 'Each heir needs an email or a WhatsApp number.'; break }
    }
    return errs
  }

  async function sendTestEmail() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({}); setTestErr(''); setTestStatus('sending')
    const cleanHeirs = cleanHeirList(heirs)
    try {
      const data = await apiCall({
        mode: 'guardian_test',
        ownerName: ownerName.trim(),
        heirs: cleanHeirs, message: message.trim(),
        portfolioSummary: getPortfolioSnapshot(),
      })
      if (data?.ok) { setTestStatus('sent') }
      else { setTestErr(explainMailReason(data?.reason)); setTestStatus('error') }
      track('guardian_test_email', { heirs: cleanHeirs.length })
    } catch (e) {
      setTestErr(explainMailReason(e?.message))
      setTestStatus('error')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({}); setStatus('saving')
    const deviceId = getOrCreateDeviceId()
    const cleanHeirs = cleanHeirList(heirs)
    const portfolioSummary = getPortfolioSnapshot()
    try {
      const data = await apiCall({
        mode: 'guardian_setup', deviceId,
        ownerName: ownerName.trim(),
        heirs: cleanHeirs, message: message.trim(),
        intervalDays, portfolioSummary,
      })
      const record = {
        active: true, deviceId,
        ownerName: ownerName.trim(),
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
  function addHeir() { if (heirs.length < 3) setHeirs(h => [...h, { name: '', email: '', whatsapp: '' }]) }

  const portfolio = getPortfolioSnapshot()

  return (
    <form className="pg-form" onSubmit={handleSubmit} noValidate>
      <p className="pg-intro">
        Portfolio Guardian notifies your chosen heirs by email and/or WhatsApp — with your personal message and portfolio information — if you stop opening WalletLens for your chosen interval. Simply opening the app resets the countdown automatically.
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

      <Field label="Your name" hint="Optional — shown to your heirs so they know who reached out">
        <input
          type="text"
          className="pg-input"
          placeholder="e.g. Alex Morgan"
          value={ownerName}
          maxLength={80}
          onChange={e => setOwnerName(e.target.value)}
        />
      </Field>

      <Field label="Heirs" hint="Up to 3 people — reach them by email, WhatsApp, or both" error={errors.heirs}>
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

      <button type="button" className="pg-test-btn" onClick={sendTestEmail} disabled={testStatus === 'sending'}>
        {testStatus === 'sending' ? 'Sending test…' : '✉️ Send a test notification to my heirs now'}
      </button>
      {testStatus === 'sent' && <p className="pg-test-ok">✓ Test sent — ask your heirs to check their inbox (and spam) and WhatsApp to confirm it arrived.</p>}
      {testStatus === 'error' && <p className="pg-error">{testErr || 'Couldn\'t send the test notification. Check the details and try again.'}</p>}

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
              {h.name || (h.email ? h.email.split('@')[0] : h.whatsapp) || 'Heir'}
              {h.whatsapp && <span className="pg-heir-wa-badge" title={`WhatsApp: ${h.whatsapp}`}> · WhatsApp</span>}
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

  // Opening the Guardian screen counts as a check-in — reset the deadline and
  // reflect it immediately so the visible countdown is always up to date.
  useEffect(() => {
    let cancelled = false
    if (loadGuardianLocal()?.active) {
      silentCheckin().finally(() => { if (!cancelled) setConfig(loadGuardianLocal()) })
    }
    return () => { cancelled = true }
  }, [])

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
