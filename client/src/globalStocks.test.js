import { describe, it, expect, vi, afterEach } from 'vitest'
import { isIntlTicker, marketOfTicker, marketForCountry, toMajorUnit, countryFromDevice, MARKETS, intlStockName } from './data/markets'
import { onRequestGet as stocksGet, isIntlSymbol } from '../../functions/api/stocks.js'
import { pickResults } from '../../functions/api/stock-search.js'
import { onRequestGet as geoGet } from '../../functions/api/geo.js'

describe('markets beyond the US', () => {
  it('tells a foreign listing from a US share class', () => {
    expect(isIntlTicker('2222.SR')).toBe(true)
    expect(isIntlTicker('comi.ca')).toBe(true)
    expect(isIntlTicker('7203.T')).toBe(true)
    expect(isIntlTicker('AAPL')).toBe(false)
    expect(isIntlTicker('BRK.B')).toBe(false)
    expect(marketOfTicker('EMAAR.AE')).toBe('AE')
    expect(marketOfTicker('FAB.AD')).toBe('AE')
    expect(marketOfTicker('MSFT')).toBe('US')
  })

  it('opens the user\'s own market, or the nearest one, or the US', () => {
    expect(marketForCountry('EG')).toBe('EG')
    expect(marketForCountry('sa')).toBe('SA')
    expect(marketForCountry('BH')).toBe('SA')
    expect(marketForCountry('AT')).toBe('DE')
    expect(marketForCountry('ZZ')).toBe('US')
    expect(marketForCountry('')).toBe('US')
  })

  it('reads London pence and Tel Aviv agorot as pounds and shekels', () => {
    expect(toMajorUnit(250, 'GBp')).toEqual({ price: 2.5, currency: 'GBP' })
    expect(toMajorUnit(1000, 'ILA')).toEqual({ price: 10, currency: 'ILS' })
    expect(toMajorUnit(27.5, 'SAR')).toEqual({ price: 27.5, currency: 'SAR' })
  })

  it('guesses the country from the device language, then its time zone', () => {
    expect(countryFromDevice({ languages: ['ar-EG', 'en'] })).toBe('EG')
    expect(typeof countryFromDevice({ languages: ['ar'] })).toBe('string')
  })

  it('lists only real foreign tickers in each market, and knows their names', () => {
    for (const m of MARKETS.filter(x => x.stocks)) {
      for (const st of m.stocks) {
        expect(isIntlTicker(st.ticker), st.ticker).toBe(true)
        expect(marketOfTicker(st.ticker), st.ticker).toBe(m.code)
      }
    }
    expect(intlStockName('2222.sr')).toBe('Saudi Aramco')
    expect(intlStockName('COMI.CA')).toBe('Commercial International Bank')
  })
})

describe('/api/stocks prices a foreign listing in USD', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('converts the local quote with the live rate and keeps the local price', async () => {
    const fetchMock = vi.fn(async (url) => {
      const u = String(url)
      const meta = u.includes('SARUSD%3DX') || u.includes('SARUSD=X')
        ? { regularMarketPrice: 0.2666 }
        : u.includes('2222.SR') ? { regularMarketPrice: 27.5, currency: 'SAR', regularMarketChangePercent: 1.2, longName: 'Saudi Arabian Oil Company' } : null
      return new Response(JSON.stringify({ chart: { result: meta ? [{ meta }] : [] } }), { status: meta ? 200 : 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('caches', { default: { match: async () => null, put: async () => {} } })
    const res = await stocksGet({ request: new Request('https://x/api/stocks?symbols=2222.SR'), waitUntil: () => {} })
    const body = await res.json()
    expect(body['2222.SR'].price).toBeCloseTo(27.5 * 0.2666, 6)
    expect(body['2222.SR'].local).toEqual({ price: 27.5, currency: 'SAR' })
    expect(body['2222.SR'].change_pct).toBe(1.2)
    // A foreign ticker never goes to Stooq's .us lookup.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('stooq'))).toBe(false)
  })

  it('falls back to the dollar peg when the live rate does not come', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url)
      if (u.includes('EMAAR.AE')) return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 14.69, currency: 'AED' } }] } }))
      return new Response('{}', { status: 500 })
    }))
    vi.stubGlobal('caches', { default: { match: async () => null, put: async () => {} } })
    const body = await (await stocksGet({ request: new Request('https://x/api/stocks?symbols=EMAAR.AE'), waitUntil: () => {} })).json()
    expect(body['EMAAR.AE'].price).toBeCloseTo(14.69 / 3.6725, 6)
  })

  it('leaves a quote out when no rate is known, instead of mislabelling it as dollars', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('COMI.CA')) return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 85, currency: 'EGP' } }] } }))
      return new Response('{}', { status: 500 })
    }))
    vi.stubGlobal('caches', { default: { match: async () => null, put: async () => {} } })
    const body = await (await stocksGet({ request: new Request('https://x/api/stocks?symbols=COMI.CA'), waitUntil: () => {} })).json()
    expect(body['COMI.CA']).toBeUndefined()
  })

  it('agrees with the client on which tickers are foreign', () => {
    for (const t of ['2222.SR', 'COMI.CA', 'VOD.L', '7203.T', 'AAPL', 'BRK.B']) expect(isIntlSymbol(t), t).toBe(isIntlTicker(t))
  })
})

describe('worldwide search and the visitor\'s country', () => {
  it('keeps shares and ETFs only, with their exchange', () => {
    const out = pickResults({ quotes: [
      { symbol: '2222.SR', shortname: 'SAUDI ARABIAN OIL CO', quoteType: 'EQUITY', exchDisp: 'Saudi' },
      { symbol: 'ARAMCO-FUT', quoteType: 'FUTURE' },
      { symbol: 'spy', longname: 'SPDR S&P 500', quoteType: 'ETF', exchange: 'PCX' },
    ] })
    expect(out).toEqual([
      { symbol: '2222.SR', name: 'SAUDI ARABIAN OIL CO', exchange: 'Saudi' },
      { symbol: 'SPY', name: 'SPDR S&P 500', exchange: 'PCX' },
    ])
  })

  it('reports the country Cloudflare sees', async () => {
    const req = new Request('https://x/api/geo')
    Object.defineProperty(req, 'cf', { value: { country: 'EG' } })
    expect(await (await geoGet({ request: req })).json()).toEqual({ country: 'EG' })
  })
})
