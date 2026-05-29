import { describe, it, expect } from 'vitest'
import {
  sma, ema, rsi, macd, bollinger, supportResistance,
  analyzeTechnicals, buildTASellPlan,
} from './technicals'

// Test series:
//  - ramp: strictly rising (extreme — ends overbought, pinned above bands)
//  - drop: strictly falling
//  - healthy: a rising trend with normal pullbacks (RSI/bands stay moderate)
//  - accel: an accelerating uptrend (MACD line leads its signal → hist > 0)
const ramp = Array.from({ length: 60 }, (_, i) => 100 + i)
const drop = Array.from({ length: 60 }, (_, i) => 160 - i)
const healthy = Array.from({ length: 60 }, (_, i) => 100 + i * 0.7 + 5 * Math.sin(i / 4))
const accel = Array.from({ length: 60 }, (_, i) => 100 + i * i * 0.05)

describe('sma / ema', () => {
  it('sma averages the last N values', () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5)
    expect(sma([1, 2], 5)).toBeNull()
  })
  it('ema is defined once enough data exists and tracks the series', () => {
    expect(ema([1, 2], 5)).toBeNull()
    const e = ema(ramp, 10)
    expect(e).toBeGreaterThan(100)
    expect(e).toBeLessThan(ramp[ramp.length - 1])
  })
})

describe('rsi', () => {
  it('returns 100 for a strictly rising series (no losses)', () => {
    expect(rsi(ramp, 14)).toBe(100)
  })
  it('returns 0 for a strictly falling series (no gains)', () => {
    expect(rsi(drop, 14)).toBe(0)
  })
  it('is null when there is not enough data', () => {
    expect(rsi([1, 2, 3], 14)).toBeNull()
  })
})

describe('macd', () => {
  it('has a positive line in any uptrend and a positive histogram when accelerating', () => {
    const linear = macd(ramp)
    expect(linear).not.toBeNull()
    expect(linear.line).toBeGreaterThan(0)        // fast EMA above slow in an uptrend
    const m = macd(accel)
    expect(m.hist).toBeGreaterThan(0)             // line leads signal when accelerating
  })
  it('is null on short series', () => {
    expect(macd([1, 2, 3, 4, 5])).toBeNull()
  })
})

describe('bollinger', () => {
  it('reports band position; price at a fresh high sits near/above the top', () => {
    const bb = bollinger(ramp, 20, 2)
    expect(bb).not.toBeNull()
    expect(bb.upper).toBeGreaterThan(bb.mid)
    expect(bb.mid).toBeGreaterThan(bb.lower)
    expect(bb.pctB).toBeGreaterThan(0.8)
  })
})

describe('supportResistance', () => {
  it('puts resistance above and support below the current price', () => {
    const series = [10, 12, 9, 14, 8, 13, 7, 15, 6, 11, 5, 16, 4, 12, 10]
    const cur = 10
    const sr = supportResistance(series, cur)
    sr.resistances.forEach((r) => expect(r).toBeGreaterThan(cur))
    sr.supports.forEach((s) => expect(s).toBeLessThan(cur))
  })
})

describe('analyzeTechnicals', () => {
  it('returns null on too little data', () => {
    expect(analyzeTechnicals([1, 2, 3], 3)).toBeNull()
  })
  it('marks a relentless vertical rise as overbought / stretched (negative score)', () => {
    const ta = analyzeTechnicals(ramp, ramp[ramp.length - 1])
    expect(ta).not.toBeNull()
    expect(ta.trend).toBe('uptrend')
    expect(ta.rsiState).toBe('overbought')
    expect(ta.score).toBeLessThan(0)   // stretched = distribution lean
  })
  it('scores a healthy uptrend (with pullbacks) as constructive', () => {
    const ta = analyzeTechnicals(healthy, healthy[healthy.length - 1])
    expect(ta.trend).toBe('uptrend')
    expect(ta.rsi).toBeGreaterThan(45)
    expect(ta.score).toBeGreaterThan(0)
  })
  it('flags a downtrend for a falling series', () => {
    const ta = analyzeTechnicals(drop, drop[drop.length - 1])
    expect(ta.trend).toBe('downtrend')
    expect(ta.rsi).toBeLessThan(40)
  })
})

describe('buildTASellPlan', () => {
  it('derives a take-profit plan when overbought / above bands', () => {
    const ta = analyzeTechnicals(ramp, ramp[ramp.length - 1])
    const plan = buildTASellPlan(ta, { currentPrice: ramp[ramp.length - 1], avgCost: 100, pnlPct: 50, weight: 5 })
    expect(plan.action).toBeTruthy()
    expect(Array.isArray(plan.targets)).toBe(true)
    expect(plan.targets.length).toBeGreaterThan(0)
    expect(typeof plan.reason).toBe('string')
    expect(['high', 'medium', 'low']).toContain(plan.urgency)
  })
  it('bumps urgency for an oversized position', () => {
    const ta = analyzeTechnicals(ramp, ramp[ramp.length - 1])
    const plan = buildTASellPlan(ta, { currentPrice: ramp[ramp.length - 1], avgCost: 100, pnlPct: 5, weight: 40 })
    expect(plan.urgency).not.toBe('low')
  })
})
