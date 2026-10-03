import { describe, it, expect } from 'vitest'
import { isWatchable } from './components/HomeTop'

describe('Home watchlist card', () => {
  it('leaves out stablecoins and cash', () => {
    expect(isWatchable({ coin_id: 'tether', coin_symbol: 'usdt', price: 1, category: 'crypto' })).toBe(false)
    expect(isWatchable({ coin_id: 'usd-coin', coin_symbol: 'USDC', price: 1, category: 'crypto' })).toBe(false)
    expect(isWatchable({ coin_id: 'usd', coin_symbol: 'USD', price: 1, category: 'fiat' })).toBe(false)
    expect(isWatchable({ coin_id: 'fiat:eur', coin_symbol: 'EUR', price: 1.1 })).toBe(false)
  })

  it('keeps assets that move, gold included', () => {
    expect(isWatchable({ coin_id: 'ethereum', coin_symbol: 'eth', price: 2685, category: 'crypto' })).toBe(true)
    expect(isWatchable({ coin_id: 'gold', coin_symbol: 'XAU', price: 4142, category: 'gold' })).toBe(true)
    expect(isWatchable({ coin_id: 'ethereum', coin_symbol: 'eth', price: 0 })).toBe(false)
  })
})
