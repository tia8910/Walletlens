import { describe, it, expect } from 'vitest'
import { pulseReading, pulseLevel, recordPulse } from './portfolioPulse'

describe('portfolio pulse', () => {
  it('weights each move by its share of the portfolio and names the drivers', () => {
    const r = pulseReading([
      { coin_symbol: 'zec', value: 100, pct24h: -17 },
      { coin_symbol: 'btc', value: 900, pct24h: -2 },
      { coin_symbol: 'gone', value: 0, pct24h: -50 },
    ], 1000)
    expect(r.rms).toBeCloseTo(Math.sqrt(0.1 * 289 + 0.9 * 4))
    expect(r.contributors[0].sym).toBe('ZEC')
    expect(r.contributors.map(c => c.sym)).not.toContain('GONE')
    expect(r.contributors.reduce((s, c) => s + c.share, 0)).toBeCloseTo(100)
  })

  it('uses the fixed scale until it has five days of your own readings', () => {
    expect(pulseLevel(5, { '2026-11-19': 1 }, '2026-11-20')).toMatchObject({ level: 1, learning: true })
  })

  it('then judges today against your own normal', () => {
    const hist = { a: 1, b: 1, c: 1, d: 1, e: 1, today: 9 }
    expect(pulseLevel(0.5, hist, 'today').level).toBe(0)
    expect(pulseLevel(1, hist, 'today').level).toBe(1)
    expect(pulseLevel(1.5, hist, 'today').level).toBe(2)
    expect(pulseLevel(2.5, hist, 'today')).toMatchObject({ level: 3, normal: 1, learning: false })
  })

  it('keeps the day\'s highest reading and 30 days at most', () => {
    const mem = { v: {}, getItem(k) { return this.v[k] ?? null }, setItem(k, x) { this.v[k] = x } }
    recordPulse(2, 'd1', mem); recordPulse(1, 'd1', mem)
    expect(JSON.parse(mem.v.wl_beat_v1).d1).toBe(2)
    for (let i = 0; i < 40; i++) recordPulse(1, `x${String(i).padStart(2, '0')}`, mem)
    expect(Object.keys(JSON.parse(mem.v.wl_beat_v1)).length).toBe(30)
  })
})
