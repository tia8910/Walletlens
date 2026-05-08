import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer,
  AreaChart, Area,
  PieChart, Pie, Cell,
  Tooltip,
} from 'recharts'
import { api } from '../api'

// ── Demo data shown when user has no real holdings ──────────────────────
const DEMO = {
  totalValue: 248750.42,
  totalInvested: 236300,
  totalPnL: 12450.42,
  totalPnLPct: 5.27,
  holdings: [
    { coin_id: 'bitcoin',  coin_symbol: 'BTC', price: 67200,  value: 142800, total_invested: 135000 },
    { coin_id: 'ethereum', coin_symbol: 'ETH', price: 3410,   value: 68450,  total_invested: 65000 },
    { coin_id: 'solana',   coin_symbol: 'SOL', price: 188.5,  value: 28300,  total_invested: 27000 },
    { coin_id: 'xrp',      coin_symbol: 'XRP', price: 1.39,   value: 5700,   total_invested: 5400 },
    { coin_id: 'others',   coin_symbol: 'Others', price: 0,   value: 3500,   total_invested: 3900 },
  ],
  transactions: [
    { id: 1, type: 'buy',  coin_symbol: 'BTC', amount: 0.08,  price_per_unit: 67200 },
    { id: 2, type: 'buy',  coin_symbol: 'ETH', amount: 1.2,   price_per_unit: 3410 },
    { id: 3, type: 'sell', coin_symbol: 'SOL', amount: 12,    price_per_unit: 188.5 },
    { id: 4, type: 'buy',  coin_symbol: 'XRP', amount: 1200,  price_per_unit: 1.39 },
    { id: 5, type: 'buy',  coin_symbol: 'BTC', amount: 0.04,  price_per_unit: 66800 },
  ],
}

// ── Helpers ─────────────────────────────────────────────────────────────
const fmt = n => n.toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})
const pct = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

// Generate a smooth pseudo-history series for the 30-day perf chart.
// Walks from current * 0.86 → current with gentle randomness.
function buildPerfSeries(current) {
  const points = 30
  const start = current * 0.86 || 1
  const series = []
  let prev = start
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1)
    const target = start + (current - start) * t
    prev = prev + (target - prev) * 0.55 + (Math.random() - 0.5) * (current * 0.012)
    series.push({ idx: i, v: Math.max(prev, 0) })
  }
  series[series.length - 1].v = current || 1
  return series
}

const PALETTE = [
  '#34d399', '#10b981', '#3b82f6', '#f59e0b',
  '#8b5cf6', '#ec4899', '#22d3ee', '#64748b',
]

// ── Component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const [portfolio, setPortfolio] = useState([])
  const [prices, setPrices] = useState({})
  const [transactions, setTransactions] = useState([])
  const [tickerValue, setTickerValue] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const tickerStart = useRef(null)

  // Load portfolio + prices
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [p, txs] = await Promise.all([
          api.getPortfolio(),
          api.getTransactions(),
        ])
        if (cancelled) return
        setPortfolio(p)
        setTransactions(txs)
        if (p.length) {
          const ids = p.map(h => h.coin_id)
          try {
            const px = await api.getPrices(ids)
            if (!cancelled) setPrices(px || {})
          } catch { /* offline / rate-limited */ }
        }
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  // Enriched holdings + totals
  const { enriched, totalValue, totalInvested, totalPnL, totalPnLPct, isDemo, pricesFailed } = useMemo(() => {
    const raw = portfolio.map(h => {
      const price = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value = h.amount * price
      return { ...h, price, value }
    }).sort((a, b) => b.value - a.value)

    const hasPortfolio = raw.length > 0
    const hasPrices = raw.some(h => h.value > 0)

    // No portfolio at all → show demo
    if (!hasPortfolio && loaded) {
      return {
        enriched: DEMO.holdings,
        totalValue: DEMO.totalValue,
        totalInvested: DEMO.totalInvested,
        totalPnL: DEMO.totalPnL,
        totalPnLPct: DEMO.totalPnLPct,
        isDemo: true,
        pricesFailed: false,
      }
    }

    const totalValue = raw.reduce((s, h) => s + h.value, 0)
    const totalInvested = raw.reduce((s, h) => s + h.total_invested, 0)
    const totalPnL = totalValue - totalInvested
    const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
    return {
      enriched: raw,
      totalValue: hasPrices ? totalValue : totalInvested, // show invested when prices unavailable
      totalInvested,
      totalPnL: hasPrices ? totalPnL : 0,
      totalPnLPct: hasPrices ? totalPnLPct : 0,
      isDemo: false,
      pricesFailed: hasPortfolio && !hasPrices && loaded,
    }
  }, [portfolio, prices, loaded])

  // Animated counter on initial load (counts up to totalValue)
  useEffect(() => {
    if (!loaded) return
    if (tickerStart.current === totalValue) return
    tickerStart.current = totalValue
    const start = performance.now()
    const from = 0
    const to = totalValue
    const duration = 1200
    let raf = 0
    function step(now) {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setTickerValue(from + (to - from) * eased)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [loaded, totalValue])

  // Demo perf chart series
  const perfSeries = useMemo(() => buildPerfSeries(totalValue), [totalValue])

  // Allocation pie data (top 5 + Others)
  const allocData = useMemo(() => {
    if (!enriched.length) return []
    const top = enriched.slice(0, 5).map(h => ({
      name: h.coin_symbol?.toUpperCase() || h.coin_id,
      value: h.value,
    }))
    const rest = enriched.slice(5).reduce((s, h) => s + h.value, 0)
    if (rest > 0) top.push({ name: 'Others', value: rest })
    return top
  }, [enriched])

  // Recent transactions feed (last 8, fall back to demo)
  const recentTxs = useMemo(() => {
    const src = (loaded && transactions.length === 0) ? DEMO.transactions : transactions
    return src.slice(0, 8)
  }, [transactions, loaded])

  return (
    <div className="dash-v2">
      {/* ── Header row ── */}
      <div className="dash-v2-header">
        <h1 className="dash-v2-title">Portfolio Overview</h1>
        <div className="dash-v2-live">
          <span className="dash-v2-live-dot" />
          <span>LIVE</span>
        </div>
      </div>

      {/* ── Total Value hero ── */}
      <div className="dash-v2-hero glass-card lens-pulse">
        <p className="dash-v2-hero-label">
          {pricesFailed ? 'INVESTED VALUE' : 'TOTAL PORTFOLIO VALUE'}
          {isDemo && <span className="dash-v2-demo-badge">DEMO</span>}
          {pricesFailed && <span className="dash-v2-demo-badge" style={{color:'#fbbf24',borderColor:'rgba(251,191,36,0.4)',background:'rgba(251,191,36,0.1)'}}>PRICES OFFLINE</span>}
        </p>
        <h2 className="dash-v2-hero-value">${fmt(loaded ? tickerValue : 0)}</h2>
        {!pricesFailed && totalPnL !== 0 && (
          <p className={`dash-v2-hero-change ${totalPnL >= 0 ? 'up' : 'down'}`}>
            {totalPnL >= 0 ? '↑' : '↓'} ${fmt(Math.abs(totalPnL))} ({pct(totalPnLPct)})
          </p>
        )}
        {!loaded && <p className="dash-v2-hero-change muted">Loading…</p>}
        {isDemo && (
          <button className="dash-v2-cta" onClick={() => navigate('/transactions', { state: { openAdd: true } })}>
            Add your first trade →
          </button>
        )}
      </div>

      {/* ── Main grid: 8 / 4 ── */}
      <div className="dash-v2-grid">
        {/* Left column */}
        <div className="dash-v2-col-main">
          {/* Performance chart */}
          <div className="glass-card holo-card-v2 dash-v2-chart-card">
            <div className="dash-v2-chart-head">
              <h3>30-Day Performance</h3>
              <span className="muted">demo trend</span>
            </div>
            <div className="dash-v2-chart-body">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={perfSeries} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#34d399" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ background: 'rgba(15,23,20,0.95)', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 10, fontSize: '0.78rem' }}
                    formatter={v => [`$${fmt(v)}`, '']}
                    labelFormatter={() => ''}
                    cursor={{ stroke: 'rgba(52,211,153,0.35)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#34d399"
                    strokeWidth={3}
                    fill="url(#perfGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Live Transactions */}
          <div className="glass-card dash-v2-tx-card">
            <h3>Live Transactions</h3>
            {recentTxs.length === 0 ? (
              <p className="muted">No transactions yet — add one to see the feed light up.</p>
            ) : (
              <ul className="dash-v2-tx-list">
                {recentTxs.map(t => {
                  const isBuy = t.type === 'buy' || t.type === 'deposit'
                  const dollar = (t.amount || 0) * (t.price_per_unit || 0)
                  return (
                    <li key={t.id} className="holo-card-v2 dash-v2-tx-item">
                      <div className="dash-v2-tx-left">
                        <span className={`dash-v2-tx-icon ${isBuy ? 'buy' : 'sell'}`}>
                          {isBuy ? '🟢' : '🔴'}
                        </span>
                        <div className="dash-v2-tx-meta">
                          <strong>
                            {isBuy ? 'Bought' : 'Sold'} {t.coin_symbol?.toUpperCase()}
                          </strong>
                          <span className="muted">
                            {t.amount} @ ${fmt(t.price_per_unit || 0)}
                          </span>
                        </div>
                      </div>
                      <div className="dash-v2-tx-amount">${fmt(dollar)}</div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="dash-v2-col-side">
          {/* Allocation donut */}
          <div className="glass-card dash-v2-alloc-card">
            <h3>Allocation</h3>
            {allocData.length === 0 ? (
              <p className="muted">No holdings yet.</p>
            ) : (
              <div className="dash-v2-alloc-body">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={allocData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius="68%"
                      outerRadius="92%"
                      stroke="none"
                      paddingAngle={2}
                    >
                      {allocData.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'rgba(15,23,20,0.95)', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 10, fontSize: '0.78rem' }}
                      formatter={(v, n) => [`$${fmt(v)}`, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="dash-v2-alloc-legend">
                  {allocData.map((d, i) => (
                    <li key={d.name}>
                      <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <span className="name">{d.name}</span>
                      <span className="val">{((d.value / totalValue) * 100 || 0).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Top Holdings */}
          <div className="glass-card dash-v2-holdings-card">
            <h3>Top Holdings</h3>
            {enriched.length === 0 ? (
              <p className="muted">Nothing here yet.</p>
            ) : (
              <ul className="dash-v2-holdings-list">
                {enriched.slice(0, 5).map(h => (
                  <li
                    key={h.coin_id}
                    className="holo-card-v2 dash-v2-holding"
                    onClick={() => navigate(`/asset/${encodeURIComponent(h.coin_id)}`)}
                  >
                    <div className="dash-v2-holding-meta">
                      <strong>{h.coin_symbol?.toUpperCase()}</strong>
                      <span className="muted">${fmt(h.price)}</span>
                    </div>
                    <span className="dash-v2-holding-value">${fmt(h.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
