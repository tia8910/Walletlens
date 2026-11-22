import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { noteMoment } from '../reviewPrompt'
import Icon from './Icon'
import { track } from '../analytics'
import { loadSnapshots } from '../snapshots'
import { api } from '../api'
import { makeQr } from '../utils/qrBackup'
import { useLanguage } from '../LanguageContext'
import { VOICE_API } from '../apiHosts.js'
import { guardianCopy } from '../guardianCopy'
import {
  INTERVALS, PLAN_KINDS, deadlineMs, daysLeft, ringPct, isPaused, stepsFor, readiness, sharesOk,
  planRows, planRowReady, looksLikeSecret,
} from '../guardianModel'
import { homePath } from '../v2Preview'
import '../guardian.css'

const ENDPOINT = VOICE_API
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
  return 'Couldn\'t send the test email. Double-check your email address and try again.'
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

// Build the "view the portfolio" QR as a base64 PNG (no data-URL prefix) so the
// server can attach it to the heir email. It encodes a walletlens.live/?wqi=…
// deep link — scanning it with any phone camera opens WalletLens and loads the
// portfolio. Returns null if the snapshot is too big for a single QR or on any
// error (the email then just falls back to the manual restore steps).
async function buildGuardianQr() {
  try {
    const url = await api.exportQrDeepLink()
    const dataUrl = await makeQr(url)
    if (!dataUrl) return null
    const b64 = dataUrl.split(',')[1] || ''
    // Guard against oversized payloads that would blow the server KV value limit.
    return b64 && b64.length < 45000 ? b64 : null
  } catch { return null }
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
    const qrPng = await buildGuardianQr()
    const data = await apiCall({ mode: 'guardian_checkin', deviceId, portfolioSummary, qrPng })
    if (data.ok) {
      saveGuardianLocal({ ...loadGuardianLocal(), lastCheckin: data.lastCheckin || nowIso })
    }
    // The deadline moved: move both reminders with it.
    syncGuardianReminders()
  } catch (e) {
    console.error('Guardian checkin failed:', e.message)
  }
}

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

// ── Reminders: on the phone and through the push service ─────────────────────

/**
 * After every change that moves the deadline (a check-in, a pause, a new
 * interval, turning Guardian off), tell both reminder paths. The Android app
 * queues its own reminders; the push service is told the deadline day. Both
 * are best-effort and silent: the emails remain the safety net.
 */
export function syncGuardianReminders(cfg = loadGuardianLocal()) {
  try {
    const b = typeof window !== 'undefined' ? window.AndroidBridge : null
    if (b && typeof b.scheduleGuardianReminder === 'function') {
      let lang = 'en'
      try { lang = localStorage.getItem('wl_lang') || 'en' } catch { /* default */ }
      const c = guardianCopy(lang)
      const at = cfg?.active ? deadlineMs(cfg) : 0
      b.scheduleGuardianReminder(String(at), c('remTitle'), c('remBody')(7), c('remBody')(3))
    }
  } catch { /* the push path still runs */ }
  import('../push').then(m => m.syncGuardianDue()).catch(() => {})
}

// ── Setup: who, what to say, how long ────────────────────────────────────────

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cleanHeirList(heirs) {
  return heirs
    .map(h => ({
      name: h.name.trim(),
      email: h.email.trim().toLowerCase(),
      role: String(h.role || '').trim().slice(0, 30),
      share: Number(h.share) > 0 ? Math.min(100, Math.round(Number(h.share))) : null,
    }))
    .filter(h => h.email && emailRe.test(h.email))
}

function HeirRow({ idx, heir, onChange, onRemove, showRemove, c }) {
  const { t } = useLanguage()
  return (
    <div className="pg-heir-row gd-heir-row">
      <div className="pg-heir-num">{idx + 1}</div>
      <div className="pg-heir-inputs">
        <input type="text" className="pg-input" placeholder={t('pgFullName')} value={heir.name} maxLength={80}
          aria-label={t('pgFullName')} onChange={e => onChange(idx, { ...heir, name: e.target.value })} />
        <input type="email" className="pg-input" placeholder="email@example.com" value={heir.email}
          aria-label={c('email')} onChange={e => onChange(idx, { ...heir, email: e.target.value })} />
        <div className="gd-heir-extra">
          <input type="text" className="pg-input" placeholder={c('rolePh')} value={heir.role || ''} maxLength={30}
            aria-label={c('role')} onChange={e => onChange(idx, { ...heir, role: e.target.value })} />
          <label className="gd-share">
            <input type="number" inputMode="numeric" min="0" max="100" className="pg-input" value={heir.share ?? ''}
              aria-label={c('share')} onChange={e => onChange(idx, { ...heir, share: e.target.value === '' ? null : e.target.value })} />
            <span>%</span>
          </label>
        </div>
      </div>
      {showRemove && (
        <button type="button" className="pg-heir-remove" onClick={() => onRemove(idx)} title={t('pgRemoveHeir')} aria-label={t('pgRemoveHeir')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  )
}

function SetupForm({ onSuccess, initial, c }) {
  const { t } = useLanguage()
  const [ownerName, setOwnerName] = useState(initial?.ownerName || '')
  const [ownerEmail, setOwnerEmail] = useState(initial?.ownerEmail || '')
  const [heirs, setHeirs] = useState(initial?.heirs?.length
    ? initial.heirs.map(h => ({ name: h.name || '', email: h.email || '', role: h.role || '', share: h.share ?? null }))
    : [{ name: '', email: '', role: '', share: null }])
  const [message, setMessage] = useState(initial?.message || '')
  const [intervalDays, setIntervalDays] = useState(INTERVALS.includes(initial?.intervalDays) ? initial.intervalDays : 90)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')
  const [testStatus, setTestStatus] = useState('idle')
  const [testErr, setTestErr] = useState('')

  function validate() {
    const errs = {}
    if (!emailRe.test(ownerEmail.trim())) {
      errs.ownerEmail = 'Enter your email — Guardian warns you here before ever contacting your heirs.'
    }
    const touched = heirs.filter(h => h.email.trim())
    if (touched.length === 0) { errs.heirs = 'Add at least one heir email.'; return errs }
    for (const h of touched) {
      if (!emailRe.test(h.email.trim())) { errs.heirs = `"${h.email.trim()}" is not a valid email.`; break }
    }
    if (!errs.heirs && !sharesOk(cleanHeirList(heirs))) errs.heirs = c('sharesWarn')
    return errs
  }

  async function sendTestEmail() {
    if (!emailRe.test(ownerEmail.trim())) {
      setErrors(e => ({ ...e, ownerEmail: 'Enter your email to send yourself a preview.' })); return
    }
    setErrors({}); setTestErr(''); setTestStatus('sending')
    try {
      const data = await apiCall({
        mode: 'guardian_test',
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        message: message.trim(),
        portfolioSummary: getPortfolioSnapshot(),
        plan: initial?.plan || [],
        qrPng: await buildGuardianQr(),
      })
      if (data?.ok) setTestStatus('sent')
      else { setTestErr(explainMailReason(data?.reason)); setTestStatus('error') }
      track('guardian_test_email', { to: 'owner' })
    } catch (e) {
      setTestErr(explainMailReason(e?.message)); setTestStatus('error')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({}); setStatus('saving')
    const deviceId = getOrCreateDeviceId()
    const cleanHeirs = cleanHeirList(heirs)
    try {
      const data = await apiCall({
        mode: 'guardian_setup', deviceId,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        heirs: cleanHeirs, message: message.trim(),
        intervalDays, portfolioSummary: getPortfolioSnapshot(),
        qrPng: await buildGuardianQr(),
      })
      const record = {
        ...(initial || {}),
        active: true, deviceId,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        heirs: cleanHeirs, message: message.trim(),
        intervalDays: data.interval || intervalDays,
        lastCheckin: new Date().toISOString(),
      }
      saveGuardianLocal(record)
      track('guardian_setup', { heirs: cleanHeirs.length, intervalDays, edit: !!initial?.active })
      onSuccess(record)
    } catch (err) {
      setStatus('error')
      const msg = String(err?.message || '')
      setErrors(msg.includes('owner_email')
        ? { ownerEmail: 'That email looks invalid — please double-check it.' }
        : { submit: c('saveFailed') })
    }
  }

  const updateHeir = (idx, updated) => {
    setHeirs(hs => hs.map((h, i) => i === idx ? updated : h))
    if (errors.heirs) setErrors(e => ({ ...e, heirs: undefined }))
  }
  const removeHeir = (idx) => setHeirs(h => h.filter((_, i) => i !== idx))
  const addHeir = () => { if (heirs.length < 3) setHeirs(h => [...h, { name: '', email: '', role: '', share: null }]) }
  const portfolio = getPortfolioSnapshot()

  return (
    <form className="pg-form" onSubmit={handleSubmit} noValidate>
      <p className="pg-intro">{t('pgIntro')}</p>
      <p className="pg-intro" style={{ marginTop: '-0.4rem' }}><b>{t('pgLostPhone')}</b> {t('pgLostPhoneBody')}</p>

      {portfolio.assetSymbols.length > 0 && (
        <div className="pg-portfolio-preview">
          <span className="pg-portfolio-label">{t('pgPortfolioDetected')}</span>
          <span className="pg-portfolio-assets">{portfolio.assetSymbols.join(' · ')}</span>
          {portfolio.totalUsd > 0 && <span className="pg-portfolio-value">≈ ${portfolio.totalUsd.toLocaleString()}</span>}
        </div>
      )}

      <Field label={t('pgYourName')} hint={t('pgYourNameHint')}>
        <input type="text" className="pg-input" placeholder={t('pgNamePlaceholder')} value={ownerName} maxLength={80}
          onChange={e => setOwnerName(e.target.value)} />
      </Field>

      <Field label={t('pgYourEmail')} hint={t('pgYourEmailHint')} error={errors.ownerEmail}>
        <input type="email" className="pg-input" placeholder="you@example.com" value={ownerEmail} maxLength={254}
          onChange={e => { setOwnerEmail(e.target.value); if (errors.ownerEmail) setErrors(er => ({ ...er, ownerEmail: undefined })) }} />
      </Field>

      <Field label={t('pgHeirs')} hint={t('pgHeirsHint')} error={errors.heirs}>
        <div className="pg-heirs-list">
          {heirs.map((h, i) => (
            <HeirRow key={i} idx={i} heir={h} c={c} onChange={updateHeir} onRemove={removeHeir} showRemove={heirs.length > 1} />
          ))}
        </div>
        {heirs.length < 3 && (
          <button type="button" className="pg-add-heir" onClick={addHeir}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('pgAddHeir')}
          </button>
        )}
      </Field>

      <Field label={t('pgPersonalMessage')} hint={t('pgPersonalMessageHint')}>
        <textarea className="pg-input pg-textarea" placeholder={t('pgMessagePlaceholder')} value={message}
          onChange={e => setMessage(e.target.value.slice(0, 500))} rows={3} />
        <span className="pg-char-count">{message.length}/500</span>
      </Field>

      <Field label={t('pgCheckinInterval')}>
        <div className="pg-interval-chips">
          {INTERVALS.map(d => (
            <button key={d} type="button" className={`pg-interval-chip ${intervalDays === d ? 'active' : ''}`}
              aria-pressed={intervalDays === d} onClick={() => setIntervalDays(d)}>
              {d >= 180 ? c('sixMonths') : c('nDays')(d)}
            </button>
          ))}
        </div>
        <p className="pg-interval-hint">{t('pgHeirsNotifiedAfter')(intervalDays)}</p>
      </Field>

      {errors.submit && <p className="pg-error">{errors.submit}</p>}

      <button type="button" className="pg-test-btn" onClick={sendTestEmail} disabled={testStatus === 'sending'}>
        {testStatus === 'sending' ? 'Sending test…' : <><Icon name="mail" size={14} style={{ verticalAlign: '-2px', marginRight: '0.35em' }} />{t('pgTestEmail')}</>}
      </button>
      {testStatus === 'sent' && <p className="pg-test-ok">✓ {t('pgTestSent')}</p>}
      {testStatus === 'error' && <p className="pg-error">{testErr || 'Couldn\'t send the test email. Check your email address and try again.'}</p>}

      <button type="submit" className="pg-submit" disabled={status === 'saving'}>
        {status === 'saving' ? c('saving') : initial?.active ? c('save') : 'Activate Portfolio Guardian'}
      </button>
    </form>
  )
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

function fmtDay(iso, lang) {
  try { return new Date(iso).toLocaleDateString(lang || undefined, { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' }
}

const sameDay = (iso) => { try { return new Date(iso).toDateString() === new Date().toDateString() } catch { return false } }

function SubHeader({ title, sub, onBack, c }) {
  return (
    <div className="gd-subhead">
      <button type="button" className="gd-back" onClick={onBack} aria-label={c('back')}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
      </button>
      <div><h3>{title}</h3>{sub && <small>{sub}</small>}</div>
    </div>
  )
}

/** Save a few fields on the server, then on this device; returns the new record. */
async function updateGuardian(cfg, fields) {
  const data = await apiCall({ mode: 'guardian_update', deviceId: cfg.deviceId, ...fields })
  if (!data?.ok) throw new Error(data?.reason || 'update_failed')
  const next = { ...cfg, lastCheckin: data.lastCheckin || new Date().toISOString() }
  if (fields.plan !== undefined) next.plan = fields.plan
  if (fields.trusted !== undefined) next.trusted = fields.trusted
  if (fields.intervalDays !== undefined) next.intervalDays = data.intervalDays || fields.intervalDays
  if (fields.pauseDays !== undefined) next.pausedUntil = data.pausedUntil || null
  saveGuardianLocal(next)
  syncGuardianReminders(next)
  return next
}

const ShieldIcon = ({ size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
)

// ── Home ──────────────────────────────────────────────────────────────────────

function useReadinessContext() {
  const [notifications, setNotifications] = useState(false)
  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const native = await import('../nativePush.js')
        if (native.usesNativePush()) { if (!off) setNotifications(!!native.nativePushToken()); return }
      } catch { /* browser */ }
      try { const m = await import('../push'); const on = await m.isPushEnabled(); if (!off) setNotifications(!!on) } catch { /* unknown: off */ }
    })()
    return () => { off = true }
  }, [])
  const backupAt = (() => { try { return Number(localStorage.getItem('wl_drive_backup_at') || 0) } catch { return 0 } })()
  return { notifications, backupAt, holdings: getPortfolioSnapshot().assetSymbols }
}

const READY_TARGET = { heirs: 'setup', message: 'setup', plan: 'plan', trusted: 'safety', drill: 'safety', notify: 'settings', backup: 'backup' }

function GuardianHome({ config, c, lang, onOpen, onCheckin }) {
  const ctx = useReadinessContext()
  const { score, items } = readiness(config, ctx)
  const paused = isPaused(config)
  const left = daysLeft(config)
  const soon = !paused && left <= 7
  const [checking, setChecking] = useState(false)
  const [done, setDone] = useState(false)

  async function checkIn() {
    setChecking(true)
    try { await silentCheckin(); setDone(true); onCheckin(); track('guardian_checkin_manual') } finally { setChecking(false) }
  }

  const subFor = (it) => ({
    heirs: it.done ? c('r_heirs_ok') : c('r_heirs_no'),
    message: c('r_message_sub'),
    plan: c('r_plan_sub')(it.ready, it.total),
    trusted: c('r_trusted_sub'),
    drill: c('r_drill_sub'),
    notify: c('r_notify_sub'),
    backup: c('r_backup_sub'),
  })[it.id]

  return (
    <div className="gd">
      <section className={`gd-hero${soon ? ' is-soon' : ''}${paused ? ' is-paused' : ''}`}>
        <span className="gd-hero-glow" aria-hidden="true" />
        <div className="gd-ring" style={{ '--p': `${ringPct(config)}%` }}>
          <div className="gd-ring-in">
            <ShieldIcon />
            <b>{left}</b>
            <small>{c('daysLeft')}</small>
          </div>
        </div>
        <div className="gd-hero-txt">
          <span className="gd-chip">{paused ? c('paused') : soon ? c('soon') : c('protected')}</span>
          <b>{paused ? c('pausedUntil')(fmtDay(config.pausedUntil, lang)) : sameDay(config.lastCheckin) ? c('seenToday') : c('seenOn')(fmtDay(config.lastCheckin, lang))}</b>
          <small>{c('heroNote')}</small>
          <button type="button" className="gd-here" onClick={checkIn} disabled={checking || done}>
            {done ? `✓ ${c('checkedIn')}` : c('imHere')}
          </button>
        </div>
      </section>

      <section className="gd-card">
        <div className="gd-ready-head"><b>{c('readiness')}</b><b className="gd-score">{score}%</b></div>
        <div className="gd-bar" aria-hidden="true"><span style={{ width: `${score}%` }} /></div>
        <ul className="gd-ready">
          {items.map(it => (
            <li key={it.id}>
              <button type="button" className={it.done ? 'is-done' : ''} onClick={() => onOpen(READY_TARGET[it.id])}>
                <span className="gd-dot" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m5 12 4 4 10-10" /></svg>
                </span>
                <span className="gd-ready-txt"><b>{c(`r_${it.id}`)}</b><small>{subFor(it)}</small></span>
                <svg className="gd-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="gd-card">
        <b className="gd-card-title">{c('yourHeirs')}</b>
        <div className="gd-heirs">
          {(config.heirs || []).map((h, i) => (
            <div className="gd-heir" key={h.email || i}>
              <span className={`gd-avatar gd-av-${i % 3}`} aria-hidden="true">{(h.name || h.email || '?').trim()[0]?.toUpperCase()}</span>
              <span className="gd-heir-txt">
                <b>{h.name || h.email.split('@')[0]}</b>
                <small>{[h.role, h.share ? `${h.share}%` : ''].filter(Boolean).join(' · ') || h.email}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="gd-actions">
        <button type="button" onClick={() => onOpen('preview')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          {c('actPreview')}
        </button>
        <button type="button" onClick={() => onOpen('plan')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></svg>
          {c('actPlan')}
        </button>
        <button type="button" onClick={() => onOpen('safety')}>
          <ShieldIcon size={20} />
          {c('actSafety')}
        </button>
      </div>

      <button type="button" className="pg-reconfigure-link" onClick={() => onOpen('setup')}>{c('editSetup')}</button>
    </div>
  )
}

// ── Legacy plan ───────────────────────────────────────────────────────────────

function PlanView({ config, c, onBack, onSaved }) {
  const holdings = getPortfolioSnapshot().assetSymbols
  const [rows, setRows] = useState(() => planRows(holdings, config.plan))
  const [open, setOpen] = useState(() => rows.find(r => !planRowReady(r))?.sym || rows[0]?.sym || '')
  const [status, setStatus] = useState('idle')
  const heirs = config.heirs || []
  const secret = rows.some(r => looksLikeSecret(r.how) || looksLikeSecret(r.place))
  const readyN = rows.filter(planRowReady).length

  const edit = (sym, patch) => { setRows(rs => rs.map(r => r.sym === sym ? { ...r, ...patch } : r)); setStatus('idle') }
  const toggleTo = (row, email) => {
    const to = row.to?.includes(email) ? row.to.filter(e => e !== email) : [...(row.to || []), email]
    edit(row.sym, { to: to.length === heirs.length ? [] : to })
  }

  async function save() {
    if (secret) return
    setStatus('saving')
    try {
      const plan = rows.filter(r => r.kind || r.place.trim() || r.how.trim())
        .map(r => ({ sym: r.sym, kind: r.kind, place: r.place.trim(), how: r.how.trim(), to: r.to || [] }))
      const next = await updateGuardian(config, { plan })
      setStatus('saved'); onSaved(next)
      track('guardian_plan_saved', { rows: plan.length, ready: plan.filter(planRowReady).length })
    } catch { setStatus('error') }
  }

  return (
    <div className="gd">
      <SubHeader title={c('planTitle')} sub={c('planSub')} onBack={onBack} c={c} />
      <div className="gd-warn" role="note">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3 2 20h20zM12 10v4M12 17h.01" /></svg>
        <span><b>{c('planWarn')}</b> {c('planWarnBody')}</span>
      </div>
      {!rows.length ? <p className="gd-empty">{c('noHoldings')}</p> : (
        <>
          <b className="gd-count">{c('planReady')(readyN, rows.length)}</b>
          <div className="gd-plan">
            {rows.map(r => {
              const isOpen = open === r.sym
              const ok = planRowReady(r)
              const bad = looksLikeSecret(r.how) || looksLikeSecret(r.place)
              return (
                <div key={r.sym} className={`gd-plan-row${isOpen ? ' is-open' : ''}`}>
                  <button type="button" className="gd-plan-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : r.sym)}>
                    <span className="gd-sym" aria-hidden="true">{r.sym.slice(0, 4)}</span>
                    <span className="gd-plan-txt">
                      <b>{r.sym}</b>
                      <small className={r.kind ? '' : 'is-missing'}>{r.kind ? [c(`kind_${r.kind}`), r.place].filter(Boolean).join(' · ') : c('notSet')}</small>
                    </span>
                    <span className={`gd-badge${ok ? ' is-ok' : ''}`}>{ok ? c('ready') : c('add')}</span>
                  </button>
                  {isOpen && (
                    <div className="gd-plan-body">
                      <span className="gd-label">{c('keptAt')}</span>
                      <div className="gd-chips">
                        {PLAN_KINDS.map(k => (
                          <button key={k} type="button" className={r.kind === k ? 'is-on' : ''} aria-pressed={r.kind === k}
                            onClick={() => edit(r.sym, { kind: r.kind === k ? '' : k })}>{c(`kind_${k}`)}</button>
                        ))}
                      </div>
                      <label className="gd-label">{c('placeName')}
                        <input className="pg-input" value={r.place} maxLength={80} placeholder={c('placePh')} onChange={e => edit(r.sym, { place: e.target.value })} />
                      </label>
                      <label className="gd-label">{c('howReach')}
                        <textarea className="pg-input" rows={2} value={r.how} maxLength={300} placeholder={c('howPh')} onChange={e => edit(r.sym, { how: e.target.value })} />
                      </label>
                      {bad && <p className="pg-error" role="alert">{c('secretWarn')}</p>}
                      {heirs.length > 1 && (
                        <>
                          <span className="gd-label">{c('goesTo')}</span>
                          <div className="gd-chips">
                            <button type="button" className={!r.to?.length ? 'is-on' : ''} aria-pressed={!r.to?.length} onClick={() => edit(r.sym, { to: [] })}>{c('everyone')}</button>
                            {heirs.map(h => (
                              <button key={h.email} type="button" className={r.to?.includes(h.email) ? 'is-on' : ''} aria-pressed={!!r.to?.includes(h.email)}
                                onClick={() => toggleTo(r, h.email)}>{h.name || h.email}{h.share ? ` ${h.share}%` : ''}</button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {status === 'error' && <p className="pg-error">{c('saveFailed')}</p>}
          <button type="button" className="pg-submit" onClick={save} disabled={secret || status === 'saving'}>
            {status === 'saving' ? c('saving') : status === 'saved' ? `✓ ${c('saved')}` : c('save')}
          </button>
        </>
      )}
    </div>
  )
}

// ── What an heir receives ─────────────────────────────────────────────────────

function PreviewView({ config, c, onBack }) {
  const heirs = config.heirs || []
  const [who, setWho] = useState(heirs[0]?.email || '')
  const [status, setStatus] = useState('idle')
  const heir = heirs.find(h => h.email === who) || heirs[0] || {}
  const snap = getPortfolioSnapshot()
  const plan = (config.plan || []).filter(p => !p.to?.length || p.to.includes(heir.email))
  const trusted = config.trusted?.name || ''

  async function emailMe() {
    setStatus('sending')
    try {
      const data = await apiCall({
        mode: 'guardian_test', ownerName: config.ownerName, ownerEmail: config.ownerEmail,
        message: config.message, portfolioSummary: snap, plan, heirShare: heir.share || 0,
        qrPng: await buildGuardianQr(),
      })
      setStatus(data?.ok ? 'sent' : 'error')
      track('guardian_test_email', { to: 'owner', from: 'preview' })
    } catch { setStatus('error') }
  }

  return (
    <div className="gd">
      <SubHeader title={c('previewTitle')(heir.name || heir.email || '')} sub={c('previewSub')} onBack={onBack} c={c} />
      {heirs.length > 1 && (
        <div className="gd-chips">
          {heirs.map(h => (
            <button key={h.email} type="button" className={h.email === heir.email ? 'is-on' : ''} aria-pressed={h.email === heir.email} onClick={() => setWho(h.email)}>{h.name || h.email}</button>
          ))}
        </div>
      )}
      <article className="gd-mail">
        <header>
          <span><b>{c('pvFrom')}</b> WalletLens Guardian</span>
          <span><b>{c('pvSubject')}</b> {c('pvSubjectText')(config.ownerName)}</span>
        </header>
        <div className="gd-mail-body">
          {config.message && <p className="gd-quote">{config.message}</p>}
          <div className="gd-stats">
            <div><small>{c('pvValue')}</small><b>{snap.totalUsd > 0 ? `≈ ${snap.currency} ${snap.totalUsd.toLocaleString()}` : '—'}</b></div>
            {heir.share ? <div><small>{c('pvShare')}</small><b>{heir.share}%</b></div> : null}
          </div>
          <b className="gd-card-title">{c('pvSteps')}</b>
          <ol className="gd-steps-list">
            <li>{c('pvStep1')(trusted)}</li>
            <li>{c('pvStep2')}</li>
            {plan.length > 0 && (
              <li>{c('pvStep3')}
                <ul>
                  {plan.map(p => <li key={p.sym}><b>{p.sym}</b>{p.kind ? ` · ${c(`kind_${p.kind}`)}` : ''}{p.place ? ` · ${p.place}` : ''}{p.how ? <><br /><small>{p.how}</small></> : null}</li>)}
                </ul>
              </li>
            )}
          </ol>
          <p className="gd-safe"><ShieldIcon size={16} /> {c('pvSafe')}</p>
        </div>
      </article>
      <button type="button" className="pg-test-btn" onClick={emailMe} disabled={status === 'sending'}>
        {status === 'sent' ? `✓ ${c('emailSent')}` : c('emailMe')}
      </button>
      {status === 'error' && <p className="pg-error">{c('saveFailed')}</p>}
    </div>
  )
}

// ── Safety steps and controls ─────────────────────────────────────────────────

const PAUSES = [7, 14, 30, 60]

function SafetyView({ config, c, lang, onBack, onChange, onTurnOff }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [drill, setDrill] = useState('')
  const [trusted, setTrusted] = useState({ name: config.trusted?.name || '', email: config.trusted?.email || '' })
  const paused = isPaused(config)
  const steps = stepsFor(config.intervalDays, { trusted: !!config.trusted?.email })
  const trustedDirty = trusted.name !== (config.trusted?.name || '') || trusted.email !== (config.trusted?.email || '')

  async function run(key, fields) {
    setBusy(key); setErr('')
    try { onChange(await updateGuardian(config, fields)) } catch { setErr(c('saveFailed')) } finally { setBusy('') }
  }

  async function sendDrill() {
    setBusy('drill'); setDrill('')
    try {
      const data = await apiCall({ mode: 'guardian_drill', deviceId: config.deviceId })
      if (data?.ok) {
        const next = { ...config, drilledAt: data.drilledAt }
        saveGuardianLocal(next); onChange(next)
        setDrill(c('drillDone')(data.sent))
        track('guardian_drill', { sent: data.sent })
      } else setDrill(data?.reason === 'too_soon' ? c('drillSoon') : c('saveFailed'))
    } catch { setDrill(c('saveFailed')) } finally { setBusy('') }
  }

  async function turnOff() {
    if (!window.confirm(c('turnOffConfirm'))) return
    setBusy('off')
    try { await apiCall({ mode: 'guardian_cancel', deviceId: config.deviceId }).catch(() => {}) } finally {
      clearGuardianLocal(); syncGuardianReminders(null); track('guardian_cancel'); onTurnOff()
    }
  }

  const stepText = (s) => ({
    seen: [c('st_seen'), c('st_seen_b')],
    reminder: [c('st_reminder'), c('st_reminder_b')],
    email: [c('st_email'), c('st_email_b')],
    trusted: [c('st_trusted')(config.trusted?.name), c('st_trusted_b')],
    heirs: [c('st_heirs'), c('st_heirs_b')],
  })[s.id]

  return (
    <div className="gd">
      <SubHeader title={c('safetyTitle')} sub={c('safetySub')} onBack={onBack} c={c} />

      <section className="gd-card">
        <b className="gd-card-title">{c('ifNotOpen')}</b>
        <div className="gd-seg">
          {INTERVALS.map(d => (
            <button key={d} type="button" className={config.intervalDays === d ? 'is-on' : ''} aria-pressed={config.intervalDays === d}
              disabled={!!busy} onClick={() => config.intervalDays !== d && run('interval', { intervalDays: d })}>
              {d >= 180 ? c('sixMonths') : c('nDays')(d)}
            </button>
          ))}
        </div>
      </section>

      <section className="gd-card">
        <b className="gd-card-title">{c('inOrder')}</b>
        <ol className="gd-timeline">
          {steps.map(s => {
            const [title, body] = stepText(s)
            return (
              <li key={s.id} className={`gd-step gd-step-${s.id}`}>
                <span className="gd-step-dot" aria-hidden="true" />
                <div><small>{c('dayN')(s.day)}</small><b>{title}</b><span>{body}</span></div>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="gd-card">
        <b className="gd-card-title">{c('trustedTitle')}</b>
        <small className="gd-muted">{c('trustedSub')}</small>
        <div className="gd-two">
          <input className="pg-input" placeholder={c('name')} aria-label={c('name')} value={trusted.name} maxLength={80} onChange={e => setTrusted(t => ({ ...t, name: e.target.value }))} />
          <input className="pg-input" type="email" placeholder={c('email')} aria-label={c('email')} value={trusted.email} maxLength={254} onChange={e => setTrusted(t => ({ ...t, email: e.target.value }))} />
        </div>
        <div className="gd-row-btns">
          {config.trusted?.email && (
            <button type="button" className="gd-link" disabled={!!busy} onClick={() => { setTrusted({ name: '', email: '' }); run('trusted', { trusted: null }) }}>{c('remove')}</button>
          )}
          <button type="button" className="gd-btn" disabled={!!busy || !trustedDirty || !emailRe.test(trusted.email.trim())}
            onClick={() => run('trusted', { trusted: { name: trusted.name.trim(), email: trusted.email.trim().toLowerCase() } })}>
            {busy === 'trusted' ? c('saving') : c('save')}
          </button>
        </div>
      </section>

      <section className="gd-card">
        <b className="gd-card-title">{c('pauseTitle')}</b>
        <small className="gd-muted">{paused ? c('pauseOn')(fmtDay(config.pausedUntil, lang)) : c('pauseOff')}</small>
        {paused ? (
          <button type="button" className="gd-btn" disabled={!!busy} onClick={() => run('pause', { pauseDays: 0 })}>{c('endPause')}</button>
        ) : (
          <div className="gd-seg" role="group" aria-label={c('pauseFor')}>
            {PAUSES.map(d => (
              <button key={d} type="button" disabled={!!busy} onClick={() => run('pause', { pauseDays: d })}>{c('nDays')(d)}</button>
            ))}
          </div>
        )}
      </section>

      <section className="gd-card">
        <b className="gd-card-title">{c('drillTitle')}</b>
        <small className="gd-muted">{config.drilledAt ? c('drillLast')(fmtDay(config.drilledAt, lang)) : c('drillSub')}</small>
        <button type="button" className="gd-btn" disabled={!!busy} onClick={sendDrill}>{busy === 'drill' ? c('saving') : c('drillSend')}</button>
        {drill && <p className="gd-muted" role="status">{drill}</p>}
      </section>

      {err && <p className="pg-error">{err}</p>}
      <button type="button" className="pg-cancel-btn" onClick={turnOff} disabled={!!busy}>{c('turnOff')}</button>
    </div>
  )
}

// ── One-time "it's on" popup ──────────────────────────────────────────────────

function ActivatedModal({ intervalDays, onClose }) {
  const { t } = useLanguage()
  return (
    <div className="pg-modal-overlay" role="dialog" aria-modal="true" aria-label={t('pgActivated')} onClick={onClose}>
      <div className="pg-modal" onClick={e => e.stopPropagation()}>
        <button className="wlm-close" onClick={onClose} aria-label={t('close')} title={t('close')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
        </button>
        <div className="pg-modal-icon"><ShieldIcon size={30} /></div>
        <h3 className="pg-modal-title">{t('pgGuardianIsOn')} <Icon name="shield" size={16} style={{ verticalAlign: '-2px', marginInlineStart: '0.25em' }} /></h3>
        <p className="pg-modal-text">{t('pgHowItProtects')}</p>
        <ul className="pg-modal-list">
          <li><b>{t('pgJustKeepUsing')}</b> {t('pgResetsAutomatically')}</li>
          <li>{t('pgEmailHeirsAfter')(intervalDays)}</li>
          <li>{t('pgShieldInHeader')}</li>
          <li>{t('pgKeysNeverShared')}</li>
        </ul>
        <button className="pg-modal-cta" onClick={onClose}>{t('pgGotIt')}</button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PortfolioGuardian() {
  const { lang } = useLanguage()
  const c = useMemo(() => guardianCopy(lang), [lang])
  const navigate = useNavigate()
  const [config, setConfig] = useState(() => loadGuardianLocal())
  const [view, setView] = useState('home')
  const [activated, setActivated] = useState(null)

  // Opening the Guardian screen counts as a check-in.
  useEffect(() => {
    let cancelled = false
    if (loadGuardianLocal()?.active) {
      silentCheckin().finally(() => { if (!cancelled) setConfig(loadGuardianLocal()) })
    }
    return () => { cancelled = true }
  }, [])

  const go = useCallback((v) => {
    track('guardian_open', { view: v })
    if (v === 'settings') { navigate('/settings'); return }
    if (v === 'backup') { navigate(homePath(true), { state: { tab: 'manage' } }); return }
    setView(v)
    try { window.scrollTo({ top: 0 }) } catch { /* jsdom */ }
  }, [navigate])

  const handleSuccess = useCallback((record) => {
    const first = !config?.active
    setConfig(record)
    setView('home')
    syncGuardianReminders(record)
    if (first) {
      setActivated(record)
      track('guardian_activated_popup')
      noteMoment('guardian_active')
    }
  }, [config])

  const active = !!config?.active
  let content
  if (!active) {
    content = view === 'setup'
      ? <div className="pg-wrapper"><SetupForm c={c} onSuccess={handleSuccess} initial={null} /></div>
      : (
        <div className="pg-wrapper">
          <button className="pg-activate-btn" onClick={() => setView('setup')}>
            <ShieldIcon size={16} /> Set Up Portfolio Guardian
          </button>
        </div>
      )
  } else if (view === 'setup') {
    content = (
      <div className="pg-wrapper">
        <SubHeader title={c('editSetup')} onBack={() => setView('home')} c={c} />
        <SetupForm c={c} onSuccess={handleSuccess} initial={config} />
      </div>
    )
  } else if (view === 'plan') {
    content = <PlanView config={config} c={c} onBack={() => setView('home')} onSaved={setConfig} />
  } else if (view === 'preview') {
    content = <PreviewView config={config} c={c} onBack={() => setView('home')} />
  } else if (view === 'safety') {
    content = <SafetyView config={config} c={c} lang={lang} onBack={() => setView('home')} onChange={setConfig}
      onTurnOff={() => { setConfig(null); setView('home') }} />
  } else {
    content = <GuardianHome config={config} c={c} lang={lang} onOpen={go} onCheckin={() => setConfig(loadGuardianLocal())} />
  }

  return (
    <>
      {content}
      {activated && <ActivatedModal intervalDays={activated.intervalDays} onClose={() => setActivated(null)} />}
    </>
  )
}
