import { emaSeries } from './technicals'

// Chart indicators for the asset page, computed on the device.
//
// Two indicators, modelled on the TradingView setups people asked for:
//
//   Buy / Sell Signal (fast 5, slow 13, RSI 14, ATR × 0.5, 3 targets)
//     BUY once the fast EMA is above the slow one with RSI above 50, SELL once
//     both are the other way; sides alternate. The stop sits ATR × mult beyond
//     the swing of the last few candles; targets are 1R, 2R, 3R …
//
//   Golden Cross (EMA 21, 55, 200)
//     The three EMA lines, a golden (or death) cross when the middle EMA
//     crosses the slow one, and a "small" golden cross when the fast EMA
//     crosses the middle one.
//
// Everything works on a candle array [{ t, o, h, l, c }], oldest first, and
// returns indexes into it, so the chart can draw only the visible tail while
// the maths uses the history before it as warm-up.

export const DEFAULT_CHART_PARAMS = {
  signals: { on: true, fast: 5, slow: 13, rsi: 14, atrMult: 0.5, targets: 3, atrPeriod: 3, swing: 5 },
  cross:   { on: true, fast: 21, mid: 55, slow: 200 },
}

const PARAMS_KEY = 'wl_chart_indicators_v1'

const clampInt = (v, lo, hi, d) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}
const clampNum = (v, lo, hi, d) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}

/** Merges stored settings over the defaults and keeps every number in range. */
export function normalizeParams(raw) {
  const d = DEFAULT_CHART_PARAMS
  const s = raw?.signals || {}, x = raw?.cross || {}
  return {
    signals: {
      on: s.on ?? d.signals.on,
      fast: clampInt(s.fast, 2, 100, d.signals.fast),
      slow: clampInt(s.slow, 3, 200, d.signals.slow),
      rsi: clampInt(s.rsi, 2, 50, d.signals.rsi),
      atrMult: clampNum(s.atrMult, 0, 5, d.signals.atrMult),
      targets: clampInt(s.targets, 1, 5, d.signals.targets),
      atrPeriod: clampInt(s.atrPeriod, 1, 50, d.signals.atrPeriod),
      swing: clampInt(s.swing, 1, 50, d.signals.swing),
    },
    cross: {
      on: x.on ?? d.cross.on,
      fast: clampInt(x.fast, 2, 400, d.cross.fast),
      mid: clampInt(x.mid, 3, 400, d.cross.mid),
      slow: clampInt(x.slow, 5, 400, d.cross.slow),
    },
  }
}

export function loadChartParams() {
  try { return normalizeParams(JSON.parse(localStorage.getItem(PARAMS_KEY) || 'null')) }
  catch { return normalizeParams(null) }
}

export function saveChartParams(p) {
  try { localStorage.setItem(PARAMS_KEY, JSON.stringify(normalizeParams(p))) } catch {}
}

/** Wilder's RSI as a series aligned to `values` (undefined during warm-up). */
export function rsiSeries(values, period = 14) {
  const out = []
  if (!values || values.length <= period) return out
  let gain = 0, loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d; else loss -= d
  }
  gain /= period; loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    gain = (gain * (period - 1) + Math.max(0, d)) / period
    loss = (loss * (period - 1) + Math.max(0, -d)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

/** Average true range (Wilder smoothing), aligned to `candles`. */
export function atrSeries(candles, period = 14) {
  const out = []
  if (!candles || candles.length < period) return out
  const tr = candles.map((c, i) => i === 0 ? c.h - c.l
    : Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c)))
  let a = tr.slice(0, period).reduce((s, v) => s + v, 0) / period
  out[period - 1] = a
  for (let i = period; i < tr.length; i++) {
    a = (a * (period - 1) + tr[i]) / period
    out[i] = a
  }
  return out
}

const crossedUp = (a, b, i) => a[i - 1] != null && b[i - 1] != null && a[i] != null && b[i] != null && a[i - 1] <= b[i - 1] && a[i] > b[i]
const crossedDown = (a, b, i) => a[i - 1] != null && b[i - 1] != null && a[i] != null && b[i] != null && a[i - 1] >= b[i - 1] && a[i] < b[i]

/**
 * Runs both indicators over `candles`.
 * Returns { ema: {fast, mid, slow}, rsi, signals: [...], crosses: [...], last }
 *   signals: { i, side: 'buy'|'sell', entry, stop, targets: [...] }
 *   crosses: { i, kind: 'golden'|'death'|'small-golden'|'small-death' }
 *   last:    the most recent signal, or null
 */
export function computeChartSignals(candles, rawParams) {
  const p = normalizeParams(rawParams)
  const closes = (candles || []).map(c => c.c)
  const S = p.signals, X = p.cross
  const fastE = emaSeries(closes, S.fast)
  const slowE = emaSeries(closes, S.slow)
  const rsi = rsiSeries(closes, S.rsi)
  const atr = atrSeries(candles || [], S.atrPeriod)
  const e1 = emaSeries(closes, X.fast)
  const e2 = emaSeries(closes, X.mid)
  const e3 = emaSeries(closes, X.slow)

  // A signal fires on the first candle where the trend and momentum agree
  // (fast EMA above the slow one AND RSI above 50 for a BUY, both below for a
  // SELL), and sides alternate. Requiring the RSI on the exact crossing candle
  // missed most real turns: after a sell-off the EMAs cross a few candles
  // before RSI recovers past 50.
  const signals = []
  if (S.on) {
    let side = null
    for (let i = 1; i < closes.length; i++) {
      const r = rsi[i]
      if (r == null || atr[i] == null || fastE[i] == null || slowE[i] == null) continue
      const bull = fastE[i] > slowE[i] && r > 50
      const bear = fastE[i] < slowE[i] && r < 50
      const from = Math.max(0, i - S.swing)
      const window = candles.slice(from, i + 1)
      if (bull && side !== 'buy') {
        const stop = Math.min(...window.map(c => c.l)) - S.atrMult * atr[i]
        const risk = closes[i] - stop
        if (risk > 0) { signals.push({ i, side: 'buy', entry: closes[i], stop, targets: Array.from({ length: S.targets }, (_, k) => closes[i] + (k + 1) * risk) }); side = 'buy' }
      } else if (bear && side !== 'sell') {
        const stop = Math.max(...window.map(c => c.h)) + S.atrMult * atr[i]
        const risk = stop - closes[i]
        if (risk > 0) { signals.push({ i, side: 'sell', entry: closes[i], stop, targets: Array.from({ length: S.targets }, (_, k) => closes[i] - (k + 1) * risk) }); side = 'sell' }
      }
    }
  }

  const crosses = []
  if (X.on) {
    for (let i = 1; i < closes.length; i++) {
      if (crossedUp(e2, e3, i)) crosses.push({ i, kind: 'golden' })
      else if (crossedDown(e2, e3, i)) crosses.push({ i, kind: 'death' })
      if (crossedUp(e1, e2, i)) crosses.push({ i, kind: 'small-golden' })
      else if (crossedDown(e1, e2, i)) crosses.push({ i, kind: 'small-death' })
    }
  }

  return {
    params: p,
    ema: { fast: e1, mid: e2, slow: e3 },
    rsi,
    signals,
    crosses,
    last: signals.length ? signals[signals.length - 1] : null,
  }
}

/** Candles from a close-only series (no highs or lows available). */
// Chart timeframes: candle size, how many candles are on screen, and the
// span (days) the close-only fallback covers. 1D is the default.
export const CHART_TIMEFRAMES = {
  '15m': { label: '15m', interval: '15m', visible: 96, days: 1 },
  '1h': { label: '1H', interval: '1h', visible: 120, days: 7 },
  '4h': { label: '4H', interval: '4h', visible: 120, days: 30 },
  '1d': { label: '1D', interval: '1d', visible: 120, days: 365 },
  '1w': { label: '1W', interval: '1w', visible: 156, days: 1825 },
}
export const DEFAULT_TIMEFRAME = '1d'

// Yahoo chart requests per timeframe (Yahoo has no 4h, so 4h is grouped
// from hourly candles). Mirrors functions/api/candles.js.
export const YAHOO_PLANS = {
  '15m': { interval: '15m', range: '1mo' },
  '1h': { interval: '60m', range: '3mo' },
  '4h': { interval: '60m', range: '1y', group: 4 },
  '1d': { interval: '1d', range: '2y' },
  '1w': { interval: '1wk', range: '10y' },
}

/** Yahoo chart JSON → [{ t, o, h, l, c }], dropping rows with gaps. */
export function parseYahooCandles(data) {
  const r = data?.chart?.result?.[0]
  const q = r?.indicators?.quote?.[0]
  const ts = r?.timestamp
  if (!q || !Array.isArray(ts)) return []
  const out = []
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
    if ([o, h, l, c].every(v => typeof v === 'number' && isFinite(v) && v > 0) && h >= l) out.push({ t: ts[i] * 1000, o, h, l, c })
  }
  return out
}

/** Merge every `n` candles of the same (UTC) day into one. */
export function groupCandles(candles, n) {
  const out = []
  let cur = null, day = null, count = 0
  for (const k of candles) {
    const d = new Date(k.t).toISOString().slice(0, 10)
    if (!cur || d !== day || count >= n) {
      if (cur) out.push(cur)
      cur = { ...k }; day = d; count = 1
    } else {
      cur.h = Math.max(cur.h, k.h); cur.l = Math.min(cur.l, k.l); cur.c = k.c; count++
    }
  }
  if (cur) out.push(cur)
  return out
}

export function candlesFromCloses(points) {
  const out = []
  for (let i = 0; i < (points || []).length; i++) {
    const c = Number(points[i].price)
    if (!(c > 0)) continue
    const o = out.length ? out[out.length - 1].c : c
    out.push({ t: points[i].t ?? points[i].date ?? i, o, h: Math.max(o, c), l: Math.min(o, c), c, closeOnly: true })
  }
  return out
}
