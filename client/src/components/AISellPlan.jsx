import { useState, useMemo } from 'react'
import { track, trackAI } from '../analytics'

function generateSellPlan(enriched, prices) {
  if (!enriched.length) return null

  const totalValue = enriched.reduce((s, h) => {
    const price = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
    return s + h.amount * price
  }, 0)

  const rows = enriched.map(h => {
    const price   = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
    const value   = h.amount * price
    const sym     = h.coin_symbol?.toUpperCase()

    // Non-crypto assets without live price: show as "manually tracked"
    const id = (h.coin_id || '').toLowerCase()
    const symL = (h.coin_symbol || '').toLowerCase()
    const isNonCryptoAsset =
      id.startsWith('metal:') || id.startsWith('stock:') || id.startsWith('real:') ||
      id.startsWith('cash:')  || id.startsWith('fiat:')  ||
      id.includes('appartment') || id.includes('apartment') ||
      ['xau','xag','xpt','xpd'].includes(symL)

    if (isNonCryptoAsset && price === 0) {
      const investedVal = h.total_invested || 0
      return {
        sym, pnlPct: 0, weight: totalValue > 0 ? (investedVal / totalValue) * 100 : 0,
        value: investedVal, price: 0,
        action: 'MANUALLY TRACKED', urgency: 'low',
        reason: `${sym} is a non-crypto asset without live price feed. Value reflects your recorded cost basis.`,
        targets: [{ label: 'Update price manually', price: null, note: 'Edit your holding to set current market value' }],
      }
    }

    const pnlPct  = h.total_invested > 0 ? ((value - h.total_invested) / h.total_invested) * 100 : 0
    const weight  = totalValue > 0 ? (value / totalValue) * 100 : 0
    const chg24   = prices[h.coin_id]?.usd_24h_change ?? 0

    // Rule-based action
    let action, targets, reason, urgency

    if (pnlPct >= 200) {
      action  = 'TAKE PROFIT'
      urgency = 'high'
      targets = [
        { label: 'Sell 40% now', price: price, note: 'Lock in 200%+ gains — secure original capital' },
        { label: 'Sell 30% at +250%', price: +(h.total_invested / h.amount * 3.5).toFixed(4), note: 'Trail remaining position' },
        { label: 'Hold 30%', price: null, note: 'Let final position run with stop-loss at break-even' },
      ]
      reason = `Up ${pnlPct.toFixed(0)}% — time to systematically de-risk.`
    } else if (pnlPct >= 100) {
      action  = 'PARTIAL SELL'
      urgency = 'medium'
      targets = [
        { label: 'Sell 25% now', price: price, note: 'Return original investment' },
        { label: 'Sell 25% at +150%', price: +(price * 1.25).toFixed(4), note: 'Second tranche at higher level' },
        { label: 'Hold 50%', price: null, note: 'Keep upside exposure' },
      ]
      reason = `Up ${pnlPct.toFixed(0)}% — consider returning your principal.`
    } else if (pnlPct >= 30 && weight > 15) {
      action  = 'TRIM OVERWEIGHT'
      urgency = 'medium'
      targets = [
        { label: `Trim to 12% weight`, price: price, note: `Currently ${weight.toFixed(1)}% of portfolio — rebalance` },
        { label: 'Hold core', price: null, note: 'Keep strategic allocation' },
      ]
      reason = `${weight.toFixed(1)}% allocation is too large — trim to manage concentration risk.`
    } else if (pnlPct >= 20) {
      action  = 'HOLD & TRAIL'
      urgency = 'low'
      targets = [
        { label: `Set stop-loss at +${Math.max(0, pnlPct - 15).toFixed(0)}%`, price: +(h.total_invested / h.amount * (1 + Math.max(0, pnlPct - 15) / 100)).toFixed(4), note: 'Protect gains' },
        { label: `Take profit at +50%`, price: +(h.total_invested / h.amount * 1.5).toFixed(4), note: 'First target' },
      ]
      reason = `Solid gain. Set a trailing stop to protect profits.`
    } else if (pnlPct <= -30 && weight > 3) {
      action  = 'CUT LOSS'
      urgency = 'high'
      targets = [
        { label: 'Exit 50% immediately', price: price, note: `Down ${Math.abs(pnlPct).toFixed(0)}% — limit further damage` },
        { label: 'Hold 50% with hard stop at -40%', price: +(h.total_invested / h.amount * 0.6).toFixed(4), note: 'Final exit if thesis breaks' },
      ]
      reason = `Down ${Math.abs(pnlPct).toFixed(0)}% — reassess thesis or cut exposure.`
    } else if (pnlPct <= -15) {
      action  = 'WATCH & DECIDE'
      urgency = 'medium'
      targets = [
        { label: 'Set hard stop at -30%', price: +(h.total_invested / h.amount * 0.7).toFixed(4), note: 'Maximum acceptable loss' },
        { label: 'DCA if thesis holds', price: +(price * 0.9).toFixed(4), note: 'Average down only with conviction' },
      ]
      reason = `Down ${Math.abs(pnlPct).toFixed(0)}% — define your max pain before it hits.`
    } else if (chg24 < -5 && pnlPct > 0) {
      action  = 'SELL SPIKE'
      urgency = 'medium'
      targets = [
        { label: 'Sell 20% on any bounce', price: +(price * 1.03).toFixed(4), note: 'Reduce into relief rallies' },
        { label: 'Hold core', price: null, note: 'Keep long-term position' },
      ]
      reason = `Sharp 24h drop (${chg24.toFixed(1)}%) while still in profit — reduce on bounces.`
    } else {
      action  = 'HOLD'
      urgency = 'low'
      targets = [
        { label: `First target: +50%`, price: +(h.total_invested / h.amount * 1.5).toFixed(4), note: 'Initial take-profit' },
        { label: `Moonbag target: +100%`, price: +(h.total_invested / h.amount * 2).toFixed(4), note: 'Long-term goal' },
      ]
      reason = `Position is healthy. Let it run with clear targets.`
    }

    return { sym, pnlPct, weight, value, price, action, targets, reason, urgency }
  }).sort((a, b) => {
    const order = { 'high': 0, 'medium': 1, 'low': 2, 'manually tracked': 3 }
    return order[a.urgency] - order[b.urgency]
  })

  // Overall summary
  const totalPnlPct = enriched.reduce((s, h) => s + h.total_invested, 0) > 0
    ? ((totalValue - enriched.reduce((s, h) => s + h.total_invested, 0)) / enriched.reduce((s, h) => s + h.total_invested, 0)) * 100
    : 0

  let summary
  if (totalPnlPct > 50) summary = `Portfolio is up ${totalPnlPct.toFixed(1)}% overall. Consider locking in profits on your biggest winners while keeping strategic core positions.`
  else if (totalPnlPct > 0) summary = `Portfolio is modestly positive (+${totalPnlPct.toFixed(1)}%). Set clear targets for each position and protect gains with stop-losses.`
  else if (totalPnlPct > -20) summary = `Portfolio is slightly underwater (${totalPnlPct.toFixed(1)}%). Reassess underperformers — trim weak hands and hold quality.`
  else summary = `Portfolio is down ${Math.abs(totalPnlPct).toFixed(1)}%. Prioritize cutting your biggest losers first to stop the bleeding.`

  return { rows, summary }
}

const URGENCY_COLOR = { high: '#f87171', medium: '#fbbf24', low: '#34d399', 'manually tracked': '#a78bfa' }
const URGENCY_BG    = { high: '#f8717115', medium: '#fbbf2415', low: '#34d39915', 'manually tracked': '#a78bfa15' }

export default function AISellPlan({ enriched = [], prices = {} }) {
  const [open, setOpen] = useState(false)

  const plan = useMemo(
    () => open ? generateSellPlan(enriched, prices) : null,
    [open, enriched, prices]
  )

  function generate() {
    if (!enriched.length) return
    track('ai_sell_plan_generate')
    trackAI({ action: 'sell_plan_generate', assetCount: enriched.length, planGenerated: true })
    setOpen(true)
  }

  if (!enriched.length) return null

  return (
    <div className="glass-card" style={{ marginTop: '1rem' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'1rem' }}>
        <div>
          <h3 style={{ margin:0, fontSize:'1rem' }}>🎯 Smart Sell Plan</h3>
          <p className="muted" style={{ margin:'0.25rem 0 0', fontSize:'0.8rem' }}>
            Rule-based exit strategy for every holding — no API key needed.
          </p>
        </div>
        {!open && (
          <button onClick={generate} style={{
            background:'#34d399', color:'#000', border:'none',
            borderRadius:10, padding:'0.5rem 1.1rem',
            fontWeight:700, fontSize:'0.85rem', cursor:'pointer',
            flexShrink:0,
          }}>✨ Generate</button>
        )}
        {open && (
          <button onClick={() => setOpen(false)} style={{
            background:'rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.5)',
            border:'none', borderRadius:8, padding:'0.4rem 0.8rem',
            fontSize:'0.8rem', cursor:'pointer', flexShrink:0,
          }}>✕ Close</button>
        )}
      </div>

      {open && plan && (
        <div style={{ marginTop:'1rem' }}>
          {/* Summary */}
          <div style={{
            background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.2)',
            borderRadius:10, padding:'0.75rem 1rem', marginBottom:'1rem',
            fontSize:'0.85rem', color:'rgba(255,255,255,0.8)', lineHeight:1.6,
          }}>
            📊 {plan.summary}
          </div>

          {/* Per-coin rows */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            {plan.rows.map(row => (
              <div key={row.sym} style={{
                background: URGENCY_BG[row.urgency],
                border: `1px solid ${URGENCY_COLOR[row.urgency]}30`,
                borderLeft: `3px solid ${URGENCY_COLOR[row.urgency]}`,
                borderRadius:10, padding:'0.75rem 1rem',
              }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.4rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                    <span style={{ fontWeight:700, fontSize:'0.95rem', color:'white' }}>{row.sym}</span>
                    <span style={{
                      background: URGENCY_COLOR[row.urgency] + '25',
                      color: URGENCY_COLOR[row.urgency],
                      borderRadius:6, padding:'0.1rem 0.5rem',
                      fontSize:'0.72rem', fontWeight:700,
                    }}>{row.action}</span>
                  </div>
                  <div style={{ textAlign:'right', fontSize:'0.8rem' }}>
                    <span style={{ color: row.pnlPct >= 0 ? '#34d399' : '#f87171', fontWeight:600 }}>
                      {row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(1)}%
                    </span>
                    <span className="muted" style={{ marginLeft:'0.4rem' }}>{row.weight.toFixed(1)}% portfolio</span>
                  </div>
                </div>
                <p style={{ margin:'0 0 0.5rem', fontSize:'0.82rem', color:'rgba(255,255,255,0.55)' }}>{row.reason}</p>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem' }}>
                  {row.targets.map((t, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'baseline', gap:'0.5rem', fontSize:'0.8rem' }}>
                      <span style={{ color: URGENCY_COLOR[row.urgency], fontWeight:700, flexShrink:0 }}>
                        {i === 0 ? '①' : i === 1 ? '②' : '③'}
                      </span>
                      <span style={{ color:'white', fontWeight:600 }}>{t.label}</span>
                      {t.price && <span className="muted">@ ${t.price > 1 ? t.price.toLocaleString() : t.price}</span>}
                      <span className="muted" style={{ marginLeft:'auto', fontSize:'0.75rem', textAlign:'right' }}>{t.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
