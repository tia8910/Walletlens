import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { binanceRowLive } from './api'

// Reported: on desktop Arweave showed $3.10 and 0.0% today, while the phone
// showed $2.52. Binance keeps a halted or delisted pair in /ticker/24hr with
// its last trade frozen; the desktop reaches Binance and took that as the
// price, the phone (Binance blocked) fell through to CoinGecko.

const HOUR = 3600e3
const now = Date.UTC(2026, 10, 18, 12)

describe('a Binance row counts only while the pair is trading', () => {
  it('takes a pair with trades running into the last two hours', () => {
    expect(binanceRowLive({ count: 52000, closeTime: now - 1000 }, now)).toBe(true)
  })
  it('rejects a halted or delisted pair', () => {
    expect(binanceRowLive({ count: 0, closeTime: now - 1000 }, now)).toBe(false)              // no trades
    expect(binanceRowLive({ count: 12, closeTime: now - 30 * 24 * HOUR }, now)).toBe(false)  // last trade weeks ago
    expect(binanceRowLive({ lastPrice: '3.10' }, now)).toBe(false)                           // nothing to go on
  })
})

describe('the price pipeline', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules() })
  afterEach(() => vi.unstubAllGlobals())

  it('prices a coin from the next source when its Binance pair is frozen', async () => {
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([
      { id: 1, coin_id: 'arweave', coin_symbol: 'AR', type: 'buy', amount: 135.295376, price: 7 },
    ]))
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url)
      const json = u.includes('ticker/24hr')
        ? [{ symbol: 'ARUSDT', lastPrice: '3.10', priceChangePercent: '0', count: 0, closeTime: Date.now() - 40 * 24 * HOUR }]
        : u.includes('coins/markets') ? [{ id: 'arweave', symbol: 'ar', name: 'Arweave', current_price: 2.52, price_change_percentage_24h: 1.4 }] : {}
      return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) }
    }))
    const { api } = await import('./api')
    const px = await api.getPrices('arweave')
    expect(px.arweave?.usd).toBe(2.52)
    expect(px.arweave?.usd_24h_change).toBe(1.4)
  })
})
