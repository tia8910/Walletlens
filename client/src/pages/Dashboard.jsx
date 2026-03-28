import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

const COLORS = ['#6366f1', '#8b5cf6', '#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#fb923c', '#e879f9', '#a78bfa', '#06b6d4']

function fmt(n) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [wallets, setWallets] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [prices, setPrices] = useState({})
  const [coinImages, setCoinImages] = useState({})
  const [newWallet, setNewWallet] = useState('')
  const [loading, setLoading] = useState(true)
  const [showWallets, setShowWallets] = useState(false)
  const [coinTargets, setCoinTargets] = useState({})
  const [editingTarget, setEditingTarget] = useState(null)
  const [targetInput, setTargetInput] = useState('')

  useEffect(() => {
    loadData()
    const interval = setInterval(refreshPrices, 60_000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [w, p, ct] = await Promise.all([api.getWallets(), api.getPortfolio(), api.getCoinTargets()])
      setWallets(w)
      setPortfolio(p)
      setCoinTargets(ct)
      if (p.length > 0) {
        const ids = p.map(h => h.coin_id).join(',')
        const [pr, imgs] = await Promise.all([api.getPrices(ids), api.getCoinImages(ids)])
        setPrices(pr)
        setCoinImages(imgs)
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  async function refreshPrices() {
    if (portfolio.length === 0) return
    const ids = portfolio.map(h => h.coin_id).join(',')
    const pr = await api.getPrices(ids)
    setPrices(pr)
  }

  async function handleCreateWallet(e) {
    e.preventDefault()
    if (!newWallet.trim()) return
    await api.createWallet({ name: newWallet.trim() })
    setNewWallet('')
    loadData()
  }

  async function handleDeleteWallet(id) {
    await api.deleteWallet(id)
    loadData()
  }

  async function handleSetCoinTarget(coinId) {
    const val = parseFloat(targetInput)
    if (!val || val <= 0) return
    await api.setCoinTarget(coinId, val)
    setEditingTarget(null)
    setTargetInput('')
    loadData()
  }

  async function handleRemoveCoinTarget(coinId) {
    await api.removeCoinTarget(coinId)
    loadData()
  }

  const totalValue = portfolio.reduce((sum, h) => sum + h.amount * (prices[h.coin_id]?.usd || 0), 0)
  const totalInvested = portfolio.reduce((sum, h) => sum + h.total_invested, 0)
  const totalPnL = totalValue - totalInvested
  const pnlPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  // Calculate projected portfolio value if all price targets are hit
  // For coins with targets: value = holdings * target_price
  // For coins without targets: value = current value
  const totalProjectedValue = enriched_raw => enriched_raw.reduce((sum, h) => {
    const target = coinTargets[h.coin_id]
    return sum + (target ? h.amount * target.amount : h.value)
  }, 0)

  const enriched = portfolio.map(h => {
    const price = prices[h.coin_id]?.usd || 0
    const change24h = prices[h.coin_id]?.usd_24h_change || 0
    const value = h.amount * price
    const pnl = value - h.total_invested
    const pnlPct = h.total_invested > 0 ? (pnl / h.total_invested) * 100 : 0
    const allocation = totalValue > 0 ? (value / totalValue) * 100 : 0
    const avgBuy = h.amount > 0 ? h.total_invested / h.amount : 0
    const image = coinImages[h.coin_id] || h.coin_image || ''
    const target = coinTargets[h.coin_id]
    // target.amount is the target PRICE, not value
    const targetPrice = target ? target.amount : null
    const targetValue = target ? h.amount * target.amount : null
    const targetPricePct = target && price > 0 ? Math.min((price / target.amount) * 100, 100) : null
    return { ...h, price, change24h, value, pnl, pnlPct, allocation, avgBuy, image, targetPrice, targetValue, targetPricePct }
  }).sort((a, b) => b.value - a.value)

  const projectedTotal = totalProjectedValue(enriched)
  const hasAnyTarget = Object.keys(coinTargets).length > 0

  const chartData = enriched.filter(h => h.value > 0).map(h => ({ name: h.coin_symbol.toUpperCase(), value: h.value }))

  return (
    <div className="page">
      {/* Hero card */}
      <div className="hero-card">
        <div className="hero-label">Total Portfolio Value</div>
        <div className="hero-value">${fmt(totalValue)}</div>
        <div className="hero-row">
          <div className={`hero-pnl ${totalPnL >= 0 ? 'positive' : 'negative'}`}>
            {totalPnL >= 0 ? '+' : ''}{fmt(totalPnL)} ({pnlPercent.toFixed(2)}%)
          </div>
          <div className="hero-invested">Invested: ${fmt(totalInvested)}</div>
        </div>

        {/* Projected value if all price targets hit */}
        {hasAnyTarget && (
          <div className="target-section">
            <div className="target-header">
              <span className="target-label">If targets hit</span>
              <span className="target-pct">${fmt(projectedTotal)}</span>
            </div>
            <div className="target-bar">
              <div className="target-fill" style={{ width: `${Math.min((totalValue / projectedTotal) * 100, 100)}%` }} />
            </div>
            <div className="target-footer">
              <span className="muted">Projected gain: +${fmt(projectedTotal - totalInvested)}</span>
            </div>
          </div>
        )}

        {chartData.length > 0 && (
          <div className="hero-chart">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} strokeWidth={0}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              {chartData.map((d, i) => (
                <div key={d.name} className="legend-item">
                  <span className="legend-dot" style={{ background: COLORS[i % COLORS.length] }} />
                  <span>{d.name}</span>
                  <span className="muted">{totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="quick-actions">
        <button className="action-btn buy-btn" onClick={() => navigate('/transactions', { state: { openAdd: true, type: 'buy' } })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Buy
        </button>
        <button className="action-btn sell-btn" onClick={() => navigate('/transactions', { state: { openAdd: true, type: 'sell' } })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Sell
        </button>
        <button className="action-btn wallet-btn" onClick={() => setShowWallets(!showWallets)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
          Wallets
        </button>
      </div>

      {/* Wallet manager */}
      {showWallets && (
        <div className="card">
          <h3>Wallets</h3>
          <form onSubmit={handleCreateWallet} className="inline-form">
            <input type="text" value={newWallet} onChange={e => setNewWallet(e.target.value)} placeholder="New wallet name..." />
            <button type="submit">Add</button>
          </form>
          {wallets.length === 0 ? <p className="muted">Create a wallet to start tracking.</p> : (
            <div className="wallet-list">
              {wallets.map(w => (
                <div key={w.id} className="wallet-item">
                  <span>{w.name}</span>
                  <button className="btn-danger btn-sm" onClick={() => handleDeleteWallet(w.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Holdings */}
      <div className="section-header">
        <h3>Holdings</h3>
        <span className="muted">{enriched.length} coin{enriched.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? <div className="card"><p className="muted">Loading...</p></div> : enriched.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#9670;</div>
          <p>No holdings yet</p>
          <p className="muted">Add a wallet and record your first transaction</p>
          <button onClick={() => { if (wallets.length === 0) setShowWallets(true); else navigate('/transactions', { state: { openAdd: true } }); }}>
            {wallets.length === 0 ? 'Create Wallet' : 'Add Transaction'}
          </button>
        </div>
      ) : (
        <div className="coin-cards">
          {enriched.map((h, i) => (
            <div key={h.coin_id} className="coin-card">
              <div className="coin-header">
                {h.image ? (
                  <img src={h.image} alt="" width={40} height={40} className="coin-logo" />
                ) : (
                  <div className="coin-icon" style={{ background: COLORS[i % COLORS.length] + '22', color: COLORS[i % COLORS.length] }}>
                    {h.coin_symbol.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="coin-name">
                  <strong>{h.coin_symbol.toUpperCase()}</strong>
                  <span className="muted">${fmt(h.price)}</span>
                </div>
                <div className="coin-value-col">
                  <strong>${fmt(h.value)}</strong>
                  <span className="muted">{h.allocation.toFixed(1)}% of portfolio</span>
                </div>
              </div>
              <div className="coin-details">
                <div className="detail">
                  <span className="detail-label">Holdings</span>
                  <span>{h.amount.toFixed(6)}</span>
                </div>
                <div className="detail">
                  <span className="detail-label">Avg Buy</span>
                  <span>${fmt(h.avgBuy)}</span>
                </div>
                <div className="detail">
                  <span className="detail-label">P&L</span>
                  <span className={h.pnl >= 0 ? 'positive' : 'negative'}>
                    {h.pnl >= 0 ? '+' : ''}{fmt(h.pnl)} ({h.pnlPct.toFixed(1)}%)
                  </span>
                </div>
                <div className="detail">
                  <span className="detail-label">24h</span>
                  <span className={h.change24h >= 0 ? 'positive' : 'negative'}>
                    {h.change24h >= 0 ? '+' : ''}{h.change24h.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Per-coin PRICE target */}
              {h.targetPrice ? (
                <div className="coin-target">
                  <div className="coin-target-header">
                    <span className="detail-label">Target Price: ${fmt(h.targetPrice)}</span>
                    <span className={`coin-target-pct ${h.targetPricePct >= 100 ? 'positive' : ''}`}>
                      {h.targetPricePct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="coin-target-bar">
                    <div className="coin-target-fill" style={{ width: `${h.targetPricePct}%`, background: h.targetPricePct >= 100 ? 'var(--green)' : COLORS[i % COLORS.length] }} />
                  </div>
                  <div className="coin-target-info">
                    <div className="target-detail">
                      <span className="detail-label">Value at target</span>
                      <strong>${fmt(h.targetValue)}</strong>
                    </div>
                    <div className="target-detail">
                      <span className="detail-label">Projected P&L</span>
                      <strong className="positive">+${fmt(h.targetValue - h.total_invested)} ({h.total_invested > 0 ? ((h.targetValue - h.total_invested) / h.total_invested * 100).toFixed(1) : 0}%)</strong>
                    </div>
                  </div>
                  <div className="coin-target-footer">
                    {h.targetPricePct >= 100 ? (
                      <span className="positive" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Target reached!</span>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.75rem' }}>
                        ${fmt(h.targetPrice - h.price)} per coin to go ({((h.targetPrice - h.price) / h.price * 100).toFixed(1)}%)
                      </span>
                    )}
                    <button className="btn-link-dark" onClick={() => handleRemoveCoinTarget(h.coin_id)}>Remove</button>
                  </div>
                </div>
              ) : (
                <div className="coin-target-actions">
                  {editingTarget === h.coin_id ? (
                    <form className="coin-target-form" onSubmit={e => { e.preventDefault(); handleSetCoinTarget(h.coin_id); }}>
                      <input type="number" step="any" value={targetInput} onChange={e => setTargetInput(e.target.value)} placeholder={`Target price ($) — now $${fmt(h.price)}`} autoFocus />
                      <button type="submit" className="btn-sm">Set</button>
                      <button type="button" className="btn-sm btn-ghost-dark" onClick={() => { setEditingTarget(null); setTargetInput(''); }}>X</button>
                    </form>
                  ) : (
                    <button className="btn-set-target" onClick={() => { setEditingTarget(h.coin_id); setTargetInput(''); }}>
                      Set price target
                    </button>
                  )}
                </div>
              )}

              <div className="alloc-bar">
                <div className="alloc-fill" style={{ width: `${h.allocation}%`, background: COLORS[i % COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
