import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell, Tooltip,
} from 'recharts'
import { api } from '../api'

// ── Demo data (shown when user has no portfolio) ─────────────────────────
const DEMO = {
  totalValue: 248750.42, totalInvested: 236300,
  totalPnL: 12450.42, totalPnLPct: 5.27,
  holdings: [
    { coin_id: 'bitcoin',  coin_symbol: 'BTC', price: 67200, value: 142800, total_invested: 135000, amount: 2.125 },
    { coin_id: 'ethereum', coin_symbol: 'ETH', price: 3410,  value: 68450,  total_invested: 65000,  amount: 20.07 },
    { coin_id: 'solana',   coin_symbol: 'SOL', price: 188.5, value: 28300,  total_invested: 27000,  amount: 150.2 },
    { coin_id: 'xrp',      coin_symbol: 'XRP', price: 1.39,  value: 5700,   total_invested: 5400,   amount: 4100 },
    { coin_id: 'others',   coin_symbol: 'Others', price: 0,  value: 3500,   total_invested: 3900,   amount: 0 },
  ],
  transactions: [
    { id: 1, type: 'buy',  coin_symbol: 'BTC', amount: 0.08,  price_per_unit: 67200 },
    { id: 2, type: 'buy',  coin_symbol: 'ETH', amount: 1.2,   price_per_unit: 3410 },
    { id: 3, type: 'sell', coin_symbol: 'SOL', amount: 12,    price_per_unit: 188.5 },
    { id: 4, type: 'buy',  coin_symbol: 'XRP', amount: 1200,  price_per_unit: 1.39 },
    { id: 5, type: 'buy',  coin_symbol: 'BTC', amount: 0.04,  price_per_unit: 66800 },
  ],
}

const fmt  = n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct  = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const PALETTE = ['#34d399','#10b981','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#22d3ee','#64748b']

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

// ── Wallet quick-add form ────────────────────────────────────────────────
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
    <div className="dv-panel">
      <div className="dv-panel-row">
        <input
          className="dv-input" placeholder="Wallet name…"
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button className="dv-btn dv-btn-primary" onClick={add} disabled={busy || !name.trim()}>
          + Add
        </button>
      </div>
      <ul className="dv-wallet-list">
        {wallets.map(w => (
          <li key={w.id} className="dv-wallet-item">
            <span className="dv-wallet-icon">👛</span>
            <span className="dv-wallet-name">{w.name}</span>
            <button className="dv-btn-ghost dv-btn-danger" onClick={() => del(w.id)}>Delete</button>
          </li>
        ))}
        {wallets.length === 0 && <li className="muted" style={{ padding: '0.5rem 0' }}>No wallets yet.</li>}
      </ul>
    </div>
  )
}

// ── Buy / Sell quick form ────────────────────────────────────────────────
function TradePanel({ wallets, onRefresh, defaultType = 'buy' }) {
  const [type, setType]   = useState(defaultType)
  const [walletId, setWalletId] = useState('')
  const [coin, setCoin]   = useState('')
  const [symbol, setSymbol] = useState('')
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate]   = useState(new Date().toISOString().split('T')[0])
  const [busy, setBusy]   = useState(false)
  const [msg, setMsg]     = useState('')

  useEffect(() => { if (wallets.length) setWalletId(String(wallets[0].id)) }, [wallets])

  async function submit() {
    if (!walletId || !coin || !symbol || !amount || !price) { setMsg('Fill all fields.'); return }
    setBusy(true)
    try {
      await api.addTransaction({
        wallet_id: walletId, type, coin_id: coin.toLowerCase().replace(/\s+/g, '-'),
        coin_symbol: symbol.toUpperCase(), coin_name: coin,
        amount: parseFloat(amount), price_per_unit: parseFloat(price),
        date, category: 'crypto',
      })
      setMsg('✓ Trade added!'); setCoin(''); setSymbol(''); setAmount(''); setPrice('')
      onRefresh()
      setTimeout(() => setMsg(''), 2500)
    } finally { setBusy(false) }
  }

  return (
    <div className="dv-panel">
      <div className="dv-type-row">
        <button className={`dv-type-btn ${type === 'buy' ? 'active-buy' : ''}`} onClick={() => setType('buy')}>Buy</button>
        <button className={`dv-type-btn ${type === 'sell' ? 'active-sell' : ''}`} onClick={() => setType('sell')}>Sell</button>
      </div>
      <div className="dv-form-grid">
        <select className="dv-input" value={walletId} onChange={e => setWalletId(e.target.value)}>
          {wallets.length === 0 && <option value="">Create a wallet first</option>}
          {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <input className="dv-input" placeholder="Coin name (e.g. Bitcoin)" value={coin} onChange={e => setCoin(e.target.value)} />
        <input className="dv-input" placeholder="Ticker (BTC)" value={symbol} onChange={e => setSymbol(e.target.value)} />
        <input className="dv-input" type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
        <input className="dv-input" type="number" placeholder="Price per unit ($)" value={price} onChange={e => setPrice(e.target.value)} />
        <input className="dv-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      {msg && <p className="dv-msg">{msg}</p>}
      <button className={`dv-btn dv-btn-full ${type === 'buy' ? 'dv-btn-primary' : 'dv-btn-sell'}`}
        onClick={submit} disabled={busy}>
        {busy ? 'Adding…' : type === 'buy' ? '🟢 Confirm Buy' : '🔴 Confirm Sell'}
      </button>
    </div>
  )
}

// ── Data import/export panel ─────────────────────────────────────────────
function DataPanel({ onRefresh }) {
  const [code, setCode]   = useState('')
  const [msg, setMsg]     = useState('')

  function doExport() {
    try {
      const data = { wallets: api.getAllData?.() }
      const wallets = JSON.parse(localStorage.getItem('crypto_tracker_wallets') || '[]')
      const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]')
      const blob = new Blob([JSON.stringify({ wallets, transactions: txs }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'walletlens-export.json'
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      setMsg('✓ Exported!')
    } catch { setMsg('Export failed.') }
    setTimeout(() => setMsg(''), 2500)
  }

  function doImport() {
    try {
      const parsed = JSON.parse(code)
      if (parsed.wallets) localStorage.setItem('crypto_tracker_wallets', JSON.stringify(parsed.wallets))
      if (parsed.transactions) localStorage.setItem('crypto_tracker_transactions', JSON.stringify(parsed.transactions))
      setMsg('✓ Imported! Refreshing…'); setCode('')
      onRefresh(); setTimeout(() => setMsg(''), 2500)
    } catch { setMsg('Invalid JSON — paste the exported data.') }
  }

  return (
    <div className="dv-panel">
      <button className="dv-btn dv-btn-primary dv-btn-full" onClick={doExport}>⬇ Export Data (JSON)</button>
      <div style={{ marginTop: '0.75rem' }}>
        <textarea className="dv-input dv-textarea" placeholder="Paste exported JSON here to import…"
          value={code} onChange={e => setCode(e.target.value)} rows={5} />
        <button className="dv-btn dv-btn-full" style={{ marginTop: '0.5rem' }}
          onClick={doImport} disabled={!code.trim()}>⬆ Import Data</button>
      </div>
      {msg && <p className="dv-msg">{msg}</p>}
    </div>
  )
}

// ── Main Dashboard ───────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [portfolio, setPortfolio]   = useState([])
  const [prices, setPrices]         = useState({})
  const [transactions, setTransactions] = useState([])
  const [wallets, setWallets]       = useState([])
  const [loaded, setLoaded]         = useState(false)
  const [activeTab, setActiveTab]   = useState(location.state?.tab || 'overview')

  useEffect(() => {
    if (location.state?.tab) setActiveTab(location.state.tab)
  }, [location.state?.tab])
  const tickerStart = useRef(null)
  const [tickerValue, setTickerValue] = useState(0)

  async function loadAll() {
    const [p, txs, ws] = await Promise.all([
      api.getPortfolio(), api.getTransactions(), api.getWallets(),
    ])
    setPortfolio(p); setTransactions(txs); setWallets(ws)
    if (p.length) {
      try { const px = await api.getPrices(p.map(h => h.coin_id).join(',')); setPrices(px || {}) }
      catch {}
    }
    setLoaded(true)
  }

  useEffect(() => {
    loadAll()
    const t = setInterval(loadAll, 60_000)
    return () => clearInterval(t)
  }, [])

  const { enriched, totalValue, totalInvested, totalPnL, totalPnLPct, isDemo, pricesFailed } = useMemo(() => {
    const raw = portfolio.map(h => {
      const price = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      return { ...h, price, value: h.amount * price }
    }).sort((a, b) => b.value - a.value)

    const hasPortfolio = raw.length > 0
    const hasPrices    = raw.some(h => h.value > 0)

    if (!hasPortfolio && loaded) {
      return { enriched: DEMO.holdings, totalValue: DEMO.totalValue, totalInvested: DEMO.totalInvested,
        totalPnL: DEMO.totalPnL, totalPnLPct: DEMO.totalPnLPct, isDemo: true, pricesFailed: false }
    }

    const tv  = raw.reduce((s, h) => s + h.value, 0)
    const ti  = raw.reduce((s, h) => s + h.total_invested, 0)
    const pnl = tv - ti
    return {
      enriched: raw, totalValue: hasPrices ? tv : ti, totalInvested: ti,
      totalPnL: hasPrices ? pnl : 0, totalPnLPct: hasPrices && ti > 0 ? (pnl / ti) * 100 : 0,
      isDemo: false, pricesFailed: hasPortfolio && !hasPrices && loaded,
    }
  }, [portfolio, prices, loaded])

  // Count-up animation
  useEffect(() => {
    if (!loaded) return
    if (tickerStart.current === totalValue) return
    tickerStart.current = totalValue
    const t0 = performance.now(), dur = 1200, from = 0, to = totalValue
    let raf = 0
    const step = now => {
      const ease = 1 - Math.pow(1 - Math.min(1, (now - t0) / dur), 3)
      setTickerValue(from + (to - from) * ease)
      if (ease < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [loaded, totalValue])

  const perfSeries = useMemo(() => buildPerfSeries(totalValue), [totalValue])
  const allocData  = useMemo(() => {
    if (!enriched.length) return []
    const top  = enriched.slice(0, 5).map(h => ({ name: h.coin_symbol?.toUpperCase(), value: h.value }))
    const rest = enriched.slice(5).reduce((s, h) => s + h.value, 0)
    if (rest > 0) top.push({ name: 'Others', value: rest })
    return top
  }, [enriched])
  const recentTxs = useMemo(() =>
    (transactions.length ? transactions : DEMO.transactions).slice(0, 6)
  , [transactions])

  const tabs = [
    { id: 'overview',  label: '📊 Overview' },
    { id: 'buy',       label: '🟢 Buy' },
    { id: 'sell',      label: '🔴 Sell' },
    { id: 'wallets',   label: '👛 Wallets' },
    { id: 'data',      label: '💾 Data' },
  ]

  return (
    <div className="dvx">
      {/* ── Tab nav ── */}
      <div className="dvx-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`dvx-tab ${activeTab === t.id ? 'dvx-tab-active' : ''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {activeTab === 'overview' && (
        <>
          {/* Hero */}
          <div className="dvx-hero glass-card lens-pulse">
            <p className="dvx-hero-label">
              {pricesFailed ? 'INVESTED VALUE' : 'TOTAL PORTFOLIO VALUE'}
              {isDemo && <span className="dash-v2-demo-badge">DEMO</span>}
              {pricesFailed && <span className="dash-v2-demo-badge" style={{color:'#fbbf24',borderColor:'rgba(251,191,36,0.4)',background:'rgba(251,191,36,0.08)'}}>PRICES OFFLINE</span>}
            </p>
            <h2 className="dvx-hero-value">${fmt(loaded ? tickerValue : 0)}</h2>
            {!pricesFailed && totalPnL !== 0 && (
              <p className={`dvx-hero-change ${totalPnL >= 0 ? 'up' : 'dn'}`}>
                {totalPnL >= 0 ? '↑' : '↓'} ${fmt(Math.abs(totalPnL))} ({pct(totalPnLPct)})
              </p>
            )}
            {isDemo && (
              <div className="dvx-hero-actions">
                <button className="dvx-hero-cta" onClick={() => setActiveTab('wallets')}>Create Wallet</button>
                <button className="dvx-hero-cta dvx-hero-cta-buy" onClick={() => setActiveTab('buy')}>Add Trade</button>
              </div>
            )}
          </div>

          {/* Quick-action cards */}
          <div className="dvx-quick-grid">
            <button className="dvx-quick-card dvx-quick-buy holo-card-v2" onClick={() => setActiveTab('buy')}>
              <span className="dvx-quick-icon">🟢</span>
              <strong>Buy</strong>
              <span>Record a purchase</span>
            </button>
            <button className="dvx-quick-card dvx-quick-sell holo-card-v2" onClick={() => setActiveTab('sell')}>
              <span className="dvx-quick-icon">🔴</span>
              <strong>Sell</strong>
              <span>Record a sale</span>
            </button>
            <button className="dvx-quick-card holo-card-v2" onClick={() => setActiveTab('wallets')}>
              <span className="dvx-quick-icon">👛</span>
              <strong>Wallets</strong>
              <span>{wallets.length} wallet{wallets.length !== 1 ? 's' : ''}</span>
            </button>
            <button className="dvx-quick-card holo-card-v2" onClick={() => navigate('/transactions')}>
              <span className="dvx-quick-icon">📋</span>
              <strong>History</strong>
              <span>{transactions.length} trades</span>
            </button>
          </div>

          {/* Main grid */}
          <div className="dvx-grid">
            {/* Left */}
            <div className="dvx-col-main">
              <div className="glass-card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'0.75rem' }}>
                  <h3 style={{ margin:0 }}>30-Day Performance</h3>
                  <span className="muted" style={{ fontSize:'0.75rem' }}>demo trend</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={perfSeries} margin={{ left:0, right:0, top:8, bottom:0 }}>
                    <defs>
                      <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.55}/>
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip contentStyle={{ background:'rgba(15,23,20,0.95)', border:'1px solid rgba(52,211,153,0.4)', borderRadius:10, fontSize:'0.78rem' }}
                      formatter={v => [`$${fmt(v)}`, '']} labelFormatter={() => ''} cursor={{ stroke:'rgba(52,211,153,0.35)' }}/>
                    <Area type="monotone" dataKey="v" stroke="#34d399" strokeWidth={3} fill="url(#pg)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="glass-card">
                <h3>Recent Transactions</h3>
                {recentTxs.length === 0
                  ? <p className="muted">No transactions yet.</p>
                  : <ul className="dvx-tx-list">
                    {recentTxs.map(t => {
                      const isBuy = t.type === 'buy' || t.type === 'deposit'
                      return (
                        <li key={t.id} className="dvx-tx-item holo-card-v2">
                          <span className="dvx-tx-icon">{isBuy ? '🟢' : '🔴'}</span>
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

            {/* Right */}
            <div className="dvx-col-side">
              <div className="glass-card">
                <h3>Allocation</h3>
                {allocData.length === 0
                  ? <p className="muted">No holdings.</p>
                  : <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={allocData} dataKey="value" cx="50%" cy="50%"
                          innerRadius="65%" outerRadius="90%" stroke="none" paddingAngle={2}>
                          {allocData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]}/>)}
                        </Pie>
                        <Tooltip contentStyle={{ background:'rgba(15,23,20,0.95)', border:'1px solid rgba(52,211,153,0.4)', borderRadius:10, fontSize:'0.78rem' }}
                          formatter={(v, n) => [`$${fmt(v)}`, n]}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="dvx-legend">
                      {allocData.map((d, i) => (
                        <li key={d.name} className="dvx-legend-item">
                          <span className="dvx-legend-dot" style={{ background: PALETTE[i % PALETTE.length] }}/>
                          <span className="dvx-legend-name">{d.name}</span>
                          <span className="dvx-legend-val">{((d.value / totalValue) * 100 || 0).toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  </>
                }
              </div>

              <div className="glass-card">
                <h3>Top Holdings</h3>
                {enriched.length === 0
                  ? <p className="muted">Nothing yet.</p>
                  : <ul className="dvx-holdings">
                    {enriched.slice(0, 6).map((h, i) => (
                      <li key={h.coin_id} className="dvx-holding holo-card-v2"
                        onClick={() => !isDemo && navigate(`/asset/${encodeURIComponent(h.coin_id)}`)}>
                        <div className="dvx-holding-icon" style={{ background: PALETTE[i % PALETTE.length] + '22', color: PALETTE[i % PALETTE.length] }}>
                          {h.coin_symbol?.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="dvx-holding-meta">
                          <strong>{h.coin_symbol?.toUpperCase()}</strong>
                          <span className="muted">{h.price > 0 ? `$${fmt(h.price)}` : '—'}</span>
                        </div>
                        <span className="dvx-holding-val">${fmt(h.value)}</span>
                      </li>
                    ))}
                  </ul>
                }
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ BUY / SELL ══ */}
      {(activeTab === 'buy' || activeTab === 'sell') && (
        <div className="dvx-form-page">
          <div className="glass-card dvx-form-card">
            <h3>{activeTab === 'buy' ? '🟢 Record a Buy' : '🔴 Record a Sell'}</h3>
            <TradePanel wallets={wallets} onRefresh={loadAll} defaultType={activeTab} />
          </div>
          <button className="dvx-back" onClick={() => setActiveTab('overview')}>← Back to Overview</button>
        </div>
      )}

      {/* ══ WALLETS ══ */}
      {activeTab === 'wallets' && (
        <div className="dvx-form-page">
          <div className="glass-card dvx-form-card">
            <h3>👛 Wallets ({wallets.length})</h3>
            <WalletPanel wallets={wallets} onRefresh={loadAll} />
          </div>
          <button className="dvx-back" onClick={() => setActiveTab('overview')}>← Back to Overview</button>
        </div>
      )}

      {/* ══ DATA ══ */}
      {activeTab === 'data' && (
        <div className="dvx-form-page">
          <div className="glass-card dvx-form-card">
            <h3>💾 Import / Export Data</h3>
            <DataPanel onRefresh={loadAll} />
          </div>
          <button className="dvx-back" onClick={() => setActiveTab('overview')}>← Back to Overview</button>
        </div>
      )}
    </div>
  )
}
