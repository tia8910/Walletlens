import { useState, useMemo, useEffect } from 'react'
import { track } from '../analytics'

/**
 * RebalancePanel — a dead-simple, in-dashboard rebalance tool. It loads the
 * user's real holdings automatically (no manual typing), starts each target at
 * the current allocation, and shows exactly what to buy or sell to hit the
 * targets. No marketing, no articles.
 */
export default function RebalancePanel({ open, onClose, holdings, cv }) {
  const items = useMemo(() =>
    (holdings || [])
      .filter(h => (h.value || 0) > 0)
      .map(h => ({ id: h.coin_id || h.coin_symbol, sym: (h.coin_symbol || h.coin_id || '').toUpperCase(), value: h.value || 0 }))
      .sort((a, b) => b.value - a.value)
  , [holdings])

  const total = useMemo(() => items.reduce((s, h) => s + h.value, 0), [items])

  const [targets, setTargets] = useState({})

  // Seed each target with the current allocation whenever the panel opens.
  useEffect(() => {
    if (!open) return
    const t = {}
    items.forEach(h => { t[h.id] = total > 0 ? Math.round((h.value / total) * 1000) / 10 : 0 })
    setTargets(t)
    track('rebalance_panel_open', { holdings: items.length })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const money = (n) => (cv ? cv(n) : `$${Math.round(n).toLocaleString()}`)
  const setTarget = (id, v) => setTargets(prev => ({ ...prev, [id]: v }))

  const targetSum = Object.values(targets).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const sumOff = Math.abs(targetSum - 100) > 0.5
  const onTargetEps = Math.max(1, total * 0.005)

  const rows = items.map(h => {
    const tgtPct = parseFloat(targets[h.id]) || 0
    const diff = (total * tgtPct / 100) - h.value // + = buy, − = sell
    return { ...h, curPct: total > 0 ? (h.value / total) * 100 : 0, diff }
  })

  const equalWeight = () => {
    const w = Math.round((100 / (items.length || 1)) * 10) / 10
    const t = {}; items.forEach(h => { t[h.id] = w }); setTargets(t)
    track('rebalance_equal_weight')
  }
  const resetCurrent = () => {
    const t = {}; items.forEach(h => { t[h.id] = total > 0 ? Math.round((h.value / total) * 1000) / 10 : 0 }); setTargets(t)
  }

  if (!open) return null

  return (
    <div className="wl-reb-overlay" onClick={onClose}>
      <div className="wl-reb-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Rebalance portfolio">
        <div className="wl-reb-head">
          <div>
            <h2 className="wl-reb-title">Rebalance</h2>
            <p className="wl-reb-sub">Set a target for each asset — we'll show what to buy or sell.</p>
          </div>
          <button className="wl-reb-x" onClick={onClose} aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="wl-reb-actions">
          <button className="wl-reb-quick" onClick={equalWeight}>Equal weight</button>
          <button className="wl-reb-quick" onClick={resetCurrent}>Reset</button>
          <span className={`wl-reb-sum ${sumOff ? 'off' : 'ok'}`}>Targets {targetSum.toFixed(0)}%</span>
        </div>

        <div className="wl-reb-list">
          <div className="wl-reb-row wl-reb-row-head">
            <span>Asset</span><span>Now</span><span>Target</span><span>Action</span>
          </div>
          {rows.length === 0 && <p className="wl-reb-empty">Add some holdings first, then come back to rebalance.</p>}
          {rows.map(r => {
            const on = Math.abs(r.diff) < onTargetEps
            return (
              <div className="wl-reb-row" key={r.id}>
                <span className="wl-reb-sym">{r.sym}</span>
                <span className="wl-reb-now">{r.curPct.toFixed(0)}%</span>
                <span className="wl-reb-tgt">
                  <input type="text" inputMode="decimal" value={targets[r.id] ?? ''}
                    onChange={e => setTarget(r.id, e.target.value.replace(/[^0-9.]/g, ''))} />
                  <em>%</em>
                </span>
                <span className={`wl-reb-act ${on ? 'flat' : r.diff > 0 ? 'buy' : 'sell'}`}>
                  {on ? 'On target' : `${r.diff > 0 ? 'Buy' : 'Sell'} ${money(Math.abs(r.diff))}`}
                </span>
              </div>
            )
          })}
        </div>

        <div className="wl-reb-foot">
          {sumOff
            ? <span className="wl-reb-hint">Targets add up to {targetSum.toFixed(0)}% — aim for 100%.</span>
            : <span className="wl-reb-hint ok">Targets balanced at 100% ✓</span>}
          <button className="wl-reb-done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
