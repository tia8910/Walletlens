import { useEffect, useState } from 'react'
import { useTheme } from '../ThemeContext'
import { api } from '../api'
import Icon from './Icon'

const _signalCache = {}

// Build the entry/exit signal from the app's OWN price-history source
// (api.getChartData). That covers crypto (CoinGecko/CoinCap), stocks and
// metals (Stooq) with the same reliable data behind the charts — so the signal
// now works for stocks, gold & silver too, not just a hard-coded coin list.
async function fetchSignalData(coinId) {
  const now = Date.now()
  if (_signalCache[coinId] && now - _signalCache[coinId].t < 5 * 60 * 1000) return _signalCache[coinId].d

  let series = []
  try { series = await api.getChartData(coinId, 30) } catch { series = [] }
  const prices = (Array.isArray(series) ? series : [])
    .map(p => Number(p.price)).filter(v => isFinite(v) && v > 0)
  if (prices.length < 3) { _signalCache[coinId] = { d: null, t: now }; return null }

  const n = prices.length
  const price = prices[n - 1]
  // Points are ~evenly spaced across the 30-day window — sample ~1d and ~7d back.
  const at = frac => prices[Math.max(0, Math.min(n - 1, Math.round((1 - frac) * (n - 1))))]
  const p24 = at(1 / 30), p7 = at(7 / 30), p30 = prices[0]
  const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : 0)
  const d = {
    current_price: price,
    price_change_percentage_24h: pct(price, p24),
    price_change_percentage_7d_in_currency: pct(price, p7),
    price_change_percentage_30d_in_currency: pct(price, p30),
    ath: 0,
  }
  // Refine the live figures with the spot-price feed when it has them.
  try {
    const px = await api.getPrices(coinId)
    const rec = px?.[coinId]
    const ch = rec?.usd_24h_change
    if (ch != null && isFinite(ch)) d.price_change_percentage_24h = ch
    const lp = rec?.usd ?? rec?.price
    if (lp && isFinite(lp)) d.current_price = lp
  } catch {}

  _signalCache[coinId] = { d, t: now }
  return d
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

function verdict(totalScore, mode, isLight) {
  // Light-mode swaps for low-contrast pastels
  const greenSoft = isLight ? '#15803d' : '#86efac'
  const neutral   = isLight ? '#475569' : '#94a3b8'
  const orange    = isLight ? '#c2410c' : '#fb923c'
  const redSoft   = isLight ? '#b91c1c' : '#f87171'
  const greenBold = isLight ? '#15803d' : '#22c55e'
  const redBold   = isLight ? '#b91c1c' : '#ef4444'

  if (mode === 'sell') {
    if (totalScore >= 3)  return { text: 'Great Exit',        color: greenBold, bg: 'rgba(34,197,94,0.1)',    emoji: '🟢' }
    if (totalScore >= 1)  return { text: 'Decent Exit',       color: greenSoft, bg: 'rgba(134,239,172,0.08)', emoji: '🟢' }
    if (totalScore === 0) return { text: 'Neutral',           color: neutral,   bg: 'rgba(148,163,184,0.08)', emoji: '🟡' }
    if (totalScore >= -1) return { text: 'Selling Low',       color: orange,    bg: 'rgba(251,146,60,0.1)',   emoji: '🟡' }
    return                       { text: 'Wait for Recovery', color: redSoft,   bg: 'rgba(248,113,113,0.1)',  emoji: '🔴' }
  }
  if (totalScore >= 3)  return { text: 'Strong Entry',   color: greenBold, bg: 'rgba(34,197,94,0.1)',    emoji: '🟢' }
  if (totalScore >= 1)  return { text: 'Decent Entry',   color: greenSoft, bg: 'rgba(134,239,172,0.08)', emoji: '🟢' }
  if (totalScore === 0) return { text: 'Neutral',        color: neutral,   bg: 'rgba(148,163,184,0.08)', emoji: '🟡' }
  if (totalScore >= -1) return { text: 'Be Cautious',    color: orange,    bg: 'rgba(251,146,60,0.1)',   emoji: '🟡' }
  if (totalScore >= -2) return { text: 'FOMO Risk',      color: redSoft,   bg: 'rgba(248,113,113,0.1)',  emoji: '🔴' }
  return                       { text: 'Don\'t Buy Now', color: redBold,   bg: 'rgba(239,68,68,0.12)',   emoji: '🔴' }
}

export default function BuySignal({ coinId, currentPrice, userAvgCost, mode = 'buy' }) {
  const { mode: themeMode } = useTheme()
  const isLight = themeMode === 'light'
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed]   = useState(false)

  const load = (id) => {
    setData(null); setFailed(false); setLoading(true)
    fetchSignalData(id).then(d => { setData(d); setLoading(false); if (!d) setFailed(true) })
  }

  useEffect(() => {
    if (!coinId || coinId.startsWith('fiat:') || coinId.startsWith('cash:') ||
        coinId.startsWith('bond:') || coinId.startsWith('other:')) return
    load(coinId)
  }, [coinId])

  if (!coinId || coinId.startsWith('fiat:') || coinId.startsWith('cash:') ||
      coinId.startsWith('bond:') || coinId.startsWith('other:')) return null
  if (loading) return (
    <div style={{ padding:'0.6rem 0.8rem', borderRadius:10, background:'var(--surface-1)', fontSize:'0.75rem', color:'var(--text-sub)', marginBottom:'0.75rem' }}>
      ⏳ Analysing entry timing…
    </div>
  )
  if (failed) return (
    <div style={{ padding:'0.6rem 0.8rem', borderRadius:10, background:'var(--surface-1)', fontSize:'0.75rem', color:'var(--text-sub)', marginBottom:'0.75rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <span>⏱️ {mode === 'sell' ? 'Sell' : 'Buy'} signal unavailable</span>
      <button onClick={() => load(coinId)} style={{ fontSize:'0.7rem', background:'var(--surface-2)', border:'none', color:'var(--text-muted)', borderRadius:6, padding:'0.2rem 0.5rem', cursor:'pointer' }}>Retry</button>
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
  const v = verdict(totalScore, mode, isLight)

  const valueGood = isLight ? '#15803d' : '#86efac'
  const valueWarn = isLight ? '#c2410c' : '#fb923c'
  const adviceWarnColor = isLight ? '#b91c1c' : '#fca5a5'
  const adviceGoodColor = isLight ? '#15803d' : '#86efac'
  const labelColor = isLight ? 'rgba(0,0,0,0.7)' : 'var(--text-muted)'

  const rows = [
    { icon: pct24h >= 0 ? 'trend-up' : 'trend-down', label: '24h move',     value: `${pct24h >= 0 ? '+' : ''}${pct24h.toFixed(1)}%`, warn: pct24h > 10 },
    { icon: pct7d  >= 0 ? 'trend-up' : 'trend-down', label: '7d move',      value: `${pct7d  >= 0 ? '+' : ''}${pct7d.toFixed(1)}%`,  warn: pct7d  > 20 },
    vsAvg      ? { icon: 'bar-chart', label: 'vs 30d average', value: vsAvg.label,        warn: vsAvg.score < 0 } : null,
    athSignal  ? { icon: 'award', label: 'vs All-Time High', value: athSignal.label,  warn: athSignal.score < 0 } : null,
    momentum.score < -1 ? { icon: 'warning', label: 'Momentum',  value: momentum.label, warn: true } : null,
    vsUserCost ? { icon: vsUserCost.warn ? 'warning' : 'banknote', label: 'vs your avg cost', value: vsUserCost.label, warn: vsUserCost.warn } : null,
  ].filter(Boolean)

  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${v.color}33`,
      background: v.bg, padding: '0.75rem 0.9rem',
      marginBottom: '0.75rem',
    }}>
      {/* Verdict header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: v.color, display: 'inline-block', flexShrink: 0, boxShadow: `0 0 6px ${v.color}66` }} />
        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: v.color }}>{v.text}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-sub)', marginLeft: 'auto' }}>
          {mode === 'sell' ? 'Good time to sell?' : 'Good time to buy?'}
        </span>
      </div>

      {/* Signal rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
            <span style={{ color: labelColor, display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
              <Icon name={r.icon} size={13} style={{ color: r.warn ? valueWarn : 'var(--text-sub)', flexShrink: 0 }} />
              {r.label}
            </span>
            <span style={{ fontWeight: 700, color: r.warn ? valueWarn : valueGood }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Contextual advice */}
      {mode === 'buy' && totalScore <= -2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: adviceWarnColor, lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(248,113,113,0.08)', borderRadius: 8 }}>
          <Icon name="warning" size={13} style={{ verticalAlign: '-2px', marginRight: '0.35em' }} />Prices may be elevated due to recent hype. Consider waiting for a dip or splitting your buy over several days.
        </div>
      )}
      {mode === 'buy' && totalScore >= 2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: adviceGoodColor, lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(134,239,172,0.06)', borderRadius: 8 }}>
          <Icon name="lightbulb" size={13} style={{ verticalAlign: '-2px', marginRight: '0.35em' }} />This looks like a reasonable entry point. Still consider DCA — split across 2–3 buys.
        </div>
      )}
      {mode === 'sell' && totalScore >= 2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: adviceGoodColor, lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(134,239,172,0.06)', borderRadius: 8 }}>
          <Icon name="lightbulb" size={13} style={{ verticalAlign: '-2px', marginRight: '0.35em' }} />Price looks elevated — good time to take profit. Consider selling in parts to avoid missing further upside.
        </div>
      )}
      {mode === 'sell' && totalScore <= -2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: adviceWarnColor, lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(248,113,113,0.08)', borderRadius: 8 }}>
          <Icon name="warning" size={13} style={{ verticalAlign: '-2px', marginRight: '0.35em' }} />You may be selling at a low. Unless you need the funds urgently, consider waiting for a recovery.
        </div>
      )}
    </div>
  )
}
