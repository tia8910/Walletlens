import { describe, it, expect } from 'vitest'
import {
  computeIndex, band, range, avg,
  cryptoPillar, equitiesPillar, volatilityPillar, macroPillar,
  WEIGHTS, EQUITY_SYMS, GROWTH_SYMS, USD_QUOTE_SYMS, USD_BASE_SYMS,
} from './marketIndexModel'

// The index is published as a citable figure, so the model has to be pinned by
// something other than "it looked about right on the day". These tests exist
// mostly to hold the SIGN of each signal: the whole reason this is a
// risk-appetite score rather than an average of percent-green is that gold, the
// dollar and the VIX all mean the opposite of what a naive reading gives, and
// every one of those is a one-character mistake away from being inverted.

const coin = (symbol, change, cap) => ({
  symbol, price_change_percentage_24h: change, market_cap: cap,
})

/** A crypto snapshot of `n` coins where `up` of them are green. */
function snapshot(n, up, move = 3) {
  return Array.from({ length: n }, (_, i) =>
    coin(`c${i}`, i < up ? move : -move, 1e9 - i))
}

const quotes = (obj) => obj

describe('range()', () => {
  it('maps a value onto 0-100 between two points', () => {
    expect(range(0, 0, 10)).toBe(0)
    expect(range(10, 0, 10)).toBe(100)
    expect(range(5, 0, 10)).toBe(50)
  })

  it('inverts when the reference points are reversed', () => {
    // This is load-bearing, not a convenience: every risk-off signal is
    // expressed by reversing the range rather than by a scattered `100 - x`.
    expect(range(12, 35, 12)).toBe(100)
    expect(range(35, 35, 12)).toBe(0)
  })

  it('clamps outside the reference points', () => {
    expect(range(-50, 0, 10)).toBe(0)
    expect(range(999, 0, 10)).toBe(100)
    expect(range(5, 35, 12)).toBe(100)   // a VIX below the calm anchor
  })

  it('returns null for a value that is not a number', () => {
    expect(range(undefined, 0, 10)).toBeNull()
    expect(range(NaN, 0, 10)).toBeNull()
  })
})

describe('avg()', () => {
  it('ignores nulls rather than treating them as zero', () => {
    // A missing quote must not drag an average towards the middle — that is
    // the same "absence read as data" bug the whole renormalising design
    // exists to avoid, one level down.
    expect(avg([2, null, 4])).toBe(3)
    expect(avg([null, undefined, NaN])).toBeNull()
    expect(avg([])).toBeNull()
  })
})

describe('the crypto pillar', () => {
  it('scores an all-green top 100 far above an all-red one', () => {
    const green = cryptoPillar(snapshot(100, 100)).value
    const red = cryptoPillar(snapshot(100, 0)).value
    expect(green).toBeGreaterThan(80)
    expect(red).toBeLessThan(20)
  })

  it('lands near the middle on an even split', () => {
    expect(cryptoPillar(snapshot(100, 50)).value).toBeGreaterThan(40)
    expect(cryptoPillar(snapshot(100, 50)).value).toBeLessThan(60)
  })

  it('is null with no snapshot', () => {
    expect(cryptoPillar([])).toBeNull()
    expect(cryptoPillar(null)).toBeNull()
  })
})

describe('the equities pillar', () => {
  const up = quotes(Object.fromEntries(EQUITY_SYMS.map(s => [s, { change: 1.2 }])))
  const down = quotes(Object.fromEntries(EQUITY_SYMS.map(s => [s, { change: -1.2 }])))

  it('reads a broad rally as risk-on and a broad selloff as risk-off', () => {
    expect(equitiesPillar(up).value).toBeGreaterThan(80)
    expect(equitiesPillar(down).value).toBeLessThan(20)
  })

  it('does not count the VIX as an index', () => {
    // A panic bid for protection must never read as broad equity strength.
    const vixOnly = equitiesPillar({ '^vix': { change: 40, close: 40 } })
    expect(vixOnly).toBeNull()
    expect(EQUITY_SYMS).not.toContain('^vix')
  })

  it('scores on whatever indices came back, not on all of them', () => {
    const partial = equitiesPillar({ '^spx': { change: 1.5 }, '^dax': { change: 1.5 } })
    expect(partial.detail.covered).toBe(2)
    expect(partial.value).toBeGreaterThan(80)
  })

  it('is null when no index quote arrived', () => {
    expect(equitiesPillar(null)).toBeNull()
    expect(equitiesPillar({})).toBeNull()
    expect(equitiesPillar({ '^spx': { change: null } })).toBeNull()
  })
})

describe('the volatility pillar', () => {
  it('reads a calm VIX as risk-on and a spiking one as risk-off', () => {
    expect(volatilityPillar({ '^vix': { close: 12 } }).value).toBe(100)
    expect(volatilityPillar({ '^vix': { close: 35 } }).value).toBe(0)
  })

  it('uses the VIX LEVEL, not its daily change', () => {
    // 12 → 14 is a 17% jump and still a placid tape. Scoring the change would
    // call that a collapse.
    const calmButJumpy = volatilityPillar({ '^vix': { close: 13, change: 17 } })
    expect(calmButJumpy.value).toBeGreaterThan(85)
  })

  it('treats a gold rally as a flight to safety, not as strength', () => {
    // The single most invertible line in the model.
    const goldUp = volatilityPillar({ xauusd: { change: 1.5 } }).value
    const goldDown = volatilityPillar({ xauusd: { change: -1.5 } }).value
    expect(goldUp).toBe(0)
    expect(goldDown).toBe(100)
  })

  it('weights the VIX above gold when both are present', () => {
    // Gold rises on dollar weakness and inflation too, neither of which is a
    // flight from risk, so it corroborates rather than decides.
    const calmVixHotGold = volatilityPillar({ '^vix': { close: 12 }, xauusd: { change: 1.5 } })
    expect(calmVixHotGold.value).toBe(60)
  })

  it('falls back to whichever of the two arrived', () => {
    expect(volatilityPillar({ xauusd: { change: 0 } }).value).toBe(50)
    expect(volatilityPillar({ '^vix': { close: 23.5 } }).value).toBeCloseTo(50, 0)
    expect(volatilityPillar({})).toBeNull()
  })
})

describe('the macro pillar', () => {
  it('reads a weakening dollar as risk-on', () => {
    // EURUSD up = the dollar is falling = looser conditions everywhere.
    const weak = macroPillar(Object.fromEntries(USD_QUOTE_SYMS.map(s => [s, { change: 0.8 }])))
    const strong = macroPillar(Object.fromEntries(USD_QUOTE_SYMS.map(s => [s, { change: -0.8 }])))
    expect(weak.value).toBe(100)
    expect(strong.value).toBe(0)
  })

  it('flips the sign for pairs quoted the other way round', () => {
    // USDJPY UP is a STRONGER dollar, so it must score the opposite of EURUSD
    // up. Getting this backwards would make the pillar read the dollar
    // inside-out with nothing on screen to give it away.
    const usdjpyUp = macroPillar({ usdjpy: { change: 0.8 } }).value
    const eurusdUp = macroPillar({ eurusd: { change: 0.8 } }).value
    expect(usdjpyUp).toBe(0)
    expect(eurusdUp).toBe(100)
    for (const s of USD_BASE_SYMS) expect(USD_QUOTE_SYMS).not.toContain(s)
  })

  it('reads copper and oil as growth demand', () => {
    const hot = macroPillar(Object.fromEntries(GROWTH_SYMS.map(s => [s, { change: 3 }])))
    const cold = macroPillar(Object.fromEntries(GROWTH_SYMS.map(s => [s, { change: -3 }])))
    expect(hot.value).toBe(100)
    expect(cold.value).toBe(0)
  })

  it('is null when neither half arrived', () => {
    expect(macroPillar({})).toBeNull()
    expect(macroPillar(null)).toBeNull()
  })
})

describe('the published score', () => {
  const allMarkets = {
    ...Object.fromEntries(EQUITY_SYMS.map(s => [s, { change: 1.2 }])),
    ...Object.fromEntries(GROWTH_SYMS.map(s => [s, { change: 3 }])),
    ...Object.fromEntries(USD_QUOTE_SYMS.map(s => [s, { change: 0.8 }])),
    ...Object.fromEntries(USD_BASE_SYMS.map(s => [s, { change: -0.8 }])),
    '^vix': { close: 12 },
    xauusd: { change: -1.5 },
  }

  it('weights the four pillars to exactly 1', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('reaches the extremes when every market agrees', () => {
    expect(computeIndex(snapshot(100, 100, 8), allMarkets).score).toBeGreaterThan(90)

    const riskOff = {
      ...Object.fromEntries(EQUITY_SYMS.map(s => [s, { change: -1.2 }])),
      ...Object.fromEntries(GROWTH_SYMS.map(s => [s, { change: -3 }])),
      ...Object.fromEntries(USD_QUOTE_SYMS.map(s => [s, { change: -0.8 }])),
      ...Object.fromEntries(USD_BASE_SYMS.map(s => [s, { change: 0.8 }])),
      '^vix': { close: 35 },
      xauusd: { change: 1.5 },
    }
    expect(computeIndex(snapshot(100, 0, 8), riskOff).score).toBeLessThan(10)
  })

  it('is no longer a crypto score wearing a cross-asset label', () => {
    // THE BUG THIS FILE EXISTS FOR: the page said "All markets, one page" over
    // a number that had never read a single non-crypto quote. Hold the same
    // crypto snapshot and move only the other markets — the score must move.
    const crypto = snapshot(100, 50)
    const withRiskOn = computeIndex(crypto, allMarkets).score
    const withRiskOff = computeIndex(crypto, {
      ...Object.fromEntries(EQUITY_SYMS.map(s => [s, { change: -1.2 }])),
      '^vix': { close: 35 },
      xauusd: { change: 1.5 },
    }).score
    expect(withRiskOn).toBeGreaterThan(withRiskOff + 25)
  })

  it('gives crypto no more than its 30% when everything is live', () => {
    const cryptoMax = computeIndex(snapshot(100, 100, 8), allMarkets)
    const cryptoMin = computeIndex(snapshot(100, 0, 8), allMarkets)
    // The whole crypto swing, everything else held identical, is bounded by
    // its weight. Before this change it was the entire score.
    expect(cryptoMax.score - cryptoMin.score).toBeLessThanOrEqual(31)
  })

  it('renormalises rather than scoring a missing pillar zero', () => {
    // Stooq comes through public CORS proxies and fails often. An outage must
    // not read as a market crash.
    const cryptoOnly = computeIndex(snapshot(100, 100, 8), null)
    expect(cryptoOnly.score).toBeGreaterThan(80)
    expect(cryptoOnly.live).toEqual(['crypto'])
    expect(cryptoOnly.coverage).toBeCloseTo(WEIGHTS.crypto, 10)
  })

  it('matches the crypto pillar exactly when only crypto is live', () => {
    const snap = snapshot(100, 63, 2)
    expect(computeIndex(snap, null).score).toBe(Math.round(cryptoPillar(snap).value))
  })

  it('reports which pillars it was built from', () => {
    const full = computeIndex(snapshot(100, 50), allMarkets)
    expect(full.live.sort()).toEqual(['crypto', 'equities', 'macro', 'volatility'])
    expect(full.coverage).toBeCloseTo(1, 10)
    expect(full.scores.equities).toBeGreaterThan(80)
  })

  it('still works with no crypto snapshot at all', () => {
    const noCrypto = computeIndex([], allMarkets)
    expect(noCrypto.live).not.toContain('crypto')
    expect(noCrypto.score).toBeGreaterThan(80)
    expect(noCrypto.totalMcap).toBe(0)
    expect(noCrypto.btcDom).toBeNull()
  })

  it('is null only when nothing at all arrived', () => {
    expect(computeIndex([], null)).toBeNull()
    expect(computeIndex(null, {})).toBeNull()
  })

  it('still reports the crypto figures the page prints beside the score', () => {
    const idx = computeIndex([
      coin('btc', 2, 1_000_000_000_000),
      coin('eth', -1, 400_000_000_000),
    ], null)
    expect(idx.gainers).toBe(1)
    expect(idx.losers).toBe(1)
    expect(idx.totalMcap).toBe(1_400_000_000_000)
    expect(idx.btcDom).toBeCloseTo(71.4, 1)
  })
})

describe('the verdict bands', () => {
  it('covers every score from 0 to 100 with no gap', () => {
    for (let s = 0; s <= 100; s++) {
      const b = band(s)
      expect(b.label, `score ${s}`).toBeTruthy()
      expect(b.color, `score ${s}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('keeps the five published labels', () => {
    // People have cited this index BY LABEL since it launched. Renaming the
    // bands under a score that now means something new would silently
    // invalidate every citation already in print.
    expect([0, 30, 50, 60, 90].map(band).map(b => b.label)).toEqual([
      'Extreme Caution', 'Caution', 'Neutral', 'Constructive', 'Overheated',
    ])
  })

  it('no longer describes the notes in crypto-only terms', () => {
    // The notes said "most coins are under pressure" on a score that now reads
    // equities, metals, forex and commodities too.
    for (const s of [0, 30, 50, 60, 90]) {
      expect(band(s).note).not.toMatch(/\bcoins?\b/i)
    }
  })
})
