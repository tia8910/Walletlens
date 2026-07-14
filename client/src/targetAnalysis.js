// ── Sell-target reality check ────────────────────────────────────────────────
// Local, offline heuristics that judge whether a sell target is reasonable and
// roughly how long it might take — from the asset's ATH, ~1-year return, recent
// trend and volatility. Pure math (privacy-first); an optional AI take is a
// separate opt-in call. Never a price prediction.
import { api } from './api'

function fmtNum(n) {
  if (!isFinite(n)) return '0'
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

// ~1-year return + annualised volatility from a price series (getChartData points).
export function seriesStats(series) {
  const prices = (series || []).map(p => p?.price).filter(v => typeof v === 'number' && v > 0)
  if (prices.length < 8) return null
  const first = prices[0], last = prices[prices.length - 1]
  const oneYearReturnPct = (last / first - 1) * 100
  const rets = []
  for (let i = 1; i < prices.length; i++) rets.push(Math.log(prices[i] / prices[i - 1]))
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1)
  // Series ≈ 1 year, so annualise by √(number of steps).
  const volatilityPct = Math.sqrt(variance) * Math.sqrt(rets.length) * 100
  return { oneYearReturnPct, volatilityPct }
}

const LEVELS = [
  { label: 'Reasonable',      color: '#22c55e' },
  { label: 'Ambitious',       color: '#3b82f6' },
  { label: 'Aggressive',      color: '#f59e0b' },
  { label: 'Very aggressive', color: '#f97316' },
  { label: 'Extreme',         color: '#ef4444' },
]

export function analyzeTarget({ symbol, currentPrice, targetPrice, ath, change30d, oneYearReturnPct }) {
  const sym = (symbol || '').toUpperCase()
  if (!(currentPrice > 0) || !(targetPrice > 0)) return null
  const ratio = targetPrice / currentPrice
  const requiredPct = (ratio - 1) * 100
  const belowAth = ath && ath > 0 && targetPrice <= ath

  let level
  if (ratio <= 1.25) level = 0
  else if (ratio <= 2) level = 1
  else if (ratio <= 4) level = 2
  else if (ratio <= 8) level = 3
  else level = 4
  if (belowAth) level = Math.max(0, level - 1) // it has traded in this zone before
  const lvl = LEVELS[level]

  // Context — the strongest anchor is the all-time high.
  let context
  if (ath && ath > 0) {
    if (targetPrice <= ath) {
      const belowPct = ((ath - targetPrice) / ath) * 100
      context = `${sym} has traded above $${fmtNum(targetPrice)} before — ${belowPct.toFixed(0)}% under its all-time high of $${fmtNum(ath)}.`
    } else {
      const abovePct = ((targetPrice - ath) / ath) * 100
      context = `That's ${abovePct.toFixed(0)}% above ${sym}'s all-time high of $${fmtNum(ath)} — uncharted territory.`
    }
  } else {
    context = `${requiredPct >= 0 ? '+' : ''}${requiredPct.toFixed(0)}% from the current price of $${fmtNum(currentPrice)}.`
  }

  // Timeframe from the past-year growth rate.
  let timeframe = null
  const g = oneYearReturnPct != null ? oneYearReturnPct / 100 : null
  if (g != null && g > 0.02 && ratio > 1) {
    const years = Math.log(ratio) / Math.log(1 + g)
    if (years <= 1) timeframe = `~${Math.max(1, Math.round(years * 12))} months at its past-year pace`
    else if (years <= 6) timeframe = `~${years.toFixed(years < 3 ? 1 : 0)} years at its past-year pace`
    else timeframe = `Many years at its past-year pace — would need a much stronger rally`
  } else if (g != null && g <= 0.02) {
    timeframe = `Not on its current trajectory — ${sym} is roughly flat or down over the past year`
  }

  // Recent momentum.
  let trend = null
  if (change30d != null && isFinite(change30d)) {
    trend = `${sym} is ${change30d >= 0 ? 'up' : 'down'} ${Math.abs(change30d).toFixed(0)}% over 30 days — momentum ${change30d >= 0 ? 'supports' : 'is against'} this target right now.`
  }

  return { requiredPct, ratio, level, label: lvl.label, color: lvl.color, context, timeframe, trend, belowAth }
}

// Fetch the per-asset data the heuristic needs (history + ATH/30d change).
export async function fetchTargetData(coinId) {
  const [series, funds] = await Promise.all([
    api.getChartData(coinId, 365).catch(() => []),
    api.getBulkFundamentals([coinId]).catch(() => ({})),
  ])
  const stats = seriesStats(series)
  const f = funds?.[coinId] || null
  return {
    ath: f?.ath ?? null,
    change30d: f?.change30d ?? null,
    oneYearReturnPct: stats?.oneYearReturnPct ?? null,
    volatilityPct: stats?.volatilityPct ?? null,
  }
}
