import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  tickerIdsFor, tickerLabel, tickerPlaceholders, INTEREST_TICKER_IDS,
  MAX_TICKER_IDS, MAX_LIVE_CRYPTO, MAX_PLACEHOLDERS,
} from './data/tickerPicks'
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

describe('request cost per tick', () => {
  it('caps the classes that cost one request per symbol', async () => {
    const { tickerIdsFor, MAX_PER_CLASS } = await import('./data/tickerPicks')
    const ids = tickerIdsFor(['crypto', 'stocks', 'etfs', 'gold'])
    const stooq = ids.filter(i => i.startsWith('stock:')).length
    // Crypto is one getMarketData call however many coins return. Stocks are a
    // batch plus one request per ticker the batch missed, against a feed that
    // rate-limits, so this number is what decides whether the strip fills in
    // under a second or takes several.
    expect(stooq).toBeLessThanOrEqual(MAX_PER_CLASS.stocks + MAX_PER_CLASS.etfs)
    expect(stooq).toBeLessThanOrEqual(7)
  })

  it('keeps no hyphenated tickers, which miss the batch', async () => {
    const { INTEREST_TICKER_IDS } = await import('./data/tickerPicks')
    for (const id of [...INTEREST_TICKER_IDS.stocks, ...INTEREST_TICKER_IDS.etfs]) {
      expect(id.slice('stock:'.length), `${id} is a plain symbol`).not.toMatch(/-/)
    }
  })
})

describe('what the strip shows before any price arrives', () => {
  it('shows the classes that were chosen, not crypto', () => {
    // The whole point of asking at onboarding. A stocks user opening the app
    // to BTC/ETH/SOL and watching them be swapped for AAPL a second later saw
    // their own answer arrive last.
    const names = tickerPlaceholders(['stocks']).map(p => p.name)
    expect(names).toContain('AAPL')
    expect(names).not.toContain('BTC')
  })

  it('falls back to crypto only when nothing was chosen', () => {
    expect(tickerPlaceholders([]).map(p => p.name)).toContain('BTC')
    expect(tickerPlaceholders(null).map(p => p.name)).toContain('BTC')
  })

  it('carries no price and no direction', () => {
    // change: 0 renders a green up-arrow, which is a claim about a price that
    // has not loaded.
    for (const p of tickerPlaceholders(['crypto', 'gold'])) {
      expect(p.price).toBeNull()
      expect(p.change).toBeNull()
      expect(p.type).toBe('price')
    }
  })

  it('uses symbols, not coin ids', () => {
    const names = tickerPlaceholders(['crypto']).map(p => p.name)
    expect(names).toContain('BTC')
    expect(names).not.toContain('BITCOIN')
  })

  it('fills a phone row without running long', () => {
    expect(tickerPlaceholders(['crypto', 'stocks', 'etfs', 'gold']).length)
      .toBeLessThanOrEqual(MAX_PLACEHOLDERS)
  })

  it('labels a metal and a currency the same way a quote would', () => {
    expect(tickerPlaceholders(['gold']).map(p => p.name)).toEqual(['GOLD'])
    expect(tickerPlaceholders(['cash']).map(p => p.name)).toContain('EUR')
  })
})

describe('the strip never substitutes one asset class for another', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'components/PriceTicker.jsx'), 'utf8')

  it('does not fall back to the crypto ranking when a choice was made', () => {
    const load = src.slice(src.indexOf('async function load()'))
    const body = load.slice(0, load.indexOf('\n    }') + 6)
    // loadDefault() is the top-of-market crypto list. It may only run when
    // there are no chosen ids at all.
    expect(body).toMatch(/if \(ids\.length\) \{ await loadChosen\([^)]*\); return \}/)
  })

  it('seeds state from the chosen classes instead of a hardcoded row', () => {
    expect(src).toMatch(/useState\(\(\) => tickerPlaceholders\(chosenInterests\(\)\)\)/)
    expect(src).not.toMatch(/name: 'DOGE', price: null/)
  })
})
