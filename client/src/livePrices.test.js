import { describe, it, expect } from 'vitest'
import { withLivePrices } from './api'

// The ticker strip and the price list read the market snapshot, a file rebuilt
// every few hours, while Holdings price from Binance live. The list showed
// BTC $81,863 −1.81% beside a holding priced minutes ago. Binance's prices now
// go over the snapshot rows.

const rows = [
  { id: 'bitcoin', symbol: 'btc', current_price: 81863, price_change_percentage_24h: -1.81 },
  { id: 'ethereum', symbol: 'eth', current_price: 2409, price_change_percentage_24h: -2.18 },
  { id: 'some-token', symbol: 'abc', current_price: 0.5, price_change_percentage_24h: 3 },
  { id: 'unlisted', symbol: 'zzz', current_price: 2, price_change_percentage_24h: 1 },
]
const live = { BTC: { usd: 81616, change: -0.75 }, ETH: { usd: 2397.1, change: -0.31 }, ABC: { usd: 9, change: 1 } }

describe('withLivePrices', () => {
  it('puts the live price and day change over the snapshot', async () => {
    const out = await withLivePrices(rows, live)
    expect(out[0]).toMatchObject({ current_price: 81616, price_change_percentage_24h: -0.75 })
    expect(out[1]).toMatchObject({ current_price: 2397.1, price_change_percentage_24h: -0.31 })
  })

  it('ignores another token that shares the symbol', async () => {
    const out = await withLivePrices(rows, live)
    expect(out[2]).toBe(rows[2])
  })

  it('leaves coins Binance does not list as they were', async () => {
    const out = await withLivePrices(rows, live)
    expect(out[3]).toBe(rows[3])
  })

  it('keeps an empty list empty', async () => {
    expect(await withLivePrices([], live)).toEqual([])
  })
})
