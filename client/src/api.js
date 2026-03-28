const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

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

let nextWalletId = parseInt(localStorage.getItem('crypto_tracker_next_wallet_id') || '1');
let nextTxId = parseInt(localStorage.getItem('crypto_tracker_next_tx_id') || '1');
let nextExId = parseInt(localStorage.getItem('crypto_tracker_next_ex_id') || '1');

function bumpId(key) {
  const current = parseInt(localStorage.getItem(key) || '1');
  const next = current + 1;
  localStorage.setItem(key, next.toString());
  return current;
}

// Price cache
let priceCache = {};
let lastPriceFetch = 0;
const CACHE_DURATION = 60_000;

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
    // Also delete wallet's transactions
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
        holdings[tx.coin_id] = { coin_id: tx.coin_id, coin_symbol: tx.coin_symbol, amount: 0, total_invested: 0 };
      }
      if (tx.type === 'buy') {
        holdings[tx.coin_id].amount += tx.amount;
        holdings[tx.coin_id].total_invested += tx.total_cost;
      } else {
        holdings[tx.coin_id].amount -= tx.amount;
        holdings[tx.coin_id].total_invested -= tx.total_cost;
      }
    }

    return Object.values(holdings).filter(h => h.amount > 0.00000001);
  },

  addTransaction: async (data) => {
    const txs = loadData('transactions');
    const tx = {
      id: bumpId('crypto_tracker_next_tx_id'),
      wallet_id: parseInt(data.wallet_id),
      type: data.type,
      coin_id: data.coin_id,
      coin_symbol: data.coin_symbol,
      amount: data.amount,
      price_per_unit: data.price_per_unit,
      total_cost: data.amount * data.price_per_unit,
      exchange: data.exchange || '',
      notes: data.notes || '',
      date: data.date || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    };
    txs.unshift(tx);
    saveData('transactions', txs);
    return tx;
  },

  deleteTransaction: async (id) => {
    const txs = loadData('transactions').filter(t => t.id !== id);
    saveData('transactions', txs);
    return null;
  },

  // Prices - direct CoinGecko calls
  getPrices: async (ids) => {
    if (!ids) return {};
    const now = Date.now();
    const coinIds = ids.split(',');
    const needsFresh = now - lastPriceFetch > CACHE_DURATION || coinIds.some(id => !priceCache[id]);

    if (needsFresh) {
      try {
        const res = await fetch(
          `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`
        );
        const data = await res.json();
        priceCache = { ...priceCache, ...data };
        lastPriceFetch = now;
      } catch (err) {
        console.error('Price fetch error:', err.message);
      }
    }

    const result = {};
    for (const id of coinIds) {
      if (priceCache[id]) result[id] = priceCache[id];
    }
    return result;
  },

  searchCoins: async (query) => {
    if (!query) return [];
    try {
      const res = await fetch(`${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      return (data.coins || []).slice(0, 20).map(c => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        thumb: c.thumb,
      }));
    } catch (err) {
      console.error('Search error:', err.message);
      return [];
    }
  },

  getMarketData: async () => {
    try {
      const res = await fetch(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`
      );
      return await res.json();
    } catch (err) {
      console.error('Market data error:', err.message);
      return [];
    }
  },

  // Exchanges (stored locally)
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
};
