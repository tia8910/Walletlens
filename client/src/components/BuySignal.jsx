import { useEffect, useState } from 'react'

// Fetch 24h/7d/30d change + current price from CoinGecko
async function fetchSignalData(coinId) {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinId}&price_change_percentage=24h,7d,30d`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data[0] || null
  } catch {
    return null
  }
}

// RSI-style momentum label
function momentumLabel(pct24h, pct7d, pct30d) {
  if (pct24h > 20 || pct7d > 40)  return { label: 'Extreme Pump', score: -3 }
  if (pct24h > 10 || pct7d > 20)  return { label: 'FOMO Zone',    score: -2 }
  if (pct24h > 5  || pct7d > 10)  return { label: 'Rising Fast',  score: -1 }
  if (pct24h < -15 || pct7d < -30) return { label: 'Heavy Dip',   score: +2 }
  if (pct24h < -8  || pct7d < -15) return { label: 'Dip',         score: +1 }
  if (pct24h < -3  || pct7d < -5)  return { label: 'Slight Dip',  score: +1 }
  return { label: 'Stable', score: 0 }
}

function priceVsAvgLabel(currentPrice, avgPrice30d) {
  if (!avgPrice30d || !currentPrice) return null
  const diff = ((currentPrice - avgPrice30d) / avgPrice30d) * 100
  if (diff > 25)  return { label: `+${diff.toFixed(0)}% above 30d avg`, score: -2 }
  if (diff > 10)  return { label: `+${diff.toFixed(0)}% above 30d avg`, score: -1 }
  if (diff < -25) return { label: `${diff.toFixed(0)}% below 30d avg`,  score: +2 }
  if (diff < -10) return { label: `${diff.toFixed(0)}% below 30d avg`,  score: +1 }
  return { label: `Near 30d avg (${diff > 0 ? '+' : ''}${diff.toFixed(0)}%)`, score: 0 }
}

function avgCostLabel(currentPrice, userAvgCost) {
  if (!userAvgCost || !currentPrice) return null
  const diff = ((currentPrice - userAvgCost) / userAvgCost) * 100
  if (diff > 30)  return { label: `${diff.toFixed(0)}% above your avg cost`, score: -2, warn: true }
  if (diff > 10)  return { label: `${diff.toFixed(0)}% above your avg cost`, score: -1, warn: true }
  if (diff < -20) return { label: `${Math.abs(diff).toFixed(0)}% below your avg — DCA opportunity`, score: +2, warn: false }
  if (diff < -5)  return { label: `${Math.abs(diff).toFixed(0)}% below your avg cost`, score: +1, warn: false }
  return { label: `Near your avg cost`, score: 0, warn: false }
}

function verdict(totalScore, mode) {
  if (mode === 'sell') {
    // For sell: high score = good exit (price elevated), low = bad exit (price down)
    if (totalScore >= 3)  return { text: 'Great Exit',       color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    emoji: '🟢' }
    if (totalScore >= 1)  return { text: 'Decent Exit',      color: '#86efac', bg: 'rgba(134,239,172,0.08)', emoji: '🟢' }
    if (totalScore === 0) return { text: 'Neutral',           color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', emoji: '🟡' }
    if (totalScore >= -1) return { text: 'Selling Low',      color: '#fb923c', bg: 'rgba(251,146,60,0.1)',   emoji: '🟡' }
    return                       { text: 'Wait for Recovery', color: '#f87171', bg: 'rgba(248,113,113,0.1)',  emoji: '🔴' }
  }
  if (totalScore >= 3)  return { text: 'Strong Entry',   color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    emoji: '🟢' }
  if (totalScore >= 1)  return { text: 'Decent Entry',   color: '#86efac', bg: 'rgba(134,239,172,0.08)', emoji: '🟢' }
  if (totalScore === 0) return { text: 'Neutral',         color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', emoji: '🟡' }
  if (totalScore >= -1) return { text: 'Be Cautious',    color: '#fb923c', bg: 'rgba(251,146,60,0.1)',   emoji: '🟡' }
  if (totalScore >= -2) return { text: 'FOMO Risk',      color: '#f87171', bg: 'rgba(248,113,113,0.1)',  emoji: '🔴' }
  return                       { text: 'Don\'t Buy Now', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   emoji: '🔴' }
}

export default function BuySignal({ coinId, currentPrice, userAvgCost, mode = 'buy' }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!coinId || coinId.startsWith('stock:') || coinId.startsWith('metal:') ||
        coinId.startsWith('fiat:') || coinId.startsWith('cash:')) return
    setData(null)
    setLoading(true)
    fetchSignalData(coinId).then(d => { setData(d); setLoading(false) })
  }, [coinId])

  if (!coinId || coinId.startsWith('stock:') || coinId.startsWith('fiat:') ||
      coinId.startsWith('cash:') || coinId.startsWith('bond:')) return null
  if (loading) return (
    <div style={{ padding:'0.6rem 0.8rem', borderRadius:10, background:'rgba(255,255,255,0.04)', fontSize:'0.75rem', color:'rgba(255,255,255,0.3)', marginBottom:'0.75rem' }}>
      Analysing entry timing…
    </div>
  )
  if (!data) return null

  const pct24h  = data.price_change_percentage_24h_in_currency  ?? data.price_change_percentage_24h  ?? 0
  const pct7d   = data.price_change_percentage_7d_in_currency   ?? data.price_change_percentage_7d   ?? 0
  const pct30d  = data.price_change_percentage_30d_in_currency  ?? data.price_change_percentage_30d  ?? 0
  const ath     = data.ath || 0
  const price   = currentPrice || data.current_price || 0

  // 30d avg approximation from pct30d
  const avg30d  = pct30d !== 0 ? price / (1 + pct30d / 100) : null

  const momentum   = momentumLabel(pct24h, pct7d, pct30d)
  const vsAvg      = priceVsAvgLabel(price, avg30d)
  const vsUserCost = avgCostLabel(price, userAvgCost)

  // ATH distance signal
  const athPct = ath > 0 ? ((price - ath) / ath) * 100 : null
  let athSignal = null
  if (athPct !== null) {
    if (athPct > -10)      athSignal = { label: 'Near ATH — high risk entry', score: -2 }
    else if (athPct > -30) athSignal = { label: `${Math.abs(athPct).toFixed(0)}% from ATH`, score: -1 }
    else if (athPct < -75) athSignal = { label: `${Math.abs(athPct).toFixed(0)}% below ATH — deep discount`, score: +2 }
    else if (athPct < -50) athSignal = { label: `${Math.abs(athPct).toFixed(0)}% below ATH`, score: +1 }
  }

  const signals = [momentum, vsAvg, athSignal, vsUserCost].filter(Boolean)
  // For sell mode, invert the score: good entry signals = bad sell signals
  const rawScore = signals.reduce((s, sig) => s + (sig.score || 0), 0)
  const totalScore = mode === 'sell' ? -rawScore : rawScore
  const v = verdict(totalScore, mode)

  const rows = [
    { icon: pct24h >= 0 ? '📈' : '📉', label: '24h move',     value: `${pct24h >= 0 ? '+' : ''}${pct24h.toFixed(1)}%`, warn: pct24h > 10 },
    { icon: pct7d  >= 0 ? '📈' : '📉', label: '7d move',      value: `${pct7d  >= 0 ? '+' : ''}${pct7d.toFixed(1)}%`,  warn: pct7d  > 20 },
    vsAvg      ? { icon: '📊', label: 'vs 30d average', value: vsAvg.label,        warn: vsAvg.score < 0 } : null,
    athSignal  ? { icon: '🏔️', label: 'vs All-Time High', value: athSignal.label,  warn: athSignal.score < 0 } : null,
    momentum.score < -1 ? { icon: '⚠️', label: 'Momentum',  value: momentum.label, warn: true } : null,
    vsUserCost ? { icon: vsUserCost.warn ? '⚠️' : '💰', label: 'vs your avg cost', value: vsUserCost.label, warn: vsUserCost.warn } : null,
  ].filter(Boolean)

  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${v.color}33`,
      background: v.bg, padding: '0.75rem 0.9rem',
      marginBottom: '0.75rem',
    }}>
      {/* Verdict header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{v.emoji}</span>
        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: v.color }}>{v.text}</span>
        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
          {mode === 'sell' ? 'Good time to sell?' : 'Good time to buy?'}
        </span>
      </div>

      {/* Signal rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>{r.icon} {r.label}</span>
            <span style={{ fontWeight: 700, color: r.warn ? '#fb923c' : '#86efac' }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Contextual advice */}
      {mode === 'buy' && totalScore <= -2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: '#fca5a5', lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(248,113,113,0.08)', borderRadius: 8 }}>
          ⚠️ Prices may be elevated due to recent hype. Consider waiting for a dip or splitting your buy over several days.
        </div>
      )}
      {mode === 'buy' && totalScore >= 2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: '#86efac', lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(134,239,172,0.06)', borderRadius: 8 }}>
          💡 This looks like a reasonable entry point. Still consider DCA — split across 2–3 buys.
        </div>
      )}
      {mode === 'sell' && totalScore >= 2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: '#86efac', lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(134,239,172,0.06)', borderRadius: 8 }}>
          💡 Price looks elevated — good time to take profit. Consider selling in parts to avoid missing further upside.
        </div>
      )}
      {mode === 'sell' && totalScore <= -2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: '#fca5a5', lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(248,113,113,0.08)', borderRadius: 8 }}>
          ⚠️ You may be selling at a low. Unless you need the funds urgently, consider waiting for a recovery.
        </div>
      )}
    </div>
  )
}
