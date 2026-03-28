import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

let priceCache = {};
let lastFetch = 0;
const CACHE_DURATION = 60_000; // 1 minute

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
    res.json(coins);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(503).json({ error: 'Search service unavailable' });
  }
});

router.get('/market', async (req, res) => {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h'
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Market data error:', err.message);
    res.status(503).json({ error: 'Market service unavailable' });
  }
});

export default router;
