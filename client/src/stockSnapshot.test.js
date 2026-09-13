import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POPULAR_TICKERS } from './data/assets.js'

// Stock prices, the way crypto prices already work.
//
// Crypto does no live upstream work per request: a cron writes market.json and
// every client reads that one file from its own origin. Stocks did the
// opposite — the Buy Asset picker asked /api/stocks for all 130 popular
// tickers and that function queried Stooq and Yahoo live, per request, per
// visitor.
//
// It could not have worked. 130 symbols across two Yahoo hosts is up to 260
// subrequests against Cloudflare's limit of 50 per invocation, and the
// function's timeouts summed past the caller's budget. Every row showed a dash
// and the price field sat on FETCHING — including for a single selected
// ticker, because getPrices routes one stock through the same batch path.

const here = dirname(fileURLToPath(import.meta.url))
const api = readFileSync(join(here, 'api.js'), 'utf8')
const fn = readFileSync(join(here, '../../functions/api/stocks.js'), 'utf8')
const feeds = readFileSync(join(here, '../../data-api/feeds.js'), 'utf8')

const datasetTickers = (() => {
  const block = feeds.match(/export const TICKERS = \[([\s\S]*?)\n\]/)[1]
  return new Set([...block.matchAll(/'([^']+)'/g)].map((m) => m[1]))
})()
const bStock = new Set(
  [...api.matchAll(/^\s{2}([a-z]+):\s*'[A-Z]/gm)].map((m) => m[1].toUpperCase())
)

describe('the snapshot covers what the picker shows', () => {
  it('parsed both lists', () => {
    expect(POPULAR_TICKERS.length).toBeGreaterThan(100)
    expect(datasetTickers.size).toBeGreaterThan(100)
  })

  it('carries every popular ticker Stooq can price', () => {
    // A ticker in the picker but not in the dataset falls through to the live
    // path, which is the slow one this change exists to stop using.
    const missing = POPULAR_TICKERS
      .map((t) => t.ticker)
      .filter((t) => !datasetTickers.has(t) && !bStock.has(t))
    expect(missing).toEqual([])
  })

  it('does not pretend to carry the bStock tickers', () => {
    // Binance tokenized securities are not on Stooq. They have their own live
    // path and must not be expected in the snapshot.
    for (const t of ['NVDAB', 'TSLAB', 'CRCLB']) {
      expect(datasetTickers.has(t), `${t} is not a Stooq symbol`).toBe(false)
    }
  })
})

describe('the batch path reads the file first', () => {
  it('asks the snapshot before anything remote', () => {
    const body = api.slice(api.indexOf('async function fetchTwelveDataBatch'))
    const snap = body.indexOf('fetchStaticStockPrices()')
    const remote = body.indexOf('_fetchStocksRemote(')
    expect(snap).toBeGreaterThan(-1)
    expect(snap, 'the remote call happens before the file is consulted').toBeLessThan(remote)
  })

  it('skips the network entirely when the file covers everything', () => {
    expect(api).toMatch(/if \(remaining\.length === 0\) return out;/)
  })

  it('asks the edge only about what is genuinely missing', () => {
    // Passing the full list again would rebuild the request that broke.
    expect(api).toMatch(/const live = await _fetchStocksRemote\(remaining\);/)
  })

  it('reads the file under the key the dataset writes', () => {
    // parseStooqCsv writes `stock:aapl`; the batch path works in bare tickers.
    expect(api).toMatch(/staticPrices\[`\$\{STOCK_PREFIX\}\$\{String\(t\)\.toLowerCase\(\)\}`\]/)
  })
})

describe('building the snapshot', () => {
  it('asks Stooq in batches it will actually answer', () => {
    // One request for all 125 symbols came back mostly N/D, which is how the
    // published file ended up with a handful of prices in it.
    expect(feeds).toMatch(/export const STOOQ_CHUNK = 20/)
    expect(feeds).toMatch(/for \(const group of chunk\(TICKERS, STOOQ_CHUNK\)\)/)
  })

  it('does not discard the symbols Stooq could not price', () => {
    // parseStooqCsv has always returned `missing`. fetchStockPrices threw it
    // away, so a dash in the picker was the only place it ever surfaced.
    expect(feeds).toMatch(/unpriced\.push\(\.\.\.missing\)/)
    expect(feeds).toMatch(/query1\.finance\.yahoo\.com/)
  })

  it('loses one batch, not the file, when a request fails', () => {
    expect(feeds).toMatch(/unpriced\.push\(\.\.\.group\)/)
  })

  it('stays under the 50-subrequest ceiling', async () => {
    const m = await import('../../data-api/feeds.js')
    const worst = m.chunk(m.TICKERS, m.STOOQ_CHUNK).length + m.YAHOO_FALLBACK_MAX
    expect(worst, `worst case ${worst} subrequests`).toBeLessThan(50)
  })

  it('reports how many are still missing, so a drop is visible', () => {
    expect(feeds).toMatch(/missing: missing\.length/)
  })

  it('chunks evenly, remainder included', async () => {
    const { chunk } = await import('../../data-api/feeds.js')
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })
})

describe('the live path stays inside both ceilings', () => {
  it('caps Yahoo so one invocation cannot breach the subrequest limit', () => {
    expect(fn).toMatch(/const YAHOO_MAX = 12/)
    expect(fn).toMatch(/\.slice\(0, YAHOO_MAX\)/)
  })

  it('queries one Yahoo host, not two', () => {
    // Two hosts doubled the subrequest count for zero extra coverage.
    expect(fn).not.toMatch(/\['query1', 'query2'\]/)
    expect(fn).toMatch(/query1\.finance\.yahoo\.com/)
  })

  it('stops when the budget is spent instead of overrunning the caller', () => {
    expect(fn).toMatch(/const deadline = Date\.now\(\) \+ BUDGET_MS/)
    expect(fn).toMatch(/if \(Date\.now\(\) >= deadline\) return/)
  })

  it('keeps the function budget under the client timeout', () => {
    const budget = Number(fn.match(/const BUDGET_MS = (\d+)/)[1])
    const clientMs = Number(api.match(/\/api\/stocks\?symbols=[^`]*`;\s*\n\s*const res = await fetchWithTimeout\(url, (\d+)\)/)[1])
    // The old pairing was 20s of upstream work against a 6s client timeout,
    // so the response was discarded even when it eventually arrived.
    expect(budget).toBeLessThan(clientMs)
  })
})
