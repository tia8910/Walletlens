import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rankCatalogueMatches } from './api.js'

// The top 1000, and a picker that still works when CoinGecko does not.
//
// Adding a holding searched CoinGecko's /search directly, so every coin was
// findable right up until the request failed — and on a device that cannot
// reach any third-party host, it always fails. /diag on one such device: every
// cross-origin request refused in 3-5ms while same-origin answered in ~430ms.
// The picker was not showing a short list on that phone. It was showing none.
//
// coins.json is the same-origin answer: 1000 coins by market cap, slim enough
// to be worth shipping because it drops everything a list does not draw.

const here = dirname(fileURLToPath(import.meta.url))
const feeds = readFileSync(join(here, '../../data-api/feeds.js'), 'utf8')
const core = readFileSync(join(here, '../../data-api/core.js'), 'utf8')
const entry = readFileSync(join(here, '../scripts/pages-worker-entry.js'), 'utf8')
const config = readFileSync(join(here, '../vite.config.js'), 'utf8')

const coin = (symbol, name, rank) => ({ id: name.toLowerCase(), symbol, name, rank, image: 'i' })
const SAMPLE = [
  coin('eth', 'Ethereum', 2),
  coin('btc', 'Bitcoin', 1),
  coin('ethw', 'EthereumPoW', 220),
  coin('weth', 'Wrapped Ether', 18),
  coin('beth', 'Binance Beacon ETH', 640),
]

describe('searching the catalogue', () => {
  it('puts the exact ticker first, whatever its rank', () => {
    // Typing eth must offer Ethereum, not a rank-640 token that contains it.
    expect(rankCatalogueMatches(SAMPLE, 'eth')[0].name).toBe('Ethereum')
  })

  it('prefers a symbol prefix over a name match', () => {
    const names = rankCatalogueMatches(SAMPLE, 'eth').map((c) => c.name)
    expect(names.indexOf('EthereumPoW')).toBeLessThan(names.indexOf('Wrapped Ether'))
  })

  it('breaks ties by market cap rank, not array order', () => {
    const r = rankCatalogueMatches([coin('x', 'Zeta', 900), coin('x', 'Alpha', 4)], 'x')
    expect(r[0].name).toBe('Alpha')
  })

  it('matches on name as well as symbol', () => {
    expect(rankCatalogueMatches(SAMPLE, 'wrapped')[0].name).toBe('Wrapped Ether')
  })

  it('returns nothing for an empty query rather than everything', () => {
    expect(rankCatalogueMatches(SAMPLE, '  ')).toEqual([])
  })

  it('hands back the shape the picker already renders', () => {
    // TradeSheet and Transactions consume {id, symbol, name, thumb, large}
    // from CoinGecko's /search. The fallback has to be a drop-in.
    expect(Object.keys(rankCatalogueMatches(SAMPLE, 'btc')[0]).sort())
      .toEqual(['id', 'large', 'name', 'symbol', 'thumb'])
  })

  it('caps the list, because a picker is not a spreadsheet', () => {
    const many = Array.from({ length: 80 }, (_, i) => coin('ab' + i, 'Ab' + i, i))
    expect(rankCatalogueMatches(many, 'ab')).toHaveLength(20)
  })
})

describe('the catalogue feed', () => {
  it('pages to 1000, because CoinGecko caps per_page at 250', () => {
    expect(feeds).toMatch(/export const COIN_PAGES = 4/)
    expect(feeds).toMatch(/per_page=250&page=\$\{page\}/)
  })

  it('ships no sparkline, which is what buys the extra 750 coins', () => {
    const url = feeds.slice(feeds.indexOf('export const coinsUrl'))
    expect(url.slice(0, 300)).toContain('sparkline=false')
  })

  it('keeps the pages it got when a later one fails', () => {
    // A rate-limited page 4 must not throw away the first 750. The next run
    // starts from page 1 regardless.
    expect(feeds).toMatch(/if \(!rows\) break/)
  })

  it('guards the rate-limit trap that parseMarket guards', () => {
    // CoinGecko answers a throttled request with a short valid JSON body, so
    // "did it parse" is not "is this a page of coins".
    expect(feeds).toMatch(/if \(!Array\.isArray\(data\) \|\| data\.length < 50\) return null/)
  })

  it('de-duplicates across pages, which overlap as ranks move', () => {
    expect(feeds).toMatch(/seen\.has\(c\.id\)/)
  })

  it('refreshes far less often than prices do', () => {
    // Four CoinGecko calls per run against a free-tier limit, for data whose
    // whole purpose is finding a coin by name.
    expect(core).toMatch(/'coins\.json':\s*\{ maxAge: 12 \* 60 \* MIN, fetch: fetchCoins \}/)
  })
})

describe('the site serves it', () => {
  it('routes /coins.json to the data worker', () => {
    // Same-origin is the entire point: a device that cannot reach
    // api.coingecko.com reaches walletlens.live fine.
    expect(entry).toMatch(/'\/coins\.json'/)
  })

  it('lists it in _routes.json, or Pages never invokes the worker', () => {
    expect(config).toMatch(/'\/coins\.json'/)
  })
})
