/**
 * Serverless function — /api/stocks
 * Server-side stock price proxy: fetches from Yahoo Finance with no CORS issues.
 * Supports ?symbols=AAPL,MSFT,NVDA (comma-separated).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

const CACHE_SECONDS = 60

// TWO CEILINGS, AND THIS USED TO BREACH BOTH.
//
// The Buy Asset picker asks for all 130 popular tickers in one call. Stooq got
// an 8s timeout against a client budget of 6s, and every symbol Stooq missed
// then went to Yahoo individually, trying two hosts at 6s each. Worst case was
// around 20 seconds for a caller that had already given up at six, so the
// picker showed a dash for every row and the price field sat on FETCHING.
//
// The harder ceiling is Cloudflare's: 50 subrequests per invocation on the
// free plan. 130 symbols across two Yahoo hosts is up to 260, so a cold call
// for the full list could not have completed at any speed. It is the same
// ceiling that silently truncated push notification sends.
//
// So the budget is now explicit. The deadline is checked before each stage,
// Yahoo is capped and reduced to one host, and whatever arrived in time is
// returned rather than discarded.
const BUDGET_MS = 4500          // comfortably inside the client's timeout
const STOOQ_MS = 3500           // one subrequest, fills nearly everything
const YAHOO_MS = 1500           // per symbol, and only while time remains
const YAHOO_MAX = 12            // 1 + 12 subrequests, far under the 50 cap

// Yahoo exchange suffixes this app treats as foreign markets. A dotted
// ticker outside the list (BRK.B) is a US share class. Kept in step with
// SUFFIX_MARKET in client/src/data/markets.js.
const INTL_SUFFIXES = new Set(['SR', 'CA', 'AE', 'AD', 'QA', 'KW', 'L', 'DE', 'F', 'PA', 'AS', 'MC', 'MI', 'SW',
  'NS', 'BO', 'T', 'HK', 'KS', 'KQ', 'AX', 'TO', 'V', 'SA', 'IS', 'SS', 'SZ', 'TW', 'SI', 'JK', 'KL', 'BK',
  'JO', 'MX', 'ST', 'OL', 'CO', 'HE', 'BR', 'VI', 'WA', 'NZ', 'TA', 'BA', 'SN'])
export function isIntlSymbol(sym) {
  const m = String(sym || '').toUpperCase().match(/\.([A-Z]{1,2})$/)
  return !!(m && INTL_SUFFIXES.has(m[1]))
}
const INTL_MAX = 20

// London quotes in pence, Tel Aviv in agorot, Johannesburg in cents.
const MINOR = { GBp: ['GBP', 100], GBX: ['GBP', 100], ILA: ['ILS', 100], ZAc: ['ZAR', 100], ZAC: ['ZAR', 100] }
export function toMajorUnit(price, currency) {
  const c = String(currency || 'USD')
  if (MINOR[c]) return { price: price / MINOR[c][1], currency: MINOR[c][0] }
  return { price, currency: c.toUpperCase() }
}
// Currencies pegged to the dollar, used when the live rate does not arrive.
const PEGGED_USD = { SAR: 1 / 3.75, AED: 1 / 3.6725, QAR: 1 / 3.64, BHD: 1 / 0.376, OMR: 1 / 0.3845, JOD: 1 / 0.709, HKD: 1 / 7.8 }

async function yahooMeta(sym, ms) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WalletLens/1.0)' }, signal: AbortSignal.timeout(ms) }
  )
  if (!res.ok) return null
  return (await res.json())?.chart?.result?.[0]?.meta || null
}

/** USD per one unit of each currency: Yahoo's FX pairs (SARUSD=X), pegs as backup. */
export async function usdRates(currencies) {
  const rates = { USD: 1 }
  const want = [...new Set(currencies)].filter(c => c && c !== 'USD')
  await Promise.all(want.map(async cur => {
    try {
      const meta = await yahooMeta(`${cur}USD=X`, 1500)
      if (meta?.regularMarketPrice > 0) rates[cur] = meta.regularMarketPrice
    } catch {}
    if (!rates[cur] && PEGGED_USD[cur]) rates[cur] = PEGGED_USD[cur]
  }))
  return rates
}

async function fetchIntl(symbols, deadline) {
  const out = {}
  const quotes = {}
  await Promise.all(symbols.map(async sym => {
    try {
      const meta = await yahooMeta(sym, Math.max(800, Math.min(2500, deadline - Date.now())))
      if (!meta || !(meta.regularMarketPrice > 0)) return
      const prev = meta.chartPreviousClose || meta.previousClose
      const change = typeof meta.regularMarketChangePercent === 'number'
        ? meta.regularMarketChangePercent
        : prev > 0 ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0
      quotes[sym] = { ...toMajorUnit(meta.regularMarketPrice, meta.currency), change, name: meta.longName || meta.shortName || sym }
    } catch {}
  }))
  const rates = await usdRates(Object.values(quotes).map(q => q.currency))
  for (const [sym, q] of Object.entries(quotes)) {
    const fx = rates[q.currency]
    if (!fx) continue // no honest dollar figure: leave it out rather than mislabel it
    out[sym] = { price: q.price * fx, change_pct: q.change, name: q.name, source: 'yahoo', local: { price: q.price, currency: q.currency } }
  }
  return out
}

export async function onRequestGet(context) {
  const { request } = context
  const url = new URL(request.url)
  const raw = (url.searchParams.get('symbols') || url.searchParams.get('symbol') || '').toUpperCase().trim()
  if (!raw) {
    return new Response(JSON.stringify({ error: 'symbols required' }), { status: 400, headers: CORS })
  }

  const symbols = raw.split(',').map(s => s.trim()).filter(Boolean)
  const deadline = Date.now() + BUDGET_MS

  // Edge cache keyed on the sorted symbol set, so requests for the same
  // tickers from every visitor worldwide share one Stooq/Yahoo fetch instead
  // of each hitting the upstream (which rate-limits/IP-blocks aggressively).
  const cacheKey = new Request(
    `https://stocks.cache/${[...new Set(symbols)].sort().join(',')}`,
    { method: 'GET' }
  )
  const cache = caches.default
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const result = {}

  // Foreign listings (2222.SR, COMI.CA, 7203.T) go to Yahoo, which quotes
  // them in local currency; convert to USD here so the client never sees a
  // riyal amount labelled as dollars. US tickers keep the Stooq path below.
  const intl = symbols.filter(isIntlSymbol).slice(0, INTL_MAX)
  const us = symbols.filter(sym => !isIntlSymbol(sym))
  if (intl.length > 0) Object.assign(result, await fetchIntl(intl, deadline))

  // ── 1. Stooq BATCH — one request for ALL symbols. Server-side (no CORS),
  //       lightweight, and avoids the per-symbol rate limiting / IP blocks that
  //       make many parallel Yahoo calls return nothing. This is the reliable
  //       path that fills most symbols in a single fetch. ────────────────────
  try {
    if (us.length === 0) throw new Error('no US symbols')
    const s = us.map(x => `${x.toLowerCase()}.us`).join(';')
    const res = await fetch(
      `https://stooq.com/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlcvn&h&e=csv`,
      { signal: AbortSignal.timeout(STOOQ_MS) }
    )
    if (res.ok) {
      const text = await res.text()
      const lines = text.trim().split('\n')
      if (lines.length >= 2) {
        const headers = lines[0].split(',')
        const iSym = headers.indexOf('Symbol')
        const iClose = headers.indexOf('Close')
        const iOpen = headers.indexOf('Open')
        const iName = headers.indexOf('Name')
        for (let i = 1; i < lines.length; i++) {
          const v = lines[i].split(',')
          const close = parseFloat(v[iClose])
          const open = parseFloat(v[iOpen])
          if (!isFinite(close) || close <= 0) continue
          // Map the row to a requested symbol: prefer the Symbol column when it
          // matches a requested ticker, otherwise fall back to row order (Stooq
          // returns rows in the same order as requested). Relying on the Symbol
          // column alone silently drops everything if its format differs.
          let sym = iSym >= 0 ? (v[iSym] || '').replace(/\.us$/i, '').toUpperCase() : ''
          if (!sym || !us.includes(sym)) sym = us[i - 1]
          if (!sym) continue
          const change = isFinite(open) && open > 0 ? ((close - open) / open) * 100 : 0
          result[sym] = { price: close, change_pct: change, name: (iName >= 0 && v[iName]) || sym, source: 'stooq' }
        }
      }
    }
  } catch {}

  // ── 2. Yahoo Finance v8 — only for symbols Stooq missed, and only a few.
  //
  // One host rather than two, and capped: this is the gap-filler for a handful
  // of tickers Stooq does not carry, not a second full pass. Uncapped it was
  // both the subrequest breach and the reason the response never arrived.
  const missing = us.filter(sym => !result[sym]).slice(0, YAHOO_MAX)
  if (missing.length > 0 && Date.now() < deadline) {
    await Promise.all(missing.map(async sym => {
      if (Date.now() >= deadline) return
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WalletLens/1.0)' }, signal: AbortSignal.timeout(YAHOO_MS) }
        )
        if (!res.ok) return
        const meta = (await res.json())?.chart?.result?.[0]?.meta
        if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
          result[sym] = {
            price: meta.regularMarketPrice,
            change_pct: meta.regularMarketChangePercent || 0,
            name: meta.longName || meta.shortName || sym,
            source: 'yahoo',
          }
        }
      } catch {}
    }))
  }

  const response = new Response(JSON.stringify(result), {
    headers: { ...CORS, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
  })
  // Only cache a response that actually has data — caching a total outage
  // (both upstreams down) would otherwise pin every visitor to an empty
  // result for the full TTL instead of letting the next request retry.
  if (Object.keys(result).length > 0) {
    context.waitUntil(cache.put(cacheKey, response.clone()))
  }
  return response
}
