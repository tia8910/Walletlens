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

  it('marks a cached crypto price stale when nothing could refresh it', async () => {
    // The case the device was in. Metals, fiat and stocks already flagged
    // their fallbacks; crypto handed back localStorage as if it were a live
    // quote, so a price from whenever the network last worked was offered as
    // the cost basis of a buy.
    localStorage.setItem('crypto_tracker_price_cache_v1', JSON.stringify({
      stonkbroker: { usd: 0.0112966, usd_24h_change: 0, symbol: 'STONKBROKER', source: 'coingecko' },
    }))
    // Every source down, the way a filtering resolver drops them.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('blocked') }))

    const { api } = await import('./api')
    const px = await api.getPrices('stonkbroker')

    expect(px.stonkbroker?.usd, 'the last known price is still offered').toBe(0.0112966)
    expect(px.stonkbroker?.stale, 'but it is labelled for what it is').toBe(true)
  })

  it('does not call a warm cache hit stale', async () => {
    // THE PHONE BUG. The dashboard polls the coins you hold every minute, so
    // by the time you open the trade sheet the cache is usually seconds old
    // and no fetch runs at all. Judging freshness on "did this pass refetch"
    // then flagged a current price as stale, and the sheet refused to prefill
    // it — "couldn't fetch — enter manually" for a price the same coin showed
    // correctly in a freshly opened browser tab.
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([
      { id: 1, coin_id: 'bitcoin', coin_symbol: 'BTC', type: 'buy', amount: 1, price: 80000 },
    ]))
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url))
      return {
        ok: true, status: 200,
        async json() { return [{ symbol: 'BTCUSDT', lastPrice: '91234', priceChangePercent: '2' }] },
        async text() { return '' },
      }
    }))
    const { api } = await import('./api')

    // The dashboard's poll.
    const first = await api.getPrices('bitcoin')
    expect(first.bitcoin?.stale, 'the poll itself is fresh').toBeUndefined()

    // The trade sheet opening moments later, inside the cache window.
    calls.length = 0
    const second = await api.getPrices('bitcoin')
    expect(calls.length, 'served from cache, as intended').toBe(0)
    expect(second.bitcoin?.usd).toBe(91234)
    expect(second.bitcoin?.stale, 'a cache hit inside the window is fresh, not stale').toBeUndefined()
  })

  it('does not mark a price stale when it did come back fresh', async () => {
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([
      { id: 1, coin_id: 'bitcoin', coin_symbol: 'BTC', type: 'buy', amount: 1, price: 80000 },
    ]))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      async json() { return [{ symbol: 'BTCUSDT', lastPrice: '91234', priceChangePercent: '2' }] },
      async text() { return '' },
    })))
    const { api } = await import('./api')
    const px = await api.getPrices('bitcoin')
    expect(px.bitcoin?.usd).toBe(91234)
    expect(px.bitcoin?.stale, 'a live quote carries no stale flag').toBeUndefined()
  })

  it('the trade sheet refuses to prefill a stale price', () => {
    // A stale quote in the price box is indistinguishable from a live one, and
    // whatever it says becomes the recorded cost basis.
    const sheet = readFileSync(join(SRC, 'components/TradeSheet.jsx'), 'utf8')
    expect(sheet).toMatch(/if \(p && !quote\?\.stale\)/)
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
