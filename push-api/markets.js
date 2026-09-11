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
  'ethena': 'ENA-USD',
  // === Top 200 Crypto (Yahoo Finance) ===
  'a7a5': 'A7A5-USD', 'agora-dollar': 'AUSD-USD', 'akedo': 'AKE-USD',
  'apenft': 'NFT-USD', 'artificial-inu-3': 'AI-USD', 'aster-2': 'ASTER-USD',
  'beldex': 'BDX-USD', 'bfusd': 'BFUSD-USD', 'bitcoin-cash-sv': 'BSV-USD',
  'bitget-token': 'BGB-USD', 'bitway': 'BTW-USD',
  'blackrock-usd-institutional-digital-liquidity-fund': 'BUIDL-USD',
  'blockstack': 'STX-USD', 'bnb48-club-token': 'KOGE-USD',
  'canton-network': 'CC-USD', 'cash-cat': 'CASHCAT-USD',
  'collector-crypt': 'CARDS-USD', 'conflux-token': 'CFX-USD',
  'crvusd': 'CRVUSD-USD', 'dai': 'DAI-USD', 'dash': 'DASH-USD',
  'decred': 'DCR-USD', 'dogwifcoin': 'WIF-USD', 'doublezero': '2Z-USD',
  'edgex': 'EDGE-USD', 'ethena-usde': 'USDE-USD', 'ether-fi': 'ETHFI-USD',
  'ethereum-name-service': 'ENS-USD', 'euro-coin': 'EURC-USD',
  'falcon-finance': 'USDF-USD', 'falcon-finance-ff': 'FF-USD',
  'fartcoin': 'FARTCOIN-USD', 'first-digital-usd': 'FDUSD-USD',
  'flare-networks': 'FLR-USD', 'frax': 'FRAX-USD',
  'gatechain-token': 'GT-USD', 'gho': 'GHO-USD',
  'global-dollar': 'USDG-USD', 'gnosis': 'GNO-USD',
  'hash-2': 'HASH-USD', 'iota': 'IOTA-USD', 'jasmycoin': 'JASMY-USD',
  'just': 'JST-USD', 'kaia': 'KAIA-USD', 'kinesis-gold': 'KAU-USD',
  'kinesis-silver': 'KAG-USD', 'kite-2': 'KITE-USD',
  'kucoin-shares': 'KCS-USD', 'lighter': 'LIT-USD',
  'memecore': 'M-USD', 'midnight-3': 'NIGHT-USD', 'monad': 'MON-USD',
  'monero': 'XMR-USD', 'morpho': 'MORPHO-USD', 'mx-token': 'MX-USD',
  'nexo': 'NEXO-USD', 'official-trump': 'TRUMP-USD',
  'olympus': 'OHM-USD', 'ondo-us-dollar-yield': 'USDY-USD',
  'ousg': 'OUSG-USD', 'pax-gold': 'PAXG-USD',
  'paypal-usd': 'PYUSD-USD', 'pi-network': 'PI-USD',
  'pieverse': 'PIEVERSE-USD', 'plasma': 'XPL-USD',
  'polygon-ecosystem-token': 'POL-USD', 'pons': 'PONS-USD',
  'quant-network': 'QNT-USD', 'reallink': 'REAL-USD',
  'ripple-usd': 'RLUSD-USD', 'safecoin': 'SAFE-USD', 'sky': 'SKY-USD',
  'societe-generale-forge-eurcv': 'EURCV-USD', 'sun-token': 'SUN-USD',
  'swissborg': 'BORG-USD', 'syrup': 'SYRUP-USD', 'telcoin': 'TEL-USD',
  'tether-gold': 'XAUT-USD', 'tezos': 'XTZ-USD',
  'thorchain': 'RUNE-USD', 'true-usd': 'TUSD-USD',
  'ultima': 'ULTIMA-USD', 'unibase': 'UB-USD', 'usa': 'USAT-USD',
  'usd1-wlfi': 'USD1-USD', 'usdai': 'USDAI-USD', 'usdd': 'USDD-USD',
  'usdgo': 'USDGO-USD', 'usds': 'USDS-USD', 'usdtb': 'USDTB-USD',
  'usual-usd': 'USD0-USD', 'usx': 'USX-USD',
  'virtual-protocol': 'VIRTUAL-USD', 'whitebit': 'WBT-USD',
  'xdce-crowd-sale': 'XDC-USD', 'ylds': 'YLDS-USD',
  'zcash': 'ZEC-USD', 'zebec-network': 'ZBCN-USD',
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

/**
 * How many symbols may still be fetched ONE AT A TIME after the shared dataset
 * has been consulted.
 *
 * Cloudflare Workers allow 50 subrequests per invocation on the Free plan, and
 * that is the whole budget for a cron pass: quotes, news, the FCM token, and
 * every notification sent. The old code fetched one Yahoo request per symbol up
 * to STOCK_CAP = 40, so a pass could spend 40 of the 50 on quotes and then fail
 * with "Too many subrequests by single Worker invocation" before delivering
 * anything. That is exactly what happened in production.
 *
 * 8 is small because it is a REMAINDER: the dataset below already answers the
 * ~120 tickers people actually hold, in one request.
 */
const STOCK_TAIL_CAP = 8

/** Rotates which leftover symbols get the tail slots, so the same ones are not
 *  starved every pass. Module state is fine: it only has to vary. */
let tailCursor = 0

/**
 * Quotes for stock symbols, in as few subrequests as possible.
 *
 * Two sources, in order:
 *
 *  1. `stock-prices.json` from the data worker — ONE request covering the fixed
 *     list of ~120 popular tickers it maintains on a 4-minute cadence. Most
 *     watched symbols are in it, so most passes now spend a single subrequest
 *     where they used to spend one per symbol.
 *
 *  2. Yahoo, per symbol, for whatever the dataset did not cover — capped at
 *     STOCK_TAIL_CAP and rotated. An uncovered symbol is not dropped, it is
 *     deferred: this runs every minute for crypto and every five for stocks, so
 *     a symbol that misses one pass is picked up in the next.
 *
 * The dataset failing is not an error. It falls through to source 2 for
 * everything, which is the old behaviour minus the cap that caused the outage.
 */
export async function fetchStockQuotes(symbols, tailCap = STOCK_TAIL_CAP) {
  const list = [...new Set(symbols)].filter(Boolean).slice(0, STOCK_CAP)
  const out = {}
  if (!list.length) return out

  let shared = {}
  try {
    const { dataUrl } = await import('../client/src/apiHosts.js')
    const r = await fetch(dataUrl('stock-prices.json'), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (r.ok) shared = (await r.json())?.prices || {}
  } catch { /* fall through to per-symbol below */ }

  // Keys are `stock:<lowercase symbol>` and values {usd, usd_24h_change} —
  // the shape parseStooqCsv writes, which is also the shape the client already
  // reads, so this stays in step with the deployed dataset rather than
  // inventing a second contract for it.
  const missing = []
  for (const symbol of list) {
    const row = shared[`stock:${symbol.toLowerCase()}`]
    const price = Number(row?.usd)
    if (Number.isFinite(price) && price > 0) {
      out[symbol.toLowerCase()] = { price, change24h: Number(row?.usd_24h_change) || 0 }
    } else {
      missing.push(symbol)
    }
  }

  if (missing.length) {
    // Rotate the window so a symbol the dataset never covers is not permanently
    // last in line behind the same neighbours.
    const start = missing.length > tailCap ? tailCursor % missing.length : 0
    const tail = [...missing.slice(start), ...missing.slice(0, start)].slice(0, tailCap)
    tailCursor = (tailCursor + tail.length) % Math.max(1, missing.length)
    await mapLimited(tail, STOCK_CONCURRENCY, async (symbol) => {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`
        const quote = parseYahooChart(await getJson(url, { 'User-Agent': 'Mozilla/5.0' }))
        if (quote) out[symbol.toLowerCase()] = quote
      } catch { /* symbol skipped this cycle */ }
    })
  }
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
// The same merged, de-duplicated RSS digest the app's own news feed reads, so
// the cron adds no upstream dependency and a notification always matches what
// the user sees in-app.
//
// It comes from the data worker now, not from walletlens.live. That digest
// used to be a static file a GitHub Action committed into client/public/ every
// two hours; when Actions was disabled the file froze, and because it ships
// inside the Pages build it kept being served, nine days stale and looking
// perfectly healthy. The client and the other two datasets here moved to the
// worker in ea04a05c; this one line was left behind pointing at the corpse.
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
    const { dataUrl } = await import('../client/src/apiHosts.js')
    return parseNews(await getJson(dataUrl('news.json')))
  } catch (e) {
    console.error('news fetch failed:', e instanceof Error ? e.message : e)
    return []
  }
}

// ── Seven-day trend ─────────────────────────────────────────────────────────

/**
 * The same weekly numbers the dashboard draws its trend from.
 *
 * Read from the data service's market.json rather than called fresh from
 * CoinGecko, and that is the whole point: a notification saying an asset
 * turned down while the screen it links to shows an uptrend is worse than no
 * notification at all. One source, one answer.
 *
 * Also cheaper. That file is already built every few hours for the app, so
 * this is one request against an edge cache instead of another rate-limited
 * upstream call on an hourly cron.
 */
export async function fetchSevenDay() {
  try {
    const { dataUrl } = await import('../client/src/apiHosts.js')
    const r = await fetch(dataUrl('market.json'), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return {}
    const d = await r.json()
    const out = {}
    for (const c of Array.isArray(d?.coins) ? d.coins : []) {
      const v = c?.price_change_percentage_7d_in_currency
      // A coin with no weekly number is absent, never zero: zero would claim
      // it is flat, and a flat reading is a direction the switch logic acts on.
      if (c?.id && Number.isFinite(v)) out[c.id] = v
    }
    return out
  } catch {
    return {}
  }
}
