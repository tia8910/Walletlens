import { describe, it, expect, beforeAll } from 'vitest'
import {
  pillarTechnical, pillarVolume, pillarWhales, pillarOnchain, pillarFundamental,
  directionMeta, computeMagic, aggregateMagic,
} from './magicIndicator'
import { translations, loadLanguage } from './i18n'

// ar/fr/es load lazily at runtime (see i18n.js); pull all three into memory
// before any assertion below reads translations[lang] directly.
beforeAll(() => Promise.all(['ar', 'fr', 'es'].map(loadLanguage)))

const bullishTA = { score: 60, trend: 'uptrend', rsi: 58, macd: { cross: 'bullish' } }
const bearishTA = { score: -60, trend: 'downtrend', rsi: 32, macd: { cross: 'bearish' } }

const bullishSignals = { volPulse: 1.8, momentum: 0.05, adNormalized: 0.6, whaleScore: 65 }
const bearishSignals = { volPulse: 1.6, momentum: -0.05, adNormalized: -0.6, whaleScore: -65 }

const goodFundamental = {
  marketCap: 5e10, fdv: 5.2e10, totalVolume: 5e9,
  circulatingSupply: 95, maxSupply: 100, marketCapRank: 8,
  athChangePct: -40, change30d: 15,
}
const dilutiveFundamental = {
  marketCap: 1e8, fdv: 1e9, totalVolume: 5e5,
  circulatingSupply: 20, maxSupply: 100, marketCapRank: 600,
  athChangePct: -92, change30d: -30,
}

describe('individual pillars', () => {
  it('technical pillar passes through the TA score', () => {
    expect(pillarTechnical(bullishTA)).toMatchObject({ available: true, score: 60 })
    expect(pillarTechnical(null).available).toBe(false)
  })
  it('volume pillar is positive when volume confirms an up move', () => {
    expect(pillarVolume(bullishSignals).score).toBeGreaterThan(0)
    expect(pillarVolume(bearishSignals).score).toBeLessThan(0)
    expect(pillarVolume(undefined).available).toBe(false)
  })
  it('volume pillar falls back to fundamentals turnover when volPulse is missing', () => {
    // No smart-signals (rate-limited chart fetch) but fundamentals present.
    const up = pillarVolume(null, { marketCap: 5e10, totalVolume: 5e9, change24h: 3 })
    expect(up.available).toBe(true)
    expect(up.score).toBeGreaterThan(0)
    expect(up.note).toMatch(/turnover/)
    const down = pillarVolume(null, { marketCap: 5e10, totalVolume: 5e9, change24h: -3 })
    expect(down.score).toBeLessThan(0)
    // Still n/a when neither signals nor usable fundamentals exist.
    expect(pillarVolume(null, { marketCap: 0, totalVolume: 0 }).available).toBe(false)
  })
  it('whale pillar mirrors the whale score', () => {
    expect(pillarWhales(bullishSignals).score).toBe(65)
    expect(pillarWhales(bearishSignals).score).toBe(-65)
  })
  it('on-chain pillar reflects flow + supply/turnover', () => {
    expect(pillarOnchain(bullishSignals, goodFundamental).score).toBeGreaterThan(0)
    expect(pillarOnchain(bearishSignals, dilutiveFundamental).score).toBeLessThan(0)
    expect(pillarOnchain(null, null).available).toBe(false)
  })
  it('fundamental pillar rewards blue chips and penalises dilutive micro-caps', () => {
    expect(pillarFundamental(goodFundamental).score).toBeGreaterThan(0)
    expect(pillarFundamental(dilutiveFundamental).score).toBeLessThan(0)
    expect(pillarFundamental({ marketCap: 0 }).available).toBe(false)
  })
})

describe('directionMeta', () => {
  it('maps scores to labels', () => {
    expect(directionMeta(70).label).toBe('Strong Buy')
    expect(directionMeta(25).label).toBe('Accumulate')
    expect(directionMeta(0).label).toBe('Neutral')
    expect(directionMeta(-25).label).toBe('Reduce')
    expect(directionMeta(-70).label).toBe('Distribute')
  })
})

describe('computeMagic', () => {
  it('returns a neutral zero-coverage read when no pillar has data', () => {
    const m = computeMagic({})
    expect(m.score).toBe(0)
    expect(m.confidence).toBe(0)
    expect(m.coverage).toBe(0)
    expect(m.pillars.every(p => p.estimated)).toBe(true)
  })
  it('produces a bullish composite when everything aligns', () => {
    const m = computeMagic({ ta: bullishTA, signals: bullishSignals, fundamental: goodFundamental })
    expect(m).not.toBeNull()
    expect(m.score).toBeGreaterThan(20)
    expect(m.direction.stance).toBe('bullish')
    expect(m.confidence).toBeGreaterThan(60)         // aligned pillars → high confidence
    expect(m.pillars.filter(p => p.available).length).toBe(8)
  })
  it('produces a bearish composite when everything is negative', () => {
    const m = computeMagic({ ta: bearishTA, signals: bearishSignals, fundamental: dilutiveFundamental })
    expect(m.score).toBeLessThan(-20)
    expect(m.direction.stance).toBe('bearish')
    expect(m.confidence).toBeGreaterThan(60)
  })
  it('lowers confidence when pillars conflict', () => {
    const aligned = computeMagic({ ta: bullishTA, signals: bullishSignals, fundamental: goodFundamental })
    const conflicted = computeMagic({ ta: bullishTA, signals: bearishSignals, fundamental: dilutiveFundamental })
    expect(conflicted.confidence).toBeLessThan(aligned.confidence)
  })
  it('works with partial data (technical only)', () => {
    const m = computeMagic({ ta: bullishTA })
    expect(m).not.toBeNull()
    expect(m.coverage).toBeLessThan(100)
    // Pillars always render (estimated fillers), but only one has real data.
    expect(m.pillars.filter(p => !p.estimated).length).toBe(1)
  })
})

describe('aggregateMagic', () => {
  it('value-weights per-asset directions', () => {
    const big = computeMagic({ ta: bullishTA, signals: bullishSignals, fundamental: goodFundamental })
    const small = computeMagic({ ta: bearishTA, signals: bearishSignals, fundamental: dilutiveFundamental })
    const agg = aggregateMagic([
      { value: 9000, magic: big },
      { value: 100, magic: small },
    ])
    expect(agg.assets).toBe(2)
    expect(agg.score).toBeGreaterThan(0)   // dominated by the large bullish position
  })
  it('returns null with no usable items', () => {
    expect(aggregateMagic([])).toBeNull()
    expect(aggregateMagic([{ value: 0, magic: null }])).toBeNull()
  })
})

// ── Pillar labels ──────────────────────────────────────────────────────────
//
// computeMagic rebuilds each pillar object field by field rather than
// spreading the definition, so a field left out of that mapper vanishes
// silently. labelKey did exactly that: the build stayed green, the rows kept
// their dot, bar and score, and only the name disappeared — in every language,
// because t(undefined) returns undefined and React renders nothing for it.
//
// The mapper has TWO return statements, one per branch. Calling computeMagic
// with no data only ever reaches the second, so the first version of this test
// passed happily while the live branch was broken. Both branches are covered
// here, and each is asserted to be non-empty so neither can go vacuous again.
describe('every pillar carries a resolvable label key', () => {
  const CLASSES = ['crypto', 'stock', 'metal']
  const LANGS = ['en', 'ar', 'fr', 'es']

  // Enough signal to push at least one pillar down the `available` path.
  const LIVE = {
    ta: { rsi: 62, macd: { hist: 0.4 }, sma20: 100, sma50: 95, sma200: 80, price: 105,
          trend: 'uptrend', bb: { upper: 110, lower: 90 }, adx: 28, stoch: { k: 60, d: 55 }, atr: 2 },
    signals: { volume24h: 1e9, volumeChange: 0.3, whaleNet: 2e6, activeAddresses: 5e5, socialScore: 60 },
    fundamental: { marketCap: 2e11, circulating: 19e6, maxSupply: 21e6, pe: 20, eps: 5,
                   dividendYield: 0.01, sectorPerf: 0.03 },
  }

  it('the live fixture really does reach the available branch', () => {
    // Without this the branch coverage below is a claim, not a fact.
    const live = ['crypto', 'metal']
      .map(assetClass => computeMagic({ ...LIVE, assetClass }).pillars.filter(p => p.quality !== 'none'))
    expect(live.every(ps => ps.length > 0)).toBe(true)
  })

  for (const assetClass of CLASSES) {
    for (const [branch, args] of [['neutral', {}], ['live', LIVE]]) {
      it(`${assetClass} pillars all have labelKey (${branch} branch)`, () => {
        const pillars = computeMagic({ ...args, assetClass }).pillars
        expect(pillars.length).toBeGreaterThan(3)
        expect(pillars.filter(p => !p.labelKey).map(p => p.key)).toEqual([])
      })
    }

    for (const lang of LANGS) {
      it(`${assetClass} pillar labels resolve in ${lang}`, () => {
        const pillars = computeMagic({ ...LIVE, assetClass }).pillars
        const unresolved = pillars
          .filter(p => typeof translations[lang][p.labelKey] !== 'string')
          .map(p => `${p.key} → ${p.labelKey}`)
        expect(unresolved).toEqual([])
      })
    }
  }
})
