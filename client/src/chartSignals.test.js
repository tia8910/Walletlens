import { describe, it, expect } from 'vitest'
import { computeChartSignals, rsiSeries, atrSeries, normalizeParams, candlesFromCloses, DEFAULT_CHART_PARAMS, signalOutcome, signalStats, trendRead } from './chartSignals'

// A price path with a clear fall then a clear rise: the fast EMA must cross
// the slow one upward during the rise, and RSI there is well above 50.
function vShape() {
  const closes = []
  for (let i = 0; i < 40; i++) closes.push(200 - i * 2)   // 200 → 122
  for (let i = 0; i < 40; i++) closes.push(122 + i * 3)   // 122 → 239
  return closes.map((c, i) => ({ t: i, o: i ? closes[i - 1] : c, h: c + 1, l: c - 1, c }))
}

describe('chart signals', () => {
  it('fires a BUY once trend and momentum turn up, with a stop below and targets above', () => {
    const { signals, last } = computeChartSignals(vShape(), DEFAULT_CHART_PARAMS)
    const buy = signals.find(s => s.side === 'buy')
    expect(buy).toBeTruthy()
    expect(buy.i).toBeGreaterThan(40)
    expect(buy.stop).toBeLessThan(buy.entry)
    expect(buy.targets).toHaveLength(3)
    const risk = buy.entry - buy.stop
    expect(buy.targets[0]).toBeCloseTo(buy.entry + risk)
    expect(buy.targets[2]).toBeCloseTo(buy.entry + 3 * risk)
    expect(last).toEqual(signals[signals.length - 1])
  })

  it('fires a SELL, with the stop above, on the reverse shape', () => {
    const inverted = vShape().map(c => ({ ...c, o: 400 - c.o, h: 400 - c.l, l: 400 - c.h, c: 400 - c.c }))
    const sell = computeChartSignals(inverted, DEFAULT_CHART_PARAMS).signals.find(s => s.side === 'sell')
    expect(sell).toBeTruthy()
    expect(sell.stop).toBeGreaterThan(sell.entry)
    expect(sell.targets[0]).toBeLessThan(sell.entry)
  })

  it('finds a golden cross when the mid EMA overtakes the slow one', () => {
    const closes = [...Array(260)].map((_, i) => i < 200 ? 300 - i : 100 + (i - 200) * 12)
    const candles = closes.map((c, i) => ({ t: i, o: c, h: c + 1, l: c - 1, c }))
    const { crosses } = computeChartSignals(candles, { cross: { fast: 21, mid: 55, slow: 200 } })
    expect(crosses.some(x => x.kind === 'golden')).toBe(true)
    expect(crosses.some(x => x.kind === 'small-golden')).toBe(true)
  })

  it('draws nothing for an indicator that is switched off', () => {
    const r = computeChartSignals(vShape(), { signals: { on: false }, cross: { on: false } })
    expect(r.signals).toEqual([])
    expect(r.crosses).toEqual([])
  })

  it('copes with too little history', () => {
    const r = computeChartSignals(vShape().slice(0, 4), DEFAULT_CHART_PARAMS)
    expect(r.signals).toEqual([])
    expect(r.crosses).toEqual([])
  })
})

describe('indicator series', () => {
  it('RSI is 100 on a straight rise and 0 on a straight fall', () => {
    const up = [...Array(30)].map((_, i) => i + 1)
    expect(rsiSeries(up, 14)[29]).toBe(100)
    expect(rsiSeries(up.slice().reverse(), 14)[29]).toBeCloseTo(0)
  })

  it('ATR of constant-range candles equals the range', () => {
    const c = [...Array(20)].map((_, i) => ({ o: 10, h: 12, l: 10, c: 11 }))
    expect(atrSeries(c, 5)[19]).toBeCloseTo(2)
  })
})

describe('settings', () => {
  it('keeps every number in range and fills gaps with defaults', () => {
    const p = normalizeParams({ signals: { fast: -3, atrMult: 99, targets: 'x' }, cross: { slow: 5000 } })
    expect(p.signals.fast).toBe(2)
    expect(p.signals.atrMult).toBe(5)
    expect(p.signals.targets).toBe(DEFAULT_CHART_PARAMS.signals.targets)
    expect(p.cross.slow).toBe(400)
    expect(p.cross.mid).toBe(55)
  })

  it('builds candles from a close-only series', () => {
    const c = candlesFromCloses([{ price: 10 }, { price: 12 }, { price: 0 }, { price: 9 }])
    expect(c.map(x => x.c)).toEqual([10, 12, 9])
    expect(c[1]).toMatchObject({ o: 10, h: 12, l: 10 })
  })
})

describe('signals alternate', () => {
  it('never fires two BUYs in a row', () => {
    const closes = [...Array(120)].map((_, i) => 100 + 30 * Math.sin(i / 7) + i * 0.2)
    const candles = closes.map((c, i) => ({ t: i, o: i ? closes[i - 1] : c, h: c + 1, l: c - 1, c }))
    const sides = computeChartSignals(candles, DEFAULT_CHART_PARAMS).signals.map(s => s.side)
    expect(sides.length).toBeGreaterThan(2)
    for (let i = 1; i < sides.length; i++) expect(sides[i]).not.toBe(sides[i - 1])
  })
})

describe('what became of a signal', () => {
  const c = (h, l, cl = (h + l) / 2) => ({ t: 0, o: cl, h, l, c: cl })
  const buy = { i: 0, side: 'buy', entry: 100, stop: 95, targets: [105, 110, 115] }

  it('counts the best target reached and keeps running', () => {
    const o = signalOutcome([c(101, 99), c(106, 100), c(111, 104)], buy)
    expect(o).toMatchObject({ status: 'tp', hit: 2, stopped: false, running: true })
  })

  it('calls a stop before any target stopped out', () => {
    expect(signalOutcome([c(101, 99), c(102, 94)], buy)).toMatchObject({ status: 'stopped', stopped: true })
  })

  it('reads a candle touching both the stop and a target as stopped, the cautious way', () => {
    expect(signalOutcome([c(101, 99), c(106, 94)], buy).status).toBe('stopped')
  })

  it('is replaced when the next signal comes first', () => {
    expect(signalOutcome([c(101, 99), c(102, 98), c(103, 97)], buy, 2).status).toBe('replaced')
  })

  it('works the other way round for a sell', () => {
    const sell = { i: 0, side: 'sell', entry: 100, stop: 105, targets: [95, 90] }
    expect(signalOutcome([c(101, 99), c(100, 89)], sell)).toMatchObject({ status: 'tp', hit: 2 })
  })

  it('sums up the track record over resolved signals only', () => {
    const st = signalStats([
      { outcome: { status: 'tp', hit: 1 } }, { outcome: { status: 'stopped', hit: 0 } },
      { outcome: { status: 'tp', hit: 3 } }, { outcome: { status: 'open', hit: 0 } },
    ])
    expect(st).toMatchObject({ n: 3, tp1: 2, stopped: 1 })
    expect(st.rate).toBeCloseTo(2 / 3)
  })

  it('reads the trend from the EMA stack and the long EMA', () => {
    expect(trendRead([10, 12], { fast: [11, 11.5], mid: [10, 11], slow: [9, 10] }, [55, 60])).toMatchObject({ dir: 'up', rsiZone: 'firm' })
    expect(trendRead([10, 8], { fast: [9, 8.5], mid: [10, 9], slow: [11, 10] }, [40, 25])).toMatchObject({ dir: 'down', rsiZone: 'oversold' })
    expect(trendRead([10, 10.5], { fast: [9, 10], mid: [10, 11], slow: [11, 10] }, [50, 50]).dir).toBe('mixed')
  })
})
