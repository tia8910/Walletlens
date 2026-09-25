import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet, parseYahoo, groupCandles, parseStooq, PLANS } from '../../functions/api/candles.js'
import { api } from './api'

// Stock and metal charts. The browser used to reach Stooq through a chain of
// public CORS proxies and sat on "Fetching" until each timed out; the
// /api/candles function asks Yahoo (then Stooq) server-side instead.

const DAY = 86400000
const yahooBody = (n, stepSec = 86400, start = Date.UTC(2026, 0, 5) / 1000) => ({
  chart: { result: [{
    timestamp: Array.from({ length: n }, (_, i) => start + i * stepSec),
    indicators: { quote: [{
      open: Array.from({ length: n }, (_, i) => 100 + i),
      high: Array.from({ length: n }, (_, i) => 102 + i),
      low: Array.from({ length: n }, (_, i) => 99 + i),
      close: Array.from({ length: n }, (_, i) => 101 + i),
    }] },
  }] },
})

function stubRuntime(fetchImpl) {
  const store = new Map()
  vi.stubGlobal('caches', { default: {
    match: async (req) => store.get(req.url),
    put: async (req, res) => { store.set(req.url, res) },
  } })
  const fetchMock = vi.fn(fetchImpl)
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, store }
}
const call = async (qs) => {
  const pending = []
  const res = await onRequestGet({ request: new Request(`https://walletlens.live/api/candles?${qs}`), waitUntil: (p) => pending.push(p) })
  await Promise.all(pending)
  return res
}

afterEach(() => { vi.unstubAllGlobals() })

describe('parsing', () => {
  it('reads Yahoo candles and drops rows with gaps', () => {
    const body = yahooBody(3)
    body.chart.result[0].indicators.quote[0].close[1] = null
    const out = parseYahoo(body)
    expect(out.map(k => k.c)).toEqual([101, 103])
    expect(out[0].t).toBe(Date.UTC(2026, 0, 5))
  })

  it('builds 4h candles from hourly ones without crossing into the next day', () => {
    const start = Date.UTC(2026, 0, 5, 14)
    const hours = Array.from({ length: 7 }, (_, i) => ({ t: start + i * 3600000, o: 10 + i, h: 12 + i, l: 9 + i, c: 11 + i }))
    const nextDay = { t: Date.UTC(2026, 0, 6, 14), o: 50, h: 52, l: 49, c: 51 }
    const out = groupCandles([...hours, nextDay], 4)
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({ t: start, o: 10, h: 15, l: 9, c: 14 })
    expect(out[1]).toMatchObject({ o: 14, h: 18, l: 13, c: 17 })
    expect(out[2]).toMatchObject({ o: 50, c: 51 })
  })

  it('reads Stooq daily history and rolls it into Monday-based weeks', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n2026-01-05,10,12,9,11,1\n2026-01-06,11,14,10,13,1\n2026-01-12,13,15,12,14,1\nbad,row'
    expect(parseStooq(csv)).toHaveLength(3)
    const weeks = parseStooq(csv, true)
    expect(weeks).toEqual([
      { t: Date.UTC(2026, 0, 5), o: 10, h: 14, l: 9, c: 13 },
      { t: Date.UTC(2026, 0, 12), o: 13, h: 15, l: 12, c: 14 },
    ])
  })
})

describe('the /api/candles function', () => {
  it('answers from Yahoo with the plan for the timeframe', async () => {
    const { fetchMock } = stubRuntime(async () => new Response(JSON.stringify(yahooBody(300))))
    const body = await (await call('symbol=aapl&interval=1d')).json()
    expect(body.source).toBe('yahoo')
    expect(body.candles).toHaveLength(300)
    expect(fetchMock.mock.calls[0][0]).toContain('/v8/finance/chart/AAPL?interval=1d&range=2y')
  })

  it('makes 4h candles from Yahoo hourly data', async () => {
    const { fetchMock } = stubRuntime(async () => new Response(JSON.stringify(yahooBody(40, 3600, Date.UTC(2026, 0, 5, 14) / 1000))))
    const body = await (await call('symbol=AAPL&interval=4h')).json()
    expect(fetchMock.mock.calls[0][0]).toContain(`interval=${PLANS['4h'].interval}`)
    expect(body.candles.length).toBeLessThan(40)
    expect(body.candles.length).toBeGreaterThan(5)
  })

  it('falls back to Stooq for daily candles when Yahoo fails', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => `${new Date(Date.UTC(2026, 0, 1) + i * DAY).toISOString().slice(0, 10)},10,12,9,11,1`)
    const { fetchMock } = stubRuntime(async (u) => String(u).includes('stooq')
      ? new Response('Date,Open,High,Low,Close,Volume\n' + rows.join('\n'))
      : new Response('no', { status: 500 }))
    const body = await (await call('symbol=BRK-B&interval=1d')).json()
    expect(body.source).toBe('stooq')
    expect(body.candles).toHaveLength(30)
    expect(fetchMock.mock.calls.at(-1)[0]).toContain('s=brk.b.us')
  })

  it('does not cache an outage', async () => {
    const { store } = stubRuntime(async () => new Response('no', { status: 500 }))
    const body = await (await call('symbol=AAPL&interval=1h')).json()
    expect(body.candles).toEqual([])
    expect(body.tried).toEqual(['query1.finance.yahoo.com: HTTP 500', 'query2.finance.yahoo.com: HTTP 500'])
    expect(store.size).toBe(0)
  })

  it('rejects a bad symbol or interval without fetching', async () => {
    const { fetchMock } = stubRuntime(async () => new Response('{}'))
    expect((await call('symbol=AA PL&interval=1d')).status).toBe(400)
    expect((await call('symbol=AAPL&interval=3d')).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the browser fallback', () => {
  it('asks Yahoo itself when the function comes back empty', async () => {
    const seen = []
    vi.stubGlobal('fetch', vi.fn(async (u) => {
      const url = String(u); seen.push(url)
      if (url.startsWith('/api/candles')) return new Response(JSON.stringify({ candles: [] }))
      if (url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/MSFT')) return new Response(JSON.stringify(yahooBody(200)))
      return new Response('no', { status: 500 })
    }))
    const r = await api.getCandles('stock:msft', 'MSFT', '1d')
    expect(r.candles).toHaveLength(200)
    expect(r.closeOnly).toBe(false)
    expect(seen[0]).toBe('/api/candles?symbol=MSFT&interval=1d')
  })
})

describe('which ticker the app asks for', () => {
  it('maps stocks, tokenized stocks and metals, and nothing else', () => {
    expect(api.candleTicker('stock:aapl')).toBe('AAPL')
    expect(api.candleTicker('stock:brk.b')).toBe('BRK-B')
    expect(api.candleTicker('xstock:tsla')).toBe('TSLA')
    expect(api.candleTicker('stock:nvdab')).toBe('NVDA')
    expect(api.candleTicker('metal:xau')).toBe('GC=F')
    expect(api.candleTicker('bitcoin')).toBeNull()
    expect(api.candleTicker('fiat:usd')).toBeNull()
  })
})
