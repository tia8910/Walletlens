// Chart pattern detector for the asset and Signals charts, run on the device.
//
// Two families, both read from the same candle array the indicators use
// ([{ t, o, h, l, c }], oldest first), returning indexes into it:
//
//   Candlestick patterns (one to three candles)
//     bull_engulf / bear_engulf     a body that swallows the one before it
//     hammer / shooting_star        a long wick against the trend, small body
//     morning_star / evening_star   a big candle, a pause, then a reversal
//
//   Chart patterns (swing highs and lows over the last ~150 candles)
//     double_top / double_bottom    two peaks (or troughs) at the same level
//     head_shoulders / inv_head_shoulders
//                                   three peaks, the middle one highest
//                                   (or troughs, the middle one lowest)
//     A chart pattern is "forming" until a close breaks its neckline, then
//     "confirmed".
//
// Sizes are measured against the average candle range, so the same rules
// work on a $0.0001 token and on gold. These are hints, not certainties:
// the UI says so.

export const CANDLE_PATTERNS = ['bull_engulf', 'bear_engulf', 'hammer', 'shooting_star', 'morning_star', 'evening_star']
export const CHART_PATTERNS = ['double_top', 'double_bottom', 'head_shoulders', 'inv_head_shoulders']
export const PATTERN_SIDE = {
  bull_engulf: 'bull', hammer: 'bull', morning_star: 'bull', double_bottom: 'bull', inv_head_shoulders: 'bull',
  bear_engulf: 'bear', shooting_star: 'bear', evening_star: 'bear', double_top: 'bear', head_shoulders: 'bear',
}

const body = (c) => Math.abs(c.c - c.o)
const upperWick = (c) => c.h - Math.max(c.o, c.c)
const lowerWick = (c) => Math.min(c.o, c.c) - c.l
const green = (c) => c.c > c.o
const red = (c) => c.c < c.o

/** Average high-low range of the `n` candles ending at `i`. */
function avgRange(candles, i, n = 14) {
  let s = 0, k = 0
  for (let j = Math.max(0, i - n + 1); j <= i; j++) { s += candles[j].h - candles[j].l; k++ }
  return k ? s / k : 0
}

/** Trend into candle i: close now against the close `n` candles before. */
function trendInto(candles, i, n = 5) {
  if (i - n < 0) return 0
  const a = candles[i - n].c, b = candles[i - 1]?.c ?? candles[i].c
  return a > 0 ? (b - a) / a : 0
}

/** Candlestick patterns from candle `start` on. Needs real OHLC. */
export function detectCandlePatterns(candles, start = 0) {
  const out = []
  if (!Array.isArray(candles) || candles.length < 3) return out
  for (let i = Math.max(2, start); i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1], pp = candles[i - 2]
    const ar = avgRange(candles, i - 1)
    if (!(ar > 0)) continue
    const b = body(c)
    const down = trendInto(candles, i) < 0, up = trendInto(candles, i) > 0

    // Engulfing: this body covers the previous body, the other way round.
    if (red(p) && green(c) && c.o <= p.c && c.c >= p.o && b > body(p) * 1.05 && b > ar * 0.4 && down) {
      out.push({ kind: 'bull_engulf', i, side: 'bull' }); continue
    }
    if (green(p) && red(c) && c.o >= p.c && c.c <= p.o && b > body(p) * 1.05 && b > ar * 0.4 && up) {
      out.push({ kind: 'bear_engulf', i, side: 'bear' }); continue
    }
    // Morning / evening star: big candle, small pause, big reversal past the middle.
    const small = body(p) < ar * 0.3
    if (red(pp) && body(pp) > ar * 0.6 && small && green(c) && b > ar * 0.5 && c.c > (pp.o + pp.c) / 2 && trendInto(candles, i - 1) < 0) {
      out.push({ kind: 'morning_star', i, side: 'bull' }); continue
    }
    if (green(pp) && body(pp) > ar * 0.6 && small && red(c) && b > ar * 0.5 && c.c < (pp.o + pp.c) / 2 && trendInto(candles, i - 1) > 0) {
      out.push({ kind: 'evening_star', i, side: 'bear' }); continue
    }
    // Hammer / shooting star: a long wick against the trend, a small body.
    const range = c.h - c.l
    if (range > ar * 0.8 && b <= range * 0.35) {
      if (down && lowerWick(c) >= Math.max(b * 2, range * 0.55) && upperWick(c) <= range * 0.15) { out.push({ kind: 'hammer', i, side: 'bull' }); continue }
      if (up && upperWick(c) >= Math.max(b * 2, range * 0.55) && lowerWick(c) <= range * 0.15) { out.push({ kind: 'shooting_star', i, side: 'bear' }); continue }
    }
  }
  return out
}

/** Swing highs and lows: a candle higher (lower) than `k` on each side. */
export function pivots(candles, k = 3, start = 0) {
  const highs = [], lows = []
  for (let i = Math.max(k, start); i < candles.length - k; i++) {
    let hi = true, lo = true
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue
      // Ties count for the earlier candle: a candle opening at the peak's
      // close often shares its high, and the peak is still the peak.
      if (j < i ? candles[j].h >= candles[i].h : candles[j].h > candles[i].h) hi = false
      if (j < i ? candles[j].l <= candles[i].l : candles[j].l < candles[i].l) lo = false
    }
    if (hi) highs.push({ i, v: candles[i].h })
    if (lo) lows.push({ i, v: candles[i].l })
  }
  return { highs, lows }
}

const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b))
const minBetween = (candles, a, b) => { let m = Infinity, at = a; for (let j = a; j <= b; j++) if (candles[j].l < m) { m = candles[j].l; at = j } return { i: at, v: m } }
const maxBetween = (candles, a, b) => { let m = -Infinity, at = a; for (let j = a; j <= b; j++) if (candles[j].h > m) { m = candles[j].h; at = j } return { i: at, v: m } }

/** Has a close after `after` broken `level` (below for bear, above for bull)? */
function brokeAt(candles, after, level, side) {
  for (let j = after + 1; j < candles.length; j++) {
    if (side === 'bear' ? candles[j].c < level : candles[j].c > level) return j
  }
  return -1
}

/**
 * Chart patterns over the last `lookback` candles. Each is
 * { kind, side, i, points: [{i, v}], neckline, confirmed, breakI }
 * where i is the candle that completes it (the break, or the last pivot).
 */
export function detectChartPatterns(candles, lookback = 150) {
  const out = []
  if (!Array.isArray(candles) || candles.length < 20) return out
  const start = Math.max(0, candles.length - lookback)
  const { highs, lows } = pivots(candles, 3, start)
  const price = candles.at(-1).c
  const ar = avgRange(candles, candles.length - 1, 20)
  // Two levels count as "the same" within 1.5 % or one average candle.
  const tol = Math.max(0.015, price > 0 ? ar / price : 0)

  const push = (p) => {
    // A newer pattern of the same kind that overlaps an older one replaces it.
    const k = out.findIndex(q => q.kind === p.kind && q.points[0].i <= p.points.at(-1).i && p.points[0].i <= q.points.at(-1).i)
    if (k >= 0) out.splice(k, 1)
    out.push(p)
  }

  // Double top / bottom: neighbouring pivots at the same level, a real dip between.
  for (let a = 0; a < highs.length - 1; a++) {
    const h1 = highs[a], h2 = highs[a + 1]
    if (h2.i - h1.i < 5 || !near(h1.v, h2.v, tol)) continue
    const trough = minBetween(candles, h1.i, h2.i)
    if ((Math.min(h1.v, h2.v) - trough.v) / trough.v < tol * 2) continue
    const breakI = brokeAt(candles, h2.i, trough.v, 'bear')
    // Gone stale: price long past the top without breaking the neckline.
    if (breakI < 0 && candles.length - 1 - h2.i > 40) continue
    push({ kind: 'double_top', side: 'bear', i: breakI >= 0 ? breakI : h2.i, points: [h1, trough, h2], neckline: trough.v, confirmed: breakI >= 0, breakI })
  }
  for (let a = 0; a < lows.length - 1; a++) {
    const l1 = lows[a], l2 = lows[a + 1]
    if (l2.i - l1.i < 5 || !near(l1.v, l2.v, tol)) continue
    const peak = maxBetween(candles, l1.i, l2.i)
    if ((peak.v - Math.max(l1.v, l2.v)) / Math.max(l1.v, l2.v) < tol * 2) continue
    const breakI = brokeAt(candles, l2.i, peak.v, 'bull')
    if (breakI < 0 && candles.length - 1 - l2.i > 40) continue
    push({ kind: 'double_bottom', side: 'bull', i: breakI >= 0 ? breakI : l2.i, points: [l1, peak, l2], neckline: peak.v, confirmed: breakI >= 0, breakI })
  }

  // Head and shoulders: three pivots, the middle clearly beyond both shoulders,
  // the shoulders at about the same level.
  for (let a = 0; a < highs.length - 2; a++) {
    const [s1, hd, s2] = [highs[a], highs[a + 1], highs[a + 2]]
    if (!(hd.v > s1.v * (1 + tol) && hd.v > s2.v * (1 + tol)) || !near(s1.v, s2.v, tol * 2)) continue
    const t1 = minBetween(candles, s1.i, hd.i), t2 = minBetween(candles, hd.i, s2.i)
    const neck = (t1.v + t2.v) / 2
    const breakI = brokeAt(candles, s2.i, neck, 'bear')
    if (breakI < 0 && candles.length - 1 - s2.i > 40) continue
    push({ kind: 'head_shoulders', side: 'bear', i: breakI >= 0 ? breakI : s2.i, points: [s1, t1, hd, t2, s2], neckline: neck, confirmed: breakI >= 0, breakI })
  }
  for (let a = 0; a < lows.length - 2; a++) {
    const [s1, hd, s2] = [lows[a], lows[a + 1], lows[a + 2]]
    if (!(hd.v < s1.v * (1 - tol) && hd.v < s2.v * (1 - tol)) || !near(s1.v, s2.v, tol * 2)) continue
    const p1 = maxBetween(candles, s1.i, hd.i), p2 = maxBetween(candles, hd.i, s2.i)
    const neck = (p1.v + p2.v) / 2
    const breakI = brokeAt(candles, s2.i, neck, 'bull')
    if (breakI < 0 && candles.length - 1 - s2.i > 40) continue
    push({ kind: 'inv_head_shoulders', side: 'bull', i: breakI >= 0 ? breakI : s2.i, points: [s1, p1, hd, p2, s2], neckline: neck, confirmed: breakI >= 0, breakI })
  }

  // A head and shoulders has double tops and bottoms inside it (its shoulders,
  // its two dips); keep the bigger pattern when a double one sits within it.
  const big = out.filter(p => p.kind.includes('head_shoulders'))
  const inside = (p, q) => p.points[0].i >= q.points[0].i && p.points.at(-1).i <= q.points.at(-1).i
  return out.filter(p => !(p.kind.startsWith('double_') && big.some(q => inside(p, q) || p.points.some(x => q.points.some(y => y.i === x.i)))))
    .sort((a, b) => a.i - b.i)
}

/**
 * Both families together. Candlestick patterns only when the candles are real
 * (close-only data has no wicks to read), and only over the recent tail.
 */
export function detectPatterns(candles, { closeOnly = false, candleTail = 120 } = {}) {
  if (!Array.isArray(candles) || candles.length < 3) return { candle: [], chart: [], recent: [] }
  const candle = closeOnly ? [] : detectCandlePatterns(candles, candles.length - candleTail)
  const chart = detectChartPatterns(candles)
  // The list under the chart is about now: chart patterns from the last 60
  // candles, candlestick ones from the last 10 (older ones stay drawn on the
  // chart). Newest first, a chart pattern before a candle on the same bar.
  const end = candles.length - 1
  const recent = [
    ...chart.filter(p => end - p.i <= 60).map(p => ({ ...p, family: 'chart' })),
    ...candle.filter(p => end - p.i <= 10).map(p => ({ ...p, family: 'candle' })),
  ].sort((a, b) => b.i - a.i || (a.family === 'chart' ? -1 : 1))
  return { candle, chart, recent }
}
