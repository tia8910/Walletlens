/**
 * Market data for the push crons.
 *
 * Runs server-side, so none of the CORS gymnastics in client/src/api.js apply
 * and the upstreams can be called directly. Plain JS with nothing but `fetch`
 * so the parsers can be unit-tested in Node alongside notify-logic.js.
 *
 * Everything here is best-effort by design: a cron that throws because Yahoo
 * had a bad minute would take the price-target alerts down with it, so each
 * source fails to an empty result and the callers simply skip assets they have
 * no quote for.
 */

const TIMEOUT_MS = 8000

/** One map key for an asset across all three asset classes. */
export function quoteKey(kind, id) {
  return `${kind || 'crypto'}:${String(id).toLowerCase()}`
}

async function getJson(url, headers = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'WalletLens/1.0', Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Crypto (CoinGecko) ──────────────────────────────────────────────────────
// simple/price takes every id in one request, which keeps a few hundred
// subscriptions inside the free tier's rate limit.
const CG_BATCH = 200

/** @returns {Record<string, {price:number, change24h:number}>} keyed by coin id */
export function parseCoinGecko(json, ids) {
  const out = {}
  for (const id of ids) {
    const row = json?.[id]
    const price = Number(row?.usd)
    if (!Number.isFinite(price) || price <= 0) continue
    out[id] = { price, change24h: Number(row?.usd_24h_change) || 0 }
  }
  return out
}

/**
 * CoinGecko ID -> Yahoo Finance symbol mapping.
 *
 * CoinGecko is unreliable from Cloudflare Workers (silent failures that
 * leave every subscription without crypto price data), so Yahoo Finance
 * is the primary source.  Yahoo uses TICKER-USD symbols for crypto,
 * which is the same format it uses for stocks.
 */
const CG_TO_YAHOO = {
  'bitcoin': 'BTC-USD', 'ethereum': 'ETH-USD', 'tether': 'USDT-USD',
  'binancecoin': 'BNB-USD', 'solana': 'SOL-USD', 'ripple': 'XRP-USD',
  'usd-coin': 'USDC-USD', 'usdc': 'USDC-USD', 'dogecoin': 'DOGE-USD', 'cardano': 'ADA-USD',
  'tron': 'TRX-USD', 'chainlink': 'LINK-USD', 'avalanche-2': 'AVAX-USD',
  'stellar': 'XLM-USD', 'the-open-network': 'TON-USD',
  'shiba-inu': 'SHIB-USD', 'hedera-hashgraph': 'HBAR-USD',
  'polkadot': 'DOT-USD', 'bitcoin-cash': 'BCH-USD', 'uniswap': 'UNI-USD',
  'litecoin': 'LTC-USD', 'matic-network': 'MATIC-USD', 'near': 'NEAR-USD',
  'internet-computer': 'ICP-USD', 'arweave': 'AR-USD',
  'sui': 'SUI-USD', 'aave': 'AAVE-USD', 'algorand': 'ALGO-USD',
  'the-graph': 'GRT-USD', 'filecoin': 'FIL-USD', 'render-token': 'RENDER-USD',
  'fantom': 'FTM-USD', 'cosmos': 'ATOM-USD', 'ethereum-classic': 'ETC-USD',
  'immutable-x': 'IMX-USD', 'optimism': 'OP-USD', 'arbitrum': 'ARB-USD',
  'sei-network': 'SEI-USD', 'injective-protocol': 'INJ-USD',
  'celestia': 'TIA-USD', 'ondo-finance': 'ONDO-USD', 'pepe': 'PEPE-USD',
  'bonk': 'BONK-USD', 'floki': 'FLOKI-USD', 'kaspa': 'KAS-USD',
  'vechain': 'VET-USD', 'theta-token': 'THETA-USD',
  'the-sandbox': 'SAND-USD', 'decentraland': 'MANA-USD', 'axie-infinity': 'AXS-USD',
  'curve-dao-token': 'CRV-USD', 'gmx': 'GMX-USD', 'pendle': 'PENDLE-USD',
  'jupiter': 'JUP-USD', 'jito-governance-token': 'JTO-USD',
  'wormhole': 'W-USD', 'starknet': 'STRK-USD', 'zksync': 'ZK-USD',
  'worldcoin-wld': 'WLD-USD', 'blur': 'BLUR-USD', 'dydx-chain': 'DYDX-USD',
  'pyth-network': 'PYTH-USD', 'beam-2': 'BEAM-USD', 'mantle': 'MNT-USD',
  'gate-token': 'GT-USD', 'crypto-com-chain': 'CRO-USD',
  'eos': 'EOS-USD', 'maker': 'MKR-USD', 'fetch-ai': 'FET-USD',
  'lido-dao': 'LDO-USD', 'rocket-pool': 'RPL-USD',
  'pancakeswap-token': 'CAKE-USD', 'convex-finance': 'CVX-USD',
  'yearn-finance': 'YFI-USD', 'enjincoin': 'ENJ-USD', 'chiliz': 'CHZ-USD',
  'neo': 'NEO-USD', 'kucoin-token': 'KCS-USD', 'okb': 'OKB-USD',
  'leo-token': 'LEO-USD', 'wrapped-bitcoin': 'WBTC-USD',
  'staked-ether': 'STETH-USD', 'wrapped-steth': 'WSTETH-USD',
  'trust-wallet-token': 'TWT-USD', 'flow': 'FLOW-USD',
  'mina-protocol': 'MINA-USD', 'moonbeam': 'GLMR-USD',
  'moonriver': 'MOVR-USD', 'celo': 'CELO-USD',
  'cronos': 'CRO-USD', 'kava': 'KAVA-USD',
  'ocean-protocol': 'OCEAN-USD', 'ankr': 'ANKR-USD',
  'waves': 'WAVES-USD', 'loopring': 'LRC-USD',
  'livepeer': 'LPT-USD', 'synthetix-network-token': 'SNX-USD',
  'compound-governance-token': 'COMP-USD',
  'raydium': 'RAY-USD', 'orca': 'ORCA-USD',
  'helium': 'HNT-USD', 'oasis-network': 'ROSE-USD',
  'qtum': 'QTUM-USD', 'nervos-network': 'CKB-USD',
  'layerzero': 'ZRO-USD', 'eigenlayer': 'EIGEN-USD',
  'ethena': 'ENA-USD', 'sei': 'SEI-USD',
}

/** Try Yahoo Finance first (works from CF Workers), fall back to CoinGecko. */
/**
 * Verified CoinGecko-ID → Coinbase-symbol map.
 *
 * Coinbase works from CF Workers (Binance and CoinGecko are blocked).
 * Only coins whose Coinbase symbol matches are listed here.
 * Coinbase uses TICKER-USD format.
 */
const COINBASE_MAP = {
  'aptos': 'APT',
  'sei-network': 'SEI',
  'moodeng': 'MOODENG',
  'dog': 'DOG',
}

export async function fetchCryptoQuotes(ids) {
  const unique = [...new Set(ids)].filter(Boolean)
  const out = {}

  // Split into Yahoo-supported and unknown
  const yahooIds = []
  const cgOnly = []
  for (const id of unique) {
    if (CG_TO_YAHOO[id]) yahooIds.push(id)
    else cgOnly.push(id)
  }

  // Run all three sources in parallel so a CoinGecko timeout does not
  // delay Binance or Yahoo.
  const yahooPromise = mapLimited(yahooIds, STOCK_CONCURRENCY, async (id) => {
    const sym = CG_TO_YAHOO[id]
    try {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`
      const quote = parseYahooChart(await getJson(url, { 'User-Agent': 'Mozilla/5.0' }))
      if (quote) out[id] = quote
    } catch { /* symbol skipped this cycle */ }
  })

  const cgPromise = (async () => {
    if (!cgOnly.length) return
    for (const group of chunk(cgOnly, CG_BATCH)) {
      try {
        const url = 'https://api.coingecko.com/api/v3/simple/price'
          + `?ids=${encodeURIComponent(group.join(','))}&vs_currencies=usd&include_24hr_change=true`
        const cgResult = await getJson(url)
        const parsed = parseCoinGecko(cgResult, group)
        Object.assign(out, parsed)
      } catch (e) {
        console.error('coingecko fetch failed:', e instanceof Error ? e.message : e)
      }
    }
  })()

  const coinbasePromise = (async () => {
    const coinbaseIds = cgOnly.filter(id => COINBASE_MAP[id])
    if (!coinbaseIds.length) return
    await mapLimited(coinbaseIds, STOCK_CONCURRENCY, async (id) => {
      try {
        const sym = COINBASE_MAP[id]
        const url = `https://api.coinbase.com/v2/prices/${encodeURIComponent(sym)}-USD/spot`
        const j = await getJson(url)
        const price = Number(j?.data?.amount)
        if (!Number.isFinite(price) || price <= 0) return
        out[id] = { price, change24h: 0 }
      } catch { /* coin not on Coinbase */ }
    })
  })()

  await Promise.all([yahooPromise, cgPromise, coinbasePromise])
  return out
}

// ── Stocks & ETFs (Yahoo chart API) ─────────────────────────────────────────
// One request per symbol, so this is capped: the watchers only need the most
// commonly held tickers to be covered, not every symbol in existence.
const STOCK_CAP = 40
const STOCK_CONCURRENCY = 5

export function parseYahooChart(json) {
  const meta = json?.chart?.result?.[0]?.meta
  const price = Number(meta?.regularMarketPrice)
  if (!Number.isFinite(price) || price <= 0) return null
  let change24h = Number(meta?.regularMarketChangePercent)
  if (!Number.isFinite(change24h)) {
    // Older payloads omit the percentage but carry the previous close.
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose)
    change24h = Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : 0
  }
  return { price, change24h }
}

async function mapLimited(items, limit, fn) {
  const results = []
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

export async function fetchStockQuotes(symbols) {
  const list = [...new Set(symbols)].filter(Boolean).slice(0, STOCK_CAP)
  const out = {}
  await mapLimited(list, STOCK_CONCURRENCY, async (symbol) => {
    try {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`
      const quote = parseYahooChart(await getJson(url, { 'User-Agent': 'Mozilla/5.0' }))
      if (quote) out[symbol.toLowerCase()] = quote
    } catch { /* symbol skipped this cycle */ }
  })
  return out
}

// ── Metals ──────────────────────────────────────────────────────────────────
const METAL_TICKERS = { xau: 'XAU', xag: 'XAG', xpt: 'XPT', xpd: 'XPD' }

export async function fetchMetalQuotes(ids) {
  const out = {}
  for (const id of new Set(ids)) {
    const ticker = METAL_TICKERS[String(id).toLowerCase()]
    if (!ticker) continue
    try {
      const j = await getJson(`https://api.gold-api.com/price/${ticker}`)
      const price = Number(j?.price)
      if (Number.isFinite(price) && price > 0) {
        out[String(id).toLowerCase()] = { price, change24h: Number(j?.change_percentage) || 0 }
      }
    } catch { /* metal skipped this cycle */ }
  }
  return out
}

// ── Unified lookup ──────────────────────────────────────────────────────────

/**
 * Quotes for a mixed set of watched assets, keyed by `quoteKey(kind, id)`.
 * @param {Array<{id:string, symbol:string, kind:string}>} assets
 */
export async function fetchQuotes(assets) {
  const crypto = [], stocks = [], metals = []
  for (const a of assets || []) {
    if (a.kind === 'stock') stocks.push(a.symbol)
    else if (a.kind === 'metal') metals.push(a.id)
    else crypto.push(a.id)
  }

  const [c, s, m] = await Promise.all([
    crypto.length ? fetchCryptoQuotes(crypto) : {},
    stocks.length ? fetchStockQuotes(stocks) : {},
    metals.length ? fetchMetalQuotes(metals) : {},
  ])

  const out = {}
  for (const [id, q] of Object.entries(c)) out[quoteKey('crypto', id)] = q
  for (const [sym, q] of Object.entries(s)) out[quoteKey('stock', sym)] = q
  for (const [id, q] of Object.entries(m)) out[quoteKey('metal', id)] = q
  return out
}

/**
 * The one key for a watched asset. Stocks are keyed by symbol because that is
 * what Yahoo is queried with; crypto and metals by id. Callers that store
 * per-asset state (movement baselines, last-visit prices) must use this too,
 * or their bookkeeping silently stops lining up with the quotes.
 */
export function assetKey(asset) {
  return asset.kind === 'stock'
    ? quoteKey('stock', asset.symbol)
    : quoteKey(asset.kind, asset.id)
}

export function quoteFor(quotes, asset) {
  return quotes[assetKey(asset)] || null
}

// ── News ────────────────────────────────────────────────────────────────────
// The site already publishes a merged, de-duplicated RSS digest for the app's
// own news feed; re-using it means the cron adds no new upstream dependency
// and always matches what the user sees in-app.
const NEWS_URL = 'https://walletlens.live/news.json'
const MAX_ARTICLES = 120

export function parseNews(json) {
  const list = Array.isArray(json?.articles) ? json.articles : []
  return list.slice(0, MAX_ARTICLES).flatMap(a => {
    const title = String(a?.title ?? '').trim()
    const link = String(a?.link ?? '').trim()
    if (!title || !link) return []
    return [{
      title,
      link,
      description: String(a?.description ?? '').trim(),
      pubDate: String(a?.pubDate ?? ''),
      source: String(a?.source ?? ''),
    }]
  })
}

export async function fetchNews() {
  try {
    return parseNews(await getJson(NEWS_URL))
  } catch (e) {
    console.error('news fetch failed:', e instanceof Error ? e.message : e)
    return []
  }
}
