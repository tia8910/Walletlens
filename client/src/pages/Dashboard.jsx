import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { api } from '../api'

// ── SVG icon set ─────────────────────────────────────────────────────────
const Ico = {
  overview: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  buy:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>,
  sell:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>,
  wallet:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20z"/><circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg>,
  data:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg>,
  history:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></svg>,
  plus:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  trash:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>,
  export:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  import:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  copy:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  check:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  trend:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
}

const DEMO = {
  totalValue: 248750.42, totalInvested: 236300,
  totalPnL: 12450.42, totalPnLPct: 5.27,
  holdings: [
    { coin_id: 'bitcoin',  coin_symbol: 'BTC', price: 67200, value: 142800, total_invested: 135000, amount: 2.125 },
    { coin_id: 'ethereum', coin_symbol: 'ETH', price: 3410,  value: 68450,  total_invested: 65000,  amount: 20.07 },
    { coin_id: 'solana',   coin_symbol: 'SOL', price: 188.5, value: 28300,  total_invested: 27000,  amount: 150.2 },
    { coin_id: 'xrp',      coin_symbol: 'XRP', price: 1.39,  value: 5700,   total_invested: 5400,   amount: 4100 },
    { coin_id: 'others',   coin_symbol: 'OTHER', price: 0,   value: 3500,   total_invested: 3900,   amount: 0 },
  ],
  transactions: [
    { id: 1, type: 'buy',  coin_symbol: 'BTC', amount: 0.08,  price_per_unit: 67200 },
    { id: 2, type: 'buy',  coin_symbol: 'ETH', amount: 1.2,   price_per_unit: 3410 },
    { id: 3, type: 'sell', coin_symbol: 'SOL', amount: 12,    price_per_unit: 188.5 },
    { id: 4, type: 'buy',  coin_symbol: 'XRP', amount: 1200,  price_per_unit: 1.39 },
    { id: 5, type: 'buy',  coin_symbol: 'BTC', amount: 0.04,  price_per_unit: 66800 },
  ],
}

const fmt   = n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtN  = n => Math.abs(n) >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(0)}`
const pct   = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const PALETTE = ['#34d399','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#22d3ee','#f87171','#64748b','#10b981','#a78bfa']

function buildPerfSeries(base) {
  const pts = 30, start = (base || 1) * 0.82
  let prev = start
  return Array.from({ length: pts }, (_, i) => {
    const t = i / (pts - 1)
    const target = start + (base - start) * t
    prev = prev + (target - prev) * 0.55 + (Math.random() - 0.5) * ((base || 1) * 0.014)
    return { i, v: Math.max(prev, 0) }
  }).concat([{ i: pts - 1, v: base || 1 }]).slice(0, pts)
}

// ── Wallet panel ─────────────────────────────────────────────────────────
function WalletPanel({ wallets, onRefresh }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try { await api.createWallet({ name: name.trim() }); setName(''); onRefresh() }
    finally { setBusy(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this wallet and all its transactions?')) return
    await api.deleteWallet(id); onRefresh()
  }

  return (
    <div className="dvx-panel">
      <div className="dvx-panel-row">
        <input className="dvx-input" placeholder="Wallet name…"
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="dvx-btn dvx-btn-primary" onClick={add} disabled={busy || !name.trim()}>
          {Ico.plus} Add
        </button>
      </div>
      <ul className="dvx-wallet-list">
        {wallets.map(w => (
          <li key={w.id} className="dvx-wallet-item">
            <span className="dvx-wallet-icon">{Ico.wallet}</span>
            <span className="dvx-wallet-name">{w.name}</span>
            <button className="dvx-btn-ghost dvx-btn-danger" onClick={() => del(w.id)}>{Ico.trash}</button>
          </li>
        ))}
        {wallets.length === 0 && <li className="muted" style={{ padding: '0.5rem 0', listStyle:'none' }}>No wallets yet. Add one above.</li>}
      </ul>
    </div>
  )
}

// ── Trade panel ──────────────────────────────────────────────────────────
function TradePanel({ wallets, onRefresh, defaultType = 'buy' }) {
  const [type, setType]     = useState(defaultType)
  const [walletId, setWalletId] = useState('')
  const [coin, setCoin]     = useState('')
  const [symbol, setSymbol] = useState('')
  const [amount, setAmount] = useState('')
  const [price, setPrice]   = useState('')
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0])
  const [busy, setBusy]     = useState(false)
  const [msg, setMsg]       = useState('')

  useEffect(() => { if (wallets.length) setWalletId(String(wallets[0].id)) }, [wallets])

  async function submit() {
    if (!walletId || !coin || !symbol || !amount || !price) { setMsg('Fill all fields.'); return }
    setBusy(true)
    try {
      await api.addTransaction({
        wallet_id: walletId, type,
        coin_id: coin.toLowerCase().replace(/\s+/g, '-'),
        coin_symbol: symbol.toUpperCase(), coin_name: coin,
        amount: parseFloat(amount), price_per_unit: parseFloat(price),
        date, category: 'crypto',
      })
      setMsg('Trade added!'); setCoin(''); setSymbol(''); setAmount(''); setPrice('')
      onRefresh(); setTimeout(() => setMsg(''), 2500)
    } finally { setBusy(false) }
  }

  return (
    <div className="dvx-panel">
      <div className="dvx-type-row">
        <button className={`dv-type-btn ${type === 'buy' ? 'active-buy' : ''}`} onClick={() => setType('buy')}>Buy</button>
        <button className={`dv-type-btn ${type === 'sell' ? 'active-sell' : ''}`} onClick={() => setType('sell')}>Sell</button>
      </div>
      <div className="dvx-form-grid">
        <select className="dvx-input" value={walletId} onChange={e => setWalletId(e.target.value)}>
          {wallets.length === 0 && <option value="">Create a wallet first</option>}
          {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <input className="dvx-input" placeholder="Coin name (e.g. Bitcoin)" value={coin} onChange={e => setCoin(e.target.value)} />
        <input className="dvx-input" placeholder="Ticker (BTC)" value={symbol} onChange={e => setSymbol(e.target.value)} />
        <input className="dvx-input" type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
        <input className="dvx-input" type="number" placeholder="Price per unit ($)" value={price} onChange={e => setPrice(e.target.value)} />
        <input className="dvx-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      {msg && <p className="dvx-msg">{msg}</p>}
      <button className={`dvx-btn dvx-btn-full ${type === 'buy' ? 'dvx-btn-primary' : 'dvx-btn-sell'}`}
        onClick={submit} disabled={busy}>
        {busy ? 'Adding…' : type === 'buy' ? 'Confirm Buy' : 'Confirm Sell'}
      </button>
    </div>
  )
}

// ── Data panel — short WLZ backup code ───────────────────────────────────
function DataPanel({ onRefresh }) {
  const [code, setCode]     = useState('')
  const [copied, setCopied] = useState(false)
  const [msg, setMsg]       = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy]     = useState(false)

  async function doExport() {
    setBusy(true)
    try {
      const result = await api.exportCode()
      if (result) { setCode(result); setMsg('') }
      else setMsg('Export failed.')
    } finally { setBusy(false) }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { setMsg('Copy failed — select and copy manually.') }
  }

  async function loadPreview() {
    if (!code.trim()) return
    setBusy(true)
    const result = await api.previewImportCode(code.trim())
    setBusy(false)
    if (!result.success) { setMsg('Invalid code: ' + result.error); setPreview(null); return }
    setPreview(result); setMsg('')
  }

  async function doImport() {
    if (!preview) return
    setBusy(true)
    const result = await api.importCode(code.trim())
    setBusy(false)
    if (result?.success === false) { setMsg('Import failed: ' + (result.error || 'unknown error')); return }
    setMsg('Imported! Refreshing…'); setCode(''); setPreview(null)
    onRefresh(); setTimeout(() => setMsg(''), 2500)
  }

  return (
    <div className="dvx-panel">
      <p className="dvx-data-hint">
        Your data is stored as a short backup code (WLZ format). Export it to save or transfer to another device. Paste a code to restore.
      </p>

      <button className="dvx-btn dvx-btn-primary dvx-btn-full" onClick={doExport} disabled={busy}>
        {Ico.export} Generate Backup Code
      </button>

      {code && (
        <div className="dvx-code-box">
          <div className="dvx-code-text">{code}</div>
          <button className="dvx-code-copy" onClick={copyCode}>
            {copied ? <>{Ico.check} Copied!</> : <>{Ico.copy} Copy</>}
          </button>
        </div>
      )}

      <div className="dvx-divider">or restore from code</div>

      <textarea className="dvx-input dvx-textarea"
        placeholder="Paste your WLZ backup code here…"
        value={code} onChange={e => { setCode(e.target.value); setPreview(null); setMsg('') }}
        rows={4} />

      {preview && (
        <div className="dvx-preview-box">
          <div className="dvx-preview-title">Preview</div>
          <div className="dvx-preview-row">
            <span>Wallets</span><strong>{preview.summary.wallets}</strong>
          </div>
          <div className="dvx-preview-row">
            <span>Transactions</span><strong>{preview.summary.transactions}</strong>
          </div>
          {Object.entries(preview.summary.byCategory || {}).map(([cat, n]) => (
            <div key={cat} className="dvx-preview-row">
              <span>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span><strong>{n} assets</strong>
            </div>
          ))}
        </div>
      )}

      {msg && <p className="dvx-msg">{msg}</p>}

      <div className="dvx-panel-row" style={{ marginTop: '0.25rem' }}>
        <button className="dvx-btn dvx-btn-full" onClick={loadPreview} disabled={busy || !code.trim()}>
          {Ico.import} Preview Import
        </button>
        {preview && (
          <button className="dvx-btn dvx-btn-primary dvx-btn-full" onClick={doImport} disabled={busy}>
            {Ico.check} Confirm Import
          </button>
        )}
      </div>
    </div>
  )
}

// ── Summary stat card ─────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div className="dvx-stat-card glass-card">
      <span className="dvx-stat-label">{label}</span>
      <span className="dvx-stat-value" style={color ? { color } : {}}>{value}</span>
      {sub && <span className="dvx-stat-sub">{sub}</span>}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [portfolio, setPortfolio]         = useState([])
  const [prices, setPrices]               = useState({})
  const [transactions, setTransactions]   = useState([])
  const [wallets, setWallets]             = useState([])
  const [loaded, setLoaded]               = useState(false)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [activeTab, setActiveTab]         = useState(location.state?.tab || 'overview')
  const [showAllHoldings, setShowAllHoldings] = useState(false)
  const tickerStart = useRef(null)
  const [tickerValue, setTickerValue] = useState(0)

  useEffect(() => {
    if (location.state?.tab) setActiveTab(location.state.tab)
  }, [location.state?.tab])

  async function loadAll() {
    const [p, txs, ws] = await Promise.all([
      api.getPortfolio(), api.getTransactions(), api.getWallets(),
    ])
    setPortfolio(p); setTransactions(txs); setWallets(ws)
    if (p.length) {
      setPricesLoading(true)
      try {
        const px = await api.getPrices(p.map(h => h.coin_id).join(','))
        setPrices(px || {})
      } catch {}
      setPricesLoading(false)
    }
    setLoaded(true)
  }

  useEffect(() => { loadAll(); const t = setInterval(loadAll, 60_000); return () => clearInterval(t) }, [])

  const { enriched, totalValue, totalInvested, totalPnL, totalPnLPct, isDemo, pricesFailed } = useMemo(() => {
    const raw = portfolio.map(h => {
      const price   = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value   = h.amount * price
      const pnl     = value - h.total_invested
      const pnlPct  = h.total_invested > 0 ? (pnl / h.total_invested) * 100 : 0
      return { ...h, price, value, pnl, pnlPct }
    }).sort((a, b) => (b.value || b.total_invested) - (a.value || a.total_invested))

    const hasPortfolio = raw.length > 0
    const hasPrices    = raw.some(h => h.value > 0)

    if (!hasPortfolio && loaded) {
      const demoEnriched = DEMO.holdings.map(h => ({
        ...h, pnl: h.value - h.total_invested,
        pnlPct: ((h.value - h.total_invested) / h.total_invested) * 100,
      }))
      return { enriched: demoEnriched, totalValue: DEMO.totalValue, totalInvested: DEMO.totalInvested,
        totalPnL: DEMO.totalPnL, totalPnLPct: DEMO.totalPnLPct, isDemo: true, pricesFailed: false }
    }

    const tv  = hasPrices ? raw.reduce((s, h) => s + h.value, 0) : raw.reduce((s, h) => s + h.total_invested, 0)
    const ti  = raw.reduce((s, h) => s + h.total_invested, 0)
    const pnl = hasPrices ? tv - ti : 0
    return {
      enriched: raw, totalValue: tv, totalInvested: ti,
      totalPnL: pnl, totalPnLPct: hasPrices && ti > 0 ? (pnl / ti) * 100 : 0,
      isDemo: false, pricesFailed: hasPortfolio && !hasPrices && loaded && !pricesLoading,
    }
  }, [portfolio, prices, loaded, pricesLoading])

  // Count-up animation
  useEffect(() => {
    if (!loaded) return
    if (tickerStart.current === totalValue) return
    tickerStart.current = totalValue
    const t0 = performance.now(), dur = 1400, from = 0, to = totalValue
    let raf = 0
    const step = now => {
      const ease = 1 - Math.pow(1 - Math.min(1, (now - t0) / dur), 3)
      setTickerValue(from + (to - from) * ease)
      if (ease < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [loaded, totalValue])

  const perfSeries = useMemo(() => buildPerfSeries(totalValue), [totalValue])

  const allocData = useMemo(() => {
    if (!enriched.length) return []
    const items = enriched
      .map(h => ({ name: h.coin_symbol?.toUpperCase(), value: h.value > 0 ? h.value : h.total_invested }))
      .filter(d => d.value > 0)
    const total = items.reduce((s, d) => s + d.value, 0)
    return items.map(d => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }))
  }, [enriched])

  const pnlData = useMemo(() => {
    if (pricesFailed || !enriched.some(h => h.pnl !== 0)) return []
    return enriched.slice(0, 8).map(h => ({
      name: h.coin_symbol?.toUpperCase(),
      pnl: parseFloat((h.pnl || 0).toFixed(2)),
    }))
  }, [enriched, pricesFailed])

  const recentTxs       = useMemo(() => (transactions.length ? transactions : DEMO.transactions).slice(0, 8), [transactions])
  const displayHoldings = showAllHoldings ? enriched : enriched.slice(0, 6)

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Ico.overview },
    { id: 'buy',      label: 'Buy',      icon: Ico.buy,    nav: '/transactions', navState: { openAdd: true, type: 'buy' } },
    { id: 'sell',     label: 'Sell',     icon: Ico.sell,   nav: '/transactions', navState: { openAdd: true, type: 'sell' } },
    { id: 'wallets',  label: 'Wallets',  icon: Ico.wallet },
    { id: 'data',     label: 'Backup',   icon: Ico.data },
  ]

  const tooltipStyle = {
    background: 'rgba(6,14,10,0.97)', border: '1px solid rgba(52,211,153,0.4)',
    borderRadius: 10, fontSize: '0.76rem', color: '#fff',
  }

  return (
    <div className="dvx">
      {/* Tab nav */}
      <div className="dvx-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`dvx-tab ${activeTab === t.id ? 'dvx-tab-active' : ''}`}
            onClick={() => t.nav ? navigate(t.nav, { state: t.navState }) : setActiveTab(t.id)}>
            <span className="dvx-tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {activeTab === 'overview' && (
        <>
          {/* Hero */}
          <div className="dvx-hero glass-card lens-pulse">
            <p className="dvx-hero-label">
              {pricesFailed ? 'INVESTED VALUE' : pricesLoading ? 'LOADING PRICES…' : 'TOTAL PORTFOLIO VALUE'}
              {isDemo && <span className="dvx-badge-demo">DEMO</span>}
              {pricesFailed && <span className="dvx-badge-warn">PRICES OFFLINE</span>}
              {pricesLoading && <span className="dvx-badge-info">LIVE</span>}
            </p>
            <h2 className="dvx-hero-value">${fmt(loaded ? tickerValue : 0)}</h2>
            {!pricesFailed && totalPnL !== 0 && (
              <p className={`dvx-hero-change ${totalPnL >= 0 ? 'up' : 'dn'}`}>
                {totalPnL >= 0 ? '↑' : '↓'} ${fmt(Math.abs(totalPnL))} ({pct(totalPnLPct)}) all time
              </p>
            )}
            {isDemo && (
              <div className="dvx-hero-actions">
                <button className="dvx-hero-cta" onClick={() => setActiveTab('wallets')}>Create Wallet</button>
                <button className="dvx-hero-cta dvx-hero-cta-buy" onClick={() => setActiveTab('buy')}>Add Trade</button>
              </div>
            )}
          </div>

          {/* Stats row */}
          {!isDemo && (
            <div className="dvx-stats-row">
              <StatCard label="Invested"  value={`$${fmt(totalInvested)}`} />
              <StatCard label="P&L"       value={`${totalPnL >= 0 ? '+' : ''}$${fmt(Math.abs(totalPnL))}`}
                color={totalPnL >= 0 ? '#34d399' : '#f87171'}
                sub={totalPnLPct !== 0 ? pct(totalPnLPct) : undefined} />
              <StatCard label="Assets"    value={enriched.length} />
              <StatCard label="Trades"    value={transactions.length} />
            </div>
          )}

          {/* Quick actions */}
          <div className="dvx-quick-grid">
            <button className="dvx-quick-card dvx-quick-buy holo-card-v2" onClick={() => navigate('/transactions', { state: { openAdd: true, type: 'buy' } })}>
              <span className="dvx-quick-icon">{Ico.buy}</span>
              <strong>Buy</strong>
              <span>Record a purchase</span>
            </button>
            <button className="dvx-quick-card dvx-quick-sell holo-card-v2" onClick={() => navigate('/transactions', { state: { openAdd: true, type: 'sell' } })}>
              <span className="dvx-quick-icon">{Ico.sell}</span>
              <strong>Sell</strong>
              <span>Record a sale</span>
            </button>
            <button className="dvx-quick-card holo-card-v2" onClick={() => setActiveTab('wallets')}>
              <span className="dvx-quick-icon">{Ico.wallet}</span>
              <strong>Wallets</strong>
              <span>{wallets.length} wallet{wallets.length !== 1 ? 's' : ''}</span>
            </button>
            <button className="dvx-quick-card holo-card-v2" onClick={() => navigate('/transactions')}>
              <span className="dvx-quick-icon">{Ico.history}</span>
              <strong>History</strong>
              <span>{transactions.length} trades</span>
            </button>
          </div>

          {/* Main grid */}
          <div className="dvx-grid">
            {/* Left column */}
            <div className="dvx-col-main">
              {/* Performance chart */}
              <div className="glass-card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                  <h3 style={{ margin:0 }}>30-Day Performance</h3>
                  <span className="muted" style={{ fontSize:'0.72rem' }}>simulated trend</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={perfSeries} margin={{ left:0, right:0, top:4, bottom:0 }}>
                    <defs>
                      <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.45}/>
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${fmt(v)}`, 'Value']}
                      labelFormatter={() => ''} cursor={{ stroke:'rgba(52,211,153,0.25)' }}/>
                    <Area type="monotone" dataKey="v" stroke="#34d399" strokeWidth={2.5} fill="url(#pg)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* P&L bar chart */}
              {pnlData.length > 0 && (
                <div className="glass-card">
                  <h3 style={{ margin:'0 0 0.75rem' }}>Profit / Loss by Asset</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={pnlData} margin={{ left:0, right:0, top:4, bottom:0 }}>
                      <CartesianGrid stroke="rgba(52,211,153,0.07)" vertical={false}/>
                      <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.45)', fontSize:11 }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fill:'rgba(255,255,255,0.38)', fontSize:10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => fmtN(v)} width={50}/>
                      <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${fmt(v)}`, 'P&L']}/>
                      <Bar dataKey="pnl" radius={[6,6,0,0]}>
                        {pnlData.map((d, i) => (
                          <Cell key={i} fill={d.pnl >= 0 ? '#34d399' : '#f87171'} fillOpacity={0.85}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Recent transactions */}
              <div className="glass-card">
                <h3>Recent Transactions</h3>
                {recentTxs.length === 0
                  ? <p className="muted">No transactions yet.</p>
                  : <ul className="dvx-tx-list">
                    {recentTxs.map(t => {
                      const isBuy = t.type === 'buy' || t.type === 'deposit'
                      return (
                        <li key={t.id} className="dvx-tx-item holo-card-v2">
                          <span className="dvx-tx-icon" style={{ color: isBuy ? '#34d399' : '#f87171' }}>
                            {isBuy ? Ico.buy : Ico.sell}
                          </span>
                          <div className="dvx-tx-meta">
                            <strong>{isBuy ? 'Bought' : 'Sold'} {t.coin_symbol?.toUpperCase()}</strong>
                            <span className="muted">{t.amount} @ ${fmt(t.price_per_unit || 0)}</span>
                          </div>
                          <span className="dvx-tx-amt">${fmt((t.amount || 0) * (t.price_per_unit || 0))}</span>
                        </li>
                      )
                    })}
                  </ul>
                }
              </div>
            </div>

            {/* Right column */}
            <div className="dvx-col-side">
              {/* Allocation donut */}
              <div className="glass-card">
                <h3>{pricesFailed ? 'Allocation (invested)' : 'Allocation'}</h3>
                {allocData.length === 0
                  ? <p className="muted">No holdings.</p>
                  : <>
                    <ResponsiveContainer width="100%" height={190}>
                      <PieChart>
                        <Pie data={allocData} dataKey="value" cx="50%" cy="50%"
                          innerRadius="60%" outerRadius="88%" stroke="none" paddingAngle={2}>
                          {allocData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]}/>)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`$${fmt(v)}`, n]}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="dvx-legend">
                      {allocData.map((d, i) => (
                        <li key={d.name} className="dvx-legend-item">
                          <span className="dvx-legend-dot" style={{ background: PALETTE[i % PALETTE.length] }}/>
                          <span className="dvx-legend-name">{d.name}</span>
                          <span className="dvx-legend-val">{d.pct.toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  </>
                }
              </div>

              {/* All holdings */}
              <div className="glass-card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                  <h3 style={{ margin:0 }}>Holdings ({enriched.length})</h3>
                  {pricesFailed && <span className="dvx-badge-warn" style={{ fontSize:'0.6rem' }}>INVESTED</span>}
                </div>
                {enriched.length === 0
                  ? <p className="muted">Nothing yet.</p>
                  : <>
                    <ul className="dvx-holdings">
                      {displayHoldings.map((h, i) => {
                        const displayValue = h.value > 0 ? h.value : h.total_invested
                        const hasPnl = h.pnl !== 0 && !pricesFailed
                        return (
                          <li key={h.coin_id} className="dvx-holding holo-card-v2"
                            onClick={() => !isDemo && navigate(`/asset/${encodeURIComponent(h.coin_id)}`)}>
                            <div className="dvx-holding-icon" style={{ background: PALETTE[i % PALETTE.length] + '22', color: PALETTE[i % PALETTE.length] }}>
                              {h.coin_symbol?.slice(0, 3).toUpperCase()}
                            </div>
                            <div className="dvx-holding-meta">
                              <strong>{h.coin_symbol?.toUpperCase()}</strong>
                              <span className="muted">
                                {h.price > 0 ? `$${fmt(h.price)}` : `inv $${fmt(h.total_invested)}`}
                                {' · '}{Number(h.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} units
                              </span>
                            </div>
                            <div style={{ textAlign:'right', flexShrink:0 }}>
                              <div className="dvx-holding-val">${fmt(displayValue)}</div>
                              {hasPnl && (
                                <div style={{ fontSize:'0.68rem', color: h.pnl >= 0 ? '#34d399' : '#f87171', marginTop:'0.1rem' }}>
                                  {h.pnl >= 0 ? '+' : ''}${fmt(h.pnl)} ({pct(h.pnlPct)})
                                </div>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                    {enriched.length > 6 && (
                      <button className="dvx-show-more" onClick={() => setShowAllHoldings(v => !v)}>
                        {showAllHoldings ? '▲ Show less' : `▼ Show all ${enriched.length} assets`}
                      </button>
                    )}
                  </>
                }
              </div>
            </div>
          </div>
        </>
      )}


      {/* ══ WALLETS ══ */}
      {activeTab === 'wallets' && (
        <div className="dvx-form-page">
          <div className="glass-card dvx-form-card">
            <h3>Wallets ({wallets.length})</h3>
            <WalletPanel wallets={wallets} onRefresh={loadAll} />
          </div>
          <button className="dvx-back" onClick={() => setActiveTab('overview')}>← Back</button>
        </div>
      )}

      {/* ══ DATA / BACKUP ══ */}
      {activeTab === 'data' && (
        <div className="dvx-form-page">
          <div className="glass-card dvx-form-card">
            <h3>Backup & Restore</h3>
            <DataPanel onRefresh={loadAll} />
          </div>
          <button className="dvx-back" onClick={() => setActiveTab('overview')}>← Back</button>
        </div>
      )}
    </div>
  )
}
