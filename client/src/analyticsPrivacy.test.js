import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// analytics.js opens with a contract, and until now nothing enforced it:
//
//   "NOTHING that describes the user's portfolio may leave the device: no
//    symbols, no value tiers, no asset counts, no asset-class mix, no
//    profit/loss signals, no user-typed text."
//
// VoiceImport was sending `symbols: ready.map(t => t.coin.symbol).join(',')`
// on every import — the user's actual tickers, to Google Analytics, from an
// app whose whole pitch is that they stay on the device. It sat beside
// tx_count, buy_count and sell_count, and it had been there long enough that
// nobody reading the file noticed the first six lines said otherwise.
//
// A comment cannot hold a line that four files call. This can.

const SRC = dirname(fileURLToPath(import.meta.url))

/** Every source file that emits analytics, found rather than listed. */
function trackingFiles(dir = SRC, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) { trackingFiles(p, out); continue }
    if (!/\.jsx?$/.test(e.name) || e.name.endsWith('.test.js')) continue
    // TrackCoin is a PUBLIC landing page — /track/bitcoin and friends, served
    // to strangers for search. Its `coin` is the subject of the page, the way
    // a page title is, and has nothing to do with what the visitor owns; most
    // people who see it have no portfolio at all. Exempted by name and with a
    // reason, so that the exemption is a decision someone can disagree with
    // rather than a hole in the pattern.
    if (e.name === 'TrackCoin.jsx') continue
    const src = readFileSync(p, 'utf8')
    if (/\btrack[A-Z]?\w*\(/.test(src)) out.push([p.slice(SRC.length + 1), src])
  }
  return out
}

/** The params object of every track(...) / trackX(...) call, flattened. */
function trackedParams(src) {
  const out = []
  // THE NAME ARGUMENT IS NOT ALWAYS A STRING LITERAL.
  //
  // This used to require a quoted event name before the params object, so
  //   track(form.type === 'buy' ? 'buy_transaction' : 'sell_transaction', { … })
  // matched nothing and its params were never scanned. The largest leak in the
  // codebase was sitting inside exactly that call — asset_symbol, amount,
  // value_usd and value_tier, on every trade — while this suite reported the
  // contract kept. Match any first argument, up to the params object.
  for (const m of src.matchAll(/\btrack[A-Za-z]*\(\s*(?:[^(){}]*?,\s*)?\{/g)) {
    // Walk braces from the opening one so nested objects come along whole.
    let depth = 0
    for (let i = src.indexOf('{', m.index + m[0].length - 1); i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}' && --depth === 0) {
        out.push(src.slice(m.index, i + 1)); break
      }
    }
  }
  return out
}

describe('the analytics privacy contract is actually kept', () => {
  const files = trackingFiles()

  it('finds the files that emit events', () => {
    expect(files.length, 'no tracking call sites found — the scan is broken').toBeGreaterThan(3)
  })

  it('never sends a symbol, a ticker, or a coin', () => {
    // THE LEAK. Reading `.symbol` inside a tracking call is the shape of it,
    // whatever the param is named.
    for (const [name, src] of files) {
      for (const call of trackedParams(src)) {
        // coin_id is deliberately NOT matched here, and the reason is worth
        // writing down: track() stamps `page: window.location.pathname` onto
        // every event, so on /asset/bitcoin the asset is already in GA through
        // the path. Failing the param while the path carries the same value
        // would demand a change that fixes nothing. Redacting the path is a
        // real option and a separate decision — see the note in analytics.js.
        expect(call, `${name} sends a symbol to analytics`)
          .not.toMatch(/\.symbol\b|\bsymbols?\s*:|\bcoin_symbol\b|\bticker/)
      }
    }
  })

  it('never sends a portfolio count', () => {
    // "no asset counts" — how many holdings, transactions, buys or sells.
    // resultsCount is search results, which is not the portfolio; the pattern
    // below is deliberately anchored to the portfolio words.
    for (const [name, src] of files) {
      for (const call of trackedParams(src)) {
        expect(call, `${name} sends a portfolio count to analytics`)
          .not.toMatch(/\b(tx_count|asset_count|assetCount|buy_count|sell_count|holding_count|coin_count)\b/)
      }
    }
  })

  it('never sends an amount, a value, or a P&L signal', () => {
    for (const [name, src] of files) {
      for (const call of trackedParams(src)) {
        expect(call, `${name} sends a value to analytics`)
          .not.toMatch(/\b(amount|total_value|portfolio_value|pnl|profit|balance)\s*:/)
      }
    }
  })

  it('keeps the contract itself in the file', () => {
    // The rules above are only legible next to the reason for them.
    const analytics = readFileSync(join(SRC, 'analytics.js'), 'utf8')
    expect(analytics).toMatch(/PRIVACY CONTRACT/)
    expect(analytics).toMatch(/no symbols/)
  })
})

// What a trade IS allowed to report, and the hole that hid what it was.
describe('trade events report a category and nothing else', () => {
  const TRADE_FILES = ['components/TradeSheet.jsx', 'pages/Transactions.jsx', 'pages/Dashboard.jsx']

  /** Every buy_transaction / sell_transaction params object in a file. */
  function tradeCalls(src) {
    const out = []
    for (const m of src.matchAll(/track\([^{]*?'(?:buy|sell)_transaction'[^{]*?\{/g)) {
      let depth = 0
      for (let i = src.indexOf('{', m.index + m[0].length - 1); i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}' && --depth === 0) { out.push(src.slice(m.index, i + 1)); break }
      }
    }
    return out
  }

  it.each(TRADE_FILES)('%s sends the category', (file) => {
    const calls = tradeCalls(readFileSync(join(SRC, file), 'utf8'))
    expect(calls.length, `no buy/sell_transaction call found in ${file}`).toBeGreaterThan(0)
    for (const c of calls) expect(c).toMatch(/asset_category:/)
  })

  it.each(TRADE_FILES)('%s sends nothing the contract forbids', (file) => {
    // The exact fourteen params these carried: the ticker, the name, the
    // dollar size and a tier of it, the quantity, the price, the wallet, what
    // it was paid for with, how much of the position went, and the realized
    // profit or loss.
    const FORBIDDEN = /asset_symbol|asset_name|value_usd|value_tier|price_usd|wallet_id|paid_with|received_as|pct_of_position|position_pct_tier|full_exit|realized_pnl|pnl_outcome|\bamount\s*:|\bexchange\s*:/
    for (const c of tradeCalls(readFileSync(join(SRC, file), 'utf8'))) {
      expect(c, `${file} still sends a forbidden trade param`).not.toMatch(FORBIDDEN)
    }
  })

  it('trade_submitted carries the category from every screen', () => {
    // It was missing on two of three, so the GA dimension read "(not set)"
    // for anything added outside the trade sheet.
    for (const file of TRADE_FILES) {
      const src = readFileSync(join(SRC, file), 'utf8')
      for (const m of src.matchAll(/track\('trade_submitted',\s*(\{[^}]*\})/g)) {
        expect(m[1], `${file} sends trade_submitted without a category`).toMatch(/asset_category:/)
      }
    }
  })

  it('the scanner can see an event named by a ternary', () => {
    // The whole reason the leak survived: the old pattern required a quoted
    // event name, and both trade events are named by a conditional.
    const sample = "track(x === 'buy' ? 'buy_transaction' : 'sell_transaction', { asset_symbol: s })"
    expect(trackedParams(sample).length, 'the scanner is blind to ternary-named events again').toBe(1)
  })
})
