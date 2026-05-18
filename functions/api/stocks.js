/**
 * Cloudflare Pages Function — /api/stocks
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

export async function onRequestGet({ request }) {
  const url = new URL(request.url)
  const raw = (url.searchParams.get('symbols') || url.searchParams.get('symbol') || '').toUpperCase().trim()
  if (!raw) {
    return new Response(JSON.stringify({ error: 'symbols required' }), { status: 400, headers: CORS })
  }

  const symbols = raw.split(',').map(s => s.trim()).filter(Boolean)
  const result = {}

  await Promise.all(symbols.map(async sym => {
    // Yahoo Finance v8 chart — runs server-side, no CORS issues
    for (const host of ['query1', 'query2']) {
      try {
        const res = await fetch(
          `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WalletLens/1.0)' } }
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

    // Fallback: Stooq CSV
    try {
      const res = await fetch(
        `https://stooq.com/q/l/?s=${encodeURIComponent(sym.toLowerCase())}.us&f=sd2t2ohlcvn&h&e=csv`
      )
      if (res.ok) {
        const text = await res.text()
        const lines = text.trim().split('\n')
        if (lines.length >= 2) {
          const headers = lines[0].split(',')
          const vals = lines[1].split(',')
          const row = {}
          headers.forEach((h, i) => { row[h] = vals[i] })
          const close = parseFloat(row.Close)
          const open = parseFloat(row.Open)
          if (isFinite(close) && close > 0) {
            const change = isFinite(open) && open > 0 ? ((close - open) / open) * 100 : 0
            result[sym] = { price: close, change_pct: change, name: row.Name || sym, source: 'stooq' }
            return
          }
        }
      }
    } catch {}
  }))

  return new Response(JSON.stringify(result), {
    headers: { ...CORS, 'Cache-Control': 'public, max-age=60' },
  })
}
