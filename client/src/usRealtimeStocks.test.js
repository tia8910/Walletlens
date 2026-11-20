import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { usSessionOpen } from './data/markets'

// US stocks and ETFs follow the market while it is open: quoted live, cached
// 30 s, polled every 30 s, and the page refreshes as soon as quotes land.
const here = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(here, f), 'utf8')

describe('the US session', () => {
  it('is open 9:30 to 16:10 New York time on weekdays', () => {
    // Fri 20 Nov 2026: EST, so New York is UTC-5.
    expect(usSessionOpen(Date.UTC(2026, 10, 20, 14, 29))).toBe(false) // 9:29
    expect(usSessionOpen(Date.UTC(2026, 10, 20, 14, 30))).toBe(true)  // 9:30
    expect(usSessionOpen(Date.UTC(2026, 10, 20, 20, 59))).toBe(true)  // 15:59
    expect(usSessionOpen(Date.UTC(2026, 10, 20, 21, 9))).toBe(true)   // 16:09, the close landing
    expect(usSessionOpen(Date.UTC(2026, 10, 20, 21, 10))).toBe(false) // 16:10
    expect(usSessionOpen(Date.UTC(2026, 10, 21, 16, 0))).toBe(false)  // Saturday
  })
  it('follows daylight saving time', () => {
    // Mon 13 Jul 2026: EDT, UTC-4, so 9:30 is 13:30 UTC.
    expect(usSessionOpen(Date.UTC(2026, 6, 13, 13, 30))).toBe(true)
    expect(usSessionOpen(Date.UTC(2026, 6, 13, 13, 29))).toBe(false)
  })
})

describe('live stock prices', () => {
  const api = read('api.js')
  it('caches a stock quote for 30 s while the market is open', () => {
    expect(api).toMatch(/const stockTtl = \(now = Date\.now\(\)\) => \(usSessionOpen\(now\) \? LIVE_US_MS : STOCK_CACHE_DURATION\)/)
    expect(api).not.toMatch(/batchStockCacheTime > STOCK_CACHE_DURATION/)
  })
  it('announces fresh quotes only when a refresh succeeded', () => {
    expect(api).toMatch(/if \(batchStockCacheTime !== before\) \{[\s\S]{0,140}new Event\('wl-stock-prices'\)/)
  })
  it('refreshes the dashboard when they land, and polls every 30 s in session', () => {
    const dash = read('pages/Dashboard.jsx')
    expect(dash).toMatch(/window\.addEventListener\('wl-stock-prices', onStocks\)/)
    expect(dash).toMatch(/setInterval\(\(\) => \{ if \(usSessionOpen\(\) \|\| Date\.now\(\) - lastPricePoll >= 60_000\)/)
  })
})
