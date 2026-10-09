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
 * Response: { market, total, stocks: [{ t, n, p, cur, u, c, m }] }, where
 * t is the ticker, n the name, p the local price, cur its currency, u the
 * USD price (null when no rate is known), c the day's change in percent and
 * m the market cap in local currency. Cached at the edge for 15 minutes.
 *
 * The screener is not a documented API; if it fails, the response is an
 * empty list and the app keeps showing its popular names for the market.
 */
import { toMajorUnit, usdRates } from './stocks.js'

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

// Market code → TradingView screener market, and the exchanges kept with the
// Yahoo suffix each one maps to. Markets that list on several venues keep
// only the primary one, so a company is not listed twice.
export const SCREENER_MARKETS = {
  EG: { tv: 'egypt', ex: { EGX: 'CA' } },
  SA: { tv: 'ksa', ex: { TADAWUL: 'SR' } },
  AE: { tv: 'uae', ex: { DFM: 'AE', ADX: 'AD' } },
  QA: { tv: 'qatar', ex: { QSE: 'QA' } },
  KW: { tv: 'kuwait', ex: { KSE: 'KW' } },
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
const MAX_ROWS = 1000

/** TradingView "EXCH:NAME" → Yahoo ticker, or null for a venue not kept. */
export function toYahooTicker(tvSymbol, market) {
  const cfg = SCREENER_MARKETS[market]
  const [exch, raw] = String(tvSymbol || '').split(':')
  const suffix = cfg?.ex[exch]
  if (!suffix || !raw) return null
  let name = raw.toUpperCase()
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
  const market = (new URL(request.url).searchParams.get('market') || '').toUpperCase()
  const cfg = SCREENER_MARKETS[market]
  if (!cfg) return new Response(JSON.stringify({ market, total: 0, stocks: [] }), { headers: HEADERS })

  const cacheKey = new Request(`https://market-list.cache/${market}`)
  const cache = caches.default
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  let stocks = []
  let total = 0
  try {
    const res = await fetch(`https://scanner.tradingview.com/${cfg.tv}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; WalletLens/1.0)' },
      body: JSON.stringify({
        markets: [cfg.tv],
        symbols: { query: { types: [] }, tickers: [] },
        options: { lang: 'en' },
        filter: [{ left: 'type', operation: 'equal', right: 'stock' }],
        columns: ['name', 'description', 'close', 'change', 'currency', 'market_cap_basic'],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        range: [0, MAX_ROWS],
      }),
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const data = await res.json()
      stocks = parseScreener(data, market)
      total = Number(data?.totalCount) || stocks.length
    }
  } catch {}

  if (stocks.length) {
    const rates = await usdRates([...new Set(stocks.map(x => x.cur))])
    for (const x of stocks) x.u = rates[x.cur] ? x.p * rates[x.cur] : null
  }
  const response = new Response(JSON.stringify({ market, total, stocks }), {
    headers: { ...HEADERS, 'Cache-Control': stocks.length ? 'public, max-age=900' : 'no-store' },
  })
  if (stocks.length) context.waitUntil?.(cache.put(cacheKey, response.clone()))
  return response
}
