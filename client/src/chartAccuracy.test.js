import { describe, it, expect } from 'vitest'
import { rsiSeries, atrSeries, weeklyFromDaily, matchesLivePrice, candlesFromCloses } from './chartSignals'
import { emaSeries } from './technicals'
import { fmt } from './components/SignalChart'

// Accuracy of what the Technicals chart draws, checked against outside
// references rather than against itself.

describe('RSI matches the published Wilder reference', () => {
  // StockCharts' worked RSI(14) example: the first value lands on the 15th
  // close, then Wilder smoothing carries it on.
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
    45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22]
  const r = rsiSeries(closes, 14)
  // The published table rounds the average gain and loss to two decimals
  // midway (70.53, 66.32, …); exact arithmetic gives the values below, which
  // a hand calculation reproduces. Within 0.1 of the published ones either way.
  it('gives the exact Wilder values', () => {
    expect(r.slice(14).map(v => +v.toFixed(2))).toEqual([70.46, 66.25, 66.48, 69.35, 66.29])
  })
  it('stays within 0.1 of the published table', () => {
    const published = [70.53, 66.32, 66.55, 69.41, 66.36]
    r.slice(14).forEach((v, i) => expect(Math.abs(v - published[i])).toBeLessThan(0.1))
  })
})

describe('EMA', () => {
  it('starts from the simple average, then smooths by 2/(n+1)', () => {
    const e = emaSeries([1, 2, 3, 4, 5, 6], 3)
    expect(e[2]).toBe(2)                       // SMA of 1, 2, 3
    expect(e[3]).toBeCloseTo(4 * 0.5 + 2 * 0.5) // k = 0.5
    expect(e[5]).toBeCloseTo(5)
  })
})

describe('ATR', () => {
  it('uses the true range, so a gap counts', () => {
    const c = [{ h: 10, l: 9, c: 9.5 }, { h: 12, l: 11.5, c: 12 }, { h: 12.2, l: 11.8, c: 12 }]
    const a = atrSeries(c, 2)
    // TR: 1, then max(0.5, |12-9.5|, |11.5-9.5|) = 2.5 → first ATR (1 + 2.5) / 2
    expect(a[1]).toBeCloseTo(1.75)
  })
})

describe('the chart shows the coin it says', () => {
  const at = (c) => [{ c: 1 }, { c }]
  it('accepts candles whose last close is near the live price', () => {
    expect(matchesLivePrice(at(101), 100)).toBe(true)
  })
  it('rejects a same-ticker coin priced elsewhere', () => {
    expect(matchesLivePrice(at(0.42), 100)).toBe(false)
    expect(matchesLivePrice(at(120), 100)).toBe(false)
  })
  it('does not reject when there is no live price to compare', () => {
    expect(matchesLivePrice(at(0.42), 0)).toBe(true)
  })
})

describe('1W from daily closes', () => {
  // 2026-09-28 is a Monday.
  const days = ['2026-09-28', '2026-09-29', '2026-10-02', '2026-10-05', '2026-10-06']
  const daily = candlesFromCloses(days.map((d, i) => ({ t: d, price: [10, 12, 9, 11, 13][i] })))
  const w = weeklyFromDaily(daily)
  it('makes one candle per Monday to Sunday week', () => {
    expect(w).toHaveLength(2)
  })
  it('keeps the week’s open, high, low and last close', () => {
    expect(w[0]).toMatchObject({ o: 10, h: 12, l: 9, c: 9 })
    expect(w[1]).toMatchObject({ h: 13, c: 13 })
  })
})

describe('level labels keep their precision', () => {
  it('does not round a tiny price by several percent', () => {
    const shown = Number(fmt(0.0000085123).replace(/[^\d.]/g, ''))
    expect(Math.abs(shown / 0.0000085123 - 1)).toBeLessThan(0.001)
  })
  it('keeps two decimals from 1 up, none from 1000 up', () => {
    expect(fmt(84477.3)).toMatch(/^84,?477$/)
    expect(fmt(2.5)).toBe('2.50')
  })
})
