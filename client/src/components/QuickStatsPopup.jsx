import { useState, useEffect } from 'react'
import api from '../api'

function fmt(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '0.00%'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

export default function QuickStatsPopup({ onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [portfolio, transactions] = await Promise.all([
          api.getPortfolio(),
          api.getTransactions(),
        ])
        if (!portfolio.length) { setData(null); setLoading(false); return }

        const ids = portfolio.map(h => h.coin_id).join(',')
        const prices = await api.getPrices(ids)

        let totalValue = 0
        let totalInvested = 0
        const enriched = portfolio.map(h => {
          const p = prices[h.coin_id] || {}
          const value = h.amount * (p.usd || 0)
          const change24hPct = p.usd_24h_change || 0
          const change24hUsd = value * (change24hPct / 100)
          totalValue += value
          totalInvested += h.total_invested || 0
          return { ...h, value, change24hPct, change24hUsd, price: p.usd || 0 }
        })

        const today24hChange = enriched.reduce((s, h) => s + h.change24hUsd, 0)
        const today24hPct = totalValue > 0 ? (today24hChange / (totalValue - today24hChange)) * 100 : 0
        const totalPnl = totalValue - totalInvested

        const sorted = [...enriched].filter(h => h.value > 0).sort((a, b) => b.change24hPct - a.change24hPct)
        const best = sorted[0] || null
        const worst = sorted[sorted.length - 1] || null

        if (!cancelled) setData({ totalValue, totalInvested, totalPnl, today24hChange, today24hPct, best, worst, holdings: enriched.length })
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="qs-overlay" onClick={onClose}>
      <div className="qs-popup" onClick={e => e.stopPropagation()}>
        <div className="qs-header">
          <span className="qs-title">Quick Stats</span>
          <button className="qs-close" onClick={onClose}>✕</button>
        </div>

        {loading && <div className="qs-loading"><span className="qs-spinner" />Loading…</div>}

        {!loading && !data && (
          <div className="qs-empty">No portfolio data yet.<br />Add some trades to get started.</div>
        )}

        {!loading && data && (
          <div className="qs-body">
            <div className="qs-main-value">
              <div className="qs-label">Total Portfolio Value</div>
              <div className="qs-value">{fmt(data.totalValue)}</div>
              <div className={`qs-badge ${data.today24hChange >= 0 ? 'pos' : 'neg'}`}>
                {data.today24hChange >= 0 ? '▲' : '▼'} {fmt(data.today24hChange)} ({fmtPct(data.today24hPct)}) today
              </div>
            </div>

            <div className="qs-grid">
              <div className="qs-stat">
                <div className="qs-stat-label">Total P&amp;L</div>
                <div className={`qs-stat-val ${data.totalPnl >= 0 ? 'pos' : 'neg'}`}>
                  {data.totalPnl >= 0 ? '+' : '-'}{fmt(data.totalPnl)}
                </div>
              </div>
              <div className="qs-stat">
                <div className="qs-stat-label">Total Invested</div>
                <div className="qs-stat-val">{fmt(data.totalInvested)}</div>
              </div>
              <div className="qs-stat">
                <div className="qs-stat-label">Holdings</div>
                <div className="qs-stat-val">{data.holdings}</div>
              </div>
              <div className="qs-stat">
                <div className="qs-stat-label">Return</div>
                <div className={`qs-stat-val ${data.totalPnl >= 0 ? 'pos' : 'neg'}`}>
                  {data.totalInvested > 0 ? fmtPct((data.totalPnl / data.totalInvested) * 100) : '—'}
                </div>
              </div>
            </div>

            {(data.best || data.worst) && (
              <div className="qs-movers">
                {data.best && (
                  <div className="qs-mover best">
                    <span className="qs-mover-label">🏆 Best today</span>
                    <span className="qs-mover-coin">{data.best.coin_symbol?.toUpperCase()}</span>
                    <span className="qs-mover-pct pos">{fmtPct(data.best.change24hPct)}</span>
                  </div>
                )}
                {data.worst && data.worst.coin_id !== data.best?.coin_id && (
                  <div className="qs-mover worst">
                    <span className="qs-mover-label">📉 Worst today</span>
                    <span className="qs-mover-coin">{data.worst.coin_symbol?.toUpperCase()}</span>
                    <span className="qs-mover-pct neg">{fmtPct(data.worst.change24hPct)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
