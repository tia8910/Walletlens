import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { api, pickDexPool, parseGeckoOhlcv } from './api'
import { CHART_TIMEFRAMES } from './chartSignals'

// Technicals sat on "Fetching price…" for every chip: api.binance.com hangs
// on networks that block it, and each chart waited out the timeout before
// the slow fallback. Now the mirror answers in its place, the last saved
// chart draws at once, and the other chips' charts load in the background.

const klines = (n, close = 3000) => Array.from({ length: n }, (_, i) => [i * 864e5, close, close + 10, close - 10, close, 1])

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Technicals charts load fast', () => {
  it('takes the Binance mirror when api.binance.com hangs', async () => {
    const asked = []
    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      asked.push(String(url))
      if (String(url).startsWith('https://api.binance.com')) {
        // Blocked: never answers, until the timeout aborts it.
        return new Promise((_, rej) => opts?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))
      }
      return Promise.resolve({ ok: true, json: async () => klines(250) })
    }))
    const t0 = Date.now()
    const r = await api.getCandles('ethereum', 'ETH', '1d', 200, 3000)
    expect(Date.now() - t0).toBeLessThan(1000)          // not the timeout
    expect(r.candles.length).toBe(250)
    expect(asked.some(u => u.startsWith('https://data-api.binance.vision/api/v3/klines?symbol=ETHUSDT'))).toBe(true)
    expect(asked.some(u => u.startsWith('https://api.binance.com/api/v3/klines?symbol=ETHUSDT'))).toBe(true)
  })

  it('shows the chart saved last time at once, without a request', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const saved = api.peekCandles('ethereum', 'ETH', '1d', 200, CHART_TIMEFRAMES)
    expect(saved?.candles.length).toBe(250)               // from the test above
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(api.peekCandles('aptos', 'APT', '1d', 200, CHART_TIMEFRAMES)).toBeNull()
  })

  it('does not draw a saved chart more than three days old', () => {
    vi.useFakeTimers({ now: Date.now() + 3 * 864e5 + 60_000 })
    expect(api.peekCandles('ethereum', 'ETH', '1d', 200, CHART_TIMEFRAMES)).toBeNull()
  })

  it('wires the saved chart and the background loading into the screens', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const chart = readFileSync(join(here, 'components/IndicatorChart.jsx'), 'utf8')
    expect(chart).toMatch(/api\.peekCandles\(coinId, symbol, frame, 200, CHART_TIMEFRAMES\)/)
    const panel = readFileSync(join(here, 'components/TechChartPanel.jsx'), 'utf8')
    expect(panel).toMatch(/api\.prefetchCandles\(assets\.filter/)
  })

  it('lets the page reach the mirror: every security policy allows it', () => {
    // The first version raced the two hosts, but the CSP blocked the mirror
    // before any request left the browser, so the chart still waited.
    const here = dirname(fileURLToPath(import.meta.url))
    for (const f of ['../index.html', '../public/_headers']) {
      const csp = readFileSync(join(here, f), 'utf8').match(/connect-src[^;]*/)[0]
      expect(csp).toContain('https://api.binance.com')
      expect(csp).toContain('https://data-api.binance.vision')
    }
  })

  it('charts a token only decentralized exchanges trade from its pool', async () => {
    // StonkBroker: no Binance pair, no CoinGecko chart. "No chart data" before.
    const pair = { chainId: 'solana', pairAddress: 'POOL1', baseToken: { symbol: 'STONKBROKER' }, priceUsd: '0.0036', liquidity: { usd: 250000 } }
    const asked = []
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url); asked.push(u)
      if (u.includes('binance')) return { ok: false, status: 400, json: async () => ({}) }
      if (u.startsWith('https://api.dexscreener.com/latest/dex/search?q=STONKBROKER')) return { ok: true, json: async () => ({ pairs: [pair] }) }
      if (u.startsWith('https://api.geckoterminal.com/api/v2/networks/solana/pools/POOL1/ohlcv/day?aggregate=1')) {
        const rows = Array.from({ length: 60 }, (_, i) => [1_760_000_000 - i * 86400, 0.004, 0.0042, 0.0035, 0.0036 + (i % 3) * 1e-5, 900])
        return { ok: true, json: async () => ({ data: { attributes: { ohlcv_list: rows } } }) }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    }))
    const r = await api.getCandles('stonkbroker', 'STONKBROKER', '1d', 200, 0.0036)
    expect(r.candles.length).toBe(60)
    expect(r.closeOnly).toBe(false)
    expect(r.candles[0].t).toBeLessThan(r.candles[59].t)                 // oldest first
    expect(asked.some(u => u.includes('coingecko'))).toBe(false)         // the slow path is not taken
    expect(api.peekCandles('stonkbroker', 'STONKBROKER', '1d', 200, CHART_TIMEFRAMES)?.candles.length).toBe(60)
    // intraday too: the pool's hourly candles
    const h = await api.getCandles('stonkbroker', 'STONKBROKER', '4h', 200, 0.0036).catch(() => null)
    expect(asked.some(u => u.includes('/pools/POOL1/ohlcv/hour?aggregate=4'))).toBe(true)
    expect(h).toBeTruthy()
  })

  it('picks the deepest pool of the right token, near the price the app shows', () => {
    const p = (sym, px, liq, addr, chain = 'base') => ({ chainId: chain, pairAddress: addr, baseToken: { symbol: sym }, priceUsd: String(px), liquidity: { usd: liq } })
    expect(pickDexPool([p('STONK', 0.002, 50000, 'a'), p('STONK', 0.0021, 90000, 'b'), p('STONK', 5, 1e7, 'c')], 'stonk', 0.002)).toEqual({ net: 'base', address: 'b' })
    expect(pickDexPool([p('STONK', 0.002, 5000, 'a')], 'STONK')).toBeNull()            // too thin to trust
    expect(pickDexPool([p('X', 1, 1e6, 'a', 'ethereum')], 'X')).toEqual({ net: 'eth', address: 'a' })
    expect(parseGeckoOhlcv({ data: { attributes: { ohlcv_list: [[2, 1, 2, 0.5, 1.5, 3], [1, 1, 1, 1, 1, 0], [3, 0, 0, 0, 0, 0]] } } }).map(k => k.t)).toEqual([1000, 2000])
  })

  it('lets the page and the proxy reach the DEX sources', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    for (const f of ['../index.html', '../public/_headers']) {
      const csp = readFileSync(join(here, f), 'utf8').match(/connect-src[^;]*/)[0]
      expect(csp).toContain('https://api.geckoterminal.com')
      expect(csp).toContain('https://api.dexscreener.com')
    }
    const worker = readFileSync(join(here, '../../workers/voice/index.js'), 'utf8')
    for (const h of ['api.dexscreener.com', 'api.geckoterminal.com', 'data-api.binance.vision']) expect(worker).toContain(`"${h}"`)
  })
})
