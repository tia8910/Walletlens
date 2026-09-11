import { describe, it, expect } from 'vitest'
import { tickerIdsFor, tickerLabel, INTEREST_TICKER_IDS, MAX_TICKER_IDS, MAX_LIVE_CRYPTO } from './data/tickerPicks'
import { GOLD_ID, SILVER_ID, STOCK_PREFIX, FIAT_PREFIX } from './data/assets'

describe('ticker picks from onboarding interests', () => {
  it('shows nothing of its own when the picker was skipped', () => {
    // An empty list is the signal to fall back to top crypto. Returning a
    // default here instead would make the skip indistinguishable from a
    // deliberate choice of crypto.
    expect(tickerIdsFor([])).toEqual([])
    expect(tickerIdsFor(null)).toEqual([])
    expect(tickerIdsFor(['realestate', 'bonds'])).toEqual([])
  })

  it('gives each chosen class a place near the front', () => {
    // Concatenating would bury gold behind five coins, which is past where
    // most people watch the strip.
    const ids = tickerIdsFor(['crypto', 'gold'])
    expect(ids[0]).toBe('bitcoin')
    expect(ids[1]).toBe(GOLD_ID)
  })

  it('covers every class a picker option can produce, or deliberately omits it', () => {
    // Guards a rename in InterestPicker's OPTIONS silently producing a ticker
    // that ignores one of the chips.
    const priced = ['crypto', 'stablecoins', 'stocks', 'etfs', 'gold', 'silver', 'cash', 'commodities']
    for (const id of priced) {
      expect(INTEREST_TICKER_IDS[id], `${id} has symbols`).toBeTruthy()
      expect(INTEREST_TICKER_IDS[id].length).toBeGreaterThan(0)
    }
    // Valued by hand in this app, so there is no quote to scroll.
    expect(INTEREST_TICKER_IDS.realestate).toBeUndefined()
    expect(INTEREST_TICKER_IDS.bonds).toBeUndefined()
  })

  it('reserves room for the other classes beside crypto', () => {
    // Crypto is filled from the live top-of-market ranking, so without a cap
    // of its own it would take the whole budget and someone who picked crypto
    // and gold would swipe past twenty coins to reach the gold.
    expect(MAX_LIVE_CRYPTO).toBeLessThan(MAX_TICKER_IDS)
  })

  it('caps the strip however many classes are chosen', () => {
    const all = Object.keys(INTEREST_TICKER_IDS)
    const ids = tickerIdsFor(all)
    expect(ids.length).toBeLessThanOrEqual(MAX_TICKER_IDS)
    expect(new Set(ids).size, 'no duplicates').toBe(ids.length)
  })

  it('labels each class from the right source', () => {
    // Crypto and metals arrive with a symbol; a stock id does not, so the
    // ticker in the id is the only label available.
    expect(tickerLabel('bitcoin', { symbol: 'btc' })).toBe('BTC')
    expect(tickerLabel(GOLD_ID, {})).toBe('GOLD')
    expect(tickerLabel(SILVER_ID, {})).toBe('SILVER')
    expect(tickerLabel(`${STOCK_PREFIX}aapl`, undefined)).toBe('AAPL')
    expect(tickerLabel(`${FIAT_PREFIX}eur`, undefined)).toBe('EUR')
  })
})
