import { describe, it, expect } from 'vitest'
import {
  FLAT_BAND_24H, FLAT_BAND_7D, sevenDayMap, trendFor, trendLabelKey,
} from './assetTrend.js'

describe('trendFor', () => {
  it('prefers the 7-day window and says so', () => {
    const t = trendFor({ pct24h: -0.4, pct7d: 9 })
    expect(t.dir).toBe('up')
    expect(t.basis).toBe('7d')
    expect(t.pct).toBe(9)
  })

  it('falls back to 24h when there is no weekly number', () => {
    // Stocks, metals and coins outside market.json's top 250 land here.
    const t = trendFor({ pct24h: 4 })
    expect(t.dir).toBe('up')
    expect(t.basis).toBe('24h')
  })

  it('does not call a day of noise a trend', () => {
    // The whole reason the module exists. A stablecoin drifting, or a stock
    // closing a fraction up, must not sit next to a position wearing an arrow.
    expect(trendFor({ pct24h: 0.3 }).dir).toBe('flat')
    expect(trendFor({ pct24h: -0.9 }).dir).toBe('flat')
    expect(trendFor({ pct24h: 1.2 }).dir).toBe('flat')
  })

  it('holds the 24h band wider than the 7d one', () => {
    // One day has to move further than a week before it means anything.
    expect(FLAT_BAND_24H).toBeGreaterThan(0)
    expect(trendFor({ pct7d: 1.9 }).dir).toBe('flat')
    expect(trendFor({ pct7d: 2.1 }).dir).toBe('up')
    expect(trendFor({ pct24h: 1.4 }).dir).toBe('flat')
    expect(trendFor({ pct24h: 1.6 }).dir).toBe('up')
  })

  it('gives a flat reading zero strength', () => {
    expect(trendFor({ pct24h: 0.2 }).strength).toBe(0)
  })

  it('scales strength from the edge of the band, not from zero', () => {
    // A move that barely clears the band should draw a faint arrow, not a
    // one-seventh-strength one, or everything looks equally emphatic.
    const just = trendFor({ pct7d: FLAT_BAND_7D + 0.1 })
    expect(just.strength).toBeLessThan(0.05)
    const strong = trendFor({ pct7d: 40 })
    expect(strong.strength).toBe(1)
  })

  it('never exceeds full strength however extreme the move', () => {
    for (const pct of [15, 60, 400, -400]) {
      const t = trendFor({ pct7d: pct })
      expect(t.strength).toBeLessThanOrEqual(1)
      expect(t.strength).toBeGreaterThanOrEqual(0)
    }
  })

  it('flags a weekly rally the last day contradicts', () => {
    const t = trendFor({ pct24h: -6, pct7d: 12 })
    expect(t.dir).toBe('up')
    expect(t.diverging).toBe(true)
  })

  it('does not flag divergence on a day that has not moved', () => {
    expect(trendFor({ pct24h: -0.5, pct7d: 12 }).diverging).toBe(false)
  })

  it('cannot diverge without a second window to disagree with', () => {
    expect(trendFor({ pct24h: 9 }).diverging).toBe(false)
  })

  it('survives missing, null and unusable input', () => {
    for (const input of [undefined, {}, { pct24h: null }, { pct24h: NaN }, { pct7d: null }]) {
      const t = trendFor(input)
      expect(t.dir).toBe('flat')
      expect(t.basis).toBe('24h')
      expect(Number.isFinite(t.strength)).toBe(true)
    }
  })

  it('treats a real zero as flat rather than as missing', () => {
    const t = trendFor({ pct24h: 3, pct7d: 0 })
    expect(t.basis).toBe('7d')
    expect(t.dir).toBe('flat')
  })
})

describe('trendLabelKey', () => {
  it('maps every direction to a key, so no row hardcodes English', () => {
    expect(trendLabelKey('up')).toBe('trendUp')
    expect(trendLabelKey('down')).toBe('trendDown')
    expect(trendLabelKey('flat')).toBe('trendFlat')
    expect(trendLabelKey(undefined)).toBe('trendFlat')
  })
})

describe('sevenDayMap', () => {
  it('keys the weekly change by coin id', () => {
    const m = sevenDayMap([
      { id: 'bitcoin', price_change_percentage_7d_in_currency: 4.5 },
      { id: 'ethereum', price_change_percentage_7d_in_currency: -2.1 },
    ])
    expect(m).toEqual({ bitcoin: 4.5, ethereum: -2.1 })
  })

  it('drops rows with no usable weekly number rather than storing zero', () => {
    // Storing 0 would claim the coin is flat, and trendFor would believe it
    // instead of falling back to the 24h window it does have.
    const m = sevenDayMap([
      { id: 'a', price_change_percentage_7d_in_currency: null },
      { id: 'b' },
      { id: 'c', price_change_percentage_7d_in_currency: 3 },
    ])
    expect(m).toEqual({ c: 3 })
  })

  it('survives junk instead of an array', () => {
    expect(sevenDayMap(null)).toEqual({})
    expect(sevenDayMap({ coins: [] })).toEqual({})
  })
})
