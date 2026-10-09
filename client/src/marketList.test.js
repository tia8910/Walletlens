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

  it('returns the whole exchange with local and USD prices', async () => {
    vi.stubGlobal('caches', { default: { match: async () => null, put: async () => {} } })
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url)
      if (u.includes('scanner.tradingview.com/egypt')) return new Response(JSON.stringify({ totalCount: 223, data: [
        { s: 'EGX:COMI', d: ['COMI', 'Commercial International Bank', 77.4, 0.74, 'EGP', 2.3e11] },
        { s: 'EGX:TMGH', d: ['TMGH', 'Talaat Moustafa Group', 55.2, -1.16, 'EGP', 1.1e11] },
      ] }))
      if (u.includes('EGPUSD')) return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 0.02 } }] } }))
      return new Response('{}', { status: 500 })
    }))
    const body = await (await onRequestGet({ request: new Request('https://x/api/market-list?market=EG'), waitUntil: () => {} })).json()
    expect(body.total).toBe(223)
    expect(body.stocks[0]).toEqual({ t: 'COMI.CA', n: 'Commercial International Bank', p: 77.4, cur: 'EGP', c: 0.74, m: 2.3e11, u: 77.4 * 0.02 })
  })

  it('answers an empty list when the screener is unavailable, so the app keeps its popular names', async () => {
    vi.stubGlobal('caches', { default: { match: async () => null, put: async () => {} } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('blocked', { status: 403 })))
    const body = await (await onRequestGet({ request: new Request('https://x/api/market-list?market=EG'), waitUntil: () => {} })).json()
    expect(body.stocks).toEqual([])
  })
})
