/**
 * Edge worker — stock price proxy
 *
 * After deploying, set STOCK_WORKER_URL in client/src/api.js to your worker URL.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url = new URL(request.url)
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim()

    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // A Cache-Control response header alone doesn't get this response into
    // Cloudflare's edge cache — that only governs downstream/browser caching.
    // Key by normalized symbol (not the raw request URL) so concurrent
    // requests for the same ticker share one upstream round-trip.
    const cache = caches.default
    const cacheKey = new Request(`https://stock-price-cache.internal/${symbol}`, request)
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    // Try Yahoo Finance v8 chart (most reliable)
    try {
      const res = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (res.ok) {
        const data = await res.json()
        const meta = data?.chart?.result?.[0]?.meta
        if (meta && typeof meta.regularMarketPrice === 'number') {
          const response = new Response(JSON.stringify({
            symbol,
            price: meta.regularMarketPrice,
            change_pct: meta.regularMarketChangePercent || 0,
            name: meta.longName || meta.shortName || symbol,
            source: 'yahoo_v8',
          }), { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } })
          ctx.waitUntil(cache.put(cacheKey, response.clone()))
          return response
        }
      }
    } catch { /* fall through */ }

    // Try Stooq CSV
    try {
      const res = await fetch(
        `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}.us&f=sd2t2ohlcvn&h&e=csv`
      )
      if (res.ok) {
        const text = await res.text()
        const lines = text.trim().split('\n')
        if (lines.length >= 2) {
          const headers = lines[0].split(',')
          const values = lines[1].split(',')
          const row = {}
          headers.forEach((h, i) => { row[h] = values[i] })
          const price = parseFloat(row.Close)
          const open = parseFloat(row.Open)
          if (isFinite(price) && price > 0) {
            const response = new Response(JSON.stringify({
              symbol,
              price,
              change_pct: isFinite(open) && open > 0 ? ((price - open) / open) * 100 : 0,
              name: row.Name || symbol,
              source: 'stooq',
            }), { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } })
            ctx.waitUntil(cache.put(cacheKey, response.clone()))
            return response
          }
        }
      }
    } catch { /* fall through */ }

    return new Response(JSON.stringify({ error: 'price unavailable', symbol }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
}
