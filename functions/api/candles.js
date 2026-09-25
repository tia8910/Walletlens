/**
 * Serverless function — /api/candles
 * OHLC candles for stocks and metals, for the indicator chart.
 *
 *   /api/candles?symbol=AAPL&interval=1d     (interval: 15m, 1h, 4h, 1d, 1w)
 *
 * Crypto charts read Binance straight from the browser. Stocks had no such
 * source: the browser went to Stooq and then through a chain of public CORS
 * proxies, each with its own timeout, so the chart sat on "Fetching" for up
 * to half a minute and usually ended empty. Server-side there is no CORS, so
 * this asks Yahoo directly (real highs and lows, intraday too) and falls back
 * to Stooq's daily CSV for daily and weekly candles.
 *
 * Response: { symbol, interval, source, candles: [{ t, o, h, l, c }], tried },
 * where t is the candle's open time in ms and `tried` lists each upstream
 * asked and what it answered, so an empty chart can be diagnosed from the
 * URL alone. An empty list means no source answered.
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

// Yahoo's own interval and range per timeframe. Yahoo has no 4h candles, so
// 4h is built from hourly ones. Ranges leave room for the 200-candle EMA
// warm-up before the ~120 candles on screen.
export const PLANS = {
  '15m': { interval: '15m', range: '1mo' },
  '1h': { interval: '60m', range: '3mo' },
  '4h': { interval: '60m', range: '1y', group: 4 },
  '1d': { interval: '1d', range: '2y' },
  '1w': { interval: '1wk', range: '10y' },
}

const CACHE_SECONDS = 300
// Yahoo turns away requests that do not look like a browser.
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
}
const YAHOO_MS = 4000
const STOOQ_MS = 3500

/** Yahoo chart JSON → candles. Rows with a missing or non-positive field are dropped. */
export function parseYahoo(data) {
  const r = data?.chart?.result?.[0]
  const q = r?.indicators?.quote?.[0]
  const ts = r?.timestamp
  if (!q || !Array.isArray(ts)) return []
  const out = []
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
    if ([o, h, l, c].every(v => typeof v === 'number' && isFinite(v) && v > 0) && h >= l) {
      out.push({ t: ts[i] * 1000, o, h, l, c })
    }
  }
  return out
}

/**
 * Merge every `n` hourly candles of the same trading day into one. Grouping
 * restarts each day, so a session's last partial group never borrows hours
 * from the next day's open.
 */
export function groupCandles(candles, n) {
  const out = []
  let cur = null, day = null, count = 0
  for (const k of candles) {
    const d = new Date(k.t).toISOString().slice(0, 10)
    if (!cur || d !== day || count >= n) {
      if (cur) out.push(cur)
      cur = { ...k }
      day = d
      count = 1
    } else {
      cur.h = Math.max(cur.h, k.h)
      cur.l = Math.min(cur.l, k.l)
      cur.c = k.c
      count++
    }
  }
  if (cur) out.push(cur)
  return out
}

/** Stooq daily CSV (Date,Open,High,Low,Close,Volume) → candles, optionally weekly. */
export function parseStooq(text, weekly = false) {
  const lines = String(text || '').trim().split('\n')
  if (lines.length < 2) return []
  const head = lines[0].split(',')
  const at = (k) => head.indexOf(k)
  const iD = at('Date'), iO = at('Open'), iH = at('High'), iL = at('Low'), iC = at('Close')
  if ([iD, iO, iH, iL, iC].some(i => i < 0)) return []
  const days = []
  for (const line of lines.slice(1)) {
    const v = line.split(',')
    const t = Date.parse(v[iD] + 'T00:00:00Z')
    const o = +v[iO], h = +v[iH], l = +v[iL], c = +v[iC]
    if (isFinite(t) && [o, h, l, c].every(x => isFinite(x) && x > 0) && h >= l) days.push({ t, o, h, l, c })
  }
  if (!weekly) return days
  // Weeks start on Monday (UTC).
  const out = []
  for (const k of days) {
    const d = new Date(k.t)
    const monday = k.t - ((d.getUTCDay() + 6) % 7) * 86400000
    const last = out[out.length - 1]
    if (last && last.week === monday) {
      last.h = Math.max(last.h, k.h); last.l = Math.min(last.l, k.l); last.c = k.c
    } else {
      out.push({ week: monday, t: monday, o: k.o, h: k.h, l: k.l, c: k.c })
    }
  }
  return out.map(({ week, ...k }) => k)
}

// Tickers are letters, digits and . - = ^ (BRK-B, GC=F, ^GSPC).
const SYMBOL_RE = /^[A-Z0-9.\-=^]{1,15}$/

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim()
  const interval = url.searchParams.get('interval') || '1d'
  const plan = PLANS[interval]
  if (!SYMBOL_RE.test(symbol) || !plan) {
    return new Response(JSON.stringify({ error: 'symbol and a valid interval are required' }), { status: 400, headers: CORS })
  }

  const cacheKey = new Request(`https://candles.cache/${symbol}/${interval}`, { method: 'GET' })
  const cache = caches.default
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  let candles = []
  let source = ''
  const tried = []

  // 1. Yahoo, one host then the other.
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${plan.interval}&range=${plan.range}`,
        { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(YAHOO_MS) }
      )
      if (!res.ok) { tried.push(`${host}: HTTP ${res.status}`); continue }
      const rows = parseYahoo(await res.json())
      tried.push(`${host}: ${rows.length} candles`)
      if (rows.length > 10) {
        candles = plan.group ? groupCandles(rows, plan.group) : rows
        source = 'yahoo'
        break
      }
    } catch (err) { tried.push(`${host}: ${err?.name || 'error'}`) }
  }

  // 2. Stooq's daily history, for daily and weekly candles. US tickers carry
  //    a .us suffix there; futures-style symbols (GC=F) do not exist on Stooq.
  if (!candles.length && (interval === '1d' || interval === '1w') && !symbol.includes('=')) {
    try {
      const res = await fetch(
        `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase().replace(/-/g, '.') + '.us')}&i=d`,
        { signal: AbortSignal.timeout(STOOQ_MS) }
      )
      if (res.ok) {
        const rows = parseStooq(await res.text(), interval === '1w')
        tried.push(`stooq: ${rows.length} candles`)
        if (rows.length > 10) { candles = rows.slice(-800); source = 'stooq' }
      } else tried.push(`stooq: HTTP ${res.status}`)
    } catch (err) { tried.push(`stooq: ${err?.name || 'error'}`) }
  }

  const response = new Response(JSON.stringify({ symbol, interval, source, candles, tried }), {
    headers: { ...CORS, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
  })
  // An outage is not cached, so the next request tries again.
  if (candles.length) context.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}
