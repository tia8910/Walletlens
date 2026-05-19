import { useState, useMemo } from 'react'
import CoinLogo from './CoinLogo'

const STORAGE_KEY = 'wl_risk_budgets'

function loadBudgets() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function saveBudgets(b) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)) } catch {}
}

function fmt(n) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function RiskBudget({ enriched, totalValue }) {
  const [budgets, setBudgets] = useState(loadBudgets)
  const [editing, setEditing] = useState({})

  function setBudget(coinId, pct) {
    const next = { ...budgets, [coinId]: pct }
    setBudgets(next)
    saveBudgets(next)
  }

  const rows = useMemo(() => enriched.map(h => {
    const allocPct    = totalValue > 0 ? (h.value / totalValue) * 100 : 0
    const budgetPct   = budgets[h.coin_id] ?? null
    const maxLossUsd  = budgetPct !== null ? (budgetPct / 100) * totalValue : null
    const currentLoss = h.value - h.total_invested
    const overexposed = budgetPct !== null && currentLoss < 0 && Math.abs(currentLoss) > (maxLossUsd ?? 0)
    const riskUsedPct = budgetPct !== null && maxLossUsd && maxLossUsd > 0
      ? Math.min(100, (Math.abs(Math.min(0, currentLoss)) / maxLossUsd) * 100)
      : 0
    return { ...h, allocPct, budgetPct, maxLossUsd, currentLoss, overexposed, riskUsedPct }
  }), [enriched, budgets, totalValue])

  const totalBudgetPct   = rows.reduce((s, r) => s + (r.budgetPct ?? 0), 0)
  const overexposedCount = rows.filter(r => r.overexposed).length
  const coveredCount     = rows.filter(r => r.budgetPct !== null).length

  if (!enriched.length) {
    return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Add holdings to set risk budgets.</p>
  }

  return (
    <div className="rb-wrap">
      {/* Summary bar */}
      <div className="rb-summary">
        <div className="rb-sum-card">
          <span className="rb-sum-label">Assets covered</span>
          <span className="rb-sum-val">{coveredCount} / {rows.length}</span>
        </div>
        <div className="rb-sum-card">
          <span className="rb-sum-label">Total risk budget</span>
          <span className="rb-sum-val" style={{ color: totalBudgetPct > 20 ? '#f87171' : 'var(--g)' }}>
            {totalBudgetPct.toFixed(1)}% of portfolio
          </span>
        </div>
        {overexposedCount > 0 && (
          <div className="rb-sum-card rb-alert">
            <span className="rb-sum-label">⚠️ Overexposed</span>
            <span className="rb-sum-val">{overexposedCount} asset{overexposedCount > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Per-asset rows */}
      {rows.map(r => {
        const isEditing = editing[r.coin_id] !== undefined
        const inputVal  = isEditing ? editing[r.coin_id] : (r.budgetPct !== null ? String(r.budgetPct) : '')

        return (
          <div key={r.coin_id} className={`rb-row${r.overexposed ? ' rb-row--alert' : ''}`}>
            <div className="rb-row-header">
              <CoinLogo coinId={r.coin_id} coinImage={r.coin_image} size={32} />
              <div className="rb-row-name">
                <span className="rb-sym">{r.symbol?.toUpperCase() || r.coin_id}</span>
                <span className="rb-alloc">{r.allocPct.toFixed(1)}% of portfolio · ${fmt(r.value)}</span>
              </div>
              <div className="rb-budget-input-wrap">
                <input
                  className="rb-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  placeholder="Max loss %"
                  value={inputVal}
                  onChange={e => setEditing(prev => ({ ...prev, [r.coin_id]: e.target.value }))}
                  onBlur={() => {
                    const v = parseFloat(editing[r.coin_id] ?? '')
                    if (!isNaN(v) && v >= 0) setBudget(r.coin_id, Math.min(v, 100))
                    else if (editing[r.coin_id] === '') { const next = { ...budgets }; delete next[r.coin_id]; setBudgets(next); saveBudgets(next) }
                    setEditing(prev => { const n = { ...prev }; delete n[r.coin_id]; return n })
                  }}
                />
                <span className="rb-pct-label">%</span>
              </div>
            </div>

            {r.budgetPct !== null && (
              <div className="rb-bar-wrap">
                <div className="rb-bar-track">
                  <div
                    className={`rb-bar-fill${r.overexposed ? ' rb-bar--danger' : r.riskUsedPct > 70 ? ' rb-bar--warn' : ''}`}
                    style={{ width: `${r.riskUsedPct}%` }}
                  />
                </div>
                <div className="rb-bar-labels">
                  <span style={{ color: r.overexposed ? '#f87171' : 'var(--text-muted)' }}>
                    {r.overexposed ? '⚠️ ' : ''}
                    Loss: {r.currentLoss < 0 ? `-$${fmt(Math.abs(r.currentLoss))}` : `+$${fmt(r.currentLoss)}`}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Budget: ${fmt(r.maxLossUsd ?? 0)} ({r.budgetPct}%)
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <p className="rb-hint">Set the max % of your total portfolio you're willing to lose on each asset. Red bar = budget exceeded.</p>
    </div>
  )
}
