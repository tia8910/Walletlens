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

// The client gives this whole function a 6s budget before falling back to a
// slower path (see fetchTwelveDataBatch in client/src/api.js). That is what
// sizes the AbortSignal.timeout() calls below: without a cap, one hung
// upstream blocks past the budget and the caller discards the entire
// response, including the symbols that came back fine.

export async function onRequestGet(context) {
  const { request } = context
  const url = new URL(request.url)
  const raw = (url.searchParams.get('symbols') || url.searchParams.get('symbol') || '').toUpperCase().trim()
  if (!raw) {
    return new Response(JSON.stringify({ error: 'symbols required' }), { status: 400, headers: CORS })
  }

  const symbols = raw.split(',').map(s => s.trim()).filter(Boolean)

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

  // ── 1. Stooq BATCH — one request for ALL symbols. Server-side (no CORS),
  //       lightweight, and avoids the per-symbol rate limiting / IP blocks that
  //       make many parallel Yahoo calls return nothing. This is the reliable
  //       path that fills most symbols in a single fetch. ────────────────────
  try {
    const s = symbols.map(x => `${x.toLowerCase()}.us`).join(';')
    const res = await fetch(
      `https://stooq.com/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlcvn&h&e=csv`,
      { signal: AbortSignal.timeout(8000) }
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
          if (!sym || !symbols.includes(sym)) sym = symbols[i - 1]
          if (!sym) continue
          const change = isFinite(open) && open > 0 ? ((close - open) / open) * 100 : 0
          result[sym] = { price: close, change_pct: change, name: (iName >= 0 && v[iName]) || sym, source: 'stooq' }
        }
      }
    }
  } catch {}

  // ── 2. Yahoo Finance v8 — only for symbols Stooq missed. ──────────────────
  const missing = symbols.filter(sym => !result[sym])
  if (missing.length > 0) {
    await Promise.all(missing.map(async sym => {
      for (const host of ['query1', 'query2']) {
        try {
          const res = await fetch(
            `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WalletLens/1.0)' }, signal: AbortSignal.timeout(6000) }
          )
          if (!res.ok) continue
          const meta = (await res.json())?.chart?.result?.[0]?.meta
          if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
            result[sym] = {
              price: meta.regularMarketPrice,
              change_pct: meta.regularMarketChangePercent || 0,
              name: meta.longName || meta.shortName || sym,
              source: 'yahoo',
            }
            return
          }
        } catch {}
      }
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
