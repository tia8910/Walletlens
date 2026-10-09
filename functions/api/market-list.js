/**
 * /api/market-list?market=EG — every stock listed on a market, largest first.
 *
 * One request to TradingView's screener per market returns each listed
 * stock with its last price, day change and market cap, which no single
 * Yahoo endpoint does. Tickers are rewritten to the Yahoo form the rest of
 * the app prices by (EGX:COMI → COMI.CA, TADAWUL:2222 → 2222.SR,
 * HKEX:700 → 0700.HK), and prices come back in the market's currency with
 * the USD figure beside them.
 *
 * Response: { market, total, cols, rows }, where cols names the fields of
 * each row: [t, n, p, cur, u, c] = ticker, name, local price, its currency,
 * USD price (null when no rate is known) and the day's change in percent.
 * Rows rather than objects keep a few thousand stocks small enough to send
 * and cheap to serialise. Cached at the edge for 15 minutes.
 *
 * The screener is not a documented API; if it fails, the response is an
 * empty list and the app keeps showing its popular names for the market.
 */
import { toMajorUnit, usdRates } from './stocks.js'

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

// Market code → TradingView screener market, and the exchanges kept with the
// Yahoo suffix each one maps to. Markets that list on several venues keep
// only the primary one, so a company is not listed twice.
// `only` names a market with a single exchange: every row is taken with that
// suffix whatever venue name the screener gives it, so a renamed or
// unexpected venue code cannot empty the list.
export const SCREENER_MARKETS = {
  US: { tv: 'america', ex: { NYSE: '', NASDAQ: '', AMEX: '' } },
  EG: { tv: 'egypt', ex: { EGX: 'CA' }, only: 'CA' },
  SA: { tv: 'ksa', ex: { TADAWUL: 'SR' }, only: 'SR' },
  AE: { tv: 'uae', ex: { DFM: 'AE', ADX: 'AD' } },
  QA: { tv: 'qatar', ex: { QSE: 'QA' }, only: 'QA' },
  KW: { tv: 'kuwait', ex: { KSE: 'KW' }, only: 'KW' },
  GB: { tv: 'uk', ex: { LSE: 'L' } },
  DE: { tv: 'germany', ex: { XETR: 'DE' } },
  FR: { tv: 'france', ex: { EURONEXT: 'PA' } },
  NL: { tv: 'netherlands', ex: { EURONEXT: 'AS' } },
  ES: { tv: 'spain', ex: { BME: 'MC' } },
  IT: { tv: 'italy', ex: { MIL: 'MI' } },
  CH: { tv: 'switzerland', ex: { SIX: 'SW' } },
  TR: { tv: 'turkey', ex: { BIST: 'IS' } },
  IN: { tv: 'india', ex: { NSE: 'NS' } },
  JP: { tv: 'japan', ex: { TSE: 'T' } },
  HK: { tv: 'hongkong', ex: { HKEX: 'HK' } },
  KR: { tv: 'korea', ex: { KRX: 'KS' } },
  AU: { tv: 'australia', ex: { ASX: 'AX' } },
  CA: { tv: 'canada', ex: { TSX: 'TO', TSXV: 'V' } },
  BR: { tv: 'brazil', ex: { BMFBOVESPA: 'SA' } },
}
// The whole exchange: pages of PAGE rows until the screener's own count is
// reached. MAX_ROWS only guards against a runaway answer; the largest
// markets here (Japan, India, Hong Kong, Korea) list a few thousand.
const PAGE = 2500
const MAX_ROWS = 15000

/** TradingView "EXCH:NAME" → Yahoo ticker, or null for a venue not kept. */
export function toYahooTicker(tvSymbol, market) {
  const cfg = SCREENER_MARKETS[market]
  const [exch, raw] = String(tvSymbol || '').split(':')
  const suffix = cfg?.ex[exch] ?? cfg?.only
  if (suffix == null || !raw) return null
  let name = raw.toUpperCase()
  // US tickers carry no suffix; share classes keep their dot (BRK.B).
  if (suffix === '') return /^[A-Z0-9.]+$/.test(name) ? name : null
  if (suffix === 'HK' && /^\d+$/.test(name)) name = name.padStart(4, '0')
  // Share classes: BT.A on LSE is BT-A.L on Yahoo.
  name = name.replace(/[./]/g, '-')
  return `${name}.${suffix}`
}

/** Screener rows → the response's stocks, before USD conversion. */
export function parseScreener(data, market) {
  const rows = Array.isArray(data?.data) ? data.data : []
  const out = []
  const seen = new Set()
  for (const r of rows) {
    const t = toYahooTicker(r?.s, market)
    const [name, description, close, change, currency, mcap] = Array.isArray(r?.d) ? r.d : []
    if (!t || seen.has(t) || !(close > 0)) continue
    seen.add(t)
    const local = toMajorUnit(close, currency || 'USD')
    out.push({ t, n: description || name || t, p: local.price, cur: local.currency, c: Number(change) || 0, m: Number(mcap) || 0 })
  }
  return out
}

export async function onRequestGet(context) {
  const { request } = context
  const params = new URL(request.url).searchParams
  const market = (params.get('market') || '').toUpperCase()
  // ?debug=1 explains an empty list: what the screener answered and which
  // venues its rows came from. Never cached.
  const debug = params.get('debug') === '1'
  const trace = []
  const cfg = SCREENER_MARKETS[market]
  if (!cfg) return new Response(JSON.stringify({ market, total: 0, cols: [], rows: [] }), { headers: HEADERS })

  // Versioned: the edge cache outlives deploys, and an entry in an older
  // response shape would otherwise be served to a client that cannot read it.
  const cacheKey = new Request(`https://market-list.cache/v3/${market}`)
  const cache = caches.default
  const hit = debug ? null : await cache.match(cacheKey)
  if (hit) return hit

  const scan = async (from, to, types) => {
    const res = await fetch(`https://scanner.tradingview.com/${cfg.tv}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; WalletLens/1.0)' },
      body: JSON.stringify({
        markets: [cfg.tv],
        symbols: { query: { types: [] }, tickers: [] },
        options: { lang: 'en' },
        // Shares and depositary receipts: everything a person can hold as a stock.
        filter: [types.length > 1
          ? { left: 'type', operation: 'in_range', right: types }
          : { left: 'type', operation: 'equal', right: types[0] }],
        columns: ['name', 'description', 'close', 'change', 'currency', 'market_cap_basic'],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        range: [from, to],
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) { trace.push({ from, types, status: res.status, body: debug ? (await res.text()).slice(0, 300) : undefined }); return null }
    const data = await res.json()
    if (debug) {
      const venues = {}
      for (const r of data?.data || []) { const v = String(r?.s || '').split(':')[0]; venues[v] = (venues[v] || 0) + 1 }
      trace.push({ from, types, status: res.status, totalCount: data?.totalCount, rows: data?.data?.length || 0, venues, sample: (data?.data || []).slice(0, 3) })
    }
    return data
  }

  let stocks = []
  let total = 0
  const seen = new Set()
  for (const types of [['stock', 'dr'], ['stock']]) { // the plain filter if the list filter is refused
    try {
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        const data = await scan(from, from + PAGE, types)
        if (!data) break
        total = Number(data.totalCount) || total
        for (const x of parseScreener(data, market)) if (!seen.has(x.t)) { seen.add(x.t); stocks.push(x) }
        if (!Array.isArray(data.data) || data.data.length < PAGE || from + PAGE >= total) break
      }
    } catch (err) { trace.push({ types, error: String(err?.message || err) }) }
    if (stocks.length) break
  }

  const rows = []
  if (stocks.length) {
    const rates = await usdRates([...new Set(stocks.map(x => x.cur))])
    for (const x of stocks) {
      const u = rates[x.cur] ? +(x.p * rates[x.cur]).toPrecision(6) : null
      rows.push([x.t, x.n, x.p, x.cur, u, +x.c.toFixed(2)])
    }
  }
  if (debug) {
    return new Response(JSON.stringify({ market, kept: rows.length, total, trace, first: rows.slice(0, 5) }, null, 2), { headers: { ...HEADERS, 'Cache-Control': 'no-store' } })
  }
  const response = new Response(JSON.stringify({ market, total: Math.max(total, rows.length), cols: ['t', 'n', 'p', 'cur', 'u', 'c'], rows }), {
    headers: { ...HEADERS, 'Cache-Control': rows.length ? 'public, max-age=900' : 'no-store' },
  })
  if (rows.length) context.waitUntil?.(cache.put(cacheKey, response.clone()))
  return response
}
