import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ASSET_CATEGORIES, assetClass } from '../api'
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import PitchCard from '../components/PitchCard'
import PortfolioAIPanel from '../components/PortfolioAIPanel'
import usePrivateFmt from '../hooks/usePrivateFmt'

// ─── Share card renderer ───
// Draws a 1080×1080 PNG of the user's portfolio card on an off-screen canvas.
// Respects `mask` so a hidden-values share shows "••••" instead of real $.
async function renderShareCardPng({ totalValue, totalPnL, pnlPercent, topHoldings, history, hideValues, size = 1080 }) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // Background gradient
  const g = ctx.createLinearGradient(0, 0, size, size)
  g.addColorStop(0, '#00c853')
  g.addColorStop(0.55, '#1e3d26')
  g.addColorStop(1, '#22d3ee')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // Decorative glow
  const glow = ctx.createRadialGradient(size * 0.8, size * 0.2, 50, size * 0.8, size * 0.2, size * 0.6)
  glow.addColorStop(0, 'rgba(255,255,255,0.22)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)

  // Brand
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 42px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.fillText('WalletLens', 80, 110)
  ctx.font = '400 24px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.fillText('zoom in your wealth', 80, 148)

  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '700 28px system-ui, sans-serif'
  ctx.fillText('TOTAL PORTFOLIO VALUE', 80, 290)

  // Big number
  const fmtUsd = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const bigValue = hideValues ? '$••••••' : `$${fmtUsd(totalValue)}`
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 128px system-ui, sans-serif'
  ctx.fillText(bigValue, 80, 410)

  // P&L
  const pnlColor = totalPnL >= 0 ? '#a7f3d0' : '#fecaca'
  ctx.fillStyle = pnlColor
  ctx.font = '700 42px system-ui, sans-serif'
  const pnlText = hideValues
    ? '•••• (••%)'
    : `${totalPnL >= 0 ? '+' : ''}$${fmtUsd(totalPnL)} (${pnlPercent.toFixed(2)}%)`
  ctx.fillText(pnlText, 80, 475)

  // Trend line mini-chart
  if (Array.isArray(history) && history.length > 1) {
    const chartX = 80, chartY = 540, chartW = size - 160, chartH = 180
    const values = history.map(h => h.value)
    const min = Math.min(...values), max = Math.max(...values)
    const rng = max - min || 1
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.lineWidth = 1
    ctx.strokeRect(chartX, chartY, chartW, chartH)
    // Area fill
    ctx.beginPath()
    ctx.moveTo(chartX, chartY + chartH)
    history.forEach((pt, i) => {
      const x = chartX + (i / (history.length - 1)) * chartW
      const y = chartY + chartH - ((pt.value - min) / rng) * chartH
      if (i === 0) ctx.lineTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.lineTo(chartX + chartW, chartY + chartH)
    ctx.closePath()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fill()
    // Line
    ctx.beginPath()
    history.forEach((pt, i) => {
      const x = chartX + (i / (history.length - 1)) * chartW
      const y = chartY + chartH - ((pt.value - min) / rng) * chartH
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    ctx.stroke()

    ctx.font = '600 20px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.fillText(`${history.length}-day trend`, chartX, chartY - 12)
  }

  // Top holdings
  const holdY = 780
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '700 26px system-ui, sans-serif'
  ctx.fillText('TOP HOLDINGS', 80, holdY)

  ctx.font = '600 28px system-ui, sans-serif'
  topHoldings.slice(0, 4).forEach((h, i) => {
    const y = holdY + 52 + i * 44
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`${i + 1}. ${(h.symbol || '').toUpperCase()}`, 80, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(
      hideValues ? '••••' : `${h.allocation.toFixed(1)}%`,
      size - 80, y
    )
    ctx.textAlign = 'left'
  })

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.68)'
  ctx.font = '500 22px system-ui, sans-serif'
  ctx.fillText('walletlens.cc', 80, size - 50)
  ctx.textAlign = 'right'
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  ctx.fillText(today, size - 80, size - 50)
  ctx.textAlign = 'left'

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

// Privacy helpers moved to ../hooks/usePrivateFmt

// ─── Portfolio value trend from transactions + historical prices ───
// For each day in the last `days`, reconstructs net holdings at end-of-day
// and values them using the historical close from signals.priceSeries
// (falls back to current price for non-crypto assets).
function computePortfolioHistory(transactions, prices, signals, days = 30) {
  if (!Array.isArray(transactions) || transactions.length === 0) return []
  const sortedTxs = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const firstMs = new Date(sortedTxs[0].date).getTime()

  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - (days - 1) * 86400000)

  const out = []
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate.getTime() + i * 86400000)
    const dayKey = d.toISOString().slice(0, 10)
    if (d.getTime() + 86400000 < firstMs) continue

    const bal = {}
    for (const tx of sortedTxs) {
      if (tx.date > dayKey) break
      const id = tx.coin_id
      if (!bal[id]) bal[id] = 0
      const amt = Number(tx.amount) || 0
      if (tx.type === 'buy' || tx.type === 'deposit') bal[id] += amt
      else if (tx.type === 'sell' || tx.type === 'withdraw') bal[id] -= amt
    }

    let value = 0
    for (const [id, amount] of Object.entries(bal)) {
      if (amount <= 1e-9) continue
      const sig = signals && signals[id]
      let price = null
      if (sig && Array.isArray(sig.priceSeries) && sig.priceSeries.length > 0) {
        let candidate = sig.priceSeries[0].price
        for (const p of sig.priceSeries) {
          if (p.date <= dayKey) candidate = p.price
          else break
        }
        price = candidate
      }
      if (price == null) price = prices?.[id]?.usd ?? 0
      value += amount * price
    }
    out.push({ date: dayKey, value, label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })
  }
  return out
}

// Brand-aligned palette for the donut + holding rows. Keeps green as the
// primary, with cool secondary tones; no more purples / pinks that
// clashed with the ink+green theme.
const COLORS = ['#00c853', '#1e3d26', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#22c55e', '#0284c7', '#94a3b8', '#06b6d4']

function fmt(n) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Asset icon with graceful fallback: try the CoinGecko image, then a
// symbol-based CoinCap icon, then a letter/category badge.
function CoinIcon({ image, symbol, color, category }) {
  const [stage, setStage] = useState(0) // 0: primary, 1: coincap, 2: badge
  const sym = (symbol || '').toLowerCase()
  const catIcon = ASSET_CATEGORIES[category]?.icon
  const isCrypto = !category || category === 'crypto'

  if (stage === 0 && image) {
    return (
      <img
        src={image}
        alt=""
        width={40}
        height={40}
        className="coin-logo"
        onError={() => setStage(isCrypto && sym ? 1 : 2)}
        loading="lazy"
      />
    )
  }
  if (stage <= 1 && isCrypto && sym) {
    return (
      <img
        src={`https://assets.coincap.io/assets/icons/${sym}@2x.png`}
        alt=""
        width={40}
        height={40}
        className="coin-logo"
        onError={() => setStage(2)}
        loading="lazy"
      />
    )
  }
  return (
    <div
      className="coin-icon"
      style={{ background: `${color}22`, color: color, borderColor: `${color}55` }}
      aria-hidden="true"
    >
      {catIcon && !isCrypto ? catIcon : (symbol || '?').substring(0, 2).toUpperCase()}
    </div>
  )
}

// ─── Portfolio AI Analysis Engine ───
// `signals` is an optional map of coin_id -> smart-signal payload from
// api.getBulkSmartSignals. When present, switches from "shallow" (24h-only)
// mode to "deep" mode with 30d volatility, drawdown, Sharpe, stress-test,
// attribution, and smarter insights.
function generatePortfolioAnalysis(enriched, totalValue, totalInvested, coinTargets, signals = null) {
  if (enriched.length === 0) return null

  const totalPnL = totalValue - totalInvested
  const pnlPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  const allocations = enriched.map(h => h.allocation / 100)
  const hhi = allocations.reduce((sum, a) => sum + a * a, 0)
  const maxHhi = 1
  const minHhi = 1 / enriched.length
  const diversificationScore = enriched.length === 1 ? 10 :
    Math.round(((maxHhi - hhi) / (maxHhi - minHhi)) * 100)

  const avgVolatility = enriched.reduce((sum, h) => sum + Math.abs(h.change24h), 0) / enriched.length
  const topHeavy = enriched[0]?.allocation > 60

  // ── Deep metrics ──
  const signalsReady = signals && Object.keys(signals).length > 0
  let annualisedVol = null, portfolioMaxDD = null, portfolio30dReturn = null, portfolioSharpe = null
  if (signalsReady) {
    let tw = 0, wVol = 0, wDD = 0, wRet = 0
    for (const h of enriched) {
      const s = signals[h.coin_id]
      if (!s) continue
      const w = h.value / (totalValue || 1)
      tw += w
      wVol += w * s.volatility
      wDD += w * s.maxDrawdown
      wRet += w * s.return30d
    }
    if (tw > 0) {
      annualisedVol = wVol / tw
      portfolioMaxDD = wDD / tw
      portfolio30dReturn = wRet / tw
      const annualisedRet = (1 + portfolio30dReturn) ** (365 / 30) - 1
      portfolioSharpe = annualisedVol > 0 ? annualisedRet / annualisedVol : 0
    }
  }

  let riskLevel, riskColor, riskIcon, riskDetail
  if (annualisedVol != null) {
    if (annualisedVol > 1.2 || topHeavy) { riskLevel = 'High Risk'; riskColor = '#ef4444'; riskIcon = '🔴' }
    else if (annualisedVol > 0.7 || diversificationScore < 40) { riskLevel = 'Medium Risk'; riskColor = '#f59e0b'; riskIcon = '🟡' }
    else { riskLevel = 'Low Risk'; riskColor = '#10b981'; riskIcon = '🟢' }
    riskDetail = `${(annualisedVol * 100).toFixed(0)}% ann. vol`
  } else {
    if (avgVolatility > 8 || topHeavy) { riskLevel = 'High Risk'; riskColor = '#ef4444'; riskIcon = '🔴' }
    else if (avgVolatility > 4 || diversificationScore < 40) { riskLevel = 'Medium Risk'; riskColor = '#f59e0b'; riskIcon = '🟡' }
    else { riskLevel = 'Low Risk'; riskColor = '#10b981'; riskIcon = '🟢' }
    riskDetail = `${avgVolatility.toFixed(1)}% 24h vol`
  }

  const weightedChange24h = enriched.reduce((sum, h) => sum + (h.change24h * h.allocation / 100), 0)
  let momentumLabel, momentumColor
  if (weightedChange24h > 3) { momentumLabel = 'Strong Up'; momentumColor = '#10b981' }
  else if (weightedChange24h > 0.5) { momentumLabel = 'Uptrend'; momentumColor = '#34d399' }
  else if (weightedChange24h > -0.5) { momentumLabel = 'Sideways'; momentumColor = '#f59e0b' }
  else if (weightedChange24h > -3) { momentumLabel = 'Downtrend'; momentumColor = '#f97316' }
  else { momentumLabel = 'Strong Down'; momentumColor = '#ef4444' }

  // Category allocation
  const categoryAlloc = {}
  for (const h of enriched) {
    const cat = h.category || 'crypto'
    categoryAlloc[cat] = (categoryAlloc[cat] || 0) + h.value
  }
  const categoryBreakdown = Object.entries(categoryAlloc)
    .map(([key, value]) => ({
      key,
      label: ASSET_CATEGORIES[key]?.label || key,
      color: ASSET_CATEGORIES[key]?.color || '#00c853',
      value,
      pct: (value / (totalValue || 1)) * 100,
    }))
    .sort((a, b) => b.value - a.value)
  const crossAssetDiversity = categoryBreakdown.length >= 3
    ? 'Multi-asset exposure'
    : categoryBreakdown.length === 2 ? 'Two-class exposure' : 'Single-class exposure'

  // Market-cap size breakdown (crypto holdings only)
  const CAP_META = {
    large:   { label: 'Large Cap',   short: 'L',  color: '#10b981', desc: '≥ $10B' },
    mid:     { label: 'Mid Cap',     short: 'M',  color: '#f59e0b', desc: '$1B – $10B' },
    small:   { label: 'Small Cap',   short: 'S',  color: '#ef4444', desc: '< $1B' },
    unknown: { label: 'Unknown Cap', short: '?',  color: '#94a3b8', desc: 'no data' },
    'n/a':   { label: 'Other',       short: '·',  color: '#4d7a59', desc: 'non-crypto' },
  }
  const capAlloc = {}
  for (const h of enriched) {
    const k = h.capSize || 'n/a'
    capAlloc[k] = (capAlloc[k] || 0) + h.value
  }
  const capBreakdown = Object.entries(capAlloc)
    .map(([key, value]) => ({
      key,
      label: CAP_META[key]?.label || key,
      color: CAP_META[key]?.color || '#94a3b8',
      desc: CAP_META[key]?.desc || '',
      value,
      pct: (value / (totalValue || 1)) * 100,
    }))
    .sort((a, b) => {
      const order = { large: 0, mid: 1, small: 2, unknown: 3, 'n/a': 4 }
      return (order[a.key] ?? 9) - (order[b.key] ?? 9)
    })

  // Stress-test — simple beta-based model
  const scenarios = [-20, -10, 10, 20].map(btcDeltaPct => {
    let delta = 0
    for (const h of enriched) {
      let beta = 1.0
      const sym = (h.coin_symbol || '').toUpperCase()
      const cat = h.category || 'crypto'
      if (sym === 'BTC' || sym === 'WBTC') beta = 1.0
      else if (cat === 'crypto') beta = sym === 'ETH' ? 1.15 : 1.3
      else if (cat === 'fiat' || ['USDT','USDC','DAI','BUSD'].includes(sym)) beta = 0
      else if (cat === 'gold' || cat === 'silver') beta = -0.1
      else if (cat === 'stock') beta = 0.4
      else if (cat === 'bond') beta = -0.05
      delta += h.value * beta * (btcDeltaPct / 100)
    }
    return { btcDelta: btcDeltaPct, portfolioDelta: delta, newValue: totalValue + delta }
  })

  // P&L attribution
  const attribution = [...enriched]
    .filter(h => Math.abs(h.pnl) > 0.01)
    .sort((a, b) => b.pnl - a.pnl)
  const topWinners = attribution.slice(0, 3)
  const topLosers = attribution.slice(-3).reverse().filter(h => h.pnl < 0)

  let highVolExposurePct = 0
  if (signalsReady) {
    for (const h of enriched) {
      const s = signals[h.coin_id]
      if (s && s.volatility > 1.0) highVolExposurePct += h.allocation
    }
  }

  // Health score
  let healthScore = 50
  if (pnlPct > 20) healthScore += 15; else if (pnlPct > 5) healthScore += 8; else if (pnlPct < -20) healthScore -= 15; else if (pnlPct < -5) healthScore -= 8
  healthScore += Math.round(diversificationScore * 0.2)
  if (weightedChange24h > 2) healthScore += 8; else if (weightedChange24h < -2) healthScore -= 8
  const profitableCoins = enriched.filter(h => h.pnl > 0).length
  healthScore += Math.round((profitableCoins / enriched.length) * 15)
  if (portfolioSharpe != null) {
    if (portfolioSharpe > 1.5) healthScore += 8
    else if (portfolioSharpe > 0.5) healthScore += 4
    else if (portfolioSharpe < -0.5) healthScore -= 6
  }
  if (portfolioMaxDD != null && portfolioMaxDD > 0.35) healthScore -= 6
  if (highVolExposurePct > 60) healthScore -= 5
  if (categoryBreakdown.length >= 3) healthScore += 4
  healthScore = Math.max(0, Math.min(100, healthScore))

  let healthLabel, healthColor
  if (healthScore >= 75) { healthLabel = 'Excellent'; healthColor = '#10b981' }
  else if (healthScore >= 55) { healthLabel = 'Good'; healthColor = '#34d399' }
  else if (healthScore >= 40) { healthLabel = 'Fair'; healthColor = '#f59e0b' }
  else { healthLabel = 'Needs Attention'; healthColor = '#ef4444' }

  // Smart insights (priority ranked)
  const insights = []
  if (enriched.length === 1) {
    insights.push({ icon: '⚠️', text: 'Single-asset portfolio — a 30% drawdown in one coin wipes 30% of your net worth. Add at least 2 uncorrelated assets.', type: 'warning', priority: 10 })
  } else if (topHeavy) {
    insights.push({ icon: '📊', text: `${enriched[0].coin_symbol.toUpperCase()} is ${enriched[0].allocation.toFixed(0)}% of your portfolio. Trimming to <40% would materially lower your max-drawdown risk.`, type: 'warning', priority: 9 })
  } else if (diversificationScore > 70 && categoryBreakdown.length >= 2) {
    insights.push({ icon: '✅', text: `Well diversified (${crossAssetDiversity.toLowerCase()}, HHI-based score ${diversificationScore}/100).`, type: 'positive', priority: 2 })
  }

  const heftyLosses = enriched.filter(h => h.pnl < -100 && h.pnlPct < -15)
  if (heftyLosses.length > 0 && topWinners.filter(w => w.pnl > 100).length > 0) {
    const names = heftyLosses.map(h => h.coin_symbol.toUpperCase()).join(', ')
    insights.push({ icon: '🧾', text: `Tax-loss harvesting candidate: ${names} sitting at a loss. Realising could offset gains elsewhere.`, type: 'info', priority: 6 })
  }

  if (highVolExposurePct > 50) {
    insights.push({ icon: '🎢', text: `${highVolExposurePct.toFixed(0)}% of your portfolio is in assets with >100% annualised volatility. Rotate some into lower-vol coins or stables to dampen swings.`, type: 'warning', priority: 8 })
  }

  if (portfolioSharpe != null) {
    if (portfolioSharpe > 1.5) {
      insights.push({ icon: '📐', text: `Risk-adjusted returns are excellent (Sharpe ${portfolioSharpe.toFixed(2)}). You're being paid well for the risk you're taking.`, type: 'positive', priority: 5 })
    } else if (portfolioSharpe < 0 && portfolio30dReturn < -0.05) {
      insights.push({ icon: '⚠️', text: `Negative risk-adjusted return (Sharpe ${portfolioSharpe.toFixed(2)}). Large drawdowns without the upside — review position sizing.`, type: 'warning', priority: 7 })
    }
  }

  if (portfolioMaxDD != null && portfolioMaxDD > 0.30) {
    insights.push({ icon: '📉', text: `Recent max drawdown ${(portfolioMaxDD * 100).toFixed(0)}% — stress-test your conviction at these levels before adding.`, type: 'warning', priority: 7 })
  }

  if (signalsReady) {
    for (const h of enriched) {
      const s = signals[h.coin_id]
      if (!s) continue
      if (s.whaleScore >= 50 && h.pnlPct > 20) {
        insights.push({ icon: '🐋', text: `${h.coin_symbol.toUpperCase()}: whale-score +${s.whaleScore} AND up ${h.pnlPct.toFixed(0)}% — consider scaling out partial profits while flow is still positive.`, type: 'positive', priority: 6 })
        break
      }
      if (s.whaleScore <= -50) {
        insights.push({ icon: '🚨', text: `${h.coin_symbol.toUpperCase()}: whale-score ${s.whaleScore} signals heavy distribution. If stop-losses aren't set, consider them.`, type: 'warning', priority: 8 })
        break
      }
    }
  }

  if (pnlPct > 30) {
    insights.push({ icon: '🎉', text: `Portfolio up ${pnlPct.toFixed(1)}%. A partial-profit ladder protects gains without exiting entirely.`, type: 'positive', priority: 4 })
  } else if (pnlPct < -20) {
    insights.push({ icon: '💡', text: `Portfolio down ${Math.abs(pnlPct).toFixed(1)}%. Dollar-cost averaging into conviction picks works better than rescue-doubling on losers.`, type: 'info', priority: 4 })
  }

  const bigWinners = enriched.filter(h => h.change24h > 5)
  const bigLosers = enriched.filter(h => h.change24h < -5)
  if (bigWinners.length > 0) {
    const names = bigWinners.map(h => h.coin_symbol.toUpperCase()).join(', ')
    insights.push({ icon: '🚀', text: `${names} surging today.`, type: 'positive', priority: 3 })
  }
  if (bigLosers.length > 0) {
    const names = bigLosers.map(h => h.coin_symbol.toUpperCase()).join(', ')
    insights.push({ icon: '📉', text: `${names} dropping today — watch support.`, type: 'warning', priority: 5 })
  }

  const targetsSet = enriched.filter(h => h.targetPrice)
  const nearTarget = targetsSet.filter(h => h.targetPricePct >= 80 && h.targetPricePct < 100)
  const hitTarget = targetsSet.filter(h => h.targetPricePct >= 100)
  if (hitTarget.length > 0) {
    insights.push({ icon: '🎯', text: `${hitTarget.map(h => h.coin_symbol.toUpperCase()).join(', ')} hit price target — execute the plan.`, type: 'positive', priority: 9 })
  } else if (nearTarget.length > 0) {
    insights.push({ icon: '🔔', text: `${nearTarget.map(h => h.coin_symbol.toUpperCase()).join(', ')} within 80%+ of target — pre-stage the sell order.`, type: 'info', priority: 6 })
  }

  const hasCrypto = categoryBreakdown.some(c => c.key === 'crypto')
  const hasHedge = categoryBreakdown.some(c => ['gold', 'silver', 'fiat', 'bond'].includes(c.key))
  if (hasCrypto && !hasHedge && totalValue > 1000) {
    insights.push({ icon: '🛡️', text: 'No hedge assets detected. A 5-10% allocation to gold, stables, or bonds materially reduces portfolio vol during crypto drawdowns.', type: 'info', priority: 5 })
  }

  const rankedInsights = insights.sort((a, b) => b.priority - a.priority).slice(0, 6)

  return {
    diversificationScore, riskLevel, riskColor, riskIcon, riskDetail,
    momentumLabel, momentumColor, weightedChange24h,
    healthScore, healthLabel, healthColor,
    insights: rankedInsights,
    profitableCoins, totalCoins: enriched.length,
    avgVolatility,
    annualisedVol, portfolioMaxDD, portfolio30dReturn, portfolioSharpe,
    highVolExposurePct,
    categoryBreakdown, crossAssetDiversity,
    capBreakdown,
    scenarios,
    topWinners, topLosers,
    signalsReady,
  }
}

// ─── Price Alarm System ───
function getAlarmState() {
  try {
    return JSON.parse(localStorage.getItem('crypto_tracker_alarm_state') || '{}')
  } catch { return {} }
}

function setAlarmDismissed(coinId) {
  const state = getAlarmState()
  state[coinId] = { dismissed: true, time: Date.now() }
  localStorage.setItem('crypto_tracker_alarm_state', JSON.stringify(state))
}

function clearAlarmDismissed(coinId) {
  const state = getAlarmState()
  delete state[coinId]
  localStorage.setItem('crypto_tracker_alarm_state', JSON.stringify(state))
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

function sendBrowserNotification(title, body, icon) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon, badge: icon })
  }
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
  const [targetQtyInput, setTargetQtyInput] = useState('')
  const [expandedPlans, setExpandedPlans] = useState({})
  const [alarms, setAlarms] = useState([])
  const [showDataPanel, setShowDataPanel] = useState(false)
  const [importStatus, setImportStatus] = useState(null)
  const [exportCode, setExportCode] = useState('')
  const [importCode, setImportCode] = useState('')
  const [importPreview, setImportPreview] = useState(null)
  const [hasImportSnapshot, setHasImportSnapshotState] = useState(() => api.hasImportSnapshot?.() || false)
  const [copyStatus, setCopyStatus] = useState('')
  const [editingPrice, setEditingPrice] = useState(null)
  const [priceInput, setPriceInput] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [signals, setSignals] = useState({})
  const [transactions, setTransactions] = useState([])
  const [trendDays, setTrendDays] = useState(30)
  const { hideValues, toggle: toggleHideValues, priv, mask } = usePrivateFmt()
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareImageUrl, setShareImageUrl] = useState(null)
  const [shareStatus, setShareStatus] = useState('')

  // Regenerate the share image when the modal opens or when deps change.
  // Note: placed near top but references `enriched` + `portfolioHistory`
  // which are computed later; the actual work only happens when the modal
  // is open, and the deps list only reads `.length` which is safe once
  // the component has rendered once. Guarded in case those aren't ready.
  async function handleShare() {
    if (!shareImageUrl) return
    try {
      const res = await fetch(shareImageUrl)
      const blob = await res.blob()
      const file = new File([blob], 'walletlens-portfolio.png', { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My WalletLens portfolio',
          text: 'Track your whole net worth in one place.',
        })
        setShareStatus('Shared!')
      } else {
        // Fallback: copy image to clipboard if supported
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          setShareStatus('Image copied to clipboard')
        } else {
          setShareStatus('Sharing not supported — use Download')
        }
      }
    } catch (err) {
      console.error(err)
      setShareStatus('Share cancelled')
    }
  }

  function handleDownload() {
    if (!shareImageUrl) return
    const a = document.createElement('a')
    a.href = shareImageUrl
    a.download = 'walletlens-portfolio.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setShareStatus('Downloaded')
  }

  function closeShareModal() {
    setShowShareModal(false)
    if (shareImageUrl) {
      URL.revokeObjectURL(shareImageUrl)
      setShareImageUrl(null)
    }
    setShareStatus('')
  }

  useEffect(() => {
    requestNotificationPermission()
    loadData()
    const interval = setInterval(refreshPrices, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Check for price target alarms
  const checkAlarms = useCallback((portfolioData, priceData, targets) => {
    const alarmState = getAlarmState()
    const newAlarms = []

    for (const h of portfolioData) {
      const plan = targets[h.coin_id]
      const price = priceData[h.coin_id]?.usd
      if (!plan?.targets?.length || !price) continue

      // Find the most relevant target: lowest-price unhit target, or highest-price hit target
      const unhit = plan.targets.filter(t => price < t.price).sort((a, b) => a.price - b.price)
      const hit = plan.targets.filter(t => price >= t.price).sort((a, b) => b.price - a.price)
      const t = hit[0] || unhit[0]
      if (!t) continue
      const targetPrice = t.price
      const pct = (price / targetPrice) * 100

      if (alarmState[h.coin_id]?.dismissed && pct >= 95) continue
      if (alarmState[h.coin_id]?.dismissed && pct < 95) clearAlarmDismissed(h.coin_id)

      if (pct >= 100) {
        newAlarms.push({
          coinId: h.coin_id, symbol: h.coin_symbol.toUpperCase(), image: h.coin_image,
          price, targetPrice, pct, type: 'hit',
        })
      } else if (pct >= 90) {
        newAlarms.push({
          coinId: h.coin_id, symbol: h.coin_symbol.toUpperCase(), image: h.coin_image,
          price, targetPrice, pct, type: 'near',
        })
      }
    }

    // Send browser notifications for new "hit" alarms
    for (const alarm of newAlarms) {
      if (alarm.type === 'hit' && !alarmState[alarm.coinId]?.notified) {
        sendBrowserNotification(
          `🎯 ${alarm.symbol} Target Hit!`,
          `${alarm.symbol} reached $${fmt(alarm.price)} (target: $${fmt(alarm.targetPrice)})`,
          coinImages[alarm.coinId] || ''
        )
        const state = getAlarmState()
        state[alarm.coinId] = { ...state[alarm.coinId], notified: true, time: Date.now() }
        localStorage.setItem('crypto_tracker_alarm_state', JSON.stringify(state))
      }
    }

    setAlarms(newAlarms)
  }, [coinImages])

  async function handleExport() {
    const code = await api.exportCode()
    if (code) {
      setExportCode(code)
      setImportCode('')
      setImportPreview(null)
    }
  }

  async function copyToClipboard(text) {
    if (!text) return false
    // Modern Clipboard API
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch (e) { /* fall through */ }
    // Legacy fallback for older browsers / non-secure contexts
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      ta.setAttribute('readonly', '')
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch (e) {
      return false
    }
  }

  async function handleCopyExport() {
    const ok = await copyToClipboard(exportCode)
    setCopyStatus(ok ? 'copied' : 'failed')
    setTimeout(() => setCopyStatus(''), 2000)
  }

  async function handlePreviewImport() {
    if (!importCode.trim()) {
      setImportStatus('error')
      setTimeout(() => setImportStatus(null), 2500)
      return
    }
    const result = await api.previewImportCode(importCode.trim())
    if (result.success) {
      // Stash the diff alongside the summary so the preview UI can render it
      setImportPreview({ ...result.summary, diff: result.diff })
      setImportStatus(null)
    } else {
      setImportPreview(null)
      setImportStatus('error')
      setTimeout(() => setImportStatus(null), 3000)
    }
  }

  async function handleConfirmImport() {
    const result = await api.importCode(importCode.trim())
    if (result.success) {
      setImportStatus('success')
      setTimeout(() => window.location.reload(), 400)
    } else {
      setImportPreview(null)
      setImportStatus('error')
      setTimeout(() => setImportStatus(null), 3000)
    }
  }

  function handleCancelImport() {
    setImportPreview(null)
  }

  async function handleUpdateManualPrice(coinId) {
    const val = parseFloat(priceInput)
    if (!val || val <= 0) return
    api.setManualPrice(coinId, val)
    setEditingPrice(null)
    setPriceInput('')
    loadData()
  }

  async function loadData() {
    setLoading(true)
    try {
      await api.ensureWallet()
      const [w, p, ct, txs] = await Promise.all([api.getWallets(), api.getPortfolio(), api.getCoinTargets(), api.getTransactions()])
      setWallets(w)
      setPortfolio(p)
      setCoinTargets(ct)
      setTransactions(txs)
      if (p.length > 0) {
        const ids = p.map(h => h.coin_id).join(',')
        const [pr, imgs] = await Promise.all([api.getPrices(ids), api.getCoinImages(ids)])
        setPrices(pr)
        setCoinImages(imgs)
        checkAlarms(p, pr, ct)
        // Kick off deep 30d signal fetch in background (1h localStorage cache)
        const cryptoIds = p
          .map(h => h.coin_id)
          .filter(id => id && assetClass(id) === 'crypto')
        if (cryptoIds.length > 0) {
          api.getBulkSmartSignals(cryptoIds, 30).then(setSignals).catch(err => console.warn('signals', err))
        }
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  async function refreshPrices() {
    if (portfolio.length === 0) return
    const ids = portfolio.map(h => h.coin_id).join(',')
    const pr = await api.getPrices(ids)
    setPrices(pr)
    checkAlarms(portfolio, pr, coinTargets)
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

  async function handleAddCoinTarget(coinId, availableQty) {
    const price = parseFloat(targetInput)
    if (!price || price <= 0) return
    let quantity = null
    if (targetQtyInput && targetQtyInput.trim() !== '') {
      const q = parseFloat(targetQtyInput)
      if (!q || q <= 0) return
      quantity = q
    }
    await api.addCoinTarget(coinId, { price, quantity })
    clearAlarmDismissed(coinId)
    setEditingTarget(null)
    setTargetInput('')
    setTargetQtyInput('')
    setExpandedPlans(prev => ({ ...prev, [coinId]: true }))
    loadData()
  }

  async function handleRemoveTargetItem(coinId, targetId) {
    await api.removeCoinTargetItem(coinId, targetId)
    clearAlarmDismissed(coinId)
    loadData()
  }

  async function handleRemoveCoinTarget(coinId) {
    await api.removeCoinTarget(coinId)
    clearAlarmDismissed(coinId)
    loadData()
  }

  function dismissAlarm(coinId) {
    setAlarmDismissed(coinId)
    setAlarms(prev => prev.filter(a => a.coinId !== coinId))
  }

  const totalValue = portfolio.reduce((sum, h) => sum + h.amount * (prices[h.coin_id]?.usd || 0), 0)
  const totalInvested = portfolio.reduce((sum, h) => sum + h.total_invested, 0)
  const totalPnL = totalValue - totalInvested
  const pnlPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  const enriched = portfolio.map(h => {
    const price = prices[h.coin_id]?.usd || 0
    const change24h = prices[h.coin_id]?.usd_24h_change || 0
    const amount = h.amount || 0
    const invested = h.total_invested || 0
    const value = amount * price
    const pnl = value - invested
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0
    const allocation = totalValue > 0 ? (value / totalValue) * 100 : 0
    const avgBuy = amount > 0 ? invested / amount : 0
    const image = coinImages[h.coin_id] || h.coin_image || ''
    const symbol = h.coin_symbol || h.coin_id || '??'

    // Multi-target sell plan
    const plan = coinTargets[h.coin_id]
    const rawTargets = plan?.targets || []
    // Sort by price ascending, then enrich each target
    const sortedTargets = [...rawTargets].sort((a, b) => a.price - b.price)
    const totalAllocatedExplicit = sortedTargets.reduce((s, t) => s + (t.quantity ?? 0), 0)
    const hasSellAllTarget = sortedTargets.some(t => t.quantity === null || t.quantity === undefined)
    const remainingQty = hasSellAllTarget ? 0 : Math.max(0, amount - totalAllocatedExplicit)
    const overAllocated = !hasSellAllTarget && totalAllocatedExplicit > amount

    const enrichedTargets = sortedTargets.map(t => {
      const qty = t.quantity ?? amount
      const proceeds = qty * t.price
      const progressPct = price > 0 ? Math.min((price / t.price) * 100, 100) : 0
      const hit = price >= t.price
      return { ...t, qty, proceeds, progressPct, hit, sellAll: t.quantity === null || t.quantity === undefined }
    })

    const planTotalProceeds = enrichedTargets.reduce((s, t) => s + t.proceeds, 0) + (remainingQty * price)
    const planInvestedCovered = amount > 0 ? (invested * enrichedTargets.reduce((s, t) => s + t.qty, 0)) / amount : 0

    // For analysis / alarms: use next unhit target (or highest hit)
    const nextUnhit = enrichedTargets.find(t => !t.hit)
    const lastHit = [...enrichedTargets].reverse().find(t => t.hit)
    const primary = lastHit || nextUnhit || null
    const targetPrice = primary ? primary.price : null
    const targetValue = primary ? amount * primary.price : null
    const targetPricePct = primary && price > 0 ? Math.min((price / primary.price) * 100, 100) : null

    // Market cap classification (crypto only; non-crypto = 'n/a')
    const rawCat = h.category || 'crypto'
    const isCrypto = rawCat === 'crypto'
    const mcUsd = isCrypto ? (prices[h.coin_id]?.usd_market_cap || 0) : 0
    let capSize = 'n/a'
    if (isCrypto) {
      if (mcUsd >= 10_000_000_000) capSize = 'large'
      else if (mcUsd >= 1_000_000_000) capSize = 'mid'
      else if (mcUsd > 0) capSize = 'small'
      else capSize = 'unknown'
    }

    return {
      ...h, coin_symbol: symbol, amount, total_invested: invested,
      price, change24h, value, pnl, pnlPct, allocation, avgBuy, image,
      plan: enrichedTargets, planRemainingQty: remainingQty, planOverAllocated: overAllocated,
      planTotalProceeds, planInvestedCovered,
      targetPrice, targetValue, targetPricePct,
      marketCap: mcUsd,
      capSize,
    }
  }).sort((a, b) => b.value - a.value)

  const totalProjectedValue = enriched_raw => enriched_raw.reduce((sum, h) => {
    if (h.plan && h.plan.length > 0) return sum + h.planTotalProceeds
    return sum + h.value
  }, 0)

  const projectedTotal = totalProjectedValue(enriched)
  const hasAnyTarget = Object.keys(coinTargets).length > 0

  // Group holdings by category for the dashboard split
  const enrichedByCategory = {}
  for (const h of enriched) {
    const cat = h.category || 'crypto'
    if (!enrichedByCategory[cat]) {
      enrichedByCategory[cat] = { items: [], total: 0, invested: 0 }
    }
    enrichedByCategory[cat].items.push(h)
    enrichedByCategory[cat].total += h.value
    enrichedByCategory[cat].invested += h.total_invested
  }
  const categoryList = Object.entries(enrichedByCategory).map(([key, v]) => {
    const meta = ASSET_CATEGORIES[key] || { key, label: key, icon: '◈', color: '#4d7a59' }
    return {
      key, label: meta.label, icon: meta.icon, color: meta.color,
      items: v.items, total: v.total, invested: v.invested,
      pct: totalValue > 0 ? (v.total / totalValue) * 100 : 0,
      pnl: v.total - v.invested,
      pnlPct: v.invested > 0 ? ((v.total - v.invested) / v.invested) * 100 : 0,
    }
  }).sort((a, b) => b.total - a.total)

  const filteredCategories = categoryFilter === 'all'
    ? categoryList
    : categoryList.filter(c => c.key === categoryFilter)

  // Pie chart: per-asset contribution (one slice per holding)
  const chartData = enriched
    .filter(h => h.value > 0)
    .map((h, i) => ({
      name: h.coin_symbol.toUpperCase(),
      value: h.value,
      color: COLORS[i % COLORS.length],
      category: h.category || 'crypto',
    }))

  // Portfolio value trend (transactions × historical prices from signals)
  const portfolioHistory = computePortfolioHistory(transactions, prices, signals, trendDays)
  const trendStart = portfolioHistory.length > 0 ? portfolioHistory[0].value : 0
  const trendEnd = portfolioHistory.length > 0 ? portfolioHistory[portfolioHistory.length - 1].value : 0
  const trendChange = trendEnd - trendStart
  const trendChangePct = trendStart > 0 ? (trendChange / trendStart) * 100 : 0
  const trendColor = trendChange >= 0 ? '#10b981' : '#ef4444'

  // Portfolio AI Analysis
  let analysis = null
  try { analysis = generatePortfolioAnalysis(enriched, totalValue, totalInvested, coinTargets, signals) } catch (e) { console.error('Analysis error:', e) }

  // Regenerate the share image when the modal opens or key data changes.
  // Placed here so enriched + portfolioHistory are in scope.
  useEffect(() => {
    if (!showShareModal) return
    let cancelled = false
    setShareStatus('')
    setShareImageUrl(null)
    const top = [...enriched]
      .sort((a, b) => b.value - a.value)
      .map(h => ({ symbol: h.coin_symbol, allocation: h.allocation }))
    renderShareCardPng({
      totalValue,
      totalPnL,
      pnlPercent,
      topHoldings: top,
      history: portfolioHistory,
      hideValues,
    }).then(blob => {
      if (cancelled || !blob) return
      const url = URL.createObjectURL(blob)
      setShareImageUrl(url)
    }).catch(err => {
      console.error('share render', err)
      if (!cancelled) setShareStatus('Could not generate card')
    })
    return () => { cancelled = true }
  }, [showShareModal, totalValue, totalPnL, pnlPercent, hideValues, enriched.length, portfolioHistory.length])

  return (
    <div className="page">
      {/* Mobile-only pitch card (sidebar is hidden on mobile) */}
      <PitchCard className="sidebar-pitch-mobile" />

      {/* ─── Price Target Alarms ─── */}
      {alarms.length > 0 && (
        <div className="alarm-container">
          {alarms.map(alarm => (
            <div key={alarm.coinId} className={`alarm-toast ${alarm.type}`}>
              <div className="alarm-icon-wrap">
                {alarm.type === 'hit' ? (
                  <div className="alarm-ring">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                  </div>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                )}
              </div>
              <div className="alarm-content">
                <div className="alarm-title">
                  {alarm.type === 'hit'
                    ? `🎯 ${alarm.symbol} Target Hit!`
                    : `⚡ ${alarm.symbol} Approaching Target`
                  }
                </div>
                <div className="alarm-detail">
                  Price: ${fmt(alarm.price)} / Target: ${fmt(alarm.targetPrice)} ({alarm.pct.toFixed(1)}%)
                </div>
              </div>
              <button className="alarm-dismiss" onClick={() => dismissAlarm(alarm.coinId)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hero + Portfolio Analysis row (AI pinned to left-side blank space on desktop) */}
      <div className="dashboard-grid">
      {/* Hero card */}
      <div className="hero-card">
        <div className="hero-label-row">
          <div className="hero-label">Total Portfolio Value</div>
          <div className="hero-actions">
            <button
              className="hero-eye"
              onClick={toggleHideValues}
              title={hideValues ? 'Show values' : 'Hide values'}
              aria-label={hideValues ? 'Show portfolio values' : 'Hide portfolio values'}
              aria-pressed={hideValues}
            >
              <span aria-hidden="true">{hideValues ? '🙈' : '👁️'}</span>
            </button>
            <button
              className="hero-eye"
              onClick={() => setShowShareModal(true)}
              title="Share wallet card"
              aria-label="Share wallet card"
            >
              📤
            </button>
          </div>
        </div>
        <div className="hero-value">{hideValues ? '$••••••' : `$${fmt(totalValue)}`}</div>
        <div className="hero-row">
          <div className={`hero-pnl ${totalPnL >= 0 ? 'positive' : 'negative'}`}>
            {hideValues ? mask : `${totalPnL >= 0 ? '+' : ''}${fmt(totalPnL)} (${pnlPercent.toFixed(2)}%)`}
          </div>
          <div className="hero-invested">Invested: {priv(`$${fmt(totalInvested)}`)}</div>
        </div>

        {/* Portfolio value trend */}
        {portfolioHistory.length > 1 && (
          <div className="portfolio-trend">
            <div className="portfolio-trend-head">
              <span className="portfolio-trend-label">{trendDays}-day trend</span>
              <div className="portfolio-trend-tabs">
                {[7, 30, 90].map(d => (
                  <button
                    key={d}
                    className={`portfolio-trend-tab ${trendDays === d ? 'active' : ''}`}
                    onClick={() => setTrendDays(d)}
                  >
                    {d}D
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={portfolioHistory} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="ptGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trendColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e0e0ea', borderRadius: 10, fontSize: '0.78rem' }}
                  formatter={(val) => [hideValues ? mask : '$' + fmt(val), 'Value']}
                  labelFormatter={(l) => l}
                />
                <Area type="monotone" dataKey="value" stroke={trendColor} strokeWidth={2} fill="url(#ptGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="portfolio-trend-foot">
              <span className={trendChange >= 0 ? 'positive' : 'negative'}>
                {trendChange >= 0 ? '▲' : '▼'} {hideValues ? mask : `$${fmt(Math.abs(trendChange))}`}
                {' '}({trendChangePct >= 0 ? '+' : ''}{trendChangePct.toFixed(2)}%) over {trendDays}d
              </span>
            </div>
          </div>
        )}

        {hasAnyTarget && (
          <div className="target-section">
            <div className="target-header">
              <span className="target-label">If targets hit</span>
              <span className="target-pct">{priv(`$${fmt(projectedTotal)}`)}</span>
            </div>
            <div className="target-bar">
              <div className="target-fill" style={{ width: `${Math.min((totalValue / projectedTotal) * 100, 100)}%` }} />
            </div>
            <div className="target-footer">
              <span className="muted">Projected gain: {priv(`+$${fmt(projectedTotal - totalInvested)}`)}</span>
            </div>
          </div>
        )}

        {chartData.length > 0 && (
          <div className="hero-chart">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} strokeWidth={0}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.color || COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              {chartData.map((d, i) => (
                <div key={d.name} className="legend-item">
                  <span className="legend-dot" style={{ background: d.color || COLORS[i % COLORS.length] }} />
                  <span>{d.name}</span>
                  <span className="muted">{totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Portfolio AI Analysis ─── */}
      <PortfolioAIPanel analysis={analysis} />
      </div>
      {/* /dashboard-grid */}

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
        <button className="action-btn data-btn" onClick={() => setShowDataPanel(!showDataPanel)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Data
        </button>
      </div>

      {/* Share wallet card modal */}
      {showShareModal && (
        <div className="share-modal-overlay" onClick={closeShareModal}>
          <div className="share-modal" onClick={e => e.stopPropagation()}>
            <div className="share-modal-head">
              <h3>Share your wallet card</h3>
              <button className="share-close" onClick={closeShareModal} aria-label="Close">×</button>
            </div>
            <div className="share-modal-body">
              {shareImageUrl ? (
                <img src={shareImageUrl} alt="Wallet share card" className="share-preview" />
              ) : (
                <div className="share-loading">Generating card…</div>
              )}
              {shareStatus && <div className="share-status">{shareStatus}</div>}
            </div>
            <div className="share-modal-actions">
              <button className="action-btn buy-btn" onClick={handleShare} disabled={!shareImageUrl}>
                📤 Share
              </button>
              <button className="action-btn data-btn" onClick={handleDownload} disabled={!shareImageUrl}>
                ⬇️ Download
              </button>
              <button className="action-btn" onClick={closeShareModal}>
                Close
              </button>
            </div>
            <p className="share-note muted">
              {hideValues
                ? 'Privacy mode is on — dollar amounts are hidden in the card.'
                : 'Tip: turn on the 👁️ toggle before sharing to hide dollar amounts.'}
            </p>
          </div>
        </div>
      )}

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

      {/* Data Import/Export */}
      {showDataPanel && (
        <div className="card data-card">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '0.4rem' }}>
              <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            Backup & Restore
          </h3>
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            Copy your backup code to transfer data, or paste a code to restore.
          </p>
          <div className="data-actions">
            <button className="data-export-btn" onClick={handleExport}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Get Backup Code
            </button>
            <button className="data-import-btn" onClick={handlePreviewImport}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Restore from Code
            </button>
          </div>
          {exportCode && (
            <div className="code-block">
              <label className="code-label">Your Backup Code</label>
              <textarea
                className="code-textarea"
                readOnly
                value={exportCode}
                onFocus={e => e.target.select()}
              />
              <div className="code-actions">
                <button type="button" className="copy-btn" onClick={handleCopyExport}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Copy failed' : 'Copy Code'}
                </button>
                <button type="button" className="btn-ghost-dark" onClick={() => setExportCode('')}>Close</button>
              </div>
            </div>
          )}
          <div className="code-block">
            <label className="code-label">Paste Code to Restore</label>
            <textarea className="code-textarea" value={importCode} onChange={e => { setImportCode(e.target.value); setImportPreview(null); }} placeholder="Paste your backup code here..." />
            {!importPreview && (
              <button type="button" className="preview-btn" onClick={handlePreviewImport} disabled={!importCode.trim()}>
                Preview Import
              </button>
            )}
            {hasImportSnapshot && (
              <button
                type="button"
                className="btn-ghost-dark"
                style={{ marginTop: '0.5rem' }}
                onClick={async () => {
                  if (!confirm('Restore the state from before your last import? This replaces your current data.')) return
                  const r = await api.restoreLastImport()
                  if (r.success) { window.location.reload() }
                  else { alert(r.error || 'Could not restore') }
                }}
              >
                ↶ Undo last import
              </button>
            )}
          </div>
          {importPreview && (
            <div className="import-preview">
              <div className="import-preview-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Restoring will replace your current data
              </div>
              <div className="import-preview-stats">
                <div><strong>{importPreview.wallets}</strong><span>wallets</span></div>
                <div><strong>{importPreview.transactions}</strong><span>transactions</span></div>
                <div><strong>{importPreview.exchanges}</strong><span>exchanges</span></div>
                <div><strong>{importPreview.targets}</strong><span>targets</span></div>
                <div><strong>{importPreview.manualPrices}</strong><span>manual prices</span></div>
              </div>
              {Object.keys(importPreview.byCategory || {}).length > 0 && (
                <div className="import-preview-cats">
                  {Object.entries(importPreview.byCategory).map(([cat, count]) => (
                    <span key={cat} className="import-preview-chip" style={{ background: `${ASSET_CATEGORIES[cat]?.color || '#00c853'}22`, color: ASSET_CATEGORIES[cat]?.color || '#00c853' }}>
                      {ASSET_CATEGORIES[cat]?.icon} {ASSET_CATEGORIES[cat]?.label || cat}: {count}
                    </span>
                  ))}
                </div>
              )}
              {importPreview.diff && (
                <div className="import-diff">
                  <div className="import-diff-head">
                    <strong>Compared to your current portfolio</strong>
                    <span className="muted">
                      {importPreview.diff.txDelta >= 0 ? '+' : ''}{importPreview.diff.txDelta} transactions
                    </span>
                  </div>
                  {!importPreview.diff.hasChanges ? (
                    <p className="muted" style={{ fontSize: '0.8rem' }}>No holdings would change.</p>
                  ) : (
                    <div className="import-diff-grid">
                      {importPreview.diff.added.length > 0 && (
                        <div>
                          <div className="positive" style={{ fontSize: '0.78rem', fontWeight: 700 }}>+ {importPreview.diff.added.length} added</div>
                          {importPreview.diff.added.slice(0, 5).map(x => (
                            <div key={x.coin_id} className="import-diff-row positive">{(x.symbol || x.coin_id).toUpperCase()} +{x.amount.toFixed(4)}</div>
                          ))}
                          {importPreview.diff.added.length > 5 && <div className="muted" style={{ fontSize: '0.7rem' }}>… and {importPreview.diff.added.length - 5} more</div>}
                        </div>
                      )}
                      {importPreview.diff.removed.length > 0 && (
                        <div>
                          <div className="negative" style={{ fontSize: '0.78rem', fontWeight: 700 }}>− {importPreview.diff.removed.length} removed</div>
                          {importPreview.diff.removed.slice(0, 5).map(x => (
                            <div key={x.coin_id} className="import-diff-row negative">{(x.symbol || x.coin_id).toUpperCase()} −{x.amount.toFixed(4)}</div>
                          ))}
                          {importPreview.diff.removed.length > 5 && <div className="muted" style={{ fontSize: '0.7rem' }}>… and {importPreview.diff.removed.length - 5} more</div>}
                        </div>
                      )}
                      {importPreview.diff.changed.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--orange)' }}>~ {importPreview.diff.changed.length} changed</div>
                          {importPreview.diff.changed.slice(0, 5).map(x => (
                            <div key={x.coin_id} className="import-diff-row" style={{ color: 'var(--orange)' }}>
                              {(x.symbol || x.coin_id).toUpperCase()} {x.from.toFixed(4)} → {x.to.toFixed(4)}
                            </div>
                          ))}
                          {importPreview.diff.changed.length > 5 && <div className="muted" style={{ fontSize: '0.7rem' }}>… and {importPreview.diff.changed.length - 5} more</div>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="import-preview-actions">
                <button type="button" className="confirm-btn" onClick={handleConfirmImport}>Confirm Import</button>
                <button type="button" className="btn-ghost-dark" onClick={handleCancelImport}>Cancel</button>
              </div>
            </div>
          )}
          {importStatus === 'error' && (
            <div className="import-status error">Invalid backup code. Please check and try again.</div>
          )}
          {importStatus === 'success' && (
            <div className="import-status success">Import successful! Reloading...</div>
          )}
        </div>
      )}

      {/* Holdings — split by category */}
      <div className="section-header">
        <h3>Holdings</h3>
        <span className="muted">{enriched.length} asset{enriched.length !== 1 ? 's' : ''} · {categoryList.length} categor{categoryList.length !== 1 ? 'ies' : 'y'}</span>
      </div>

      {enriched.length > 0 && (
        <div className="cat-filter">
          <button
            className={`cat-pill ${categoryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            All · {enriched.length}
          </button>
          {categoryList.map(c => (
            <button
              key={c.key}
              className={`cat-pill ${categoryFilter === c.key ? 'active' : ''}`}
              style={categoryFilter === c.key
                ? { background: c.color, color: '#fff', borderColor: c.color }
                : { color: c.color, borderColor: `${c.color}55` }}
              onClick={() => setCategoryFilter(c.key)}
            >
              <span>{c.icon}</span> {c.label} · {c.items.length}
            </button>
          ))}
        </div>
      )}

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
        <div className="categories">
          {filteredCategories.map(cat => (
            <div key={cat.key} className="category-section" style={{ '--cat-color': cat.color }}>
              <div className="category-section-header">
                <div className="cat-title">
                  <span className="cat-icon-lg">{cat.icon}</span>
                  <div className="cat-title-text">
                    <strong>{cat.label}</strong>
                    <span className="muted">{cat.items.length} asset{cat.items.length !== 1 ? 's' : ''} · {cat.pct.toFixed(1)}% of portfolio</span>
                  </div>
                </div>
                <div className="cat-total">
                  <strong>{priv(`$${fmt(cat.total)}`)}</strong>
                  <span className={cat.pnl >= 0 ? 'positive' : 'negative'}>
                    {hideValues ? mask : `${cat.pnl >= 0 ? '+' : ''}$${fmt(cat.pnl)} (${cat.pnlPct.toFixed(1)}%)`}
                  </span>
                </div>
              </div>
              <div className="cat-bar"><div className="cat-bar-fill" style={{ width: `${cat.pct}%`, background: cat.color }} /></div>
              <div className="coin-cards">
                {cat.items.map((h, i) => (
                  <div
                    key={h.coin_id}
                    className="coin-card"
                    onClick={() => navigate(`/asset/${encodeURIComponent(h.coin_id)}`)}
                    title={`View ${h.coin_symbol.toUpperCase()} details`}
                    style={{ cursor: 'pointer' }}
                  >
              <div className="coin-header">
                <CoinIcon
                  image={h.image}
                  symbol={h.coin_symbol}
                  color={COLORS[i % COLORS.length]}
                  category={h.category}
                />
                <div className="coin-name">
                  <div className="coin-name-row">
                    <strong>{h.coin_symbol.toUpperCase()}</strong>
                    {h.category && h.category !== 'crypto' && (
                      <span
                        className="category-badge"
                        style={{ background: `${ASSET_CATEGORIES[h.category]?.color || '#00c853'}22`, color: ASSET_CATEGORIES[h.category]?.color || '#00c853' }}
                      >
                        {ASSET_CATEGORIES[h.category]?.icon} {ASSET_CATEGORIES[h.category]?.label}
                      </span>
                    )}
                    {h.capSize && ['large','mid','small'].includes(h.capSize) && (
                      <span
                        className={`cap-badge cap-${h.capSize}`}
                        title={`${h.capSize === 'large' ? 'Large cap (≥$10B)' : h.capSize === 'mid' ? 'Mid cap ($1B–$10B)' : 'Small cap (<$1B)'} — MCap $${(h.marketCap / 1e9).toFixed(2)}B`}
                      >
                        {h.capSize === 'large' ? 'L' : h.capSize === 'mid' ? 'M' : 'S'}
                      </span>
                    )}
                  </div>
                  <span className="muted">${fmt(h.price)}</span>
                </div>
                <div className="coin-value-col">
                  <strong>{priv(`$${fmt(h.value)}`)}</strong>
                  <span className="muted">{h.allocation.toFixed(1)}% of portfolio</span>
                </div>
                {(() => {
                  const globalIdx = enriched.findIndex(x => x.coin_id === h.coin_id)
                  const donutColor = COLORS[(globalIdx >= 0 ? globalIdx : i) % COLORS.length]
                  return (
                    <div className="contribution-donut" title={`Contribution: ${h.allocation.toFixed(1)}%`}>
                      <svg viewBox="0 0 36 36">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none" stroke="var(--bg4)" strokeWidth="3.2" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none" stroke={donutColor} strokeWidth="3.2"
                          strokeDasharray={`${Math.min(h.allocation, 100)}, 100`}
                          strokeLinecap="round" />
                      </svg>
                      <span className="contribution-donut-value">{h.allocation.toFixed(0)}%</span>
                    </div>
                  )
                })()}
              </div>
              <div className="coin-details">
                <div className="detail">
                  <span className="detail-label">Holdings</span>
                  <span>{h.amount.toFixed(6)}</span>
                </div>
                <div className="detail">
                  <span className="detail-label">Avg Buy</span>
                  <span>{priv(`$${fmt(h.avgBuy)}`)}</span>
                </div>
                <div className="detail">
                  <span className="detail-label">P&L</span>
                  <span className={h.pnl >= 0 ? 'positive' : 'negative'}>
                    {hideValues ? mask : `${h.pnl >= 0 ? '+' : ''}${fmt(h.pnl)} (${h.pnlPct.toFixed(1)}%)`}
                  </span>
                </div>
                <div className="detail">
                  <span className="detail-label">24h</span>
                  <span className={h.change24h >= 0 ? 'positive' : 'negative'}>
                    {h.change24h >= 0 ? '+' : ''}{h.change24h.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Manual price update for non-crypto assets */}
              {h.category && h.category !== 'crypto' && (
                <div className="manual-price-edit" onClick={e => e.stopPropagation()}>
                  {editingPrice === h.coin_id ? (
                    <form
                      className="coin-target-form"
                      onSubmit={e => { e.preventDefault(); handleUpdateManualPrice(h.coin_id); }}
                    >
                      <input
                        type="number"
                        step="any"
                        value={priceInput}
                        onChange={e => setPriceInput(e.target.value)}
                        placeholder={`Current: $${fmt(h.price)}`}
                        autoFocus
                      />
                      <button type="submit" className="btn-sm">Update</button>
                      <button type="button" className="btn-sm btn-ghost-dark" onClick={() => { setEditingPrice(null); setPriceInput(''); }}>X</button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn-update-price"
                      onClick={() => { setEditingPrice(h.coin_id); setPriceInput(String(h.price || '')); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      Update current price
                    </button>
                  )}
                </div>
              )}

              {/* Multi-target Sell Plan */}
              <div className="sell-plan" onClick={e => e.stopPropagation()}>
                {h.plan.length > 0 && (
                  <>
                    <div className="sell-plan-header">
                      <div className="sell-plan-title">
                        <span className="sell-plan-icon">🎯</span>
                        <span>Sell Plan · {h.plan.length} target{h.plan.length !== 1 ? 's' : ''}</span>
                      </div>
                      <button
                        className="btn-link-dark"
                        onClick={() => setExpandedPlans(prev => ({ ...prev, [h.coin_id]: !prev[h.coin_id] }))}
                      >
                        {expandedPlans[h.coin_id] ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    {expandedPlans[h.coin_id] && (
                      <div className="sell-plan-items">
                        {h.plan.map((t, ti) => (
                          <div key={t.id} className={`sell-plan-item ${t.hit ? 'hit' : ''}`}>
                            <div className="sell-plan-item-top">
                              <div className="sell-plan-item-desc">
                                <span className="sell-plan-qty">
                                  {t.sellAll ? `All ${h.amount.toFixed(6)}` : t.qty.toFixed(6)}
                                </span>
                                <span className="sell-plan-at">@</span>
                                <strong>${fmt(t.price)}</strong>
                              </div>
                              <div className="sell-plan-item-right">
                                <span className={`sell-plan-pct ${t.hit ? 'positive' : ''}`}>
                                  {t.progressPct.toFixed(1)}%
                                </span>
                                <button
                                  type="button"
                                  className="btn-ghost-dark sell-plan-remove"
                                  onClick={() => handleRemoveTargetItem(h.coin_id, t.id)}
                                  title="Remove target"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                            <div className="sell-plan-bar">
                              <div
                                className="sell-plan-fill"
                                style={{
                                  width: `${t.progressPct}%`,
                                  background: t.hit ? 'var(--green)' : COLORS[(i + ti) % COLORS.length],
                                }}
                              />
                            </div>
                            <div className="sell-plan-item-meta">
                              <span className="muted">Proceeds: ${fmt(t.proceeds)}</span>
                              {t.hit ? (
                                <span className="positive">Hit!</span>
                              ) : (
                                <span className="muted">${fmt(t.price - h.price)} to go</span>
                              )}
                            </div>
                          </div>
                        ))}

                        <div className="sell-plan-summary">
                          <div className="sell-plan-summary-row">
                            <span className="muted">Allocated</span>
                            <span>
                              {h.plan.some(t => t.sellAll)
                                ? `All ${h.amount.toFixed(6)}`
                                : `${h.plan.reduce((s, t) => s + t.qty, 0).toFixed(6)} / ${h.amount.toFixed(6)}`}
                            </span>
                          </div>
                          {!h.plan.some(t => t.sellAll) && (
                            <div className="sell-plan-summary-row">
                              <span className="muted">Remaining</span>
                              <span className={h.planOverAllocated ? 'negative' : ''}>
                                {h.planOverAllocated
                                  ? `Over-allocated by ${(h.plan.reduce((s, t) => s + t.qty, 0) - h.amount).toFixed(6)}`
                                  : h.planRemainingQty.toFixed(6)}
                              </span>
                            </div>
                          )}
                          <div className="sell-plan-summary-row total">
                            <span>Total projected proceeds</span>
                            <strong>${fmt(h.planTotalProceeds)}</strong>
                          </div>
                          <div className="sell-plan-summary-row">
                            <span className="muted">vs. invested ${fmt(h.total_invested)}</span>
                            <strong className={h.planTotalProceeds - h.total_invested >= 0 ? 'positive' : 'negative'}>
                              {h.planTotalProceeds - h.total_invested >= 0 ? '+' : ''}${fmt(h.planTotalProceeds - h.total_invested)}
                              {h.total_invested > 0 && (
                                <> ({((h.planTotalProceeds - h.total_invested) / h.total_invested * 100).toFixed(1)}%)</>
                              )}
                            </strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {editingTarget === h.coin_id ? (
                  <form
                    className="sell-plan-add"
                    onSubmit={e => { e.preventDefault(); handleAddCoinTarget(h.coin_id, h.planRemainingQty); }}
                  >
                    <div className="sell-plan-add-inputs">
                      <div className="sell-plan-field">
                        <label>Target price ($)</label>
                        <input
                          type="number"
                          step="any"
                          value={targetInput}
                          onChange={e => setTargetInput(e.target.value)}
                          placeholder={`now $${fmt(h.price)}`}
                          autoFocus
                        />
                      </div>
                      <div className="sell-plan-field">
                        <label>
                          Quantity to sell
                          {h.plan.length > 0 && !h.plan.some(t => t.sellAll) && h.planRemainingQty > 0 && (
                            <button
                              type="button"
                              className="btn-max"
                              onClick={() => setTargetQtyInput(String(h.planRemainingQty))}
                            >
                              Max {h.planRemainingQty.toFixed(4)}
                            </button>
                          )}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={targetQtyInput}
                          onChange={e => setTargetQtyInput(e.target.value)}
                          placeholder={h.plan.length === 0 ? `Leave blank for all ${h.amount.toFixed(4)}` : `up to ${h.planRemainingQty.toFixed(4)}`}
                        />
                      </div>
                    </div>
                    {targetInput && targetQtyInput && (
                      <div className="sell-plan-preview">
                        <span className="muted">Preview proceeds</span>
                        <strong>${fmt(parseFloat(targetInput) * parseFloat(targetQtyInput))}</strong>
                      </div>
                    )}
                    <div className="sell-plan-add-actions">
                      <button type="submit" className="btn-add-target">Add target</button>
                      <button
                        type="button"
                        className="btn-ghost-dark"
                        onClick={() => { setEditingTarget(null); setTargetInput(''); setTargetQtyInput(''); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    className="btn-set-target"
                    onClick={() => {
                      setEditingTarget(h.coin_id); setTargetInput(''); setTargetQtyInput('');
                      setExpandedPlans(prev => ({ ...prev, [h.coin_id]: true }));
                    }}
                  >
                    + {h.plan.length === 0 ? 'Set a sell target' : 'Add another target'}
                  </button>
                )}
              </div>

              <div className="alloc-bar">
                <div className="alloc-fill" style={{ width: `${h.allocation}%`, background: cat.color }} />
              </div>
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// DeepMetric moved to src/components/PortfolioAIPanel.jsx
