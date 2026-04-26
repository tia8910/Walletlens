const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
// Multiple CORS proxies — some networks/IPs get rate-limited or blocked by
// specific proxies, so we try several before giving up.
const CORS_PROXIES = [
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://cors.eu.org/${u}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

// Per-attempt timeout for any single fetch — without this, a slow proxy
// can stall the whole pipeline for 30s+ before failing over.
const FETCH_TIMEOUT_MS = 4500;
async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
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

// ─── Asset Categories ───
// Non-crypto assets track manually-entered prices in localStorage under
// `crypto_tracker_manual_prices` as { [coin_id]: { usd, usd_24h_change, updated_at } }.
// Real-time prices for gold/silver come from a free metals API and for US stocks
// from Stooq's CORS-enabled CSV endpoint. Failures fall back to the manual cache.
export const ASSET_CATEGORIES = {
  crypto: { key: 'crypto', label: 'Crypto', icon: '◆', color: '#6366f1' },
  fiat:   { key: 'fiat',   label: 'Fiat',   icon: '💵', color: '#0ea5e9' },
  gold:   { key: 'gold',   label: 'Gold',   icon: '🥇', color: '#f59e0b' },
  silver: { key: 'silver', label: 'Silver', icon: '🥈', color: '#94a3b8' },
  stock:  { key: 'stock',  label: 'Stocks', icon: '📈', color: '#10b981' },
  bond:   { key: 'bond',   label: 'Bonds',  icon: '📜', color: '#0284c7' },
  other:  { key: 'other',  label: 'Other',  icon: '◈', color: '#a78bfa' },
};
export const NON_CRYPTO_CATEGORIES = ['fiat', 'gold', 'silver', 'stock', 'bond', 'other'];

// Special coin IDs used for real-time external data sources
export const GOLD_ID = 'metal:xau';        // 1 troy oz gold, USD
export const SILVER_ID = 'metal:xag';      // 1 troy oz silver, USD
export const STOCK_PREFIX = 'stock:';      // followed by lowercase ticker, e.g. stock:aapl
export const FIAT_PREFIX = 'fiat:';        // followed by lowercase iso code, e.g. fiat:eur

export const PRESET_ASSETS = {
  gold:   { coin_id: GOLD_ID,   symbol: 'XAU', name: 'Gold (1 oz)',   unit: 'oz' },
  silver: { coin_id: SILVER_ID, symbol: 'XAG', name: 'Silver (1 oz)', unit: 'oz' },
};

export const POPULAR_FIAT = [
  { code: 'USD', name: 'US Dollar',        symbol: '$' },
  { code: 'EUR', name: 'Euro',             symbol: '€' },
  { code: 'GBP', name: 'British Pound',    symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen',     symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc',      symbol: 'Fr' },
  { code: 'CAD', name: 'Canadian Dollar',  symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar',symbol: 'A$' },
  { code: 'CNY', name: 'Chinese Yuan',     symbol: '¥' },
  { code: 'INR', name: 'Indian Rupee',     symbol: '₹' },
  { code: 'AED', name: 'UAE Dirham',       symbol: 'د.إ' },
];

export const POPULAR_TICKERS = [
  { ticker: 'AAPL', name: 'Apple Inc.' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'GOOGL', name: 'Alphabet (Google)' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'META', name: 'Meta Platforms' },
  { ticker: 'SPY',  name: 'S&P 500 ETF' },
  { ticker: 'QQQ',  name: 'Nasdaq 100 ETF' },
  { ticker: 'TLT',  name: '20+ Year Treasury Bond ETF' },
];

// LocalStorage helpers
function loadData(key, fallback = []) {
  try {
    const data = localStorage.getItem(`crypto_tracker_${key}`);
    return data ? JSON.parse(data) : fallback;
  } catch { return fallback; }
}

function saveData(key, data) {
  localStorage.setItem(`crypto_tracker_${key}`, JSON.stringify(data));
}

function bumpId(key) {
  const current = parseInt(localStorage.getItem(key) || '1');
  localStorage.setItem(key, (current + 1).toString());
  return current;
}

// Price & image cache — hydrated from localStorage on boot so the dashboard
// can render instantly on subsequent loads while a fresh fetch runs in
// the background.
const PRICE_CACHE_KEY = 'crypto_tracker_price_cache_v1';
const IMAGE_CACHE_KEY = 'crypto_tracker_image_cache_v1';
function _loadCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function _saveCache(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
let priceCache = _loadCache(PRICE_CACHE_KEY);
let lastPriceFetch = 0;
let coinImageCache = _loadCache(IMAGE_CACHE_KEY);
let lastImageFetch = 0;

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

function _symbolForId(id, holdings) {
  if (BINANCE_ID_OVERRIDES[id]) return BINANCE_ID_OVERRIDES[id];
  if (priceCache[id]?.symbol) return String(priceCache[id].symbol).toUpperCase();
  const h = holdings?.find?.(x => x?.coin_id === id);
  if (h?.coin_symbol) return String(h.coin_symbol).toUpperCase();
  return null;
}
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
  // Primary: gold-api.com
  try {
    const [goldRes, silverRes] = await Promise.all([
      fetch('https://api.gold-api.com/price/XAU'),
      fetch('https://api.gold-api.com/price/XAG'),
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

  // Primary: Stooq (CORS-enabled CSV, no key). Works for most US tickers.
  const stooqUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(ticker.toLowerCase())}.us&f=sd2t2ohlcvn&h&e=csv`;
  try {
    const res = await fetch(stooqUrl);
    if (res.ok) {
      const text = await res.text();
      const parsed = parseStooqRow(text);
      if (parsed) {
        stockCache[coinId] = parsed;
        stockCacheTime[coinId] = now;
        return parsed;
      }
    }
  } catch { /* fall through */ }

  // Fallback 1: Stooq through a public CORS proxy (some browsers/networks block Stooq directly).
  try {
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(stooqUrl)}`);
    if (res.ok) {
      const text = await res.text();
      const parsed = parseStooqRow(text);
      if (parsed) {
        stockCache[coinId] = parsed;
        stockCacheTime[coinId] = now;
        return parsed;
      }
    }
  } catch { /* fall through */ }

  // Fallback 2: Yahoo Finance quote JSON via CORS proxy.
  try {
    const yUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker.toUpperCase())}`;
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(yUrl)}`);
    if (res.ok) {
      const data = await res.json();
      const q = data?.quoteResponse?.result?.[0];
      if (q && typeof q.regularMarketPrice === 'number') {
        const parsed = {
          usd: q.regularMarketPrice,
          usd_24h_change: q.regularMarketChangePercent || 0,
          name: q.longName || q.shortName || '',
        };
        stockCache[coinId] = parsed;
        stockCacheTime[coinId] = now;
        return parsed;
      }
    }
  } catch { /* fall through */ }

  return null;
}

// ─── Real-time fiat FX rates (all quoted in USD per 1 unit of currency) ───
// Uses open.er-api.com (free, CORS-enabled, no key). Falls back to frankfurter.app.
async function fetchFiatRates() {
  const now = Date.now();
  if (fiatRatesCache && now - fiatRatesCacheTime < FIAT_CACHE_DURATION) return fiatRatesCache;

  // Primary: open.er-api.com — returns rates vs USD base
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        // rates[X] = X per 1 USD. We want usd_per_unit = 1 / rates[X].
        const out = { USD: 1 };
        for (const [code, perUsd] of Object.entries(data.rates)) {
          if (typeof perUsd === 'number' && perUsd > 0) out[code] = 1 / perUsd;
        }
        fiatRatesCache = out;
        fiatRatesCacheTime = now;
        return out;
      }
    }
  } catch {}

  // Fallback: frankfurter.app (European Central Bank reference rates)
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD');
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        const out = { USD: 1 };
        for (const [code, perUsd] of Object.entries(data.rates)) {
          if (typeof perUsd === 'number' && perUsd > 0) out[code] = 1 / perUsd;
        }
        fiatRatesCache = out;
        fiatRatesCacheTime = now;
        return out;
      }
    }
  } catch {}

  return fiatRatesCache || { USD: 1 };
}

// Map a WalletLens asset id to a Stooq symbol string for historical CSV downloads.
function stooqSymbolFor(id) {
  if (id === GOLD_ID) return 'xauusd';
  if (id === SILVER_ID) return 'xagusd';
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
    const res = await fetch(url);
    if (res.ok) {
      const out = parseStooqCsv(await res.text(), days);
      if (out.length > 0) return out;
    }
  } catch {}
  try {
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      return parseStooqCsv(await res.text(), days);
    }
  } catch {}
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
        holdings[tx.coin_id].amount -= tx.amount;
        holdings[tx.coin_id].total_invested -= tx.total_cost;
      }
    }

    return Object.values(holdings).filter(h => h.amount > 0.00000001);
  },

  addTransaction: async (data) => {
    const txs = loadData('transactions');
    const totalCost = data.amount * data.price_per_unit;
    const category = data.category || 'crypto';
    const tx = {
      id: bumpId('crypto_tracker_next_tx_id'),
      wallet_id: parseInt(data.wallet_id),
      type: data.type,
      category,
      coin_id: data.coin_id,
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
  getPrices: async (ids) => {
    if (!ids) return {};
    const coinIds = ids.split(',').filter(Boolean);
    const manual = loadData('manual_prices', {});

    const stockIds = coinIds.filter(id => id.startsWith(STOCK_PREFIX));
    const metalIds = coinIds.filter(id => id === GOLD_ID || id === SILVER_ID);
    const fiatIds = coinIds.filter(id => id.startsWith(FIAT_PREFIX));
    const cryptoLikeIds = coinIds.filter(id =>
      !id.startsWith(STOCK_PREFIX) && id !== GOLD_ID && id !== SILVER_ID &&
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

    // Fiat currencies — convert each ISO code to USD-per-unit via live FX
    if (fiatIds.length > 0) {
      tasks.push(fetchFiatRates().then(rates => {
        for (const id of fiatIds) {
          const code = id.slice(FIAT_PREFIX.length).toUpperCase();
          const usd = rates[code];
          if (typeof usd === 'number' && usd > 0) {
            result[id] = { usd, usd_24h_change: 0, source: 'er-api', name: code };
          } else if (manual[id]) {
            result[id] = { ...manual[id], source: 'manual' };
          }
        }
      }));
    }

    // Stocks
    if (stockIds.length > 0) {
      tasks.push(Promise.all(stockIds.map(async id => {
        const live = await fetchStockLive(id);
        if (live) result[id] = { ...live, source: 'stooq' };
        else if (manual[id]) result[id] = { ...manual[id], source: 'manual' };
      })));
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
            const symbolsParam = tradeable.map(([,s]) => `"${s}USDT"`).join(',');
            if (symbolsParam) {
              const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbolsParam}]`;
              try {
                const res = await fetch(url);
                if (res.ok) {
                  const list = await res.json();
                  if (Array.isArray(list)) {
                    for (const row of list) {
                      const tkr = String(row.symbol || '').replace(/USDT$/, '');
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

          // Anything Binance couldn't resolve falls through to CoinGecko/CoinCap below.
          // Primary: CoinGecko /coins/markets — returns price, 24h change,
          // market cap AND image in one shot, so the separate getCoinImages
          // call gets a free piggyback fill.
          const data = await fetchJSON(
            `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${cryptoIds.join(',')}&per_page=250&page=1&sparkline=false&price_change_percentage=24h`
          );
          if (Array.isArray(data) && data.length > 0) {
            for (const c of data) {
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

    await Promise.all(tasks);
    return result;
  },

  // Fetch coin images from market data (more reliable than search thumb)
  getCoinImages: async (ids) => {
    if (!ids) return {};
    const now = Date.now();
    const coinIds = ids.split(',');
    const allCached = coinIds.every(id => coinImageCache[id]);

    if (!allCached || now - lastImageFetch > CACHE_DURATION * 5) {
      const data = await fetchJSON(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&per_page=100&page=1`
      );
      if (Array.isArray(data)) {
        for (const coin of data) {
          coinImageCache[coin.id] = coin.image;
        }
        lastImageFetch = now;
        _saveCache(IMAGE_CACHE_KEY, coinImageCache);
      }
    }

    const result = {};
    for (const id of coinIds) {
      if (coinImageCache[id]) result[id] = coinImageCache[id];
    }
    return result;
  },

  searchCoins: async (query) => {
    if (!query) return [];
    const data = await fetchJSON(`${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`);
    if (!data) return [];
    return (data.coins || []).slice(0, 20).map(c => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      thumb: c.thumb,
      large: c.large,
    }));
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
    const CHART_CACHE_KEY = 'crypto_tracker_chart_cache_v1';
    const CHART_TTL = 5 * 60 * 1000;
    let chartCache = {};
    try { chartCache = JSON.parse(localStorage.getItem(CHART_CACHE_KEY) || '{}'); } catch {}
    const cacheKey = `${id}::${days}`;
    const hit = chartCache[cacheKey];
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
        chartCache[cacheKey] = { t: Date.now(), v: series };
        localStorage.setItem(CHART_CACHE_KEY, JSON.stringify(chartCache));
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
    const meanR = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length;
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
    for (const id of toFetch) {
      try {
        const s = await api.getCoinSmartSignals(id, days);
        out[id] = s;
        cache[id] = { t: now, v: s };
      } catch { out[id] = null; }
      await new Promise(r => setTimeout(r, 120));
    }
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
    const data = {
      w: loadData('wallets'),
      t: loadData('transactions'),
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
      return btoa(unescape(encodeURIComponent(json)));
    } catch (err) {
      console.error('Export error:', err);
      return null;
    }
  },

  // Parse a code without committing anything. Returns a summary the UI can display for confirmation.
  previewImportCode: async (code) => {
    try {
      const trimmed = (code || '').trim();
      let jsonString;
      if (trimmed.startsWith('WLZ:')) {
        const bin = atob(trimmed.slice(4));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        jsonString = await new Response(stream).text();
      } else {
        jsonString = decodeURIComponent(escape(atob(trimmed)));
      }
      const data = JSON.parse(jsonString);
      const wallets = Array.isArray(data.w || data.wallets) ? (data.w || data.wallets) : [];
      const transactions = Array.isArray(data.t || data.transactions) ? (data.t || data.transactions) : [];
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
        _raw: { wallets, transactions, exchanges, targets, manualPrices, ids: data.ids || {} },
      };
    } catch (err) {
      return { success: false, error: err.message || 'Invalid backup code' };
    }
  },

  importCode: async (code) => {
    const preview = await api.previewImportCode(code);
    if (!preview.success) return preview;
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
};
