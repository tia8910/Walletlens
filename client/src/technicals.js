// ── Technical analysis toolkit ───────────────────────────────────────────
// Pure, dependency-free indicator math that runs on an array of daily closes
// (oldest → newest). Used to (a) describe the technical posture of a holding
// and (b) derive sell-plan targets from real support/resistance + momentum
// instead of fixed P&L percentages.
//
// Everything here is defensive: short or noisy series return null rather than
// throwing, so callers can simply fall back to rule-based logic.

const clean = (arr) =>
  (Array.isArray(arr) ? arr : []).filter((x) => typeof x === 'number' && isFinite(x) && x > 0)

// Simple moving average of the last `period` values.
export function sma(values, period) {
  if (!values || values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((s, v) => s + v, 0) / period
}

// Full EMA series, aligned to `values` (entries before it can be computed are
// left undefined). Seeded with an SMA of the first `period` values.
export function emaSeries(values, period) {
  if (!values || values.length < period) return []
  const k = 2 / (period + 1)
  const out = []
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

export function ema(values, period) {
  const s = emaSeries(values, period)
  return s.length ? s[s.length - 1] : null
}

// Wilder's RSI over `period` (default 14). Returns 0..100 or null.
export function rsi(values, period = 14) {
  if (!values || values.length < period + 1) return null
  let gains = 0
  let losses = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gains += d
    else losses -= d
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    const g = d > 0 ? d : 0
    const l = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

// MACD (12/26/9). Returns { line, signal, hist, cross } or null.
export function macd(values, fast = 12, slow = 26, signalP = 9) {
  if (!values || values.length < slow + signalP) return null
  const emaFast = emaSeries(values, fast)
  const emaSlow = emaSeries(values, slow)
  const macdLine = []
  for (let i = 0; i < values.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) macdLine.push(emaFast[i] - emaSlow[i])
  }
  if (macdLine.length < signalP + 1) return null
  const signalSeries = emaSeries(macdLine, signalP)
  const line = macdLine[macdLine.length - 1]
  const signal = signalSeries[signalSeries.length - 1]
  const prevLine = macdLine[macdLine.length - 2]
  const prevSignal = signalSeries[signalSeries.length - 2]
  let cross = null
  if (prevLine != null && prevSignal != null && line != null && signal != null) {
    if (prevLine <= prevSignal && line > signal) cross = 'bullish'
    else if (prevLine >= prevSignal && line < signal) cross = 'bearish'
  }
  return { line, signal, hist: line - signal, cross }
}

// Bollinger Bands (20, 2). Returns { upper, mid, lower, pctB, bandwidth }.
export function bollinger(values, period = 20, mult = 2) {
  if (!values || values.length < period) return null
  const slice = values.slice(-period)
  const mid = slice.reduce((s, v) => s + v, 0) / period
  const variance = slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period
  const sd = Math.sqrt(variance)
  const upper = mid + mult * sd
  const lower = mid - mult * sd
  const last = values[values.length - 1]
  const pctB = upper > lower ? (last - lower) / (upper - lower) : 0.5
  return { upper, mid, lower, pctB, bandwidth: mid > 0 ? (upper - lower) / mid : 0 }
}

// Swing pivots: local highs/lows with `left`/`right` bars on each side.
export function pivots(values, left = 3, right = 3) {
  const highs = []
  const lows = []
  for (let i = left; i < values.length - right; i++) {
    const v = values[i]
    let isHigh = true
    let isLow = true
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue
      if (values[j] > v) isHigh = false
      if (values[j] < v) isLow = false
    }
    if (isHigh) highs.push(v)
    if (isLow) lows.push(v)
  }
  return { highs, lows }
}

// Cluster nearby price levels (merge within 2%) and keep the closest `max`.
function clusterLevels(levels, ascending, max = 3) {
  const sorted = [...new Set(levels.map((p) => +p))].sort((a, b) => (ascending ? a - b : b - a))
  const out = []
  for (const p of sorted) {
    if (!out.some((q) => Math.abs(q - p) / p < 0.02)) out.push(p)
    if (out.length >= max) break
  }
  return out
}

// Support (below price) and resistance (above price) from swing pivots plus
// the window extremes. Nearest level first in each list.
export function supportResistance(values, currentPrice) {
  const { highs, lows } = pivots(values, 3, 3)
  const windowHigh = Math.max(...values)
  const windowLow = Math.min(...values)
  const resistances = [...highs, windowHigh].filter((p) => p > currentPrice * 1.005)
  const supports = [...lows, windowLow].filter((p) => p < currentPrice * 0.995)
  return {
    resistances: clusterLevels(resistances, true),
    supports: clusterLevels(supports, false),
  }
}

// Average daily move as a % of price — a rough ATR proxy from closes only.
export function atrPct(values, period = 14) {
  if (!values || values.length < period + 1) return null
  let sum = 0
  for (let i = values.length - period; i < values.length; i++) sum += Math.abs(values[i] - values[i - 1])
  const atr = sum / period
  const last = values[values.length - 1]
  return last > 0 ? atr / last : null
}

// Consolidated technical posture for a series of daily closes.
// Returns null if there isn't enough clean data to be meaningful (<20 pts).
export function analyzeTechnicals(closes, currentPrice) {
  const v = clean(closes)
  if (v.length < 20) return null
  const cur = currentPrice && isFinite(currentPrice) && currentPrice > 0 ? currentPrice : v[v.length - 1]

  const _rsi = rsi(v, 14)
  const _macd = macd(v)
  const _bb = bollinger(v, 20, 2)
  const _sma20 = sma(v, 20)
  const _sma50 = sma(v, 50)
  const _sma200 = sma(v, 200)
  const _ema20 = ema(v, 20)
  const sr = supportResistance(v, cur)
  const _atr = atrPct(v, 14)

  // Trend from price relative to the 50-day (or 20-day) average.
  let trend = 'sideways'
  if (_sma50 != null) {
    if (cur > _sma50 * 1.01 && (_sma20 == null || _sma20 >= _sma50)) trend = 'uptrend'
    else if (cur < _sma50 * 0.99 && (_sma20 == null || _sma20 <= _sma50)) trend = 'downtrend'
  } else if (_sma20 != null) {
    trend = cur > _sma20 ? 'uptrend' : 'downtrend'
  }

  let rsiState = 'neutral'
  if (_rsi != null) {
    if (_rsi >= 70) rsiState = 'overbought'
    else if (_rsi <= 30) rsiState = 'oversold'
  }

  // Composite score: positive = constructive (hold/accumulate), negative =
  // distribution/sell pressure. Bounded to -100..100.
  let score = 0
  if (_rsi != null) score += _rsi >= 70 ? -25 : _rsi <= 30 ? 25 : (50 - _rsi) * 0.4
  score += trend === 'uptrend' ? 20 : trend === 'downtrend' ? -20 : 0
  if (_macd) score += _macd.hist > 0 ? 15 : -15
  if (_bb) score += _bb.pctB > 1 ? -15 : _bb.pctB < 0 ? 15 : (0.5 - _bb.pctB) * 20
  score = Math.max(-100, Math.min(100, Math.round(score)))

  // Exit-oriented signal: lean to distribute when stretched, accumulate when
  // washed out, otherwise hold.
  let signal = 'hold'
  if (rsiState === 'overbought' || (_bb && _bb.pctB > 1) || _macd?.cross === 'bearish') signal = 'distribute'
  if (rsiState === 'oversold' || (_bb && _bb.pctB < 0)) signal = 'accumulate'

  return {
    rsi: _rsi,
    rsiState,
    trend,
    score,
    signal,
    sma20: _sma20,
    sma50: _sma50,
    sma200: _sma200,
    ema20: _ema20,
    macd: _macd,
    bb: _bb,
    atrPct: _atr,
    supports: sr.supports,
    resistances: sr.resistances,
    nearestSupport: sr.supports[0] ?? null,
    nearestResistance: sr.resistances[0] ?? null,
    currentPrice: cur,
    samples: v.length,
  }
}

// Round to a readable number of significant figures for display/target prices.
function fmtPrice(p) {
  if (!isFinite(p) || p <= 0) return p
  return +(+p).toPrecision(6)
}

// Build a sell plan straight from the technical posture + the user's position
// context. Targets come from real resistance levels; stops from support.
// `ctx`: { currentPrice, avgCost, pnlPct, weight }
export function buildTASellPlan(ta, ctx = {}) {
  const { currentPrice, pnlPct = 0, weight = 0 } = ctx
  const cur = currentPrice && isFinite(currentPrice) && currentPrice > 0 ? currentPrice : ta.currentPrice

  // Re-derive S/R against the live price (the cached series may be a few hours
  // stale, so a level that was "above" can now be at/below spot).
  const allLevels = [...(ta.resistances || []), ...(ta.supports || [])]
  const resAbove = clusterLevels(allLevels.filter((p) => p > cur * 1.005), true)
  const supBelow = clusterLevels(allLevels.filter((p) => p < cur * 0.995), false)

  const overbought = ta.rsiState === 'overbought'
  const oversold = ta.rsiState === 'oversold'
  const aboveBB = ta.bb && ta.bb.pctB > 1
  const bearishMacd = ta.macd?.cross === 'bearish' || (ta.macd && ta.macd.hist < 0)
  const bullishMacd = ta.macd?.cross === 'bullish' || (ta.macd && ta.macd.hist > 0)
  const nearResistance = resAbove[0] && cur >= resAbove[0] * 0.97

  const stop = supBelow[0]
    ? { label: 'Stop-loss under support', price: fmtPrice(supBelow[0] * 0.985), note: `Exit if it loses S1 ($${fmtPrice(supBelow[0])})` }
    : null

  // Resistance-laddered take-profit (40/35/25).
  const ladder = resAbove.slice(0, 3).map((p, i) => ({
    label: `Sell ${[40, 35, 25][i]}% near R${i + 1}`,
    price: fmtPrice(p),
    note: `Prior swing high / range top`,
  }))

  let action
  let urgency
  let reason
  const targets = []

  if (overbought || aboveBB) {
    action = 'TAKE PROFIT'
    urgency = 'high'
    reason = `RSI ${ta.rsi?.toFixed(0)}${overbought ? ' (overbought)' : ''}${aboveBB ? ' & price above the upper Bollinger band' : ''} in a ${ta.trend}. Momentum is stretched — scale out into strength.`
    targets.push(...(ladder.length ? ladder : [{ label: 'Sell 40% now', price: fmtPrice(cur), note: 'Overbought — bank into strength' }]))
    if (stop) targets.push(stop)
  } else if (bearishMacd && ta.trend === 'downtrend') {
    action = 'REDUCE'
    urgency = 'high'
    reason = `Bearish MACD in a downtrend (RSI ${ta.rsi?.toFixed(0)}). Trend and momentum are both down — cut exposure into bounces.`
    if (resAbove[0]) targets.push({ label: 'Sell 50% on bounce to R1', price: fmtPrice(resAbove[0]), note: 'Sell into the next relief rally' })
    else targets.push({ label: 'Sell 50% now', price: fmtPrice(cur), note: 'Momentum broken — reduce risk' })
    if (stop) targets.push(stop)
  } else if (oversold && ta.trend !== 'downtrend') {
    action = 'HOLD / ACCUMULATE'
    urgency = 'low'
    reason = `RSI ${ta.rsi?.toFixed(0)} (oversold) with a non-bearish trend. Don't sell into weakness — set upside targets at resistance.`
    targets.push(...(ladder.length ? ladder : [{ label: 'First target +30%', price: fmtPrice(cur * 1.3), note: 'No mapped resistance — fixed target' }]))
    if (supBelow[0]) targets.push({ label: 'Add near support', price: fmtPrice(supBelow[0]), note: 'Accumulation zone' })
  } else if (nearResistance) {
    action = 'TRIM AT RESISTANCE'
    urgency = 'medium'
    reason = `Price is testing resistance at $${fmtPrice(resAbove[0])} in a ${ta.trend}. Take partial profit; let the rest run if it breaks out.`
    targets.push({ label: 'Sell 30% at R1', price: fmtPrice(resAbove[0]), note: 'First resistance' })
    if (resAbove[1]) targets.push({ label: 'Sell 30% at R2', price: fmtPrice(resAbove[1]), note: 'Second resistance' })
    targets.push({ label: 'Hold runner', price: null, note: stop ? `Trail with stop under $${fmtPrice(supBelow[0])}` : 'Trail the breakout' })
  } else {
    action = ta.trend === 'uptrend' ? 'HOLD (UPTREND)' : 'HOLD'
    urgency = 'low'
    reason = `${ta.trend === 'uptrend' ? 'Healthy uptrend' : 'Neutral structure'} — RSI ${ta.rsi?.toFixed(0)}, MACD ${bullishMacd ? 'positive' : 'flat/negative'}. Let it run toward resistance with a defined stop.`
    targets.push(...(ladder.length ? ladder.slice(0, 2) : [{ label: 'First target +50%', price: fmtPrice(cur * 1.5), note: 'No mapped resistance' }]))
    if (stop) targets.push(stop)
  }

  // Concentration overlay — an oversized position deserves more urgency even
  // when the technicals look calm.
  if (weight > 20 && urgency === 'low') {
    urgency = 'medium'
    reason += ` It's also ${weight.toFixed(0)}% of your portfolio — consider trimming to manage concentration.`
  }
  // If deep in profit and stretched, nudge urgency up.
  if (pnlPct >= 150 && urgency !== 'high') urgency = 'high'

  return { action, urgency, reason, targets }
}
