import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeFlow, rowsOf, pick, SMART_MONEY_TOKENS } from '../../data-api/feeds.js'
import { fmtFlow } from './components/SmartMoneyTicker.jsx'

// Smart money flow, as a ticker.
//
// Nansen bills by credit and a ticker renders on every page load for every
// visitor, so a browser-initiated call would tie the bill to traffic — one
// good day on Hacker News and the quota is gone. The cron pays once an hour
// and every client reads the file.
//
// The field names cannot be verified from here: the sandbox's egress proxy
// blocks api.nansen.ai and the key is deliberately not available. So the
// parser reads defensively and REPORTS what it could not read, rather than
// publishing an empty ticker that looks like "smart money did nothing".

const here = dirname(fileURLToPath(import.meta.url))
const feeds = readFileSync(join(here, '../../data-api/feeds.js'), 'utf8')
const core = readFileSync(join(here, '../../data-api/core.js'), 'utf8')
const ticker = readFileSync(join(here, 'components/SmartMoneyTicker.jsx'), 'utf8')

describe('reading whatever Nansen sends', () => {
  it('accepts snake_case, camelCase and numeric strings', () => {
    expect(normalizeFlow({ symbol: 'eth', netflow_usd: 12_400_000 }).netflow).toBe(12_400_000)
    expect(normalizeFlow({ tokenSymbol: 'SOL', netflowUsd: '-8100000' }).netflow).toBe(-8_100_000)
    expect(normalizeFlow({ ticker: 'ARB', net_flow_usd: 1 }).symbol).toBe('ARB')
  })

  it('refuses a row it cannot read instead of inventing a zero', () => {
    // A zero netflow renders as "smart money did nothing", which is a claim.
    expect(normalizeFlow({ symbol: 'ETH' })).toBeNull()
    expect(normalizeFlow({ netflow_usd: 5 })).toBeNull()
    expect(pick({ a: 'abc' }, ['a'])).toBeNull()
  })

  it('finds the rows under any of the usual envelope keys', () => {
    expect(rowsOf([1, 2])).toHaveLength(2)
    expect(rowsOf({ data: [1] })).toHaveLength(1)
    expect(rowsOf({ result: [1, 2, 3] })).toHaveLength(3)
    expect(rowsOf({ nothing: true })).toEqual([])
  })

  it('counts what it could not parse rather than dropping it silently', () => {
    // The stock snapshot went sparse for months because parseStooqCsv's
    // `missing` was collected and then thrown away.
    expect(feeds).toMatch(/else unparsed\+\+/)
    expect(feeds).toMatch(/unparsed,/)
  })

  it('publishes why it failed instead of failing silently', () => {
    // A dataset that fails silently is indistinguishable from one that was
    // never deployed, and that ambiguity cost several rounds of "still no
    // ticker". The envelope now carries the upstream's own field names —
    // schema, not data — which is exactly what fixes the mapping.
    expect(feeds).toMatch(/sampleKeys: rows\.length \? Object\.keys\(rows\[0\]\)/)
    expect(feeds).toMatch(/diagnostic: \{/)
  })

  it('probes candidate paths rather than betting on one spelling', async () => {
    // All three shapes of a flat api/v1/token-screener returned 404, and the
    // proxy answers a DISALLOWED endpoint with 403 — so 404 meant the path
    // does not exist, not that it was refused.
    const m = await import('../../data-api/feeds.js')
    expect(m.SMART_MONEY_PATHS.length).toBeGreaterThan(2)
    expect(m.SMART_MONEY_PATHS).toContain('api/v1/tgm/indicators')
  })

  it('keeps a verified endpoint in the list as a control', () => {
    // tgm/indicators is known to work. If it answers while the rest 404, the
    // convention is prefixed paths and the right one is among them.
    expect(feeds).toMatch(/CONTROL/)
  })

  it('counts the 404s and lists everything else', () => {
    // Most candidate paths will 404 and listing them all would push the
    // findings off a phone screen. A path that answers anything else is the
    // finding.
    expect(feeds).toMatch(/if \(res\.status === 404\) \{ notFound\+\+; continue \}/)
    expect(feeds).toMatch(/notFound,/)
  })

  it('probes the proxy health first, as a control', async () => {
    // /health answers without touching Nansen, so 200 there and 404 elsewhere
    // proves the worker is reachable and routing, and that the only thing
    // wrong is which path is being asked for.
    const m = await import('../../data-api/feeds.js')
    expect(m.SMART_MONEY_PATHS[0]).toBe('health')
  })

  it('reports the top-level keys when an endpoint answers with no rows', () => {
    // A 200 with nothing rowsOf recognises means the rows are nested somewhere
    // it does not look, and the key names say where.
    expect(feeds).toMatch(/200\[\$\{Object\.keys/)
  })

  it('publishes no values, only key names', () => {
    // Field names are schema. Publishing a row of live market data into a
    // public file to debug a parser would be a different mistake.
    const block = feeds.slice(feeds.indexOf('diagnostic: {'), feeds.indexOf('diagnostic: {') + 400)
    expect(block).not.toMatch(/Object\.values|rows\[0\]\[/)
  })

  it('leads with the biggest conviction, because a ticker has few slots', () => {
    expect(feeds).toMatch(/Math\.abs\(b\.netflow\) - Math\.abs\(a\.netflow\)/)
  })
})

describe('what it costs', () => {
  it('is fetched by the cron, not by the browser', () => {
    expect(core).toMatch(/'smartmoney\.json':\s*\{\s*maxAge: 60 \* MIN,\s*fetch: fetchSmartMoney\s*\}/)
    // The component must read the published file, never the Nansen proxy.
    expect(ticker).toMatch(/dataUrl\('smartmoney\.json'\)/)
    // Named in a comment; what matters is that it is never fetched.
    expect(ticker).not.toMatch(/walletlens-nansen|api\.nansen\.ai|api\/v1\//)
  })

  it('asks for a bounded set of tokens', () => {
    expect(SMART_MONEY_TOKENS.length).toBeGreaterThan(5)
    expect(SMART_MONEY_TOKENS.length).toBeLessThanOrEqual(25)
  })
})

describe('who sees it', () => {
  it('is gated on the crypto interest', () => {
    // Smart money flow is a crypto-only signal: there is no on-chain wallet
    // labelling for a gold bar or a share of Apple. Someone who picked stocks
    // and metals should not get a strip of token tickers.
    expect(ticker).toMatch(/function hasCrypto\(\)/)
    expect(ticker).toMatch(/v\.includes\('crypto'\)/)
    expect(ticker).toMatch(/localStorage\.getItem\('wl_interests'\)/)
  })

  it('treats an unset list as yes, matching the strip above it', () => {
    // tickerPlaceholders() ends `ids.length ? ids : INTEREST_TICKER_IDS.crypto`,
    // so anyone who never picked sees the crypto PRICE ticker. Requiring an
    // explicit choice here made this strip stricter than that one, and hid it
    // on a screen that was showing BTC and ETH at the time.
    expect(ticker).toMatch(/if \(!Array\.isArray\(v\) \|\| v\.length === 0\) return true/)
    expect(ticker).toMatch(/catch \{ return true \}/)
  })

  it('hides it only for someone who chose, and chose without crypto', () => {
    expect(ticker).toMatch(/return v\.includes\('crypto'\)/)
  })

  it('agrees with the price ticker about the default', () => {
    // If that fallback is ever removed, this gate has to change with it.
    const picks = readFileSync(join(here, 'data/tickerPicks.js'), 'utf8')
    expect(picks).toMatch(/ids\.length \? ids : INTEREST_TICKER_IDS\.crypto/)
  })

  it('skips the request entirely rather than fetching and hiding', () => {
    // A stocks-only user should not pay for a file they will never see.
    expect(ticker).toMatch(/if \(!show\) \{ setFlows\(\[\]\); return \}/)
  })

  it('appears the moment the picker is saved, without a reload', () => {
    // The picker reopens from Settings, and a strip that waits for a reload
    // reads as broken — the same reason PriceTicker listens for this.
    expect(ticker).toMatch(/INTERESTS_EVENT/)
    expect(ticker).toMatch(/window\.addEventListener\(INTERESTS_EVENT, sync\)/)
    expect(ticker).toMatch(/\}, \[show\]\)/)
  })
})

describe('the strip itself', () => {
  it('abbreviates, because a ticker has no room for grouped digits', () => {
    expect(fmtFlow(12_400_000)).toBe('$12.4M')
    expect(fmtFlow(-8_100_000)).toBe('$8.1M')
    expect(fmtFlow(840_000)).toBe('$840K')
    expect(fmtFlow(2_300_000_000)).toBe('$2.3B')
  })

  it('renders nothing at all when there is nothing to say', () => {
    // An empty bar costs a row of a phone screen and says the feature is
    // broken. This covers both a non-crypto user and a reshaped upstream.
    expect(ticker).toMatch(/if \(!show \|\| !flows\.length\) return null/)
  })

  it('sizes the chip by magnitude, not just direction', () => {
    // A $40M move and a $40K move are not the same news.
    expect(ticker).toMatch(/mag >= 1e7 \? 'strong' : mag >= 1e6 \? 'mid' : 'soft'/)
  })
})
