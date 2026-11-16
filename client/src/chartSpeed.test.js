import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { api } from './api'
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
})
