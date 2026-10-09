/**
 * /api/stock-search?q=aramco — find a listed company on any market.
 *
 * Yahoo's search, server side (it has no CORS headers), cut down to shares
 * and ETFs. Returns { country, results: [{ symbol, name, exchange }] }, where
 * country is the visitor's, from Cloudflare, so one call also tells the
 * picker which market to open.
 */
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
}

export function pickResults(data) {
  const quotes = Array.isArray(data?.quotes) ? data.quotes : []
  return quotes
    .filter(q => q && q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
    .slice(0, 12)
    .map(q => ({
      symbol: String(q.symbol).toUpperCase(),
      name: q.shortname || q.longname || q.symbol,
      exchange: q.exchDisp || q.exchange || '',
    }))
}

export async function onRequestGet(context) {
  const { request } = context
  const country = request.cf?.country || ''
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 60)
  if (q.length < 2) {
    return new Response(JSON.stringify({ country, results: [] }), { headers: HEADERS })
  }
  let results = []
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WalletLens/1.0)' }, signal: AbortSignal.timeout(4000) }
    )
    if (res.ok) results = pickResults(await res.json())
  } catch {}
  return new Response(JSON.stringify({ country, results }), {
    headers: { ...HEADERS, 'Cache-Control': results.length ? 'public, max-age=3600' : 'no-store' },
  })
}
