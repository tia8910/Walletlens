import { describe, it, expect } from 'vitest'
import { detectCandlePatterns, detectChartPatterns, detectPatterns, pivots, PATTERN_SIDE } from './chartPatterns'

// Candles from closes: open is the previous close, wicks a little past the body.
const fromCloses = (closes, wick = 0.3) => closes.map((c, i) => {
  const o = i ? closes[i - 1] : c
  return { t: i, o, c, h: Math.max(o, c) + wick, l: Math.min(o, c) - wick }
})
// A path through waypoints, `step` candles per leg.
const path = (pts, step = 6) => {
  const out = [pts[0]]
  for (let k = 1; k < pts.length; k++) for (let j = 1; j <= step; j++) out.push(pts[k - 1] + ((pts[k] - pts[k - 1]) * j) / step)
  return out
}

describe('candlestick patterns', () => {
  it('finds a bullish engulfing at the end of a fall', () => {
    const cs = fromCloses([110, 108, 106, 104, 102, 100, 99])
    cs.push({ t: 7, o: 98.5, c: 101.5, h: 101.8, l: 98.2 })
    const hit = detectCandlePatterns(cs).at(-1)
    expect(hit).toMatchObject({ kind: 'bull_engulf', i: 7, side: 'bull' })
  })

  it('finds a bearish engulfing at the end of a rise', () => {
    const cs = fromCloses([90, 92, 94, 96, 98, 100, 101])
    cs.push({ t: 7, o: 101.5, c: 98.5, h: 101.8, l: 98.2 })
    expect(detectCandlePatterns(cs).at(-1)).toMatchObject({ kind: 'bear_engulf', side: 'bear' })
  })

  it('finds a hammer after a fall and a shooting star after a rise', () => {
    const down = fromCloses([110, 108, 106, 104, 102, 100])
    down.push({ t: 6, o: 99.6, c: 100, h: 100.1, l: 96 })
    expect(detectCandlePatterns(down).at(-1)).toMatchObject({ kind: 'hammer', side: 'bull' })
    const up = fromCloses([90, 92, 94, 96, 98, 100])
    up.push({ t: 6, o: 100.4, c: 100, h: 104, l: 99.9 })
    expect(detectCandlePatterns(up).at(-1)).toMatchObject({ kind: 'shooting_star', side: 'bear' })
  })

  it('finds a morning star', () => {
    const cs = fromCloses([112, 110, 108, 106, 104])
    cs.push({ t: 5, o: 104, c: 100, h: 104.2, l: 99.8 })     // big red
    cs.push({ t: 6, o: 99.8, c: 99.9, h: 100.3, l: 99.4 })   // pause
    cs.push({ t: 7, o: 100, c: 103.5, h: 103.7, l: 99.9 })   // big green past the middle
    expect(detectCandlePatterns(cs).map(p => p.kind)).toContain('morning_star')
  })

  it('reads nothing into a quiet, steady line', () => {
    const cs = fromCloses(Array.from({ length: 40 }, (_, i) => 100 + i * 0.1))
    expect(detectCandlePatterns(cs)).toEqual([])
  })
})

describe('chart patterns', () => {
  it('finds swing highs and lows', () => {
    const { highs, lows } = pivots(fromCloses(path([100, 120, 100, 120, 100])))
    expect(highs.length).toBe(2)
    expect(lows.length).toBe(1)
  })

  it('finds a double top and confirms it once the neckline breaks', () => {
    const forming = detectChartPatterns(fromCloses(path([90, 100, 120, 105, 120, 110])))
    const top = forming.find(p => p.kind === 'double_top')
    expect(top).toBeTruthy()
    expect(top.confirmed).toBe(false)
    const broke = detectChartPatterns(fromCloses(path([90, 100, 120, 105, 120, 98])))
    expect(broke.find(p => p.kind === 'double_top')).toMatchObject({ confirmed: true, side: 'bear' })
  })

  it('finds a double bottom', () => {
    const ps = detectChartPatterns(fromCloses(path([130, 120, 100, 115, 100, 118])))
    expect(ps.find(p => p.kind === 'double_bottom')).toMatchObject({ side: 'bull', confirmed: true })
  })

  it('finds a head and shoulders, not two double tops inside it', () => {
    const ps = detectChartPatterns(fromCloses(path([90, 100, 115, 103, 130, 103, 115, 95])))
    const hs = ps.find(p => p.kind === 'head_shoulders')
    expect(hs).toMatchObject({ side: 'bear', confirmed: true })
    expect(hs.points.length).toBe(5)
    expect(ps.some(p => p.kind === 'double_top' || p.kind === 'double_bottom')).toBe(false)
  })

  it('finds an inverse head and shoulders', () => {
    const ps = detectChartPatterns(fromCloses(path([140, 130, 115, 127, 100, 127, 115, 135])))
    expect(ps.find(p => p.kind === 'inv_head_shoulders')).toMatchObject({ side: 'bull', confirmed: true })
  })
})

describe('both together', () => {
  it('skips candlestick patterns on close-only data and lists newest first', () => {
    const cs = fromCloses(path([90, 100, 120, 105, 120, 98]))
    const r = detectPatterns(cs, { closeOnly: true })
    expect(r.candle).toEqual([])
    expect(r.recent.length).toBeGreaterThan(0)
    for (let k = 1; k < r.recent.length; k++) expect(r.recent[k - 1].i).toBeGreaterThanOrEqual(r.recent[k].i)
  })

  it('lists only recent patterns under the chart', () => {
    const cs = fromCloses(path([90, 100, 120, 105, 120, 98, 98, 98, 98, 98, 98, 98, 98, 98, 98, 98, 98], 6))
    const r = detectPatterns(cs)
    expect(r.chart.length).toBeGreaterThan(0)
    expect(r.recent.every(p => cs.length - 1 - p.i <= 60)).toBe(true)
  })

  it('gives every pattern a side', () => {
    for (const k of Object.keys(PATTERN_SIDE)) expect(['bull', 'bear']).toContain(PATTERN_SIDE[k])
  })
})
