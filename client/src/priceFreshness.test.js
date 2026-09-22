import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(fileURLToPath(import.meta.url))

// The reported bug, in one line: the trade sheet prefilled STONKBROKER at
// $0.0112966 while the coin was trading at $0.01285. Not a wrong source — a
// price from roughly a day earlier, served as current, in the box you are
// about to record a buy at.
describe('price freshness is decided per coin', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('does not judge one coin fresh because a different coin was just fetched', async () => {
    // priceCache is persisted, so yesterday's price for a coin you looked at
    // then is still on disk today. The dashboard polls the coins you HOLD every
    // minute, which used to bump one global clock that every other coin was
    // then measured against.
    const day = 24 * 60 * 60 * 1000
    localStorage.setItem('crypto_tracker_price_cache_v1', JSON.stringify({
      bitcoin:  { usd: 85000, usd_24h_change: 1, symbol: 'BTC', source: 'binance' },
      ethereum: { usd: 2600,  usd_24h_change: 1, symbol: 'ETH', source: 'binance' },
    }))
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([
      { id: 1, coin_id: 'bitcoin',  coin_symbol: 'BTC', type: 'buy', amount: 1, price: 80000 },
      { id: 2, coin_id: 'ethereum', coin_symbol: 'ETH', type: 'buy', amount: 1, price: 2000 },
    ]))

    let btcPrice = 90000
    let ethPrice = 3000
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url))
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            { symbol: 'BTCUSDT', lastPrice: String(btcPrice), priceChangePercent: '1' },
            { symbol: 'ETHUSDT', lastPrice: String(ethPrice), priceChangePercent: '1' },
          ]
        },
        async text() { return '' },
      }
    }))

    const { api } = await import('./api')

    // One coin is asked for, which in the old code set the global clock.
    await api.getPrices('bitcoin')
    expect(calls.length, 'the first coin went out to the network').toBeGreaterThan(0)

    // Now the other coin moves, and is asked for within the cache window.
    calls.length = 0
    ethPrice = 4321
    const px = await api.getPrices('ethereum')

    expect(calls.length, 'the second coin must go out too, not ride the first one’s clock')
      .toBeGreaterThan(0)
    expect(px.ethereum?.usd, 'and must come back with the live price, not the cached one')
      .toBe(4321)
    void day
  })

  it('still throttles, so a coin no source can price is not asked for on every keystroke', async () => {
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([
      { id: 1, coin_id: 'bitcoin', coin_symbol: 'BTC', type: 'buy', amount: 1, price: 80000 },
    ]))
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url))
      return { ok: true, status: 200, async json() { return [{ symbol: 'BTCUSDT', lastPrice: '90000', priceChangePercent: '1' }] }, async text() { return '' } }
    }))
    const { api } = await import('./api')
    await api.getPrices('bitcoin')
    const first = calls.length
    calls.length = 0
    await api.getPrices('bitcoin')
    expect(calls.length, 'a repeat inside the window is served from cache').toBe(0)
    expect(first).toBeGreaterThan(0)
  })

  it('does not decide freshness from the app-wide clock', () => {
    // A source guard, because the behaviour above is easy to reintroduce by
    // "optimising" the predicate back to one timestamp.
    const src = readFileSync(join(SRC, 'api.js'), 'utf8')
    const decision = /const needsFresh = [\s\S]{0,240}?;/.exec(src)
    expect(decision, 'needsFresh not found').toBeTruthy()
    expect(decision[0]).not.toMatch(/lastPriceFetch/)
    expect(decision[0]).toMatch(/priceFetchedAt/)
  })
})
