// ── Domain modules ──
// Constants, classifiers, and pure helpers live in src/data/* and are
// re-exported here so existing imports from '../api' keep working
// unchanged. New code should prefer importing directly from data/*.

// Stock price proxy URL — set this after deploying workers/stock-price/index.js
// Leave empty ('') to skip and fall through to other sources.
const STOCK_WORKER_URL = ''  // set to your deployed proxy URL after deploying

// ── Static stock price cache (served from same origin, no CORS) ──────────
// Populated every 30 min by GitHub Actions workflow (update-stock-prices.yml)
let staticStockPrices = null
let staticStockPricesTime = 0
const STATIC_PRICES_TTL = 25 * 60 * 1000 // 25 min

async function fetchStaticStockPrices() {
  const now = Date.now()
  if (staticStockPrices && now - staticStockPricesTime < STATIC_PRICES_TTL) return staticStockPrices
  try {
    const res = await fetchWithTimeout('/stock-prices.json', 5000)
    if (res.ok) {
      const data = await res.json()
      if (data?.prices && typeof data.prices === 'object') {
        staticStockPrices = data.prices
        staticStockPricesTime = now
        return staticStockPrices
      }
    }
  } catch { /* file not deployed yet */ }
  return null
}

// ── Optional external API keys (fallback only) ────────────────────────────
const FINNHUB_KEY = ''       // https://finnhub.io (60 req/min free)
const ALPHA_VANTAGE_KEY = '' // https://alphavantage.co (25 req/day free)

import {
  ASSET_CATEGORIES, NON_CRYPTO_CATEGORIES,
  GOLD_ID, SILVER_ID, COPPER_ID, PLATINUM_ID, STOCK_PREFIX, FIAT_PREFIX,
  PRESET_ASSETS, POPULAR_FIAT, POPULAR_TICKERS,
  assetClass, isCrypto,
} from './data/assets';
import {
  loadData as _loadData, saveData as _saveData, bumpId as _bumpId,
  runSchemaMigrations,
} from './data/storage';
import { foldBalances as _foldBalancesPure, diffHoldings, aggregatePortfolio } from './data/portfolio';
import { analyzeTechnicals } from './technicals';

export {
  ASSET_CATEGORIES, NON_CRYPTO_CATEGORIES,
  GOLD_ID, SILVER_ID, COPPER_ID, PLATINUM_ID, STOCK_PREFIX, FIAT_PREFIX,
  PRESET_ASSETS, POPULAR_FIAT, POPULAR_TICKERS,
  assetClass, isCrypto,
};
// Re-export the pure helper that was already named-exported here
export const foldBalances = _foldBalancesPure;
export const getCachedCoinImage = (coinId) => coinImageCache[coinId] || null;

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
// Our own server-side proxy on Deno Deploy. Allowlist-only, CORS-enabled, and
// not subject to the browser's CORS limits or per-region IP geo-blocks (e.g.
// Binance). Tried FIRST everywhere because it's the most reliable; the public
// proxies below remain as backups if the Deno service is ever unreachable.
export const DENO_PROXY = (u) => `https://walletlens-voice-parse.tia8910.deno.net/proxy?url=${encodeURIComponent(u)}`;
// Multiple CORS proxies — some networks/IPs get rate-limited or blocked by
// specific proxies, so we try several before giving up.
const CORS_PROXIES = [
  DENO_PROXY,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

// Per-attempt timeout for any single fetch — without this, a slow proxy
// can stall the whole pipeline for 30s+ before failing over.
// Accepts an optional external AbortSignal so callers (e.g. fetchJSONFast)
// can cancel all in-flight requests once the first one wins.
const FETCH_TIMEOUT_MS = 3000;
async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS, externalSignal) {
  const controller = new AbortController();
  // Combine our timeout signal with any caller-supplied cancellation signal.
  // AbortSignal.any is available in Chrome 116+/Firefox 116+/Safari 17.4+ (all
  // within our esnext target). Fallback: use only the timeout controller.
  const signal = externalSignal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal });
  } finally {
    clearTimeout(t);
  }
}

// Fetch JSON from a URL, retrying through multiple CORS proxies if the
// direct request fails (rate-limit, CORS block, network error, or
// timeout). Returns null only if every attempt fails.
async function fetchJSON(url) {
  try {
    const res = await fetchWithTimeout(url);
    if (res.ok) return await res.json();
  } catch {}
  for (const wrap of CORS_PROXIES) {
    try {
      const res = await fetchWithTimeout(wrap(url));
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
}

// Race all CORS proxies simultaneously — returns the first success.
// Cuts worst-case wait from 15s (sequential) down to ~4s.
// The shared AbortController cancels all losing requests the moment one wins,
// preventing bandwidth waste and avoiding extra hits to rate-limited APIs.
async function fetchJSONFast(url) {
  const controller = new AbortController();
  const sources = [
    fetchWithTimeout(url, 4000, controller.signal).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ...CORS_PROXIES.map(w => fetchWithTimeout(w(url), 4000, controller.signal).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })),
  ]
  try {
    const result = await Promise.any(sources);
    controller.abort(); // cancel all still-in-flight losers
    return result;
  } catch { return null }
}

// ─── Asset Categories ───
// Non-crypto assets track manually-entered prices in localStorage under
// `crypto_tracker_manual_prices` as { [coin_id]: { usd, usd_24h_change, updated_at } }.
// Real-time prices for gold/silver come from a free metals API and for US stocks
// from Stooq's CORS-enabled CSV endpoint. Failures fall back to the manual cache.

// LocalStorage helpers re-aliased to the data/storage module so api.js
// keeps using its old names without a sweep across this file.
const loadData = _loadData;
const saveData = _saveData;
const bumpId = _bumpId;
// Run schema migrations once on module load.
try { runSchemaMigrations(); } catch (err) { console.warn('Schema migration failed:', err); }

// Price & image cache — hydrated from localStorage on boot so the dashboard
// can render instantly on subsequent loads while a fresh fetch runs in
// the background.
const PRICE_CACHE_KEY = 'crypto_tracker_price_cache_v1';
const IMAGE_CACHE_KEY = 'crypto_tracker_image_cache_v2';
function _loadCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
const _saveCacheTimers = {}
function _saveCache(key, val) {
  // Debounce localStorage writes so multiple fills in one price cycle
  // don't trigger repeated JSON.stringify + setItem calls.
  clearTimeout(_saveCacheTimers[key])
  _saveCacheTimers[key] = setTimeout(() => {
    delete _saveCacheTimers[key]
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, 200)
}
let priceCache = _loadCache(PRICE_CACHE_KEY);
let lastPriceFetch = 0;
let coinImageCache = _loadCache(IMAGE_CACHE_KEY);
let lastImageFetch = 0;

// Pre-warm Binance prices for the most-traded coins in the background
// so the trade sheet gets an instant cache hit instead of waiting on fetch.
const TOP_BINANCE_TICKERS = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT','LTCUSDT','BCHUSDT','NEARUSDT','ARBUSDT','OPUSDT','SUIUSDT'];
const TOP_BINANCE_ID = {'BTC':'bitcoin','ETH':'ethereum','BNB':'binancecoin','SOL':'solana','XRP':'ripple','ADA':'cardano','DOGE':'dogecoin','AVAX':'avalanche-2','DOT':'polkadot','LINK':'chainlink','LTC':'litecoin','BCH':'bitcoin-cash','NEAR':'near','ARB':'arbitrum','OP':'optimism','SUI':'sui'};

// Maps naive coin_id values (produced by coin.toLowerCase().replace(/ /g,'-')) to the
// canonical CoinGecko ID. Prevents mis-IDed holdings that fetch no price or the wrong price.
const COIN_ID_ALIASES = {
  // Common name-derived wrong IDs → canonical CoinGecko ID
  'avalanche':         'avalanche-2',
  'avalanche-coin':    'avalanche-2',
  'polygon':           'matic-network',
  'matic':             'matic-network',
  'pol':               'matic-network',
  'shib':              'shiba-inu',
  'shiba':             'shiba-inu',
  'bnb':               'binancecoin',
  'xrp':               'ripple',
  'doge':              'dogecoin',
  'xlm':               'stellar',
  'ada':               'cardano',
  'dot':               'polkadot',
  'atom':              'cosmos',
  'uni':               'uniswap',
  'link':              'chainlink',
  'ltc':               'litecoin',
  'trx':               'tron',
  'eth':               'ethereum',
  'btc':               'bitcoin',
  'sol':               'solana',
  'vet':               'vechain',
  'algo':              'algorand',
  'xtz':               'tezos',
  'fil':               'filecoin',
  'hbar':              'hedera-hashgraph',
  'hedera':            'hedera-hashgraph',
  'icp':               'internet-computer',
  'internet-computer-protocol': 'internet-computer',
  'apt':               'aptos',
  'arb':               'arbitrum',
  'op':                'optimism',
  'inj':               'injective-protocol',
  'injective':         'injective-protocol',
  'sei':               'sei-network',
  'imx':               'immutable-x',
  'immutable':         'immutable-x',
  'zk':                'zksync',
  'zksync-era':        'zksync',
  'stx':               'stacks',
  'kas':               'kaspa',
  'rune':              'thorchain',
  'jup':               'jupiter-exchange-solana',
  'jupiter':           'jupiter-exchange-solana',
  'ldo':               'lido-dao',
  'lido':              'lido-dao',
  'render':            'render-token',
  'rndr':              'render-token',
  'grt':               'the-graph',
  'the-graph':         'the-graph',
  'mana':              'decentraland',
  'sand':              'the-sandbox',
  'mkr':               'maker',
  'aave':              'aave',
  'crv':               'curve-dao-token',
  'curve':             'curve-dao-token',
  'comp':              'compound-governance-token',
  'compound':          'compound-governance-token',
  'near-protocol':     'near',
  'wbtc':              'wrapped-bitcoin',
  'wrapped-btc':       'wrapped-bitcoin',
  'fet':               'fetch-ai',
  'fetch':             'fetch-ai',
  'wld':               'worldcoin-wld',
  'worldcoin':         'worldcoin-wld',
  'ondo':              'ondo-finance',
  'mnt':               'mantle',
  'cro':               'cronos',
  'theta':             'theta-token',
  'pepe-coin':         'pepe',
  'bonk-coin':         'bonk',
  'wif-coin':          'dogwifcoin',
  'dogwif':            'dogwifcoin',
};

// Symbol-level fallback (uppercase symbol → CoinGecko ID) for cases where coin_id
// doesn't match anything in COIN_ID_ALIASES.
const SYMBOL_TO_ID = {
  'AVAX':'avalanche-2','MATIC':'matic-network','POL':'matic-network',
  'SHIB':'shiba-inu','BNB':'binancecoin','XRP':'ripple','DOGE':'dogecoin',
  'XLM':'stellar','ADA':'cardano','DOT':'polkadot','ATOM':'cosmos',
  'UNI':'uniswap','LINK':'chainlink','LTC':'litecoin','TRX':'tron',
  'VET':'vechain','ALGO':'algorand','XTZ':'tezos','FIL':'filecoin',
  'HBAR':'hedera-hashgraph','ICP':'internet-computer','APT':'aptos',
  'ARB':'arbitrum','OP':'optimism','INJ':'injective-protocol',
  'SEI':'sei-network','IMX':'immutable-x','ZK':'zksync','STX':'stacks',
  'KAS':'kaspa','RUNE':'thorchain','JUP':'jupiter-exchange-solana',
  'LDO':'lido-dao','RENDER':'render-token','RNDR':'render-token',
  'GRT':'the-graph','MANA':'decentraland','SAND':'the-sandbox',
  'MKR':'maker','CRV':'curve-dao-token','COMP':'compound-governance-token',
  'WBTC':'wrapped-bitcoin','FET':'fetch-ai','WLD':'worldcoin-wld',
  'ONDO':'ondo-finance','MNT':'mantle','CRO':'cronos','THETA':'theta-token',
};

function normalizeCoinId(coinId, symbol) {
  if (!coinId) return coinId;
  const lower = coinId.toLowerCase();
  if (COIN_ID_ALIASES[lower]) return COIN_ID_ALIASES[lower];
  if (symbol) {
    const upper = symbol.toUpperCase();
    if (SYMBOL_TO_ID[upper]) return SYMBOL_TO_ID[upper];
  }
  return coinId;
}
setTimeout(() => {
  if (Object.keys(priceCache).length > 0) return; // already warm
  const now = Date.now();
  // CryptoCompare fallback — used when Binance is blocked (e.g. Egypt, Turkey)
  const _ccPrewarm = () => {
    const syms = Object.keys(TOP_BINANCE_ID); // BTC,ETH,BNB,...
    fetchWithTimeout(`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${syms.join(',')}&tsyms=USD`, 5000)
      .then(async r => {
        if (!r?.ok) return;
        const d = await r.json();
        if (!d?.RAW) return;
        for (const [sym, currencies] of Object.entries(d.RAW)) {
          const raw = currencies?.USD;
          if (!raw?.PRICE || raw.PRICE <= 0) continue;
          const id = TOP_BINANCE_ID[sym];
          if (!id) continue;
          if (!priceCache[id] || !priceCache[id].usd) {
            priceCache[id] = { ...(priceCache[id] || {}), usd: raw.PRICE, usd_24h_change: raw.CHANGEPCT24HOUR || 0, symbol: sym, source: 'cryptocompare' };
          }
        }
        lastPriceFetch = now;
        _saveCache(PRICE_CACHE_KEY, priceCache);
      }).catch(() => {});
  };
  // Binance blocks direct browser CORS requests, so always route through the
  // Deno proxy. The direct URL is kept as a fallback in case the proxy is down.
  const _binanceUrl = 'https://api.binance.com/api/v3/ticker/price';
  const _binanceAttempts = [DENO_PROXY(_binanceUrl), _binanceUrl];
  const _tryBinance = async () => {
    for (const url of _binanceAttempts) {
      try {
        const r = await fetchWithTimeout(url, 5000);
        if (!r?.ok) continue;
        const list = await r.json();
        if (!Array.isArray(list)) continue;
        const wanted = new Set(TOP_BINANCE_TICKERS);
        for (const row of list) {
          if (!wanted.has(row.symbol)) continue;
          const tkr = row.symbol.replace(/USDT$/, '');
          const id = TOP_BINANCE_ID[tkr];
          if (!id) continue;
          const usd = parseFloat(row.price);
          if (!isFinite(usd) || usd <= 0) continue;
          priceCache[id] = { ...(priceCache[id] || {}), usd, symbol: tkr, source: 'binance' };
        }
        lastPriceFetch = now;
        _saveCache(PRICE_CACHE_KEY, priceCache);
        return;
      } catch { /* try next */ }
    }
    _ccPrewarm();
  };
  _tryBinance();
}, 800);

// CoinGecko id → Binance ticker mapping for the highest-volume coins
// where the slug doesn't match the exchange ticker. Anything not listed
// falls back to deriving the ticker from the recorded coin_symbol on
// the user's holdings/transactions.
const BINANCE_ID_OVERRIDES = {
  'bitcoin': 'BTC', 'ethereum': 'ETH', 'tether': 'USDT', 'binancecoin': 'BNB',
  'ripple': 'XRP', 'cardano': 'ADA', 'solana': 'SOL', 'dogecoin': 'DOGE',
  'tron': 'TRX', 'avalanche-2': 'AVAX', 'shiba-inu': 'SHIB', 'polkadot': 'DOT',
  'chainlink': 'LINK', 'matic-network': 'MATIC', 'polygon-ecosystem-token': 'POL',
  'litecoin': 'LTC', 'bitcoin-cash': 'BCH', 'wrapped-bitcoin': 'WBTC',
  'usd-coin': 'USDC', 'dai': 'DAI', 'uniswap': 'UNI', 'cosmos': 'ATOM',
  'aptos': 'APT', 'arbitrum': 'ARB', 'near': 'NEAR', 'optimism': 'OP',
  'fetch-ai': 'FET', 'arweave': 'AR', 'render-token': 'RENDER', 'sui': 'SUI',
  'hyperliquid': 'HYPE', 'first-digital-usd': 'FDUSD',
};
// ── Same-origin market snapshot ───────────────────────────────────────────
// /market.json is refreshed every 30 min by a GitHub Actions cron (pushed
// straight to gh-pages, like stock-prices.json). Because it's served from
// walletlens.live itself it works on networks that block crypto APIs and
// CORS proxies outright — if the site loads, this loads.
let _staticMarket = null;
let _staticMarketAt = 0;
async function _loadStaticMarket() {
  const now = Date.now();
  if (_staticMarket && now - _staticMarketAt < 10 * 60_000) return _staticMarket;
  try {
    const res = await fetchWithTimeout('/market.json?t=' + Math.floor(now / 1_800_000), 5000);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.coins) && data.coins.length > 0) {
        _staticMarket = data.coins;
        _staticMarketAt = now;
        return _staticMarket;
      }
    }
  } catch {}
  return null;
}

// ── Resilient market-snapshot loader (used by getMarketData and Whales) ──
// Returns CoinGecko /coins/markets-shaped rows. Tries localStorage cache
// first (returns instantly), then CoinGecko, then CoinCap as a fallback.
// Persists to localStorage on success so subsequent loads are instant.
const MARKET_CACHE_KEY = 'crypto_tracker_market_cache_v1';
const MARKET_TTL = 60_000;
async function _loadMarketSnapshot(perPage = 250) {
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(MARKET_CACHE_KEY) || '{}'); } catch {}
  const now = Date.now();
  // Reuse the larger snapshot for both 50 and 250 calls
  const fresh = cache[250] && (now - cache[250].t < MARKET_TTL) ? cache[250]
              : cache[50]  && (now - cache[50].t  < MARKET_TTL) ? cache[50]
              : null;
  if (fresh && Array.isArray(fresh.v) && fresh.v.length > 0) {
    return fresh.v.slice(0, perPage);
  }

  // Primary: CoinGecko
  const data = await fetchJSON(
    `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d`
  );
  if (Array.isArray(data) && data.length > 0) {
    cache[perPage] = { t: now, v: data };
    try { localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(cache)); } catch {}
    return data;
  }

  // Fallback: same-origin snapshot — reachable wherever the site itself is
  const staticMkt = await _loadStaticMarket();
  if (staticMkt) {
    cache[perPage] = { t: now, v: staticMkt };
    try { localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(cache)); } catch {}
    return staticMkt.slice(0, perPage);
  }

  // Fallback: CoinCap
  try {
    const ccData = await fetchJSON(`https://rest.coincap.io/v3/assets?limit=${perPage}`);
    const list = Array.isArray(ccData?.data) ? ccData.data : [];
    if (list.length > 0) {
      const mapped = list.map((a, i) => ({
        id: a.id,
        symbol: (a.symbol || '').toLowerCase(),
        name: a.name,
        image: `https://assets.coincap.io/assets/icons/${(a.symbol || '').toLowerCase()}@2x.png`,
        current_price: parseFloat(a.priceUsd) || 0,
        market_cap: parseFloat(a.marketCapUsd) || 0,
        market_cap_rank: i + 1,
        total_volume: parseFloat(a.volumeUsd24Hr) || 0,
        price_change_percentage_24h: parseFloat(a.changePercent24Hr) || 0,
        price_change_percentage_24h_in_currency: parseFloat(a.changePercent24Hr) || 0,
        price_change_percentage_1h_in_currency: 0,
        price_change_percentage_7d_in_currency: 0,
      }));
      cache[perPage] = { t: now, v: mapped };
      try { localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(cache)); } catch {}
      return mapped;
    }
  } catch {}

  // Last resort: stale cache > nothing
  if (fresh && Array.isArray(fresh.v)) return fresh.v.slice(0, perPage);
  if (cache[250]?.v) return cache[250].v.slice(0, perPage);
  if (cache[50]?.v)  return cache[50].v.slice(0, perPage);
  return [];
}

// Net-balance fold over a transactions array — pure helper now in
// ./data/portfolio. Aliased here so existing callers keep their name.
const _foldBalances = _foldBalancesPure;

function _symbolForId(id, holdings) {
  if (BINANCE_ID_OVERRIDES[id]) return BINANCE_ID_OVERRIDES[id];
  if (priceCache[id]?.symbol) return String(priceCache[id].symbol).toUpperCase();
  const h = holdings?.find?.(x => x?.coin_id === id);
  if (h?.coin_symbol) return String(h.coin_symbol).toUpperCase();
  return null;
}
// Module-level in-memory mirror of the chart localStorage cache.
// Keeps getChartData from parsing potentially large JSON on every call.
const _CHART_CACHE_KEY = 'crypto_tracker_chart_cache_v1';
let _chartCache = (() => { try { return JSON.parse(localStorage.getItem(_CHART_CACHE_KEY) || '{}'); } catch { return {}; } })();

let metalCache = null;
let metalCacheTime = 0;
let stockCache = {};
let stockCacheTime = {};
let fiatRatesCache = null;
let fiatRatesCacheTime = 0;
const CACHE_DURATION = 60_000;
const METAL_CACHE_DURATION = 5 * 60_000;   // 5 min — metals update slowly
const STOCK_CACHE_DURATION = 2 * 60_000;   // 2 min
const FIAT_CACHE_DURATION = 15 * 60_000;   // 15 min — FX moves slowly

// ─── Real-time metal prices (gold / silver) ───
// Tries gold-api.com first (CORS-enabled, no key), falls back to CoinGecko's
// pax-gold token for gold (tracks physical gold ~1:1).
async function fetchMetalsLive() {
  const now = Date.now();
  if (metalCache && now - metalCacheTime < METAL_CACHE_DURATION) return metalCache;

  const out = {};
  // Primary: gold-api.com — use fetchWithTimeout so a slow API doesn't hang
  // the entire price refresh cycle indefinitely.
  try {
    const [goldRes, silverRes, copperRes, platinumRes] = await Promise.all([
      fetchWithTimeout('https://api.gold-api.com/price/XAU'),
      fetchWithTimeout('https://api.gold-api.com/price/XAG'),
      fetchWithTimeout('https://api.gold-api.com/price/XCU'),
      fetchWithTimeout('https://api.gold-api.com/price/XPT'),
    ]);
    if (goldRes.ok) {
      const g = await goldRes.json();
      if (g && typeof g.price === 'number') {
        out[GOLD_ID] = { usd: g.price, usd_24h_change: 0, name: 'Gold (1 oz)', symbol: 'XAU', source: 'gold-api' };
      }
    }
    if (silverRes.ok) {
      const s = await silverRes.json();
      if (s && typeof s.price === 'number') {
        out[SILVER_ID] = { usd: s.price, usd_24h_change: 0, name: 'Silver (1 oz)', symbol: 'XAG', source: 'gold-api' };
      }
    }
    if (copperRes.ok) {
      const c = await copperRes.json();
      if (c && typeof c.price === 'number') {
        out[COPPER_ID] = { usd: c.price, usd_24h_change: 0, name: 'Copper (1 lb)', symbol: 'XCU', source: 'gold-api' };
      }
    }
    if (platinumRes.ok) {
      const pt = await platinumRes.json();
      if (pt && typeof pt.price === 'number') {
        out[PLATINUM_ID] = { usd: pt.price, usd_24h_change: 0, name: 'Platinum (1 oz)', symbol: 'XPT', source: 'gold-api' };
      }
    }
  } catch (err) { /* fall through */ }

  // Fallback for gold: CoinGecko pax-gold (PAXG tracks 1 oz gold)
  if (!out[GOLD_ID]) {
    try {
      const d = await fetchJSON(`${COINGECKO_BASE}/simple/price?ids=pax-gold&vs_currencies=usd&include_24hr_change=true`);
      if (d && d['pax-gold']?.usd) {
        out[GOLD_ID] = { usd: d['pax-gold'].usd, usd_24h_change: d['pax-gold'].usd_24h_change || 0, name: 'Gold (1 oz)', symbol: 'XAU', source: 'coingecko-paxg' };
      }
    } catch {}
  }

  if (Object.keys(out).length > 0) {
    metalCache = { ...(metalCache || {}), ...out };
    metalCacheTime = now;
  }
  return metalCache || {};
}

// ─── Binance bStocks — tokenized 1:1-backed securities (launched June 2026) ───
// These trade as /USDT pairs on the main Binance exchange (api.binance.com).
// Map: WalletLens ticker (lowercase) → Binance symbol
const BSTOCK_SYMBOLS = {
  nvdab: 'NVDABUSDT',
  tslab: 'TSLAB' + 'USDT',
  mubb:  'MUBB'  + 'USDT',
  sndkb: 'SNDKB' + 'USDT',
  crclb: 'CRCLB' + 'USDT',
}
// For historical charts: map bStock → underlying US stock on Stooq
const BSTOCK_UNDERLYING = {
  'stock:nvdab': 'nvda.us',
  'stock:tslab': 'tsla.us',
  'stock:mubb':  'mu.us',
  'stock:sndkb': 'sndk.us',
  'stock:crclb': 'crcl.us',
}

// ─── Real-time US stock prices via Stooq (CORS-enabled CSV) ───
// Returns { [coin_id]: { usd, usd_24h_change, name } } for the requested IDs.
function parseStooqRow(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return null;
  const headers = lines[0].split(',');
  const values = lines[1].split(',');
  const row = {};
  for (let i = 0; i < headers.length; i++) row[headers[i]] = values[i];
  const close = parseFloat(row.Close);
  const open = parseFloat(row.Open);
  if (!isFinite(close) || close <= 0) return null;
  const change = isFinite(open) && open > 0 ? ((close - open) / open) * 100 : 0;
  return { usd: close, usd_24h_change: change, name: row.Name || '' };
}

async function fetchStockLive(coinId) {
  const ticker = coinId.startsWith(STOCK_PREFIX) ? coinId.slice(STOCK_PREFIX.length) : coinId;
  const now = Date.now();
  if (stockCache[coinId] && now - (stockCacheTime[coinId] || 0) < STOCK_CACHE_DURATION) {
    return stockCache[coinId];
  }

  const tickerUp = ticker.toUpperCase();

  // ── 0a. Binance bStock API — live 24/7 tokenized securities ──
  // Route through Deno proxy first (bypasses CORS + regional Binance geo-blocks),
  // then try direct as fallback.
  const binanceSymbol = BSTOCK_SYMBOLS[ticker.toLowerCase()];
  if (binanceSymbol) {
    const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`;
    for (const url of [DENO_PROXY(binanceUrl), binanceUrl]) {
      try {
        const res = await fetchWithTimeout(url, 6000);
        if (res.ok) {
          const data = await res.json();
          const price = parseFloat(data.lastPrice);
          const pct   = parseFloat(data.priceChangePercent);
          if (isFinite(price) && price > 0) {
            const parsed = { usd: price, usd_24h_change: isFinite(pct) ? pct : 0, name: `${tickerUp} bStock` };
            stockCache[coinId] = parsed; stockCacheTime[coinId] = now;
            return parsed;
          }
        }
      } catch { /* try next */ }
    }
  }

  // ── 0b. Static prices file served from same origin (no CORS, always works) ──
  const staticPrices = await fetchStaticStockPrices()
  if (staticPrices?.[coinId]) {
    const p = staticPrices[coinId]
    stockCache[coinId] = p; stockCacheTime[coinId] = now;
    return p;
  }

  // ── 1. Stock price proxy (CORS-safe proxy, most reliable on mobile) ──
  if (STOCK_WORKER_URL) {
    try {
      const res = await fetchWithTimeout(`${STOCK_WORKER_URL}?symbol=${encodeURIComponent(tickerUp)}`, 7000);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.price === 'number' && data.price > 0) {
          const parsed = { usd: data.price, usd_24h_change: data.change_pct || 0, name: data.name || '' };
          stockCache[coinId] = parsed; stockCacheTime[coinId] = now;
          return parsed;
        }
      }
    } catch { /* fall through */ }
  }

  // ── 2. Finnhub (CORS-enabled, 60 req/min free) ──
  if (FINNHUB_KEY) {
    try {
      const res = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(tickerUp)}&token=${FINNHUB_KEY}`, 6000);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.c === 'number' && data.c > 0) {
          const pct = data.pc > 0 ? ((data.c - data.pc) / data.pc) * 100 : 0;
          const parsed = { usd: data.c, usd_24h_change: pct, name: tickerUp };
          stockCache[coinId] = parsed; stockCacheTime[coinId] = now;
          return parsed;
        }
      }
    } catch { /* fall through */ }
  }

  // ── 3. Alpha Vantage (CORS-enabled, 25 req/day free) ──
  if (ALPHA_VANTAGE_KEY) {
    try {
      const res = await fetchWithTimeout(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(tickerUp)}&apikey=${ALPHA_VANTAGE_KEY}`, 7000);
      if (res.ok) {
        const data = await res.json();
        const q = data?.['Global Quote'];
        const price = parseFloat(q?.['05. price']);
        const pct = parseFloat(q?.['10. change percent']);
        if (isFinite(price) && price > 0) {
          const parsed = { usd: price, usd_24h_change: isFinite(pct) ? pct : 0, name: tickerUp };
          stockCache[coinId] = parsed; stockCacheTime[coinId] = now;
          return parsed;
        }
      }
    } catch { /* fall through */ }
  }

  // ── 4. Yahoo Finance v8 direct (has CORS headers on some networks) ──
  const yahooV8 = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tickerUp)}?interval=1d&range=2d`;
  try {
    const res = await fetchWithTimeout(yahooV8, 5000);
    if (res.ok) {
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      if (meta && typeof meta.regularMarketPrice === 'number') {
        const parsed = { usd: meta.regularMarketPrice, usd_24h_change: meta.regularMarketChangePercent || 0, name: meta.longName || meta.shortName || '' };
        stockCache[coinId] = parsed; stockCacheTime[coinId] = now;
        return parsed;
      }
    }
  } catch { /* fall through */ }

  // ── 5. Stooq direct ──
  const stooqUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(ticker.toLowerCase())}.us&f=sd2t2ohlcvn&h&e=csv`;
  try {
    const res = await fetchWithTimeout(stooqUrl, 5000);
    if (res.ok) {
      const parsed = parseStooqRow(await res.text());
      if (parsed) { stockCache[coinId] = parsed; stockCacheTime[coinId] = now; return parsed; }
    }
  } catch { /* fall through */ }

  // ── 6. CORS proxies (Deno proxy first, then public fallbacks) ──
  for (const proxy of CORS_PROXIES) {
    for (const target of [stooqUrl, yahooV8]) {
      try {
        const res = await fetchWithTimeout(proxy(target), 6000);
        if (!res.ok) continue;
        const text = await res.text();
        // Try Stooq CSV parse
        const csv = parseStooqRow(text);
        if (csv) { stockCache[coinId] = csv; stockCacheTime[coinId] = now; return csv; }
        // Try Yahoo JSON parse
        try {
          const meta = JSON.parse(text)?.chart?.result?.[0]?.meta;
          if (meta && typeof meta.regularMarketPrice === 'number') {
            const parsed = { usd: meta.regularMarketPrice, usd_24h_change: meta.regularMarketChangePercent || 0, name: meta.longName || '' };
            stockCache[coinId] = parsed; stockCacheTime[coinId] = now; return parsed;
          }
        } catch { /* not JSON */ }
      } catch { /* next */ }
    }
  }

  return null;
}

// ─── Real-time fiat FX rates (all quoted in USD per 1 unit of currency) ───
// Uses open.er-api.com (free, CORS-enabled, no key). Falls back to frankfurter.app.
async function fetchFiatRates() {
  const now = Date.now();
  if (fiatRatesCache && now - fiatRatesCacheTime < FIAT_CACHE_DURATION) return fiatRatesCache;

  // Primary: open.er-api.com — returns rates vs USD base
  try {
    const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', 8000);
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        // rates[X] = X per 1 USD — store as-is for direct multiplication
        const out = { USD: 1 };
        for (const [code, perUsd] of Object.entries(data.rates)) {
          if (typeof perUsd === 'number' && perUsd > 0) out[code] = perUsd;
        }
        fiatRatesCache = out;
        fiatRatesCacheTime = now;
        return out;
      }
    }
  } catch {}

  // Fallback: frankfurter.app (European Central Bank reference rates)
  try {
    const res = await fetchWithTimeout('https://api.frankfurter.app/latest?from=USD', 8000);
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        const out = { USD: 1 };
        for (const [code, perUsd] of Object.entries(data.rates)) {
          if (typeof perUsd === 'number' && perUsd > 0) out[code] = perUsd;
        }
        fiatRatesCache = out;
        fiatRatesCacheTime = now;
        return out;
      }
    }
  } catch {}

  return fiatRatesCache || { USD: 1 };
}

// ─── Batch stock quotes ───────────────────────────────────────────────────
// Fetches multiple tickers at once from Yahoo Finance v7 (supports CORS on
// most networks). Falls back to individual fetchStockLive calls for misses.
let batchStockCache = {};
let batchStockCacheTime = 0;

function parseStooqBatchCsv(text) {
  // Stooq multi-ticker CSV: first line = headers, subsequent lines = one ticker each
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;
  const headers = lines[0].split(',');
  const nameIdx   = headers.indexOf('Name');
  const closeIdx  = headers.indexOf('Close');
  const openIdx   = headers.indexOf('Open');
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    const name = nameIdx >= 0 ? vals[nameIdx] : '';
    const close = parseFloat(vals[closeIdx]);
    const open  = parseFloat(vals[openIdx]);
    if (!isFinite(close) || close <= 0) continue;
    const change = isFinite(open) && open > 0 ? ((close - open) / open) * 100 : 0;
    // Symbol is the Name column value (Stooq uses full name; use ticker from caller)
    // Use position in lines to map back to tickers — stored separately
    out[i - 1] = { usd: close, usd_24h_change: change, name };
  }
  return out;
}

async function fetchTwelveDataBatch(tickers) {
  // ── 0. Same-origin /api/stocks Pages Function — runs server-side, no CORS ──
  try {
    const url = `/api/stocks?symbols=${encodeURIComponent(tickers.join(','))}`;
    const res = await fetchWithTimeout(url, 6000);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && !data.error) {
        const out = {};
        for (const [sym, q] of Object.entries(data)) {
          if (typeof q.price === 'number' && q.price > 0) {
            out[sym.toUpperCase()] = { usd: q.price, usd_24h_change: q.change_pct || 0, name: q.name || sym, source: q.source || 'edge' };
          }
        }
        if (Object.keys(out).length > 0) return out;
      }
    }
  } catch {}

  // ── 1. Stooq batch CSV — all tickers in one request, no key, CORS-enabled ──
  try {
    const syms = tickers.map(t => `${t.toLowerCase()}.us`).join('%3B'); // %3B = ;
    const url = `https://stooq.com/q/l/?s=${syms}&f=sd2t2ohlcvn&h&e=csv`;
    // Stooq has no CORS headers → direct fetch fails in the browser. Try direct
    // (works on some networks) then fall back to our server-side proxy.
    let res = await fetchWithTimeout(url, 6000).catch(() => null);
    if (!res || !res.ok) res = await fetchWithTimeout(DENO_PROXY(url), 7000).catch(() => null);
    if (res && res.ok) {
      const text = await res.text();
      const byIdx = parseStooqBatchCsv(text);
      if (byIdx && Object.keys(byIdx).length > 0) {
        const out = {};
        for (const [idx, data] of Object.entries(byIdx)) {
          const sym = tickers[Number(idx)];
          if (sym) out[sym.toUpperCase()] = { ...data, source: 'stooq' };
        }
        if (Object.keys(out).length > 0) return out;
      }
    }
  } catch {}

  // ── 2. corsproxy → Yahoo Finance v8 chart for each ticker in parallel ──
  try {
    const results = await Promise.all(tickers.map(async sym => {
      for (const wrap of CORS_PROXIES) {
        try {
          const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
          const res = await fetchWithTimeout(wrap(target), 5000);
          if (!res.ok) continue;
          const meta = (await res.json())?.chart?.result?.[0]?.meta;
          if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
            return { sym: sym.toUpperCase(), usd: meta.regularMarketPrice, usd_24h_change: meta.regularMarketChangePercent || 0, name: meta.longName || sym };
          }
        } catch {}
      }
      return null;
    }));
    const out = {};
    for (const r of results) {
      if (r) out[r.sym] = { usd: r.usd, usd_24h_change: r.usd_24h_change, name: r.name, source: 'yahoo-proxy' };
    }
    if (Object.keys(out).length > 0) return out;
  } catch {}

  return null;
}

async function fetchOneTicker(sym) {
  const ticker = sym.toUpperCase();
  // 1. Yahoo v8/chart — no crumb needed for single-symbol calls
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
      const res = await fetchWithTimeout(url, 4000);
      if (res.ok) {
        const meta = (await res.json())?.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
          return { usd: meta.regularMarketPrice, usd_24h_change: meta.regularMarketChangePercent || 0, name: meta.longName || meta.shortName || ticker, source: 'yahoo' };
        }
      }
    } catch {}
  }
  // 2. Stooq CSV (direct, then server-side proxy — Stooq has no CORS headers)
  try {
    const stooqUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(ticker.toLowerCase())}.us&f=sd2t2ohlcvn&h&e=csv`;
    let res = await fetchWithTimeout(stooqUrl, 4000).catch(() => null);
    if (!res || !res.ok) res = await fetchWithTimeout(DENO_PROXY(stooqUrl), 6000).catch(() => null);
    if (res && res.ok) {
      const parsed = parseStooqRow(await res.text());
      if (parsed) return { ...parsed, source: 'stooq' };
    }
  } catch {}
  // 3. CORS proxy → Yahoo v8
  for (const wrap of CORS_PROXIES) {
    try {
      const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
      const res = await fetchWithTimeout(wrap(target), 4000);
      if (!res.ok) continue;
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
        return { usd: meta.regularMarketPrice, usd_24h_change: meta.regularMarketChangePercent || 0, name: meta.longName || ticker, source: 'yahoo-proxy' };
      }
    } catch {}
  }
  return null;
}

async function fetchBatchStocks(tickers) {
  const now = Date.now();
  const missing = tickers.filter(t => !batchStockCache[t] || now - batchStockCacheTime > STOCK_CACHE_DURATION);
  if (missing.length === 0) return batchStockCache;

  // Primary: Twelve Data → Stooq batch → Yahoo proxy
  const batchResult = await fetchTwelveDataBatch(missing);
  if (batchResult) {
    for (const [sym, data] of Object.entries(batchResult)) {
      batchStockCache[sym] = data;
    }
  }

  // For any tickers FMP missed, fire individual Yahoo/Stooq fetches in parallel
  const stillMissing = missing.filter(t => !batchStockCache[t]);
  if (stillMissing.length > 0) {
    const results = await Promise.all(stillMissing.map(async t => ({ t, data: await fetchOneTicker(t) })));
    for (const { t, data } of results) {
      if (data) batchStockCache[t] = data;
    }
  }

  batchStockCacheTime = now;
  return batchStockCache;
}
// Map a WalletLens asset id to a Stooq symbol string for historical CSV downloads.
function stooqSymbolFor(id) {
  if (id === GOLD_ID) return 'xauusd';
  if (id === SILVER_ID) return 'xagusd';
  if (id === COPPER_ID) return 'xcuusd';
  if (id === PLATINUM_ID) return 'xptusd';
  // bStocks: use underlying stock history (NVDAB → nvda.us, etc.)
  if (BSTOCK_UNDERLYING[id]) return BSTOCK_UNDERLYING[id];
  if (id.startsWith(STOCK_PREFIX)) return `${id.slice(STOCK_PREFIX.length).toLowerCase()}.us`;
  return null;
}

function parseStooqCsv(text, days) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  const closeIdx = headers.indexOf('Close');
  const dateIdx = headers.indexOf('Date');
  if (closeIdx < 0 || dateIdx < 0) return [];
  const rows = lines.slice(1)
    .map(l => l.split(','))
    .map(cols => ({ date: cols[dateIdx], close: parseFloat(cols[closeIdx]) }))
    .filter(r => r.date && isFinite(r.close) && r.close > 0);
  const tail = rows.slice(-Math.max(days, 7));
  return tail.map(r => ({ date: r.date, time: r.date, price: r.close }));
}

// Stooq daily CSV — returns [{ date, time, price }] for the most recent `days` rows.
async function fetchStooqHistory(symbol, days = 30) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
  try {
    const res = await fetchWithTimeout(url, 5000);
    if (res.ok) {
      const out = parseStooqCsv(await res.text(), days);
      if (out.length > 0) return out;
    }
  } catch {}
  for (const wrap of CORS_PROXIES) {
    try {
      const res = await fetchWithTimeout(wrap(url), 5000);
      if (res.ok) {
        const out = parseStooqCsv(await res.text(), days);
        if (out.length > 0) return out;
      }
    } catch {}
  }
  return [];
}

export const api = {
  // Wallets
  getWallets: async () => loadData('wallets'),

  createWallet: async ({ name, description }) => {
    const wallets = loadData('wallets');
    const wallet = {
      id: bumpId('crypto_tracker_next_wallet_id'),
      name,
      description: description || '',
      created_at: new Date().toISOString(),
    };
    wallets.unshift(wallet);
    saveData('wallets', wallets);
    return wallet;
  },

  deleteWallet: async (id) => {
    const wallets = loadData('wallets').filter(w => w.id !== id);
    saveData('wallets', wallets);
    const txs = loadData('transactions').filter(t => t.wallet_id !== id);
    saveData('transactions', txs);
    return null;
  },

  // Transactions
  getTransactions: async (walletId) => {
    let txs = loadData('transactions');
    if (walletId) txs = txs.filter(t => t.wallet_id === parseInt(walletId));
    return txs.sort((a, b) => b.date.localeCompare(a.date));
  },

  getPortfolio: async (walletId) => {
    let txs = loadData('transactions');
    if (walletId) txs = txs.filter(t => t.wallet_id === parseInt(walletId));
    // Sort ascending so cost-basis removal uses the correct running average.
    // For transactions on the SAME calendar date, fall back to insertion order
    // (id ascending) — otherwise a same-day sell logged after a buy would be
    // applied to a zero balance first (clamped to 0) and the trade wouldn't
    // reflect. Transactions are stored newest-first, so date alone leaves
    // same-day trades in reverse chronological order.
    txs = txs.slice().sort((a, b) => {
      const d = (a.date || '').localeCompare(b.date || '');
      if (d !== 0) return d;
      return (a.id || 0) - (b.id || 0);
    });

    const holdings = {};
    for (const tx of txs) {
      if (!holdings[tx.coin_id]) {
        holdings[tx.coin_id] = {
          coin_id: tx.coin_id,
          coin_symbol: tx.coin_symbol,
          coin_name: tx.coin_name || '',
          coin_image: tx.coin_image || '',
          category: tx.category || 'crypto',
          amount: 0,
          total_invested: 0,
        };
      }
      // Latest non-empty metadata wins
      if (tx.coin_name) holdings[tx.coin_id].coin_name = tx.coin_name;
      if (tx.coin_image) holdings[tx.coin_id].coin_image = tx.coin_image;
      if (tx.category) holdings[tx.coin_id].category = tx.category;

      if (tx.type === 'buy' || tx.type === 'deposit') {
        holdings[tx.coin_id].amount += tx.amount;
        holdings[tx.coin_id].total_invested += tx.total_cost;
      } else if (tx.type === 'sell' || tx.type === 'withdraw') {
        const h = holdings[tx.coin_id];
        // Deduct cost basis (avg_cost × sold_qty) not sell proceeds, so avg buy price stays correct.
        // Clamp the sold quantity to the running balance — an oversell (typo or
        // missing buy record) must not drive the holding negative, which would
        // silently eat into any later buys.
        const avgCost = h.amount > 0 ? h.total_invested / h.amount : 0;
        const sold = Math.min(tx.amount, Math.max(0, h.amount));
        h.total_invested = Math.max(0, h.total_invested - avgCost * sold);
        h.amount = Math.max(0, h.amount - sold);
      }
    }

    return Object.values(holdings).filter(h => h.amount > 0.00000001);
  },

  addTransaction: async (data) => {
    const txs = loadData('transactions');
    const totalCost = data.amount * data.price_per_unit;
    const category = data.category || 'crypto';
    const coin_id = category === 'crypto'
      ? normalizeCoinId(data.coin_id, data.coin_symbol)
      : data.coin_id;
    const tx = {
      id: bumpId('crypto_tracker_next_tx_id'),
      wallet_id: parseInt(data.wallet_id),
      type: data.type,
      category,
      coin_id,
      coin_symbol: data.coin_symbol,
      coin_name: data.coin_name || '',
      coin_image: data.coin_image || '',
      amount: data.amount,
      price_per_unit: data.price_per_unit,
      total_cost: totalCost,
      exchange: data.exchange || '',
      notes: data.notes || '',
      date: data.date || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    };
    txs.unshift(tx);

    // Update manual price for non-crypto assets so holdings show current value
    if (category !== 'crypto') {
      const manual = loadData('manual_prices', {});
      manual[data.coin_id] = {
        usd: data.price_per_unit,
        usd_24h_change: manual[data.coin_id]?.usd_24h_change || 0,
        updated_at: new Date().toISOString(),
      };
      saveData('manual_prices', manual);
    }

    saveData('transactions', txs);
    return tx;
  },

  deleteTransaction: async (id) => {
    const txs = loadData('transactions').filter(t => t.id !== id);
    saveData('transactions', txs);
    return null;
  },

  // Manual (non-crypto) prices
  getManualPrices: () => loadData('manual_prices', {}),
  setManualPrice: (coinId, price) => {
    const manual = loadData('manual_prices', {});
    const prev = manual[coinId];
    const prevPrice = prev?.usd || price;
    const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
    manual[coinId] = { usd: price, usd_24h_change: change, updated_at: new Date().toISOString() };
    saveData('manual_prices', manual);
    return manual[coinId];
  },

  // Prices — routes each id to the right source:
  //   stock:XXX   → Stooq (real-time US stock close)
  //   metal:xau/xag → gold-api.com (live spot metal price, with CoinGecko fallback)
  //   <crypto id> → CoinGecko simple/price
  //   everything else → manual price cache (localStorage)
  getPrices: (() => {
    // In-flight cache: if the same id-set is already being fetched, return the
    // same promise instead of firing a second identical fan-out.
    const _inFlight = new Map();
    return async (ids) => {
    if (!ids) return {};
    // Order-insensitive key so "btc,eth" and "eth,btc" dedupe to one fan-out.
    const key = ids.split(',').filter(Boolean).sort().join(',');
    if (_inFlight.has(key)) return _inFlight.get(key);
    const coinIds = ids.split(',').filter(Boolean);
    const manual = loadData('manual_prices', {});

    const stockIds = coinIds.filter(id => id.startsWith(STOCK_PREFIX));
    const metalIds = coinIds.filter(id => id === GOLD_ID || id === SILVER_ID || id === COPPER_ID || id === PLATINUM_ID);
    const fiatIds = coinIds.filter(id => id.startsWith(FIAT_PREFIX));
    const cryptoLikeIds = coinIds.filter(id =>
      !id.startsWith(STOCK_PREFIX) && id !== GOLD_ID && id !== SILVER_ID && id !== COPPER_ID && id !== PLATINUM_ID &&
      !id.startsWith('bond:') && !id.startsWith('other:') && !id.startsWith(FIAT_PREFIX)
    );
    const manualFallbackIds = coinIds.filter(id => id.startsWith('bond:') || id.startsWith('other:'));

    const result = {};

    // Fire all three remote sources in parallel
    const tasks = [];

    // Metals
    if (metalIds.length > 0) {
      tasks.push(fetchMetalsLive().then(metals => {
        for (const id of metalIds) {
          if (metals[id]) result[id] = metals[id];
          else if (manual[id]) result[id] = { ...manual[id], source: 'manual' };
        }
      }));
    }

    // Fiat currencies — convert each ISO code to USD-per-unit via live FX.
    // fetchFiatRates returns units-per-USD (e.g. EGP ≈ 52), so the USD value
    // of ONE unit is the reciprocal (1 EGP ≈ $0.019).
    if (fiatIds.length > 0) {
      tasks.push(fetchFiatRates().then(rates => {
        for (const id of fiatIds) {
          const code = id.slice(FIAT_PREFIX.length).toUpperCase();
          const perUsd = rates[code];
          if (typeof perUsd === 'number' && perUsd > 0) {
            result[id] = { usd: 1 / perUsd, usd_24h_change: 0, source: 'er-api', name: code };
          } else if (manual[id]) {
            result[id] = { ...manual[id], source: 'manual' };
          }
        }
      }));
    }

    // Stocks — batch fetch first, fall back to individual for misses
    if (stockIds.length > 0) {
      tasks.push((async () => {
        const tickers = stockIds.map(id => id.slice(STOCK_PREFIX.length).toUpperCase());
        await fetchBatchStocks(tickers);
        await Promise.all(stockIds.map(async id => {
          const ticker = id.slice(STOCK_PREFIX.length).toUpperCase();
          if (batchStockCache[ticker]) {
            result[id] = batchStockCache[ticker];
          } else {
            // Individual fallback for tickers batch missed
            const live = await fetchStockLive(id);
            if (live) result[id] = { ...live, source: 'stooq' };
            else if (manual[id]) result[id] = { ...manual[id], source: 'manual' };
          }
        }));
      })());
    }

    // Crypto (CoinGecko) — only IDs that don't already have a manual override
    const cryptoIds = cryptoLikeIds.filter(id => !manual[id]);
    const manualCryptoLike = cryptoLikeIds.filter(id => manual[id]);
    for (const id of manualCryptoLike) result[id] = { ...manual[id], source: 'manual' };

    if (cryptoIds.length > 0) {
      tasks.push((async () => {
        const now = Date.now();
        const needsFresh = now - lastPriceFetch > CACHE_DURATION || cryptoIds.some(id => !priceCache[id]);
        if (needsFresh) {
          // ── Primary fast path: Binance public /api/v3/ticker/24hr ──
          // CORS-enabled, no key, very fast. We map each CoinGecko id to its
          // exchange ticker (built-in overrides + user's recorded coin_symbol)
          // and ask for all USDT pairs in one batch. Stables resolve to ~$1.
          try {
            const txs = loadData('transactions');
            const knownSymbols = {}; // id -> ticker (sym)
            const symToId = {};      // ticker -> id (reverse lookup)
            for (const id of cryptoIds) {
              const sym = _symbolForId(id, txs);
              if (sym) { knownSymbols[id] = sym; symToId[sym] = id; }
            }
            const stables = new Set(['USDT','USDC','DAI','FDUSD','TUSD','BUSD']);
            const stableIds = Object.entries(knownSymbols).filter(([,s]) => stables.has(s)).map(([id]) => id);
            const tradeable = Object.entries(knownSymbols).filter(([,s]) => !stables.has(s));
            // Binance's batch /ticker/24hr returns 400 if ANY symbol in the list
            // is invalid, killing the whole call. Fetch every USDT pair in one
            // unfiltered request (~3000 rows, gzipped ~150KB) and look up our
            // tickers locally so unknown symbols can never poison the batch.
            if (tradeable.length > 0) {
              try {
                // Binance is geo-blocked from some IPs (e.g. Egypt, Turkey). Try
                // direct first, then fall back to our server-side proxy so those
                // users still get Binance's fast, complete price + 24h data.
                const _bUrl = 'https://api.binance.com/api/v3/ticker/24hr';
                let res = await fetchWithTimeout(_bUrl, 4500).catch(() => null);
                if (!res || !res.ok) res = await fetchWithTimeout(DENO_PROXY(_bUrl), 6000).catch(() => null);
                if (res && res.ok) {
                  const list = await res.json();
                  if (Array.isArray(list)) {
                    const wanted = new Set(tradeable.map(([,s]) => `${s}USDT`));
                    for (const row of list) {
                      const sym = String(row.symbol || '');
                      if (!wanted.has(sym)) continue;
                      const tkr = sym.replace(/USDT$/, '');
                      const id = symToId[tkr];
                      if (!id) continue;
                      const usd = parseFloat(row.lastPrice);
                      if (!isFinite(usd) || usd <= 0) continue;
                      priceCache[id] = {
                        ...(priceCache[id] || {}),
                        usd,
                        usd_24h_change: parseFloat(row.priceChangePercent) || 0,
                        symbol: tkr,
                        source: 'binance',
                      };
                    }
                    lastPriceFetch = now;
                    _saveCache(PRICE_CACHE_KEY, priceCache);
                  }
                }
              } catch {}
            }
            // Stables → assume $1
            for (const id of stableIds) {
              priceCache[id] = {
                ...(priceCache[id] || {}),
                usd: 1,
                usd_24h_change: 0,
                symbol: knownSymbols[id],
                source: 'stable',
              };
            }
            if (stableIds.length > 0) _saveCache(PRICE_CACHE_KEY, priceCache);
          } catch {}

          // Only call CoinGecko for IDs Binance didn't fill — skip the whole
          // round-trip if Binance covered everything (common case for top coins).
          const afterBinance = cryptoIds.filter(id => !priceCache[id]);
          if (afterBinance.length > 0) {
            // Race CoinGecko (all proxies in parallel) and CryptoCompare simultaneously.
            // Whichever responds first fills the cache; the other fills any gaps.
            const _txs2 = loadData('transactions');
            const _stables = new Set(['USDT','USDC','DAI','FDUSD','TUSD','BUSD']);
            const ccSyms = afterBinance.map(id => _symbolForId(id, _txs2)).filter(s => s && !_stables.has(s));
            const [cgData, ccPrices] = await Promise.all([
              fetchJSONFast(
                `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${afterBinance.join(',')}&per_page=250&page=1&sparkline=false&price_change_percentage=24h`
              ),
              ccSyms.length > 0
                ? fetchWithTimeout(`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${ccSyms.join(',')}&tsyms=USD`, 5000)
                    .then(r => r.ok ? r.json() : null).catch(() => null)
                : null,
            ]);
            if (Array.isArray(cgData) && cgData.length > 0) {
              for (const c of cgData) {
                if (!c?.id) continue;
                priceCache[c.id] = {
                  usd: c.current_price,
                  usd_24h_change: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0,
                  usd_market_cap: c.market_cap || 0,
                  name: c.name,
                  symbol: c.symbol,
                };
                if (c.image) coinImageCache[c.id] = c.image;
              }
              lastPriceFetch = now;
              lastImageFetch = now;
              _saveCache(PRICE_CACHE_KEY, priceCache);
              _saveCache(IMAGE_CACHE_KEY, coinImageCache);
            }
            // Fill any gaps with CryptoCompare data
            if (ccPrices?.RAW) {
              for (const id of afterBinance) {
                if (priceCache[id]) continue;
                const sym = _symbolForId(id, _txs2);
                if (!sym) continue;
                const raw = ccPrices.RAW[sym]?.USD;
                if (raw && typeof raw.PRICE === 'number' && raw.PRICE > 0) {
                  priceCache[id] = { usd: raw.PRICE, usd_24h_change: raw.CHANGEPCT24HOUR || 0, symbol: sym, source: 'cryptocompare' };
                }
              }
              if (afterBinance.some(id => priceCache[id]?.source === 'cryptocompare')) {
                lastPriceFetch = now;
                _saveCache(PRICE_CACHE_KEY, priceCache);
              }
            }
          }
          // Fallback: CoinCap for any IDs still missing
          const missing = cryptoIds.filter(id => !priceCache[id]);
          if (missing.length > 0) {
            const ccData = await fetchJSON(
              `https://rest.coincap.io/v3/assets?ids=${missing.join(',')}&limit=${missing.length}`
            );
            const list = Array.isArray(ccData?.data) ? ccData.data : [];
            for (const a of list) {
              const usd = parseFloat(a.priceUsd);
              if (isFinite(usd) && usd > 0) {
                priceCache[a.id] = {
                  usd,
                  usd_24h_change: parseFloat(a.changePercent24Hr) || 0,
                  usd_market_cap: parseFloat(a.marketCapUsd) || 0,
                };
              }
            }
            if (list.length > 0) {
              lastPriceFetch = now;
              _saveCache(PRICE_CACHE_KEY, priceCache);
            }
          }
          // Last resort: CoinPaprika (no key, native CORS)
          const stillMissing = cryptoIds.filter(id => !priceCache[id]);
          if (stillMissing.length > 0) {
            // CoinPaprika uses its own IDs (e.g. "btc-bitcoin") — map common CoinGecko IDs
            const PAPRIKA_ID_MAP = {
              'bitcoin':'btc-bitcoin','ethereum':'eth-ethereum','tether':'usdt-tether',
              'binancecoin':'bnb-binance-coin','ripple':'xrp-xrp','cardano':'ada-cardano',
              'solana':'sol-solana','dogecoin':'doge-dogecoin','tron':'trx-tron',
              'avalanche-2':'avax-avalanche','polkadot':'dot-polkadot','litecoin':'ltc-litecoin',
              'chainlink':'link-chainlink','uniswap':'uni-uniswap','cosmos':'atom-cosmos',
              'near':'near-near-protocol','usd-coin':'usdc-usd-coin','dai':'dai-dai',
              'bitcoin-cash':'bch-bitcoin-cash','shiba-inu':'shib-shiba-inu','sui':'sui-sui',
              'aptos':'apt-aptos','arbitrum':'arb-arbitrum','optimism':'op-optimism',
            };
            await Promise.all(stillMissing.map(async id => {
              const pid = PAPRIKA_ID_MAP[id];
              if (!pid) return;
              try {
                const res = await fetchWithTimeout(`https://api.coinpaprika.com/v1/tickers/${pid}`, 3000);
                if (res.ok) {
                  const d = await res.json();
                  const usd = d?.quotes?.USD?.price;
                  if (typeof usd === 'number' && usd > 0) {
                    priceCache[id] = {
                      usd,
                      usd_24h_change: d?.quotes?.USD?.percent_change_24h || 0,
                      usd_market_cap: d?.quotes?.USD?.market_cap || 0,
                      source: 'coinpaprika',
                    };
                  }
                }
              } catch {}
            }));
            _saveCache(PRICE_CACHE_KEY, priceCache);
          }
          // Absolute last resort: the same-origin /market.json snapshot
          // (≤30 min old) — works even when every crypto API and proxy is
          // blocked by the user's network.
          const finalMissing = cryptoIds.filter(id => !priceCache[id]);
          if (finalMissing.length > 0) {
            const mkt = await _loadStaticMarket();
            if (mkt) {
              const byId = new Map(mkt.map(c => [c.id, c]));
              for (const id of finalMissing) {
                const c = byId.get(id);
                if (c && typeof c.current_price === 'number' && c.current_price > 0) {
                  priceCache[id] = {
                    usd: c.current_price,
                    usd_24h_change: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0,
                    usd_market_cap: c.market_cap || 0,
                    name: c.name,
                    symbol: c.symbol,
                    source: 'snapshot',
                  };
                  if (c.image) coinImageCache[id] = c.image;
                }
              }
              _saveCache(PRICE_CACHE_KEY, priceCache);
              _saveCache(IMAGE_CACHE_KEY, coinImageCache);
            }
          }
        }
        for (const id of cryptoIds) {
          if (priceCache[id]) result[id] = { ...priceCache[id], source: 'coingecko' };
        }
      })());
    }

    // Manual-only categories (bonds, other)
    for (const id of manualFallbackIds) {
      if (manual[id]) result[id] = { ...manual[id], source: 'manual' };
    }

    const promise = Promise.all(tasks)
      .then(() => result)
      .finally(() => _inFlight.delete(key));
    _inFlight.set(key, promise);
    return promise;
  };
  })(),

  // Fetch coin images from market data (more reliable than search thumb)
  getCoinImages: async (ids) => {
    if (!ids) return {};
    const now = Date.now();
    const coinIds = ids.split(',').filter(Boolean);
    const allCached = coinIds.every(id => !!coinImageCache[id]);

    if (!allCached || now - lastImageFetch > CACHE_DURATION * 5) {
      const data = await fetchJSON(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&per_page=100&page=1`
      );
      if (Array.isArray(data)) {
        for (const coin of data) {
          if (coin.image) coinImageCache[coin.id] = coin.image;
        }
        lastImageFetch = now;
        _saveCache(IMAGE_CACHE_KEY, coinImageCache);
      }

      // For any coin not returned by the batch (e.g. renamed ID), try individual lookup
      const missing = coinIds.filter(id => !coinImageCache[id] && !id.startsWith('metal:') && !id.startsWith('stock:') && !id.startsWith('fiat:'));
      for (const id of missing.slice(0, 5)) {
        try {
          const coin = await fetchJSON(`${COINGECKO_BASE}/coins/${id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`);
          if (coin?.image?.large) coinImageCache[id] = coin.image.large;
          else if (coin?.image?.thumb) coinImageCache[id] = coin.image.thumb;
        } catch {}
      }
      if (missing.length) _saveCache(IMAGE_CACHE_KEY, coinImageCache);
    }

    const result = {};
    for (const id of coinIds) {
      if (coinImageCache[id]) result[id] = coinImageCache[id];
    }
    return result;
  },

  searchCoins: async (query) => {
    if (!query) return [];
    const data = await fetchJSONFast(`${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`);
    if (!data) return [];
    const results = (data.coins || []).slice(0, 20).map(c => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      thumb: c.thumb,
      large: c.large,
    }));
    // Cache image URLs immediately so CoinLogo finds them without CDN fallbacks
    let changed = false;
    for (const c of results) {
      if (c.id && (c.large || c.thumb) && !coinImageCache[c.id]) {
        coinImageCache[c.id] = c.large || c.thumb;
        changed = true;
      }
    }
    if (changed) _saveCache(IMAGE_CACHE_KEY, coinImageCache);
    return results;
  },

  // Get detailed coin data for AI analysis
  getCoinDetail: async (id) => {
    if (!id) return null;
    return await fetchJSON(
      `${COINGECKO_BASE}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`
    );
  },

  // Chart data for asset detail — routes by id:
  //   stock:XXX / metal:xau / metal:xag → Stooq daily CSV
  //   bond:/other: → synthesize from user's own transaction history
  //   crypto id   → CoinGecko market_chart
  getChartData: async (id, days = 7) => {
    if (!id) return [];
    const stooqSym = stooqSymbolFor(id);
    if (stooqSym) {
      const hist = await fetchStooqHistory(stooqSym, days);
      const step = Math.max(1, Math.floor(hist.length / 80));
      return hist.filter((_, i) => i % step === 0);
    }
    if (id.startsWith('bond:') || id.startsWith('other:')) {
      const txs = loadData('transactions').filter(t => t.coin_id === id);
      const manual = loadData('manual_prices', {})[id];
      const pts = txs
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(t => ({ date: t.date, time: t.date, price: t.price_per_unit }));
      if (manual?.usd && (pts.length === 0 || pts[pts.length - 1].price !== manual.usd)) {
        pts.push({ date: 'Now', time: 'Now', price: manual.usd });
      }
      return pts;
    }

    // Localstorage cache: 5 min TTL per (id, days). Returns cached series
    // immediately if fresh, otherwise tries CoinGecko, then CoinCap, then
    // falls back to whatever we have in 30d signals cache.
    const CHART_TTL = 5 * 60 * 1000;
    const cacheKey = `${id}::${days}`;
    const hit = _chartCache[cacheKey];
    if (hit && Date.now() - hit.t < CHART_TTL && Array.isArray(hit.v) && hit.v.length > 0) {
      return hit.v;
    }

    const finalize = (rawPrices) => {
      const step = Math.max(1, Math.floor(rawPrices.length / 80));
      const series = rawPrices.filter((_, i) => i % step === 0).map(([ts, price]) => ({
        date: new Date(ts).toLocaleDateString(),
        time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        price,
      }));
      try {
        _chartCache[cacheKey] = { t: Date.now(), v: series };
        localStorage.setItem(_CHART_CACHE_KEY, JSON.stringify(_chartCache));
      } catch {}
      return series;
    };

    // Primary: CoinGecko
    const data = await fetchJSON(
      `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`
    );
    if (data && Array.isArray(data.prices) && data.prices.length > 0) {
      return finalize(data.prices);
    }

    // Fallback: CoinCap history (CORS-enabled, no key)
    try {
      const interval = days <= 1 ? 'm15' : days <= 7 ? 'h1' : days <= 30 ? 'h6' : 'd1';
      const end = Date.now();
      const start = end - days * 24 * 60 * 60 * 1000;
      const ccData = await fetchJSON(
        `https://rest.coincap.io/v3/assets/${id}/history?interval=${interval}&start=${start}&end=${end}`
      );
      const list = Array.isArray(ccData?.data) ? ccData.data : [];
      if (list.length > 0) {
        const rawPrices = list
          .map(p => [Number(p.time), parseFloat(p.priceUsd)])
          .filter(([, v]) => isFinite(v) && v > 0);
        if (rawPrices.length > 0) return finalize(rawPrices);
      }
    } catch {}

    // Last resort: reuse cached signals priceSeries (1h cached) — coarse
    // but better than empty.
    try {
      const sig = JSON.parse(localStorage.getItem('crypto_tracker_signals_cache_v1') || '{}');
      const series = sig?.[id]?.v?.priceSeries;
      if (Array.isArray(series) && series.length > 0) {
        return series.map(p => ({ date: p.date, time: '', price: p.price }));
      }
    } catch {}

    // Stale cache as final fallback (better something than nothing)
    if (hit && Array.isArray(hit.v) && hit.v.length > 0) return hit.v;
    return [];
  },

  // Holdings for a specific coin (for sell quantity picker)
  getHoldingsForCoin: async (coinId) => {
    const portfolio = await api.getPortfolio();
    return portfolio.find(h => h.coin_id === coinId) || null;
  },

  // Resilient market snapshot. Returns the same shape as CoinGecko's
  // /coins/markets (id, symbol, name, current_price, image,
  // market_cap, price_change_percentage_24h, total_volume, ...).
  // Order: localStorage cache (instant) → CoinGecko → CoinCap → empty.
  // Persisted to localStorage so the page never paints blank.
  getMarketData: async () => {
    const data = await _loadMarketSnapshot(50);
    return data;
  },

  getWhaleMarketSnapshot: async () => {
    return await _loadMarketSnapshot(250);
  },

  // CoinGecko trending — what people are searching most right now
  getTrendingCoins: async () => {
    const data = await fetchJSON(`${COINGECKO_BASE}/search/trending`);
    const items = Array.isArray(data?.coins) ? data.coins : [];
    return items.map(({ item }) => ({
      id: item?.id,
      name: item?.name,
      symbol: item?.symbol,
      thumb: item?.small || item?.thumb,
      market_cap_rank: item?.market_cap_rank,
      score: item?.score,
      price_btc: item?.price_btc,
    }));
  },

  // Recent large BTC transactions from blockchain.info's unconfirmed feed.
  // CORS-enabled, no key required. Filter to txs > $minUsd.
  getLargeBtcTransactions: async (minUsd = 1_000_000) => {
    const [txData, priceData] = await Promise.all([
      fetchJSON('https://blockchain.info/unconfirmed-transactions?format=json&cors=true'),
      fetchJSON(`${COINGECKO_BASE}/simple/price?ids=bitcoin&vs_currencies=usd`),
    ]);
    const btcUsd = priceData?.bitcoin?.usd || 0;
    const txs = Array.isArray(txData?.txs) ? txData.txs : [];
    const SAT = 1e8;
    const out = [];
    for (const tx of txs) {
      const totalSat = (tx.out || []).reduce((s, o) => s + (o.value || 0), 0);
      const btc = totalSat / SAT;
      const usd = btc * btcUsd;
      if (usd >= minUsd) {
        out.push({
          hash: tx.hash,
          time: tx.time ? new Date(tx.time * 1000) : new Date(),
          btc,
          usd,
          inputs: (tx.inputs || []).length,
          outputs: (tx.out || []).length,
        });
      }
    }
    return out.sort((a, b) => b.usd - a.usd).slice(0, 12);
  },

  // Compute "smart" indicators for a single coin from its OHLC-ish chart data.
  // Returns volume pulse, accumulation/distribution score, momentum, volatility.
  getCoinSmartSignals: async (coinId, days = 30) => {
    const nonCrypto =
      coinId === GOLD_ID ||
      coinId === SILVER_ID ||
      coinId === COPPER_ID ||
      coinId === PLATINUM_ID ||
      coinId.startsWith(STOCK_PREFIX) ||
      coinId.startsWith(FIAT_PREFIX) ||
      coinId.startsWith('bond:') ||
      coinId.startsWith('other:');
    if (!coinId || nonCrypto) return null;
    const data = await fetchJSON(
      `${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
    );
    const prices = Array.isArray(data?.prices) ? data.prices : [];
    const volumes = Array.isArray(data?.total_volumes) ? data.total_volumes : [];
    if (prices.length < 5 || volumes.length < 5) return null;

    const recentN = Math.max(2, Math.floor(prices.length / days));
    const last24Vol = volumes.slice(-recentN).reduce((s, v) => s + v[1], 0);
    const avgDailyVol = volumes.reduce((s, v) => s + v[1], 0) / days;
    const volPulse = avgDailyVol > 0 ? last24Vol / avgDailyVol : 0;

    // Accumulation/Distribution: compare close-to-close direction vs volume.
    let accumScore = 0;
    let totalVol = 0;
    const minLen = Math.min(prices.length, volumes.length);
    for (let i = 1; i < minLen; i++) {
      const dir = Math.sign(prices[i][1] - prices[i - 1][1]);
      const v = volumes[i][1];
      accumScore += dir * v;
      totalVol += v;
    }
    const adNormalized = totalVol > 0 ? accumScore / totalVol : 0; // -1..1

    // Momentum: short-vs-long EMA-ish ratio
    const sma = (n) => {
      const slice = prices.slice(-n);
      return slice.reduce((s, p) => s + p[1], 0) / slice.length;
    };
    const fast = sma(Math.max(2, Math.floor(recentN * 3)));
    const slow = sma(Math.max(4, Math.floor(prices.length / 2)));
    const momentum = slow > 0 ? (fast - slow) / slow : 0;

    // Volatility: stdev of log returns over the window
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const r = Math.log(prices[i][1] / prices[i - 1][1]);
      if (isFinite(r)) returns.push(r);
    }
    const meanR = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
    const variance = returns.length > 0 ? returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length : 0;
    const volatility = Math.sqrt(variance) * Math.sqrt(365); // annualised

    // Recent high/low range position (0 = at low, 1 = at high)
    const window = prices.slice(-Math.min(prices.length, recentN * 7));
    const hi = Math.max(...window.map(p => p[1]));
    const lo = Math.min(...window.map(p => p[1]));
    const lastPrice = prices[prices.length - 1][1];
    const rangePos = hi > lo ? (lastPrice - lo) / (hi - lo) : 0.5;

    // Composite "Whale Score": -100 (heavy distribution) to +100 (heavy accumulation)
    const whaleScore = Math.max(-100, Math.min(100, Math.round(
      adNormalized * 60 + Math.tanh(momentum * 5) * 25 + (volPulse > 1 ? Math.min(15, (volPulse - 1) * 10) : 0)
    )));

    // Daily-bucketed price series — one price per day (latest known) for
    // portfolio value reconstruction on the Dashboard trend chart.
    const daily = {};
    for (const [ts, p] of prices) {
      const dayKey = new Date(ts).toISOString().slice(0, 10);
      daily[dayKey] = p;
    }
    const priceSeries = Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, price]) => ({ date, price }));

    return {
      volPulse,            // ratio of last-24h volume to daily average over window
      adNormalized,        // -1..1 accumulation/distribution
      momentum,            // -1..1 fast vs slow MA delta
      volatility,          // annualised stdev of log returns
      rangePos,             // 0..1 position in recent range
      whaleScore,          // -100..100 composite
      lastPrice,
      windowDays: days,
      priceSeries,         // [{ date: 'YYYY-MM-DD', price }]
      // Portfolio-level analytics helpers
      maxDrawdown: (() => {
        let peak = -Infinity, maxDD = 0;
        for (const p of prices) {
          if (p[1] > peak) peak = p[1];
          const dd = peak > 0 ? (p[1] - peak) / peak : 0;
          if (dd < maxDD) maxDD = dd;
        }
        return Math.abs(maxDD);
      })(),
      return30d: prices.length > 1 ? (prices[prices.length - 1][1] - prices[0][1]) / prices[0][1] : 0,
    };
  },

  // Bulk smart signals with 1h localStorage cache. Non-crypto IDs silently skipped.
  getBulkSmartSignals: async (coinIds, days = 30) => {
    const out = {};
    if (!Array.isArray(coinIds) || coinIds.length === 0) return out;
    const CACHE_KEY = 'crypto_tracker_signals_cache_v1';
    const TTL_MS = 60 * 60 * 1000;
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch {}
    const now = Date.now();
    const toFetch = [];
    for (const id of coinIds) {
      const hit = cache[id];
      if (hit && now - hit.t < TTL_MS && hit.v) {
        out[id] = hit.v;
      } else {
        toFetch.push(id);
      }
    }
    // Fetch up to 3 coins concurrently — enough to saturate CoinGecko's free
    // tier without triggering rate-limits. Sequential 120ms delays would take
    // 10s+ for a 50-coin portfolio; this cuts it to under 2s.
    const CONCURRENCY = 3;
    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      const batch = toFetch.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async id => {
        try {
          const s = await api.getCoinSmartSignals(id, days);
          out[id] = s;
          cache[id] = { t: now, v: s };
        } catch { out[id] = null; }
      }));
      // Brief pause between batches to stay within CoinGecko's 10–30 req/min free limit
      if (i + CONCURRENCY < toFetch.length) await new Promise(r => setTimeout(r, 350));
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
    return out;
  },

  // Bulk technical analysis (RSI, MACD, Bollinger, trend, support/resistance)
  // per crypto holding, computed from ~`days` of daily closes. Non-crypto IDs
  // are skipped (no reliable OHLC feed). 1h localStorage cache.
  getBulkTechnicals: async (coinIds, days = 180) => {
    const out = {};
    if (!Array.isArray(coinIds) || coinIds.length === 0) return out;
    const isNonCrypto = (id) =>
      !id ||
      id === GOLD_ID || id === SILVER_ID || id === COPPER_ID || id === PLATINUM_ID ||
      id.startsWith(STOCK_PREFIX) || id.startsWith(FIAT_PREFIX) ||
      id.startsWith('bond:') || id.startsWith('other:') ||
      id.startsWith('metal:') || id.startsWith('stock:') || id.startsWith('real:') || id.startsWith('cash:');

    const CACHE_KEY = 'crypto_tracker_ta_cache_v1';
    const TTL_MS = 60 * 60 * 1000;
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch {}
    const now = Date.now();
    const toFetch = [];
    for (const id of coinIds) {
      if (isNonCrypto(id)) { out[id] = null; continue; }
      const hit = cache[id];
      if (hit && now - hit.t < TTL_MS) { out[id] = hit.v; continue; }
      toFetch.push(id);
    }
    const CONCURRENCY = 3;
    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      const batch = toFetch.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async id => {
        try {
          const data = await fetchJSON(
            `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`
          );
          const prices = Array.isArray(data?.prices) ? data.prices : [];
          if (prices.length < 20) { out[id] = null; cache[id] = { t: now, v: null }; return; }
          // Collapse to one close per calendar day for stable daily indicators.
          const daily = {};
          for (const [ts, p] of prices) daily[new Date(ts).toISOString().slice(0, 10)] = p;
          const closes = Object.entries(daily)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, p]) => p);
          const ta = analyzeTechnicals(closes, closes[closes.length - 1]);
          out[id] = ta;
          cache[id] = { t: now, v: ta };
        } catch { out[id] = null; }
      }));
      if (i + CONCURRENCY < toFetch.length) await new Promise(r => setTimeout(r, 350));
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
    return out;
  },

  // Bulk fundamental/on-chain-proxy data per crypto holding from CoinGecko's
  // /coins/markets (one batched call). Gives market-cap rank, FDV, supply
  // figures, ATH distance and multi-window price change — the inputs for the
  // fundamental + on-chain pillars of the Magic Indicator. 1h cache.
  getBulkFundamentals: async (coinIds) => {
    const out = {};
    if (!Array.isArray(coinIds) || coinIds.length === 0) return out;
    const isNonCrypto = (id) =>
      !id ||
      id === GOLD_ID || id === SILVER_ID || id === COPPER_ID || id === PLATINUM_ID ||
      id.startsWith(STOCK_PREFIX) || id.startsWith(FIAT_PREFIX) ||
      id.startsWith('bond:') || id.startsWith('other:') ||
      id.startsWith('metal:') || id.startsWith('stock:') || id.startsWith('real:') || id.startsWith('cash:');

    const CACHE_KEY = 'crypto_tracker_fundamentals_cache_v1';
    const TTL_MS = 60 * 60 * 1000;
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch {}
    const now = Date.now();
    const cryptoIds = [];
    for (const id of coinIds) {
      if (isNonCrypto(id)) { out[id] = null; continue; }
      const hit = cache[id];
      if (hit && now - hit.t < TTL_MS) { out[id] = hit.v; continue; }
      cryptoIds.push(id);
    }
    if (cryptoIds.length === 0) return out;

    const map = (m) => ({
      currentPrice: m.current_price ?? null,
      marketCap: m.market_cap ?? 0,
      marketCapRank: m.market_cap_rank ?? null,
      fdv: m.fully_diluted_valuation ?? null,
      totalVolume: m.total_volume ?? 0,
      circulatingSupply: m.circulating_supply ?? null,
      totalSupply: m.total_supply ?? null,
      maxSupply: m.max_supply ?? null,
      ath: m.ath ?? null,
      athChangePct: m.ath_change_percentage ?? null,
      atlChangePct: m.atl_change_percentage ?? null,
      change24h: m.price_change_percentage_24h_in_currency ?? m.price_change_percentage_24h ?? null,
      change7d: m.price_change_percentage_7d_in_currency ?? null,
      change30d: m.price_change_percentage_30d_in_currency ?? null,
    });

    try {
      // CoinGecko allows a comma-separated ids filter; chunk to stay well under URL limits.
      const CHUNK = 100;
      for (let i = 0; i < cryptoIds.length; i += CHUNK) {
        const slice = cryptoIds.slice(i, i + CHUNK);
        const ids = encodeURIComponent(slice.join(','));
        const data = await fetchJSON(
          `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=${slice.length}&page=1&sparkline=false&price_change_percentage=24h%2C7d%2C30d`
        );
        if (Array.isArray(data)) {
          for (const m of data) {
            if (!m?.id) continue;
            out[m.id] = map(m);
            cache[m.id] = { t: now, v: out[m.id] };
          }
        }
        if (i + CHUNK < cryptoIds.length) await new Promise(r => setTimeout(r, 350));
      }
    } catch { /* leave missing ids as undefined */ }
    // Any id we couldn't resolve falls back to its (possibly stale) cache or null.
    for (const id of cryptoIds) if (!(id in out)) out[id] = cache[id]?.v ?? null;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
    return out;
  },

  // Exchanges
  getExchanges: async () => loadData('exchanges'),

  addExchange: async (data) => {
    const exchanges = loadData('exchanges');
    const ex = {
      id: bumpId('crypto_tracker_next_ex_id'),
      name: data.name,
      is_connected: data.api_key ? 1 : 0,
      created_at: new Date().toISOString(),
    };
    exchanges.unshift(ex);
    saveData('exchanges', exchanges);
    return ex;
  },

  deleteExchange: async (id) => {
    const exchanges = loadData('exchanges').filter(e => e.id !== id);
    saveData('exchanges', exchanges);
    return null;
  },

  syncExchange: async () => {
    return { error: 'Exchange sync requires the backend server. Run locally with: npm run dev' };
  },

  // Per-coin sell plan: multiple price targets, each with a quantity to sell at that price.
  // Shape: { [coin_id]: { targets: [{ id, price, quantity }, ...] } }
  // Legacy shape { amount } is migrated on read into a single-target plan with null quantity (sell all).
  getCoinTargets: async () => {
    try {
      const data = localStorage.getItem('crypto_tracker_coin_targets');
      const raw = data ? JSON.parse(data) : {};
      const normalized = {};
      for (const [coinId, v] of Object.entries(raw)) {
        if (v && Array.isArray(v.targets)) {
          normalized[coinId] = { targets: v.targets };
        } else if (v && typeof v.amount === 'number') {
          // Migrate legacy single-price target
          normalized[coinId] = {
            targets: [{ id: Date.now(), price: v.amount, quantity: null }],
          };
        }
      }
      return normalized;
    } catch { return {}; }
  },

  // Legacy single-target setter (replaces any existing plan with one target that sells all holdings)
  setCoinTarget: async (coinId, amount) => {
    const targets = await api.getCoinTargets();
    targets[coinId] = { targets: [{ id: Date.now(), price: amount, quantity: null }] };
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(targets));
    return targets;
  },

  addCoinTarget: async (coinId, { price, quantity }) => {
    const targets = await api.getCoinTargets();
    if (!targets[coinId]) targets[coinId] = { targets: [] };
    const newTarget = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      price: parseFloat(price),
      quantity: quantity === null || quantity === '' || quantity === undefined ? null : parseFloat(quantity),
    };
    targets[coinId].targets.push(newTarget);
    targets[coinId].targets.sort((a, b) => a.price - b.price);
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(targets));
    return targets;
  },

  updateCoinTargetItem: async (coinId, targetId, { price, quantity }) => {
    const targets = await api.getCoinTargets();
    const plan = targets[coinId];
    if (!plan) return targets;
    plan.targets = plan.targets.map(t =>
      t.id === targetId
        ? { ...t, price: parseFloat(price), quantity: quantity === null || quantity === '' || quantity === undefined ? null : parseFloat(quantity) }
        : t
    ).sort((a, b) => a.price - b.price);
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(targets));
    return targets;
  },

  removeCoinTargetItem: async (coinId, targetId) => {
    const targets = await api.getCoinTargets();
    const plan = targets[coinId];
    if (!plan) return targets;
    plan.targets = plan.targets.filter(t => t.id !== targetId);
    if (plan.targets.length === 0) delete targets[coinId];
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(targets));
    return targets;
  },

  removeCoinTarget: async (coinId) => {
    const targets = await api.getCoinTargets();
    delete targets[coinId];
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(targets));
    return targets;
  },

  // Import / Export as shareable code.
  // New format: 'WLZ:' + base64(gzip(JSON)) — ~60-70% shorter than plain base64.
  // Legacy format: plain base64(JSON) — still accepted on import.
  exportCode: async () => {
    // Strip large/redundant fields from each transaction before encoding.
    // coin_image  — re-fetched from CoinGecko; often 70-100 chars per tx.
    // total_cost  — always amount × price_per_unit; reconstructed on import.
    // created_at  — precise timestamp; not needed for portfolio state.
    // Dropping these typically reduces a 3-QR backup to a single QR code.
    // eslint-disable-next-line no-unused-vars
    const stripTx = ({ coin_image, total_cost, created_at, ...rest }) => rest
    const data = {
      w: loadData('wallets'),
      t: loadData('transactions').map(stripTx),
      e: loadData('exchanges'),
      mp: loadData('manual_prices', {}),
      ct: (() => { try { return JSON.parse(localStorage.getItem('crypto_tracker_coin_targets') || '{}'); } catch { return {}; } })(),
      ids: {
        w: localStorage.getItem('crypto_tracker_next_wallet_id') || '1',
        t: localStorage.getItem('crypto_tracker_next_tx_id') || '1',
        e: localStorage.getItem('crypto_tracker_next_ex_id') || '1',
      },
      v: 3,
    };
    const json = JSON.stringify(data);
    try {
      if (typeof CompressionStream !== 'undefined') {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        const buf = await new Response(stream).arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return 'WLZ:' + btoa(bin);
      }
    } catch (err) {
      console.error('Gzip export failed, falling back:', err);
    }
    try {
      const enc = new TextEncoder().encode(json);
      let bin = '';
      for (let i = 0; i < enc.length; i++) bin += String.fromCharCode(enc[i]);
      return 'WLZ:' + btoa(bin);
    } catch (err) {
      console.error('Export error:', err);
      return null;
    }
  },

  // Compact QR snapshot — only current holdings (no transaction history).
  // Always fits in a single QR code regardless of how many transactions exist.
  // Prefix 'WLQS:' distinguishes it from a full backup code on import.
  exportQrSnapshot: async () => {
    const wallets = loadData('wallets')
    const holdings = await api.getPortfolio()
    const manualPrices = loadData('manual_prices', {})
    const snapshot = {
      sv: 1,
      w: wallets.map(w => ({ i: w.id, n: w.name })),
      h: holdings.map(h => {
        const avgPrice = h.amount > 0 ? (h.total_invested / h.amount) : 0
        return {
          w: h.wallet_id || (wallets[0]?.id ?? 1),
          c: h.coin_id,
          s: h.coin_symbol,
          n: h.coin_name || '',
          a: h.amount,
          p: avgPrice,
          ca: h.category || 'crypto',
        }
      }),
      mp: manualPrices,
    }
    const json = JSON.stringify(snapshot)
    try {
      if (typeof CompressionStream !== 'undefined') {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
        const buf = await new Response(stream).arrayBuffer()
        const bytes = new Uint8Array(buf)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        return 'WLQS:' + btoa(bin)
      }
    } catch {}
    const enc = new TextEncoder().encode(json)
    let bin = ''
    for (let i = 0; i < enc.length; i++) bin += String.fromCharCode(enc[i])
    return 'WLQS:' + btoa(bin)
  },

  // Deep-link QR: encodes a URL that opens walletlens.live and auto-imports.
  // Uses URL-safe base64 (no +/=) so the ?wqi= param needs no percent-encoding.
  exportQrDeepLink: async () => {
    const wallets = loadData('wallets')
    const holdings = await api.getPortfolio()
    const manualPrices = loadData('manual_prices', {})
    const snapshot = {
      sv: 1,
      w: wallets.map(w => ({ i: w.id, n: w.name })),
      h: holdings.map(h => {
        const avgPrice = h.amount > 0 ? (h.total_invested / h.amount) : 0
        return {
          w: h.wallet_id || (wallets[0]?.id ?? 1),
          c: h.coin_id, s: h.coin_symbol, n: h.coin_name || '',
          a: h.amount, p: avgPrice, ca: h.category || 'crypto',
        }
      }),
      mp: manualPrices,
    }
    const json = JSON.stringify(snapshot)
    let bin = ''
    try {
      if (typeof CompressionStream !== 'undefined') {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
        const buf = await new Response(stream).arrayBuffer()
        const bytes = new Uint8Array(buf)
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
      } else {
        const enc = new TextEncoder().encode(json)
        for (let i = 0; i < enc.length; i++) bin += String.fromCharCode(enc[i])
      }
    } catch {
      const enc = new TextEncoder().encode(json)
      bin = ''
      for (let i = 0; i < enc.length; i++) bin += String.fromCharCode(enc[i])
    }
    const b64url = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    return 'https://walletlens.live/?wqi=' + b64url
  },

  // Parse a code without committing anything. Returns a summary the UI can display for confirmation.
  previewImportCode: async (code) => {
    try {
      let trimmed = (code || '').trim();
      // Accept deep-link URL format produced by exportQrDeepLink
      const wqiMatch = trimmed.match(/[?&]wqi=([A-Za-z0-9_-]+)/)
      if (wqiMatch) {
        const raw = wqiMatch[1]
        const b64 = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - raw.length % 4) % 4)
        trimmed = 'WLQS:' + b64
      }
      let jsonString;
      const isSnapshot = trimmed.startsWith('WLQS:')
      if (trimmed.startsWith('WLZ:') || isSnapshot) {
        const payload = trimmed.slice(isSnapshot ? 5 : 4);
        const bin = atob(payload);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        try {
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
          jsonString = await new Response(stream).text();
        } catch {
          jsonString = new TextDecoder().decode(bytes);
        }
      } else {
        const b = atob(trimmed);
        const bb = new Uint8Array(b.length);
        for (let i = 0; i < b.length; i++) bb[i] = b.charCodeAt(i);
        jsonString = new TextDecoder().decode(bb);
      }
      const data = JSON.parse(jsonString);

      // WLQS snapshot: convert compact holdings back to full wallet+transaction arrays
      if (isSnapshot && data.sv) {
        const today = new Date().toISOString().split('T')[0]
        const wallets = (data.w || []).map(w => ({ id: w.i, name: w.n }))
        const walletId = wallets[0]?.id ?? 1
        let txId = 1
        const transactions = (data.h || []).map(h => ({
          id: txId++,
          wallet_id: h.w ?? walletId,
          type: 'buy',
          category: h.ca || 'crypto',
          coin_id: h.c,
          coin_symbol: h.s,
          coin_name: h.n || '',
          coin_image: '',
          amount: h.a,
          price_per_unit: h.p,
          total_cost: h.a * h.p,
          exchange: '',
          notes: '',
          date: today,
          created_at: new Date().toISOString(),
        }))
        const ids = { w: String((wallets.length || 0) + 1), t: String(txId + 1), e: '1' }
        return {
          success: true,
          summary: { wallets: wallets.length, transactions: transactions.length, exchanges: 0, targets: 0, manualPrices: Object.keys(data.mp || {}).length, byCategory: {}, version: 'snapshot' },
          diff: { txDelta: transactions.length, added: [], removed: [], changed: [], hasChanges: true },
          _raw: { wallets, transactions, exchanges: [], targets: {}, manualPrices: data.mp || {}, ids },
        }
      }

      const wallets = Array.isArray(data.w || data.wallets) ? (data.w || data.wallets) : [];
      const transactions = Array.isArray(data.t || data.transactions) ? (data.t || data.transactions) : [];
      // Reconstruct fields stripped by the compact export (coin_image, total_cost, created_at).
      // Old full exports still include them; this is a no-op for those.
      // Also backfill wallet_id: very old backups (pre-multi-wallet) omit it, and a
      // transaction with no wallet_id is silently dropped by any wallet-filtered
      // view (parseInt(undefined) === NaN never matches), so restored holdings
      // vanish the moment a specific wallet is selected. Pin them to the first wallet.
      const fallbackWalletId = wallets[0]?.id ?? 1
      for (const tx of transactions) {
        if (tx.total_cost == null) tx.total_cost = (tx.amount || 0) * (tx.price_per_unit || 0)
        if (!tx.coin_image) tx.coin_image = ''
        if (!tx.created_at) tx.created_at = tx.date || new Date().toISOString()
        if (tx.wallet_id == null) tx.wallet_id = fallbackWalletId
      }
      const exchanges = Array.isArray(data.e || data.exchanges) ? (data.e || data.exchanges) : [];
      const targets = (data.ct || data.coin_targets || {});
      const manualPrices = data.mp || {};
      // Count CURRENT holdings per category: compute net balance per coin_id
      // (buys/deposits minus sells/withdraws) and only count coin_ids with
      // non-zero balance, so fully-sold-out positions don't inflate the chips.
      const balances = {};
      const catFor = (tx) => {
        let cat = tx.category;
        const id = String(tx.coin_id || '');
        if (!cat) {
          if (id === GOLD_ID) cat = 'gold';
          else if (id === SILVER_ID) cat = 'silver';
          else if (id === COPPER_ID) cat = 'copper';
          else if (id === PLATINUM_ID) cat = 'platinum';
          else if (id.startsWith(STOCK_PREFIX)) cat = 'stock';
          else if (id.startsWith(FIAT_PREFIX)) cat = 'fiat';
          else cat = 'crypto';
        }
        return cat;
      };
      for (const tx of transactions) {
        const id = String(tx.coin_id || '');
        if (!id) continue;
        const amt = Number(tx.amount) || 0;
        if (!balances[id]) balances[id] = { amount: 0, category: catFor(tx) };
        if (tx.type === 'buy' || tx.type === 'deposit') balances[id].amount += amt;
        else if (tx.type === 'sell' || tx.type === 'withdraw') balances[id].amount -= amt;
      }
      const byCategory = {};
      for (const { amount, category } of Object.values(balances)) {
        if (amount > 1e-9) byCategory[category] = (byCategory[category] || 0) + 1;
      }
      // Diff against current state: which holdings are added / removed /
      // changed, plus tx-count delta, so the user can review before
      // committing rather than blindly overwriting.
      const currentTxs = loadData('transactions');
      const incomingHoldings = _foldBalances(transactions);
      const currentHoldings = _foldBalances(currentTxs);
      const allIds = new Set([...Object.keys(incomingHoldings), ...Object.keys(currentHoldings)]);
      const added = [], removed = [], changed = [];
      for (const id of allIds) {
        const a = currentHoldings[id]?.amount || 0;
        const b = incomingHoldings[id]?.amount || 0;
        if (a < 1e-9 && b > 1e-9) added.push({ coin_id: id, symbol: incomingHoldings[id].symbol, amount: b });
        else if (a > 1e-9 && b < 1e-9) removed.push({ coin_id: id, symbol: currentHoldings[id].symbol, amount: a });
        else if (Math.abs(a - b) > 1e-9) changed.push({ coin_id: id, symbol: incomingHoldings[id]?.symbol || currentHoldings[id]?.symbol, from: a, to: b });
      }

      return {
        success: true,
        summary: {
          wallets: wallets.length,
          transactions: transactions.length,
          exchanges: exchanges.length,
          targets: Object.keys(targets).length,
          manualPrices: Object.keys(manualPrices).length,
          byCategory,
          version: data.v || 1,
        },
        diff: {
          txDelta: transactions.length - currentTxs.length,
          added,
          removed,
          changed,
          hasChanges: added.length + removed.length + changed.length > 0,
        },
        _raw: { wallets, transactions, exchanges, targets, manualPrices, ids: data.ids || {} },
      };
    } catch (err) {
      return { success: false, error: err.message || 'Invalid backup code' };
    }
  },

  importCode: async (code) => {
    const preview = await api.previewImportCode(code);
    if (!preview.success) return preview;
    // Snapshot current state before overwriting, so the user has a one-tap undo.
    try {
      const snapshot = {
        t: Date.now(),
        wallets: loadData('wallets'),
        transactions: loadData('transactions'),
        exchanges: loadData('exchanges'),
        manual_prices: loadData('manual_prices', {}),
        coin_targets: (() => { try { return JSON.parse(localStorage.getItem('crypto_tracker_coin_targets') || '{}'); } catch { return {}; } })(),
        ids: {
          w: localStorage.getItem('crypto_tracker_next_wallet_id') || '1',
          t: localStorage.getItem('crypto_tracker_next_tx_id') || '1',
          e: localStorage.getItem('crypto_tracker_next_ex_id') || '1',
        },
      };
      localStorage.setItem('crypto_tracker_pre_import_snapshot', JSON.stringify(snapshot));
    } catch {}

    const { wallets, transactions, exchanges, targets, manualPrices, ids } = preview._raw;
    saveData('wallets', wallets);
    saveData('transactions', transactions);
    saveData('exchanges', exchanges);
    saveData('manual_prices', manualPrices);
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(targets));
    const maxWId = Math.max(wallets.reduce((m, w) => Math.max(m, w.id || 0), 0) + 1, parseInt(ids.w) || 1);
    const maxTId = Math.max(transactions.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1, parseInt(ids.t) || 1);
    const maxEId = Math.max(exchanges.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1, parseInt(ids.e) || 1);
    localStorage.setItem('crypto_tracker_next_wallet_id', String(maxWId));
    localStorage.setItem('crypto_tracker_next_tx_id', String(maxTId));
    localStorage.setItem('crypto_tracker_next_ex_id', String(maxEId));
    priceCache = {};
    lastPriceFetch = 0;
    coinImageCache = {};
    lastImageFetch = 0;
    return { success: true, wallets: wallets.length, transactions: transactions.length };
  },

  hasImportSnapshot: () => {
    try { return !!localStorage.getItem('crypto_tracker_pre_import_snapshot'); }
    catch { return false; }
  },

  // Roll back the last import. Returns { success, when } or { success: false }.
  restoreLastImport: async () => {
    let snap;
    try { snap = JSON.parse(localStorage.getItem('crypto_tracker_pre_import_snapshot') || 'null'); } catch {}
    if (!snap) return { success: false, error: 'No snapshot to restore' };
    saveData('wallets', snap.wallets || []);
    saveData('transactions', snap.transactions || []);
    saveData('exchanges', snap.exchanges || []);
    saveData('manual_prices', snap.manual_prices || {});
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(snap.coin_targets || {}));
    if (snap.ids) {
      localStorage.setItem('crypto_tracker_next_wallet_id', String(snap.ids.w || 1));
      localStorage.setItem('crypto_tracker_next_tx_id', String(snap.ids.t || 1));
      localStorage.setItem('crypto_tracker_next_ex_id', String(snap.ids.e || 1));
    }
    localStorage.removeItem('crypto_tracker_pre_import_snapshot');
    priceCache = {};
    lastPriceFetch = 0;
    coinImageCache = {};
    lastImageFetch = 0;
    return { success: true, when: snap.t };
  },

  // Ensure a default wallet exists
  ensureWallet: async () => {
    const wallets = loadData('wallets');
    if (wallets.length === 0) {
      const wallet = {
        id: bumpId('crypto_tracker_next_wallet_id'),
        name: 'My Wallet',
        description: '',
        created_at: new Date().toISOString(),
      };
      wallets.push(wallet);
      saveData('wallets', wallets);
      return wallet;
    }
    return wallets[0];
  },

  // Multi-chain whale feed — BTC (blockchain.info) + ETH (Blockchair free tier)
  getWhaleAlertFeed: async (minUsd = 500_000) => {
    const [btcPrice, ethPrice, btcData, ethData] = await Promise.all([
      fetchJSON(`${COINGECKO_BASE}/simple/price?ids=bitcoin&vs_currencies=usd`).catch(() => null),
      fetchJSON(`${COINGECKO_BASE}/simple/price?ids=ethereum&vs_currencies=usd`).catch(() => null),
      fetchJSON('https://blockchain.info/unconfirmed-transactions?format=json&cors=true').catch(() => null),
      fetchJSON('https://api.blockchair.com/ethereum/mempool/transactions?limit=100&s=value(desc)').catch(() => null),
    ])
    const btcUsd = btcPrice?.bitcoin?.usd || 0
    const ethUsd = ethPrice?.ethereum?.usd || 0
    const SAT = 1e8
    const WEI = 1e18
    const out = []

    for (const tx of (btcData?.txs || [])) {
      const totalSat = (tx.out || []).reduce((s, o) => s + (o.value || 0), 0)
      const btc = totalSat / SAT
      const usd = btc * btcUsd
      if (usd >= minUsd) out.push({ hash: tx.hash, chain: 'BTC', symbol: '₿', amount: btc, usd, time: tx.time ? new Date(tx.time * 1000) : new Date() })
    }

    for (const tx of (ethData?.data || [])) {
      const eth = (tx.value || 0) / WEI
      const usd = eth * ethUsd
      if (usd >= minUsd) out.push({ hash: tx.hash, chain: 'ETH', symbol: 'Ξ', amount: eth, usd, time: new Date() })
    }

    return out.sort((a, b) => b.usd - a.usd).slice(0, 20)
  },

  // ── Coin notes (private, localStorage) ──
  getCoinNote: (coinId) => {
    const notes = loadData('coin_notes', {})
    return Array.isArray(notes) ? '' : (notes[coinId] || '')
  },
  saveCoinNote: (coinId, note) => {
    const notes = loadData('coin_notes', {})
    const obj = Array.isArray(notes) ? {} : notes
    if (note.trim()) obj[coinId] = note.trim()
    else delete obj[coinId]
    saveData('coin_notes', obj)
  },

  // Top exchanges by 24h volume with net flow signal from CoinGecko
  getExchangeFlows: async () => {
    const data = await fetchJSON(`${COINGECKO_BASE}/exchanges?per_page=12&page=1`)
    if (!Array.isArray(data)) return []
    return data.map(e => ({
      id: e.id,
      name: e.name,
      image: e.image,
      volume24h: e.trade_volume_24h_btc || 0,
      volumeNorm: e.trade_volume_24h_btc_normalized || 0,
      trustScore: e.trust_score || 0,
      trustRank: e.trust_score_rank || 99,
      url: e.url,
      country: e.country || '',
    }))
  },

  getFiatRates: fetchFiatRates,
};
