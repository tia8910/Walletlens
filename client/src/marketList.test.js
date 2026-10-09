import { describe, it, expect, vi, afterEach } from 'vitest'
import { toYahooTicker, parseScreener, onRequestGet, SCREENER_MARKETS } from '../../functions/api/market-list.js'
import { MARKETS } from './data/markets'

describe('every stock on a market', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('rewrites screener symbols to the Yahoo tickers the app prices by', () => {
    expect(toYahooTicker('EGX:COMI', 'EG')).toBe('COMI.CA')
    expect(toYahooTicker('TADAWUL:2222', 'SA')).toBe('2222.SR')
    expect(toYahooTicker('ADX:FAB', 'AE')).toBe('FAB.AD')
    expect(toYahooTicker('DFM:EMAAR', 'AE')).toBe('EMAAR.AE')
    expect(toYahooTicker('HKEX:700', 'HK')).toBe('0700.HK')
    expect(toYahooTicker('LSE:BT.A', 'GB')).toBe('BT-A.L')
    expect(toYahooTicker('FWB:SAP', 'DE')).toBe(null) // a second German venue, not listed twice
  })

  it('lists US shares under their bare ticker, keeping share classes', () => {
    expect(toYahooTicker('NASDAQ:AAPL', 'US')).toBe('AAPL')
    expect(toYahooTicker('NYSE:BRK.B', 'US')).toBe('BRK.B')
    expect(toYahooTicker('OTC:TCEHY', 'US')).toBe(null) // over the counter is left out
  })

  it('takes every row of a single-exchange market whatever venue name it carries', () => {
    expect(toYahooTicker('EGX:COMI', 'EG')).toBe('COMI.CA')
    expect(toYahooTicker('EGXX:COMI', 'EG')).toBe('COMI.CA')
    expect(toYahooTicker('SAU:2222', 'SA')).toBe('2222.SR')
  })

  it('has a screener for every market the picker offers', () => {
    for (const m of MARKETS) if (m.code !== 'US') expect(SCREENER_MARKETS[m.code], m.code).toBeTruthy()
  })

  it('reads London pence as pounds and drops rows without a price or duplicates', () => {
    const out = parseScreener({ data: [
      { s: 'LSE:SHEL', d: ['SHEL', 'Shell plc', 2560, 0.3, 'GBX', 1.6e11] },
      { s: 'LSE:SHEL', d: ['SHEL', 'Shell plc', 2560, 0.3, 'GBX', 1.6e11] },
      { s: 'LSE:DEAD', d: ['DEAD', 'Gone', 0, 0, 'GBX', 0] },
    ] }, 'GB')
    expect(out).toEqual([{ t: 'SHEL.L', n: 'Shell plc', p: 25.6, cur: 'GBP', c: 0.3, m: 1.6e11 }])
  })

  it('returns the whole exchange, page after page, with local and USD prices', async () => {
    vi.stubGlobal('caches', { default: { match: async () => null, put: async () => {} } })
    // 2,600 stocks: more than one page, so the second request must happen.
    const all = Array.from({ length: 2600 }, (_, i) => ({ s: `EGX:S${i}`, d: [`S${i}`, `Company ${i}`, 100 - i * 0.01, 0.5, 'EGP', 1e11 - i] }))
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url)
      if (u.includes('scanner.tradingview.com/egypt')) {
        const body = JSON.parse(init.body); bodies.push(body)
        const [from, to] = body.range
        return new Response(JSON.stringify({ totalCount: all.length, data: all.slice(from, to) }))
      }
      if (u.includes('EGPUSD')) return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 0.02 } }] } }))
      return new Response('{}', { status: 500 })
    }))
    const body = await (await onRequestGet({ request: new Request('https://x/api/market-list?market=EG'), waitUntil: () => {} })).json()
    expect(body.total).toBe(2600)
    expect(body.rows.length).toBe(2600)
    expect(bodies.length).toBe(2)
    expect(bodies[0].filter[0]).toEqual({ left: 'type', operation: 'in_range', right: ['stock', 'dr'] })
    expect(body.cols).toEqual(['t', 'n', 'p', 'cur', 'u', 'c'])
    expect(body.rows[0]).toEqual(['S0.CA', 'Company 0', 100, 'EGP', 2, 0.5])
  })

  it('falls back to the plain stock filter if the list filter is refused', async () => {
    vi.stubGlobal('caches', { default: { match: async () => null, put: async () => {} } })
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url)
      if (u.includes('scanner.tradingview.com')) {
        const f = JSON.parse(init.body).filter[0]
        if (f.operation === 'in_range') return new Response('bad filter', { status: 400 })
        return new Response(JSON.stringify({ totalCount: 1, data: [{ s: 'TADAWUL:2222', d: ['2222', 'Saudi Aramco', 27.5, 1.2, 'SAR', 7e12] }] }))
      }
      return new Response('{}', { status: 500 }) // no live rate: the riyal peg applies
    }))
    const body = await (await onRequestGet({ request: new Request('https://x/api/market-list?market=SA'), waitUntil: () => {} })).json()
    expect(body.rows[0][0]).toBe('2222.SR')
    expect(body.rows[0][4]).toBeCloseTo(27.5 / 3.75, 4)
  })

  it('answers an empty list when the screener is unavailable, so the app keeps its popular names', async () => {
    vi.stubGlobal('caches', { default: { match: async () => null, put: async () => {} } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('blocked', { status: 403 })))
    const body = await (await onRequestGet({ request: new Request('https://x/api/market-list?market=EG'), waitUntil: () => {} })).json()
    expect(body.rows).toEqual([])
  })
})
