import { describe, it, expect } from 'vitest'
import {
  pillarTechnical, pillarVolume, pillarWhales, pillarOnchain, pillarFundamental,
  directionMeta, computeMagic, aggregateMagic,
} from './magicIndicator'

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
  it('returns null when no pillar has data', () => {
    expect(computeMagic({})).toBeNull()
  })
  it('produces a bullish composite when everything aligns', () => {
    const m = computeMagic({ ta: bullishTA, signals: bullishSignals, fundamental: goodFundamental })
    expect(m).not.toBeNull()
    expect(m.score).toBeGreaterThan(20)
    expect(m.direction.stance).toBe('bullish')
    expect(m.confidence).toBeGreaterThan(60)         // aligned pillars → high confidence
    expect(m.pillars.filter(p => p.available).length).toBe(5)
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
    expect(m.pillars.filter(p => p.available).length).toBe(1)
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
