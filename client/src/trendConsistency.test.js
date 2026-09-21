import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { trendFor, FLAT_BAND_7D, FLAT_BAND_24H } from './assetTrend'

// A holding row showed three trend indicators driven by two different windows.
//
// The pill read pct24h with a ±0.5% band. The chevron beside it and the TREND
// row below it came from trendFor(), which prefers the 7-day window and uses a
// ±2% band. So WLD read "Uptrend 7-day +3.0%" next to a red DOWNTREND pill,
// and APT a green UPTREND pill next to "Flat". Both statements were true about
// different periods, which is not something a reader can work out from badges.

const here = dirname(fileURLToPath(import.meta.url))
const dash = readFileSync(join(here, 'pages/Dashboard.jsx'), 'utf8')

describe('a holding reports one trend', () => {
  it('derives the pill from the same reading as the chevron and the row', () => {
    expect(dash).toMatch(/const holdingTrend = trendFor\(\{ pct24h: h\.pct24h, pct7d: sevenDay\[h\.coin_id\] \}\)/)
    expect(dash).toMatch(/const trendStatus = holdingTrend\.dir/)
  })

  it('no longer computes a second direction from a different window', () => {
    expect(dash).not.toMatch(/trendVal > 0\.5 \? 'up' : trendVal < -0\.5 \? 'down' : 'flat'/)
  })

  it('computes that reading once and shares it', () => {
    // Three call sites recomputing the same thing is also three chances for
    // them to drift apart again.
    expect(dash.match(/trendFor\(\{ pct24h: h\.pct24h/g)).toHaveLength(1)
    expect(dash).toMatch(/<TrendArrow trend=\{holdingTrend\} \/>/)
    expect(dash).toMatch(/trend=\{holdingTrend\}\n\s+points=/)
  })
})

describe('the reading the row and the pill now share', () => {
  it('reads the 7-day window when there is one', () => {
    expect(trendFor({ pct24h: -3, pct7d: 3 }).basis).toBe('7d')
    expect(trendFor({ pct24h: -3, pct7d: 3 }).dir).toBe('up')
  })

  it('falls back to 24 hours when there is not', () => {
    expect(trendFor({ pct24h: -3 }).basis).toBe('24h')
    expect(trendFor({ pct24h: -3 }).dir).toBe('down')
  })

  it('calls the WLD case up, not down', () => {
    // 7-day +3.0% clears the 2% band; the 24h dip does not get a vote.
    const t = trendFor({ pct24h: -0.8, pct7d: 3.0 })
    expect(t.dir).toBe('up')
    expect(FLAT_BAND_7D).toBe(2)
  })

  it('calls the APT case flat, not up', () => {
    // 7-day +0.9% is inside the band, however big the one-day move was.
    expect(trendFor({ pct24h: 16.7, pct7d: 0.9 }).dir).toBe('flat')
  })

  it('still marks a genuine divergence, which is where it belongs', () => {
    const t = trendFor({ pct24h: -0.8, pct7d: 3.0 })
    // -0.8 is inside the 24h noise band, so this is not a disagreement worth
    // flagging.
    expect(FLAT_BAND_24H).toBe(1.5)
    expect(t.diverging).toBe(false)
    // This one is: both windows cleared their own noise and point apart.
    expect(trendFor({ pct24h: -4, pct7d: 3.0 }).diverging).toBe(true)
  })
})
