import { Router } from 'express';
import db from '../database.js';
import { createHmac } from 'crypto';
import fetch from 'node-fetch';

const router = Router();

router.get('/', (req, res) => {
  const exchanges = db.prepare('SELECT id, name, is_connected, created_at FROM exchanges ORDER BY created_at DESC').all();
  res.json(exchanges);
});

router.post('/', (req, res) => {
  const { name, api_key, api_secret } = req.body;
  if (!name) return res.status(400).json({ error: 'Exchange name is required' });

  const result = db.prepare(
    'INSERT INTO exchanges (name, api_key, api_secret, is_connected) VALUES (?, ?, ?, ?)'
  ).run(name, api_key || '', api_secret || '', api_key ? 1 : 0);

  const exchange = db.prepare('SELECT id, name, is_connected, created_at FROM exchanges WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(exchange);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM exchanges WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

router.post('/:id/sync', async (req, res) => {
  const exchange = db.prepare('SELECT * FROM exchanges WHERE id = ?').get(req.params.id);
  if (!exchange) return res.status(404).json({ error: 'Exchange not found' });
  if (!exchange.api_key || !exchange.api_secret) {
    return res.status(400).json({ error: 'API credentials not configured' });
  }

  try {
    let balances = [];

    if (exchange.name.toLowerCase() === 'binance') {
      balances = await fetchBinanceBalances(exchange.api_key, exchange.api_secret);
    } else if (exchange.name.toLowerCase() === 'coinbase') {
      balances = await fetchCoinbaseBalances(exchange.api_key, exchange.api_secret);
    } else {
      return res.json({ message: 'Exchange sync not yet supported for ' + exchange.name, balances: [] });
    }

    res.json({ message: 'Sync successful', balances });
  } catch (err) {
    console.error('Exchange sync error:', err.message);
    res.status(500).json({ error: 'Failed to sync: ' + err.message });
  }
});

async function fetchBinanceBalances(apiKey, apiSecret) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = createHmac('sha256', apiSecret).update(queryString).digest('hex');

  const response = await fetch(
    `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
    { headers: { 'X-MBX-APIKEY': apiKey } }
  );

  if (!response.ok) throw new Error('Binance API error: ' + response.statusText);
  const data = await response.json();

  return (data.balances || [])
    .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map(b => ({
      symbol: b.asset.toLowerCase(),
      free: parseFloat(b.free),
      locked: parseFloat(b.locked),
      total: parseFloat(b.free) + parseFloat(b.locked),
    }));
}

async function fetchCoinbaseBalances(apiKey, apiSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = '/v2/accounts';
  const message = timestamp + method + path;
  const signature = createHmac('sha256', apiSecret).update(message).digest('hex');

  const response = await fetch(`https://api.coinbase.com${path}`, {
    headers: {
      'CB-ACCESS-KEY': apiKey,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp.toString(),
      'CB-VERSION': '2024-01-01',
    },
  });

  if (!response.ok) throw new Error('Coinbase API error: ' + response.statusText);
  const data = await response.json();

  return (data.data || [])
    .filter(a => parseFloat(a.balance.amount) > 0)
    .map(a => ({
      symbol: a.balance.currency.toLowerCase(),
      total: parseFloat(a.balance.amount),
    }));
}

export default router;
