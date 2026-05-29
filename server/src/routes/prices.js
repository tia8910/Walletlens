import { Router } from 'express';
import fetch from 'node-fetch';
import crypto from 'crypto';

const router = Router();

let priceCache = {};
let lastFetch = 0;
const CACHE_DURATION = 60_000; // 1 minute

// In-flight deduplication: if a CoinGecko fetch is already running, attach
// to that promise instead of firing a second identical upstream request.
let pendingFetch = null;

// Market data cache: avoid hitting CoinGecko on every /market poll
let marketCache = null;
let marketCacheTime = 0;
const MARKET_CACHE_TTL = 60_000; // 1 minute
let pendingMarketFetch = null;

// Search results cache: keyed by query string, TTL 5 minutes
const searchCache = new Map();
const SEARCH_CACHE_TTL = 5 * 60_000;

async function refreshPrices(ids) {
  if (pendingFetch) return pendingFetch;
  pendingFetch = fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`
  )
    .then(async (response) => {
      const data = await response.json();
      priceCache = { ...priceCache, ...data };
      lastFetch = Date.now();
      return data;
    })
    .catch((err) => {
      console.error('Price fetch error:', err.message);
      return null;
    })
    .finally(() => { pendingFetch = null; });
  return pendingFetch;
}

router.get('/', async (req, res) => {
  const { ids } = req.query;
  if (!ids) return res.json({});

  const now = Date.now();
  const coinIds = ids.split(',');
  const needsFresh = now - lastFetch > CACHE_DURATION || coinIds.some(id => !priceCache[id]);

  if (needsFresh) {
    const fetched = await refreshPrices(ids);
    if (!fetched && Object.keys(priceCache).length === 0) {
      return res.status(503).json({ error: 'Price service unavailable' });
    }
  }

  const result = {};
  for (const id of coinIds) {
    if (priceCache[id]) result[id] = priceCache[id];
  }

  // ETag for conditional requests — clients skip parsing if data unchanged
  const etag = `"${crypto.createHash('md5').update(JSON.stringify(result)).digest('hex').slice(0, 12)}"`
  res.set('ETag', etag);
  if (req.headers['if-none-match'] === etag) return res.status(304).end();

  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.json(result);
});

router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const cacheKey = q.toLowerCase().trim();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.time < SEARCH_CACHE_TTL) {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.set('X-Cache', 'HIT');
    return res.json(cached.data);
  }

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`
    );
    const data = await response.json();
    const coins = (data.coins || []).slice(0, 20).map(c => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      thumb: c.thumb,
    }));
    // Evict stale entries if cache grows large (>200 keys)
    if (searchCache.size > 200) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }
    searchCache.set(cacheKey, { data: coins, time: Date.now() });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.set('X-Cache', 'MISS');
    res.json(coins);
  } catch (err) {
    console.error('Search error:', err.message);
    // Serve stale cache on upstream failure rather than returning an error
    if (cached) return res.json(cached.data);
    res.status(503).json({ error: 'Search service unavailable' });
  }
});

router.get('/market', async (req, res) => {
  const now = Date.now();

  // Serve memory-cached market data immediately when still fresh
  if (marketCache && now - marketCacheTime < MARKET_CACHE_TTL) {
    const etag = `"${crypto.createHash('md5').update(JSON.stringify(marketCache)).digest('hex').slice(0, 12)}"`;
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    res.set('X-Cache', 'HIT');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return res.json(marketCache);
  }

  // Deduplicate concurrent upstream fetches
  if (!pendingMarketFetch) {
    pendingMarketFetch = fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h'
    )
      .then(r => r.json())
      .then(data => { marketCache = data; marketCacheTime = Date.now(); return data; })
      .catch(err => { console.error('Market data error:', err.message); return null; })
      .finally(() => { pendingMarketFetch = null; });
  }

  try {
    const data = await pendingMarketFetch;
    if (!data) {
      if (marketCache) return res.json(marketCache); // stale fallback
      return res.status(503).json({ error: 'Market service unavailable' });
    }
    const etag = `"${crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').slice(0, 12)}"`;
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    res.set('X-Cache', 'MISS');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json(data);
  } catch (err) {
    console.error('Market data error:', err.message);
    if (marketCache) return res.json(marketCache);
    res.status(503).json({ error: 'Market service unavailable' });
  }
});

export default router;
