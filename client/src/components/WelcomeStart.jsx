import { useState } from 'react'
import { api } from '../api'
import { track, trackProfileCreated } from '../analytics'

// ── First-run "start with your balances" ────────────────────────────────────
// A warm, premium welcome shown once to a brand-new user (no holdings yet).
// It gently asks for a cash and USDT balance so the dashboard isn't an empty
// $0 the first time they land — then seeds those as real holdings. Fully
// skippable; it never blocks the dashboard.

const STARTED_KEY = 'wl_started'

function readCurrency() {
  try { return (JSON.parse(localStorage.getItem('wl_settings') || '{}').currency || 'USD').toUpperCase() }
  catch { return 'USD' }
}

// A tiny symbol for the common currencies; falls back to the code.
const CUR_SYMBOL = { USD: '$', EUR: '€', GBP: '£', EGP: 'E£', AED: 'د.إ', SAR: '﷼', INR: '₹', JPY: '¥', TRY: '₺' }

export default function WelcomeStart({ onDone }) {
  const cur = readCurrency()
  const sym = CUR_SYMBOL[cur] || cur
  const [cash, setCash] = useState('')
  const [usdt, setUsdt] = useState('')
  const [busy, setBusy] = useState(false)

  const cashNum = Math.max(0, parseFloat(cash) || 0)
  const usdtNum = Math.max(0, parseFloat(usdt) || 0)
  const hasAny = cashNum > 0 || usdtNum > 0

  function finish() {
    try { localStorage.setItem(STARTED_KEY, '1') } catch {}
    onDone?.()
  }

  function skip() {
    track('welcome_start_skip')
    finish()
  }

  async function start() {
    if (!hasAny) { skip(); return }
    setBusy(true)
    try {
      const wallet = await api.ensureWallet()
      const date = new Date().toISOString().split('T')[0]
      if (cashNum > 0) {
        await api.addTransaction({
          wallet_id: wallet.id, type: 'buy', category: 'fiat',
          coin_id: `fiat:${cur.toLowerCase()}`, coin_symbol: cur, coin_name: `${cur} Cash`,
          amount: cashNum, price_per_unit: 1, date,
        })
      }
      if (usdtNum > 0) {
        await api.addTransaction({
          wallet_id: wallet.id, type: 'buy', category: 'crypto',
          coin_id: 'tether', coin_symbol: 'USDT', coin_name: 'Tether',
          amount: usdtNum, price_per_unit: 1, date,
        })
      }
      const assetCount = (cashNum > 0 ? 1 : 0) + (usdtNum > 0 ? 1 : 0)
      track('welcome_start_seed', { cash: cashNum > 0, usdt: usdtNum > 0 })
      trackProfileCreated({ method: 'welcome_balances', assetCount, source: 'welcome_start' })
      finish()
    } catch {
      // Even if seeding fails, don't trap the user on this screen.
      finish()
    } finally { setBusy(false) }
  }

  function onKeyDown(e) { if (e.key === 'Enter') start() }

  return (
    <div className="wls-overlay" role="dialog" aria-modal="true" aria-label="Welcome to WalletLens">
      <div className="wls-card">
        <button className="wls-skip-x" onClick={skip} aria-label="Skip for now" title="Skip">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>

        <div className="wls-badge" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
        </div>

        <h2 className="wls-title">Welcome to WalletLens 👋</h2>
        <p className="wls-sub">
          Let's bring your dashboard to life. Pop in what you're holding in <b>cash</b> and <b>USDT</b> and you'll
          see your net worth instantly — you can add crypto, stocks, gold and more in a moment.
        </p>

        <div className="wls-field">
          <label className="wls-label">💵 Cash balance <span className="wls-opt">optional</span></label>
          <div className="wls-input-wrap">
            <span className="wls-prefix">{sym}</span>
            <input
              className="wls-input" type="number" inputMode="decimal" min="0" placeholder="0.00"
              value={cash} onChange={e => setCash(e.target.value)} onKeyDown={onKeyDown} autoFocus
            />
            <span className="wls-suffix">{cur}</span>
          </div>
        </div>

        <div className="wls-field">
          <label className="wls-label">💠 USDT balance <span className="wls-opt">optional</span></label>
          <div className="wls-input-wrap">
            <span className="wls-prefix wls-prefix-usdt">₮</span>
            <input
              className="wls-input" type="number" inputMode="decimal" min="0" placeholder="0.00"
              value={usdt} onChange={e => setUsdt(e.target.value)} onKeyDown={onKeyDown}
            />
            <span className="wls-suffix">USDT</span>
          </div>
        </div>

        <button className="wls-cta" onClick={start} disabled={busy}>
          {busy ? 'Setting up…' : hasAny ? 'See my dashboard →' : 'Continue →'}
        </button>
        <button className="wls-skip" onClick={skip} disabled={busy}>I'll add these later</button>

        <p className="wls-privacy">
          🔒 100% private — everything stays on your device. No account needed.
        </p>
      </div>
    </div>
  )
}

export function hasStarted() {
  try { return localStorage.getItem(STARTED_KEY) === '1' } catch { return false }
}
