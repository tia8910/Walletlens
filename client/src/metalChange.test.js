import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { metalDayChange } from './api'

// gold-api.com returns a spot price only, so gold, silver, copper and platinum
// all read +0.00% every day. The move now comes from the futures' daily closes.

const chart = (closes, last) => ({
  ok: true,
  json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: last }, indicators: { quote: [{ close: closes }] } }] } }),
})

afterEach(() => vi.unstubAllGlobals())

describe('metalDayChange', () => {
  it('is the move from the previous daily close', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => chart([4100, 4050, 4000, 4012], 4020)))
    expect(await metalDayChange('GC=F')).toBeCloseTo(0.5, 5)
  })

  it('skips gaps in the closes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => chart([4000, null, 3990], 3970)))
    expect(await metalDayChange('GC=F')).toBeCloseTo(-0.75, 5)
  })

  it('gives up rather than inventing a number', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    expect(await metalDayChange('GC=F')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => chart([4000], 4010)))
    expect(await metalDayChange('GC=F')).toBeNull()
    expect(await metalDayChange(null)).toBeNull()
  })
})

describe('the live metal prices', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'api.js'), 'utf8')
  it('fill the day change after the spot price', () => {
    const body = src.slice(src.indexOf('async function fetchMetalsLive'), src.indexOf('// Fallback for gold'))
    expect(body).toMatch(/metalDayChange\(yahooTickerFor\(id\)\)/)
  })
})

describe('metalDayLine', () => {
  it('is the hourly closes without gaps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => chart([4000, null, 4005, 4010, 4002], 4002)))
    const { metalDayLine } = await import('./api')
    expect(await metalDayLine('GC=F')).toEqual([4000, 4005, 4010, 4002])
  })
})
