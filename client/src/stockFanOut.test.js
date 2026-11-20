import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The popular-ticker pre-warm in api.js runs on every page load. It used to
// cost ~100 third-party requests per load for six symbols no batch source can
// price (five Binance bStocks and a delisted ticker), and ~1,600 per load when
// the stock sources were unreachable. These checks keep that from coming back.

const here = dirname(fileURLToPath(import.meta.url))
const api = readFileSync(join(here, 'api.js'), 'utf8')

const fnSource = (name) => {
  const start = api.indexOf(`async function ${name}(`)
  expect(start, `${name} exists`).toBeGreaterThan(-1)
  // The function ends at the first line that is exactly "}".
  const end = api.indexOf('\n}\n', start)
  return api.slice(start, end + 2)
}

// eslint-disable-next-line no-new-func
const mapWithConcurrency = new Function(`${fnSource('mapWithConcurrency')}; return mapWithConcurrency`)()

describe('mapWithConcurrency circuit breaker', () => {
  it('stops once the first batch all failed', async () => {
    const items = Array.from({ length: 130 }, (_, i) => i)
    let calls = 0
    const out = await mapWithConcurrency(items, 6, async () => { calls++; return null }, { giveUpAfter: 6 })
    expect(calls).toBeLessThanOrEqual(12)
    expect(out).toHaveLength(130)
  })

  it('keeps going once anything succeeded', async () => {
    const items = Array.from({ length: 130 }, (_, i) => i)
    let calls = 0
    await mapWithConcurrency(items, 6, async (i) => { calls++; return i === 0 ? 'ok' : null }, { giveUpAfter: 6 })
    expect(calls).toBe(130)
  })

  it('runs everything when no breaker is set', async () => {
    let calls = 0
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9], 2, async () => { calls++; return null })
    expect(calls).toBe(9)
  })

  it('honours a custom success test', async () => {
    let calls = 0
    await mapWithConcurrency(Array.from({ length: 50 }, (_, i) => i), 3,
      async (t) => { calls++; return { t, data: null } }, { giveUpAfter: 3, ok: (r) => !!r.data })
    expect(calls).toBeLessThanOrEqual(6)
  })
})

describe('batch stock refresh', () => {
  const refresh = fnSource('_refreshBatchStocks')

  it('prices bStocks from Binance, not the Stooq/Yahoo chain', () => {
    expect(refresh).toMatch(/fetchBStockQuote\(/)
    expect(refresh).toMatch(/usMissing = missing\.filter\(t => !isIntlTicker\(t\) && !BSTOCK_SYMBOLS/)
  })

  it('caps and breaks the per-ticker fallback', () => {
    expect(refresh).not.toMatch(/Promise\.all\(stillMissing\.map/)
    expect(refresh).toMatch(/mapWithConcurrency\(stillMissing,[\s\S]*giveUpAfter/)
    expect(fnSource('_fetchStocksRemote')).toMatch(/giveUpAfter: YAHOO_FALLBACK_CONCURRENCY/)
  })

  it('skips recently unpriceable tickers, but only marks them when some source answered', () => {
    expect(refresh).toMatch(/recentlyUnpriceable\(t, now\)/)
    expect(refresh).toMatch(/else if \(anyPriced\) \{ stockMissAt\[t\] = now/)
  })

  it('the pre-warm counts unpriceable tickers as warm', () => {
    expect(api).toMatch(/tickers\.every\(t => batchStockCache\[t\] \|\| recentlyUnpriceable\(t\)\)/)
  })
})
