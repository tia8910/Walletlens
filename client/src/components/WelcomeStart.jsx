import { useState, useEffect } from 'react'
import { api } from '../api'
import sfx from '../sfx'
import { POPULAR_FIAT, GOLD_ID } from '../data/assets'
import { THEMES } from '../ThemeContext'
import { track, trackProfileCreated } from '../analytics'

// Match the dashboard/trade icons. Self-contained data URIs so they always
// render (no CDN dependency): a teal Tether ₮ coin and the "Au" gold bar.
const USDT_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%2326a17b'/%3E%3Crect x='9' y='11' width='22' height='4.2' rx='1' fill='white'/%3E%3Crect x='17.4' y='11' width='5.2' height='20' rx='1.2' fill='white'/%3E%3Crect x='12.5' y='16.4' width='15' height='3.4' rx='1' fill='white'/%3E%3C/svg%3E"
const GOLD_LOGO = THEMES.find(t => t.id === 'gold')?.logo || ''

// ── First-run "start with your balances" ────────────────────────────────────
// A warm, premium welcome shown once to a brand-new user (no holdings yet).
// It gently asks for a few balances — cash (in a currency they choose), USDT,
// gold and Bitcoin — so the dashboard isn't an empty $0 the first time they
// land. Each is seeded at its live price so P&L starts at zero. Fully skippable.

const STARTED_KEY = 'wl_started'

function readCurrency() {
  try { return (JSON.parse(localStorage.getItem('wl_settings') || '{}').currency || 'USD').toUpperCase() }
  catch { return 'USD' }
}

export default function WelcomeStart({ onDone }) {
  const [currency, setCurrency] = useState(() => {
    const cur = readCurrency()
    return POPULAR_FIAT.some(f => f.code === cur) ? cur : 'USD'
  })
  const [cash, setCash] = useState('')
  const [usdt, setUsdt] = useState('')
  const [gold, setGold] = useState('')
  const [goldUnit, setGoldUnit] = useState('oz') // 'oz' | 'g'
  const [btc, setBtc] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [canSkip, setCanSkip] = useState(false)

  // Delay the "add later" link so users see the step before they can bail.
  useEffect(() => {
    const t = setTimeout(() => setCanSkip(true), 4000)
    return () => clearTimeout(t)
  }, [])

  const sym = POPULAR_FIAT.find(f => f.code === currency)?.symbol || currency
  const n = v => Math.max(0, parseFloat(v) || 0)
  const cashN = n(cash), usdtN = n(usdt), goldN = n(gold), btcN = n(btc)
  const hasAny = cashN > 0 || usdtN > 0 || goldN > 0 || btcN > 0

  function finish() {
    try { localStorage.setItem(STARTED_KEY, '1') } catch {}
    onDone?.()
  }

  function skip() {
    track('welcome_start_skip')
    finish()
  }
  function askSkip() { track('welcome_start_skip_prompt'); setConfirmSkip(true) }

  async function start() {
    if (!hasAny) { skip(); return }
    setBusy(true)
    try {
      const wallet = await api.ensureWallet()
      const date = new Date().toISOString().split('T')[0]
      const fiatId = `fiat:${currency.toLowerCase()}`

      // Fetch live prices so cost basis ≈ current value (P&L starts ~0).
      const ids = []
      if (cashN > 0) ids.push(fiatId)
      if (usdtN > 0) ids.push('tether')
      if (goldN > 0) ids.push(GOLD_ID)
      if (btcN > 0)  ids.push('bitcoin')
      let prices = {}
      try { prices = ids.length ? await api.getPrices(ids.join(',')) : {} } catch {}
      const px = (id, fallback) => (prices[id]?.usd ?? prices[id]?.price ?? fallback)

      let count = 0
      if (cashN > 0) {
        await api.addTransaction({
          wallet_id: wallet.id, type: 'buy', category: 'fiat',
          coin_id: fiatId, coin_symbol: currency, coin_name: `${currency} Cash`,
          amount: cashN, price_per_unit: px(fiatId, 1), date,
        })
        count++
      }
      if (usdtN > 0) {
        await api.addTransaction({
          wallet_id: wallet.id, type: 'buy', category: 'crypto',
          coin_id: 'tether', coin_symbol: 'USDT', coin_name: 'Tether',
          amount: usdtN, price_per_unit: px('tether', 1), date,
        })
        count++
      }
      if (goldN > 0) {
        // Gold is priced per troy ounce — convert grams if that's what they entered.
        const goldOz = goldUnit === 'g' ? goldN / 31.1034768 : goldN
        await api.addTransaction({
          wallet_id: wallet.id, type: 'buy', category: 'gold',
          coin_id: GOLD_ID, coin_symbol: 'XAU', coin_name: 'Gold (1 oz)',
          amount: goldOz, price_per_unit: px(GOLD_ID, 0), date,
        })
        count++
      }
      if (btcN > 0) {
        await api.addTransaction({
          wallet_id: wallet.id, type: 'buy', category: 'crypto',
          coin_id: 'bitcoin', coin_symbol: 'BTC', coin_name: 'Bitcoin',
          amount: btcN, price_per_unit: px('bitcoin', 0), date,
        })
        count++
      }
      track('welcome_start_seed', { cash: cashN > 0, usdt: usdtN > 0, gold: goldN > 0, btc: btcN > 0, currency })
      trackProfileCreated({ method: 'welcome_balances', assetCount: count, source: 'welcome_start' })
      sfx.haptic([10, 30, 12])
      finish()
    } catch {
      finish()
    } finally { setBusy(false) }
  }

  function onKeyDown(e) { if (e.key === 'Enter') start() }

  return (
    <div className="wls-overlay" role="dialog" aria-modal="true" aria-label="Welcome to WalletLens">
      <div className="wls-card">
        <button className="wlm-close" onClick={skip} aria-label="Close" title="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
        </button>

        <div className="wls-badge" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
        </div>

        <h2 className="wls-title">Now build your dashboard 🚀</h2>
        <p className="wls-sub">
          Let's bring your dashboard to life. Add whatever you're holding and you'll see your net worth
          instantly — all optional, and you can add stocks and more in a moment.
        </p>

        {/* Cash — pick the currency */}
        <div className="wls-field">
          <label className="wls-label">💵 Cash balance</label>
          <div className="wls-input-wrap">
            <span className="wls-prefix">{sym}</span>
            <input
              className="wls-input" type="number" inputMode="decimal" min="0" placeholder="0.00"
              value={cash} onChange={e => setCash(e.target.value)} onKeyDown={onKeyDown} autoFocus
            />
            <select
              className="wls-cur-select" value={currency}
              onChange={e => setCurrency(e.target.value)} aria-label="Cash currency"
            >
              {POPULAR_FIAT.map(f => <option key={f.code} value={f.code}>{f.code}</option>)}
            </select>
          </div>
        </div>

        {/* USDT */}
        <div className="wls-field">
          <label className="wls-label"><img className="wls-ic" src={USDT_LOGO} alt="" /> USDT balance</label>
          <div className="wls-input-wrap">
            <span className="wls-prefix"><img className="wls-ic" src={USDT_LOGO} alt="" /></span>
            <input
              className="wls-input" type="number" inputMode="decimal" min="0" placeholder="0.00"
              value={usdt} onChange={e => setUsdt(e.target.value)} onKeyDown={onKeyDown}
            />
            <span className="wls-suffix">USDT</span>
          </div>
        </div>

        {/* Gold */}
        <div className="wls-field">
          <label className="wls-label">{GOLD_LOGO ? <img className="wls-ic" src={GOLD_LOGO} alt="" /> : '🥇'} Gold</label>
          <div className="wls-input-wrap">
            <span className="wls-prefix">{GOLD_LOGO ? <img className="wls-ic" src={GOLD_LOGO} alt="" /> : '🥇'}</span>
            <input
              className="wls-input" type="number" inputMode="decimal" min="0" placeholder="0.00"
              value={gold} onChange={e => setGold(e.target.value)} onKeyDown={onKeyDown}
            />
            <select
              className="wls-unit-select" value={goldUnit}
              onChange={e => setGoldUnit(e.target.value)} aria-label="Gold unit"
            >
              <option value="oz">oz</option>
              <option value="g">gram</option>
            </select>
          </div>
        </div>

        {/* Bitcoin */}
        <div className="wls-field">
          <label className="wls-label">₿ Bitcoin</label>
          <div className="wls-input-wrap">
            <span className="wls-prefix wls-prefix-btc">₿</span>
            <input
              className="wls-input" type="number" inputMode="decimal" min="0" placeholder="0.00"
              value={btc} onChange={e => setBtc(e.target.value)} onKeyDown={onKeyDown}
            />
            <span className="wls-suffix">BTC</span>
          </div>
        </div>

        <button className="wls-cta" onClick={start} disabled={busy}>
          {busy ? 'Setting up…' : hasAny ? 'See my dashboard →' : 'Continue →'}
        </button>
        <button
          className="wls-skip" onClick={askSkip} disabled={busy}
          style={{ opacity: canSkip ? 0.6 : 0, pointerEvents: canSkip ? 'auto' : 'none', transition: 'opacity .4s ease' }}
        >I'll add these later</button>

        <p className="wls-privacy">
          🔒 100% private — everything stays on your device. No account needed.
        </p>

        {confirmSkip && (
          <div className="bs-confirm-overlay" onClick={() => setConfirmSkip(false)}>
            <div className="bs-confirm-card" onClick={e => e.stopPropagation()}>
              <h4 className="bs-confirm-title">Start with an empty dashboard?</h4>
              <p className="bs-confirm-text">
                Adding even <strong>one balance</strong> lets you see your net worth and live P&L
                right away instead of a blank $0. It's optional and stays on your device — you can
                add or remove anything later.
              </p>
              <div className="bs-confirm-actions">
                <button className="bs-confirm-go" style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                  onClick={() => setConfirmSkip(false)}>
                  Add a balance
                </button>
                <button className="bs-confirm-switch" onClick={skip} disabled={busy}>Skip anyway</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function hasStarted() {
  try { return localStorage.getItem(STARTED_KEY) === '1' } catch { return false }
}
