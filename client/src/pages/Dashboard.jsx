import { useState, useEffect } from 'react'
import { api } from '../api'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#e879f9']

export default function Dashboard() {
  const [wallets, setWallets] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [prices, setPrices] = useState({})
  const [newWallet, setNewWallet] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    const interval = setInterval(refreshPrices, 60_000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [w, p] = await Promise.all([api.getWallets(), api.getPortfolio()])
      setWallets(w)
      setPortfolio(p)
      if (p.length > 0) {
        const ids = p.map(h => h.coin_id).join(',')
        const pr = await api.getPrices(ids)
        setPrices(pr)
      }
    } catch (err) {
      console.error(err)
    }
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

  const totalValue = portfolio.reduce((sum, h) => {
    const price = prices[h.coin_id]?.usd || 0
    return sum + h.amount * price
  }, 0)

  const totalInvested = portfolio.reduce((sum, h) => sum + h.total_invested, 0)
  const totalPnL = totalValue - totalInvested
  const pnlPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  const chartData = portfolio.map(h => ({
    name: h.coin_symbol.toUpperCase(),
    value: h.amount * (prices[h.coin_id]?.usd || 0),
  })).filter(d => d.value > 0)

  return (
    <div className="page">
      <h2>Portfolio Dashboard</h2>

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Total Value</span>
          <span className="stat-value">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Invested</span>
          <span className="stat-value">${totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">P&L</span>
          <span className={`stat-value ${totalPnL >= 0 ? 'positive' : 'negative'}`}>
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <small> ({pnlPercent.toFixed(2)}%)</small>
          </span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Holdings</h3>
          {loading ? <p className="muted">Loading...</p> : portfolio.length === 0 ? (
            <p className="muted">No holdings yet. Add transactions to get started.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Amount</th>
                  <th>Price</th>
                  <th>Value</th>
                  <th>24h</th>
                  <th>P&L</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map(h => {
                  const price = prices[h.coin_id]?.usd || 0
                  const change = prices[h.coin_id]?.usd_24h_change || 0
                  const value = h.amount * price
                  const pnl = value - h.total_invested
                  return (
                    <tr key={h.coin_id}>
                      <td><strong>{h.coin_symbol.toUpperCase()}</strong></td>
                      <td>{h.amount.toFixed(6)}</td>
                      <td>${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className={change >= 0 ? 'positive' : 'negative'}>{change.toFixed(2)}%</td>
                      <td className={pnl >= 0 ? 'positive' : 'negative'}>
                        {pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Allocation</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="muted">No data to display</p>}
        </div>
      </div>

      <div className="card">
        <h3>Wallets</h3>
        <form onSubmit={handleCreateWallet} className="inline-form">
          <input
            type="text"
            value={newWallet}
            onChange={e => setNewWallet(e.target.value)}
            placeholder="New wallet name..."
          />
          <button type="submit">Create Wallet</button>
        </form>
        {wallets.length === 0 ? <p className="muted">No wallets yet.</p> : (
          <div className="wallet-list">
            {wallets.map(w => (
              <div key={w.id} className="wallet-item">
                <span>{w.name}</span>
                <small className="muted">{new Date(w.created_at).toLocaleDateString()}</small>
                <button className="btn-danger btn-sm" onClick={() => handleDeleteWallet(w.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
