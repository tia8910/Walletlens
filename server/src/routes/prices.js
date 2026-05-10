import { Router } from 'express';

const router = Router();

let priceCache = {};
let lastFetch = 0;
const CACHE_DURATION = 60_000;

let marketCache = null;
let lastMarketFetch = 0;
const MARKET_CACHE_DURATION = 60_000;

const searchCache = new Map();
const SEARCH_CACHE_TTL = 5 * 60_000;

router.get('/', async (req, res) => {
  const { ids } = req.query;
  if (!ids) return res.json({});

  const now = Date.now();
  const coinIds = ids.split(',');
  const needsFresh = now - lastFetch > CACHE_DURATION || coinIds.some(id => !priceCache[id]);

  if (needsFresh) {
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`
      );
      const data = await response.json();
      priceCache = { ...priceCache, ...data };
      lastFetch = now;
    } catch (err) {
      console.error('Price fetch error:', err.message);
      if (Object.keys(priceCache).length === 0) {
        return res.status(503).json({ error: 'Price service unavailable' });
      }
    }
  }

  const result = {};
  for (const id of coinIds) {
    if (priceCache[id]) result[id] = priceCache[id];
  }
  res.json(result);
});

router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const now = Date.now();
  const cached = searchCache.get(q);
  if (cached && now - cached.ts < SEARCH_CACHE_TTL) {
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
    searchCache.set(q, { data: coins, ts: now });
    // Cap cache size to avoid unbounded growth
    if (searchCache.size > 200) {
      const firstKey = searchCache.keys().next().value;
      searchCache.delete(firstKey);
    }
    res.json(coins);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(503).json({ error: 'Search service unavailable' });
  }
});

router.get('/market', async (req, res) => {
  const now = Date.now();
  if (marketCache && now - lastMarketFetch < MARKET_CACHE_DURATION) {
    return res.json(marketCache);
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h'
    );
    const data = await response.json();
    marketCache = data;
    lastMarketFetch = now;
    res.json(data);
  } catch (err) {
    console.error('Market data error:', err.message);
    if (marketCache) return res.json(marketCache);
    res.status(503).json({ error: 'Market service unavailable' });
  }
});

export default router;
