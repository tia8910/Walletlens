import { useState, useMemo, useEffect } from 'react'
import { track } from '../analytics'

/**
 * RebalancePanel — a simple, in-dashboard rebalance tool that works off the
 * user's real holdings. Beyond manual targets, it can SUGGEST a target mix from
 * the user's style + risk appetite, weighting each asset by its market-cap /
 * risk bucket, and then advises what to do to stay on the safe side.
 */

// Base weight per risk/market-cap bucket for each profile. Higher = more of the
// portfolio. Cautious leans on safe money + blue-chips; aggressive tilts toward
// mid/small caps.
const WEIGHTS = {
  cautious:   { cash: 3.0, stable: 2.6, metal: 2.4, large: 2.0, mid: 0.8, small: 0.3 },
  balanced:   { cash: 1.5, stable: 1.4, metal: 1.5, large: 2.0, mid: 1.3, small: 0.7 },
  aggressive: { cash: 0.5, stable: 0.6, metal: 0.8, large: 1.5, mid: 1.6, small: 1.5 },
}
// Max any single asset may take, to keep the mix diversified.
const CAPS = { cautious: 25, balanced: 35, aggressive: 50 }
const PROFILES = [
  { id: 'cautious',   label: 'Cautious',   sub: 'Investor · low risk' },
  { id: 'balanced',   label: 'Balanced',   sub: 'A steady mix' },
  { id: 'aggressive', label: 'Aggressive', sub: 'Trader · high risk' },
]
const SAFE = ['cash', 'stable', 'metal']

function suggestTargets(items, profile) {
  const W = WEIGHTS[profile], cap = CAPS[profile]
  const t = {}; let sumW = 0
  items.forEach(h => { const w = W[h.bucket] ?? W.small; t[h.id] = w; sumW += w })
  if (sumW <= 0) return t
  Object.keys(t).forEach(id => { t[id] = (t[id] / sumW) * 100 })
  // Clamp each asset to the cap and redistribute the excess across the rest.
  for (let i = 0; i < 6; i++) {
    const over = Object.keys(t).filter(id => t[id] > cap + 0.01)
    if (!over.length) break
    let excess = 0
    over.forEach(id => { excess += t[id] - cap; t[id] = cap })
    const under = Object.keys(t).filter(id => t[id] < cap - 0.01)
    const us = under.reduce((s, id) => s + t[id], 0)
    if (us <= 0) break
    under.forEach(id => { t[id] += excess * (t[id] / us) })
  }
  // Round to 0.1 and nudge the largest so the total lands on 100.
  const r = {}; let sum = 0
  Object.keys(t).forEach(id => { r[id] = Math.round(t[id] * 10) / 10; sum += r[id] })
  const drift = Math.round((100 - sum) * 10) / 10
  if (Math.abs(drift) >= 0.1) {
    const biggest = Object.keys(r).sort((a, b) => r[b] - r[a])[0]
    if (biggest) r[biggest] = Math.round((r[biggest] + drift) * 10) / 10
  }
  return r
}

function buildAdvice(items, targets, total, profile) {
  const cap = CAPS[profile]
  const rows = items.map(h => ({ ...h, cur: total > 0 ? (h.value / total) * 100 : 0, tgt: targets[h.id] || 0 }))
  const tips = []
  const dom = rows.filter(r => r.cur > cap + 1).sort((a, b) => b.cur - a.cur)[0]
  if (dom) tips.push(`${dom.sym} is ${dom.cur.toFixed(0)}% of your portfolio — trim it toward ${dom.tgt.toFixed(0)}% so no single asset dominates.`)
  const safeCur = rows.filter(r => SAFE.includes(r.bucket)).reduce((s, r) => s + r.cur, 0)
  const safeTgt = rows.filter(r => SAFE.includes(r.bucket)).reduce((s, r) => s + r.tgt, 0)
  if (safeTgt - safeCur > 4) tips.push(`Build a safety buffer: aim for ~${safeTgt.toFixed(0)}% in cash, stablecoins & gold (you're at ${safeCur.toFixed(0)}%).`)
  else if (safeCur - safeTgt > 8 && profile === 'aggressive') tips.push(`You hold ${safeCur.toFixed(0)}% in cash/stables — for an aggressive style you could put more to work.`)
  const add = rows.filter(r => r.tgt - r.cur > 4).sort((a, b) => (b.tgt - b.cur) - (a.tgt - a.cur))[0]
  if (add) tips.push(`Add to ${add.sym} (→ ${add.tgt.toFixed(0)}%) to move toward a ${profile} mix.`)
  if (!tips.length) tips.push(`Your mix already looks close to a ${profile} allocation — nice work.`)
  return tips.slice(0, 3)
}

export default function RebalancePanel({ open, onClose, holdings, cv }) {
  const items = useMemo(() =>
    (holdings || [])
      .filter(h => (h.value || 0) > 0)
      .map(h => ({ id: h.id, sym: h.sym || String(h.id || '').toUpperCase(), value: h.value || 0, bucket: h.bucket || 'small' }))
      .sort((a, b) => b.value - a.value)
  , [holdings])

  const total = useMemo(() => items.reduce((s, h) => s + h.value, 0), [items])

  const [targets, setTargets] = useState({})
  const [profile, setProfile] = useState(null)
  const [advice, setAdvice] = useState([])

  const currentTargets = () => {
    const t = {}; items.forEach(h => { t[h.id] = total > 0 ? Math.round((h.value / total) * 1000) / 10 : 0 }); return t
  }

  useEffect(() => {
    if (!open) return
    setTargets(currentTargets()); setProfile(null); setAdvice([])
    track('rebalance_panel_open', { holdings: items.length })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const money = (n) => (cv ? cv(n) : `$${Math.round(n).toLocaleString()}`)
  const setTarget = (id, v) => setTargets(prev => ({ ...prev, [id]: v }))

  const applyProfile = (p) => {
    setProfile(p)
    const t = suggestTargets(items, p)
    setTargets(t)
    setAdvice(buildAdvice(items, t, total, p))
    track('rebalance_suggest', { profile: p })
  }
  const resetCurrent = () => { setTargets(currentTargets()); setProfile(null); setAdvice([]) }

  const targetSum = Object.values(targets).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const sumOff = Math.abs(targetSum - 100) > 0.5
  const onTargetEps = Math.max(1, total * 0.005)

  const rows = items.map(h => {
    const tgtPct = parseFloat(targets[h.id]) || 0
    return { ...h, curPct: total > 0 ? (h.value / total) * 100 : 0, diff: (total * tgtPct / 100) - h.value }
  })

  if (!open) return null

  return (
    <div className="wl-reb-overlay" onClick={onClose}>
      <div className="wl-reb-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Rebalance portfolio">
        <div className="wl-reb-head">
          <div>
            <h2 className="wl-reb-title">Rebalance</h2>
            <p className="wl-reb-sub">Pick a style for a suggested mix, or set targets yourself.</p>
          </div>
          <button className="wl-reb-x" onClick={onClose} aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="wl-reb-profiles">
          {PROFILES.map(p => (
            <button key={p.id} className={`wl-reb-profile${profile === p.id ? ' active' : ''}`} onClick={() => applyProfile(p.id)}>
              <strong>{p.label}</strong><em>{p.sub}</em>
            </button>
          ))}
        </div>

        {advice.length > 0 && (
          <div className="wl-reb-advice">
            <div className="wl-reb-advice-title">💡 To stay on the safe side</div>
            {advice.map((a, i) => <p key={i}>{a}</p>)}
          </div>
        )}

        <div className="wl-reb-actions">
          <button className="wl-reb-quick" onClick={resetCurrent}>Reset to current</button>
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
