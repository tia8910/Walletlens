import { describe, it, expect } from 'vitest'
import { dayDrivers, soulLine, getSoulGreeting } from './soulGreeting'

const h = (sym, value, pct24h) => ({ coin_symbol: sym, coin_id: sym.toLowerCase(), value, pct24h })

describe('soul: explaining the day', () => {
  it('measures each holding\'s own dollar move over 24 hours', () => {
    const d = dayDrivers([h('zec', 900, -10), h('btc', 550, 10)])
    expect(d[0].sym).toBe('ZEC')
    expect(d[0].usd).toBeCloseTo(-100)
    expect(d[1].usd).toBeCloseTo(50)
  })

  it('names who did most of a red day and whether the market fell too', () => {
    const drivers = dayDrivers([h('zec', 830, -16.9), h('doge', 920, -8.1), h('btc', 3000, -2)])
    const line = soulLine({ pct: -3.1, drivers, btcPct: -2 })
    expect(line).toMatch(/^Down 3\.1% today\. ZEC and DOGE did most of it\./)
    expect(line).toMatch(/BTC is down 2\.0% too/)
  })

  it('says when BTC is up on a red day for you', () => {
    const line = soulLine({ pct: -1.2, drivers: dayDrivers([h('sol', 1000, -3)]), btcPct: 1.1 })
    expect(line).toMatch(/BTC is up today, so this one is yours/)
  })

  it('compares a green day with BTC', () => {
    const drivers = dayDrivers([h('sol', 2000, 6.1)])
    expect(soulLine({ pct: 2.4, drivers, btcPct: 1.6 })).toBe('Up 2.4% today. SOL did most of it. You are 0.8% ahead of BTC.')
    expect(soulLine({ pct: 2.4, drivers, btcPct: 2.2 })).toMatch(/In step with BTC/)
  })

  it('leaves BTC out when BTC is all you hold', () => {
    expect(soulLine({ pct: 2, drivers: dayDrivers([h('btc', 100, 2)]), btcPct: 2, onlyBtc: true })).toBe('Up 2.0% today. BTC did most of it.')
  })

  it('reads a flat day honestly', () => {
    expect(soulLine({ pct: 0.2, drivers: dayDrivers([h('eth', 100, 0.3)]) })).toMatch(/^Flat today \(\+0\.2%\)\. Nothing you hold moved more than 1%/)
    expect(soulLine({ pct: 0.1, drivers: dayDrivers([h('eth', 100, 4), h('sol', 100, -4)]) })).toMatch(/cancelled each other out/)
  })

  it('uses the hero\'s ±0.5% line for its tone', () => {
    expect(getSoulGreeting({ dayChangePct: 0.6 }).tone).toBe('up')
    expect(getSoulGreeting({ dayChangePct: -0.6 }).tone).toBe('down')
    expect(getSoulGreeting({ dayChangePct: 0.4 }).tone).toBe('calm')
  })

  it('writes Arabic too', () => {
    const line = soulLine({ pct: -3, drivers: dayDrivers([h('zec', 800, -17)]), btcPct: -2, lang: 'ar' })
    expect(line).toMatch(/انخفاض 3\.0% اليوم/)
  })
})
