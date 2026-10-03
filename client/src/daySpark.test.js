import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { daySeries, hasDayLine } from './daySpark'
import { sparkPath } from './components/HomeTop'
import { api } from './api'

const here = dirname(fileURLToPath(import.meta.url))
const ys = (p) => p.line.slice(1).split(' L').map(s => Number(s.split(' ')[1]))

describe('the holdings line matches the row it sits in', () => {
  it('draws the day and ends at the price the row shows', () => {
    expect(daySeries([10, 11, 12, 13], 13.1)).toEqual([10, 11, 12, 13, 13.1])
  })

  it('without a day series, uses the last day of the weekly line, never the whole week', () => {
    const week = Array.from({ length: 28 }, (_, i) => 100 - i)
    expect(daySeries(null, 72.8, week)).toEqual([77, 76, 75, 74, 73, 72.8])
  })

  it('drops a series that ends far from the live price instead of drawing a jump', () => {
    expect(daySeries([50, 51, 52, 53], 84000)).toBeNull()
    expect(daySeries([100, 101, 102, 103], 103.5)).toEqual([100, 101, 102, 103, 103.5])
    // 2% off: drawn, but not joined to the live price with a fake jump.
    expect(daySeries([100, 101, 102, 103], 105)).toEqual([100, 101, 102, 103])
  })

  it('draws no line for cash', () => {
    expect(hasDayLine({ coin_id: 'usd', category: 'fiat' })).toBe(false)
    expect(hasDayLine({ coin_id: 'bitcoin', category: 'crypto' })).toBe(true)
  })

  it('draws nothing rather than a line over another window', () => {
    expect(daySeries(null, 5, null)).toBeNull()
    expect(daySeries([1, 2], 5, [1, 2, 3])).toBeNull()
  })

  it('keeps a stablecoin flat instead of stretching a 0.05% wobble to full height', () => {
    const p = sparkPath([1.0, 1.0005, 0.9995, 1.0002, 1.0], 64, 26)
    const y = ys(p)
    expect(Math.max(...y) - Math.min(...y)).toBeLessThan(3)
  })

  it('still fills the height for a real move', () => {
    const y = ys(sparkPath([100, 103, 98, 106], 64, 26))
    expect(Math.max(...y) - Math.min(...y)).toBeCloseTo(20, 0)
  })

  it('colours the line by the change printed beside it, and shows the unit price', () => {
    const src = readFileSync(join(here, 'components/NlHoldings.jsx'), 'utf8')
    expect(src).toMatch(/up=\{showsDay \? ch >= 0 : undefined\}/)
    expect(src).toMatch(/nl-row-px">\{px\(h\.price\)\}/)
  })
})

describe('getDaySpark', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear() })

  it('uses Binance hourly closes when they match the shown price', async () => {
    const closes = Array.from({ length: 25 }, (_, i) => 2600 + i * 3)
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => closes.map(c => [0, 0, 0, 0, String(c)]) }))
    const v = await api.getDaySpark('ethereum-test-a', 'ETH', 2672)
    expect(v).toEqual(closes)
    expect(String(globalThis.fetch.mock.calls[0][0])).toMatch(/klines\?symbol=ETHUSDT&interval=1h&limit=25/)
  })

  it('rejects a Binance ticker that is a different token and falls back', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => Array.from({ length: 25 }, () => [0, 0, 0, 0, '0.5']) }))
    const chart = vi.spyOn(api, 'getChartData').mockResolvedValue([1, 2, 3, 4, 5].map(price => ({ price: 148 + price })))
    const v = await api.getDaySpark('gram-test-b', 'GRAM', 148.5)
    expect(chart).toHaveBeenCalledWith('gram-test-b', 1)
    expect(v).toEqual([149, 150, 151, 152, 153])
  })
})
