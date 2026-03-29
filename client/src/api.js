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

function bumpId(key) {
  const current = parseInt(localStorage.getItem(key) || '1');
  localStorage.setItem(key, (current + 1).toString());
  return current;
}

// Price & image cache
let priceCache = {};
let lastPriceFetch = 0;
let coinImageCache = {};
let lastImageFetch = 0;
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
        holdings[tx.coin_id] = { coin_id: tx.coin_id, coin_symbol: tx.coin_symbol, coin_image: tx.coin_image || '', amount: 0, total_invested: 0 };
      }
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
    const tx = {
      id: bumpId('crypto_tracker_next_tx_id'),
      wallet_id: parseInt(data.wallet_id),
      type: data.type,
      coin_id: data.coin_id,
      coin_symbol: data.coin_symbol,
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

    // Skip auto-USDT for stablecoins and deposit/withdraw types
    const isStable = ['tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd', 'first-digital-usd'].includes(data.coin_id);
    const isDepositOrWithdraw = data.type === 'deposit' || data.type === 'withdraw';

    if (!isStable && !isDepositOrWithdraw) {
      const usdtImage = 'https://assets.coingecko.com/coins/images/325/thumb/Tether.png';
      const txDate = data.date || new Date().toISOString().split('T')[0];

      // When selling, auto-add USDT buy for the proceeds
      if (data.type === 'sell') {
        txs.unshift({
          id: bumpId('crypto_tracker_next_tx_id'),
          wallet_id: parseInt(data.wallet_id),
          type: 'buy',
          coin_id: 'tether',
          coin_symbol: 'usdt',
          coin_image: usdtImage,
          amount: totalCost,
          price_per_unit: 1,
          total_cost: totalCost,
          exchange: data.exchange || '',
          notes: `From selling ${data.amount} ${(data.coin_symbol || '').toUpperCase()}`,
          date: txDate,
          created_at: new Date().toISOString(),
        });
      }

      // When buying, auto-add USDT sell (spending USDT to buy)
      if (data.type === 'buy') {
        txs.unshift({
          id: bumpId('crypto_tracker_next_tx_id'),
          wallet_id: parseInt(data.wallet_id),
          type: 'sell',
          coin_id: 'tether',
          coin_symbol: 'usdt',
          coin_image: usdtImage,
          amount: totalCost,
          price_per_unit: 1,
          total_cost: totalCost,
          exchange: data.exchange || '',
          notes: `Spent on ${data.amount} ${(data.coin_symbol || '').toUpperCase()}`,
          date: txDate,
          created_at: new Date().toISOString(),
        });
      }
    }

    saveData('transactions', txs);
    return tx;
  },

  deleteTransaction: async (id) => {
    const txs = loadData('transactions').filter(t => t.id !== id);
    saveData('transactions', txs);
    return null;
  },

  // Prices
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

  // Fetch coin images from market data (more reliable than search thumb)
  getCoinImages: async (ids) => {
    if (!ids) return {};
    const now = Date.now();
    const coinIds = ids.split(',');
    const allCached = coinIds.every(id => coinImageCache[id]);

    if (!allCached || now - lastImageFetch > CACHE_DURATION * 5) {
      try {
        const res = await fetch(
          `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&per_page=100&page=1`
        );
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const coin of data) {
            coinImageCache[coin.id] = coin.image;
          }
          lastImageFetch = now;
        }
      } catch (err) {
        console.error('Image fetch error:', err.message);
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
    try {
      const res = await fetch(`${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      return (data.coins || []).slice(0, 20).map(c => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        thumb: c.thumb,
        large: c.large,
      }));
    } catch (err) {
      console.error('Search error:', err.message);
      return [];
    }
  },

  // Get detailed coin data for AI analysis
  getCoinDetail: async (id) => {
    if (!id) return null;
    try {
      const res = await fetch(
        `${COINGECKO_BASE}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`
      );
      return await res.json();
    } catch (err) {
      console.error('Coin detail error:', err.message);
      return null;
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

  // Per-coin Investment Targets: { [coin_id]: { amount: number } }
  getCoinTargets: async () => {
    try {
      const data = localStorage.getItem('crypto_tracker_coin_targets');
      return data ? JSON.parse(data) : {};
    } catch { return {}; }
  },

  setCoinTarget: async (coinId, amount) => {
    const targets = await api.getCoinTargets();
    targets[coinId] = { amount };
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(targets));
    return targets;
  },

  removeCoinTarget: async (coinId) => {
    const targets = await api.getCoinTargets();
    delete targets[coinId];
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(targets));
    return targets;
  },

  // Import / Export
  exportData: () => {
    const data = {
      wallets: loadData('wallets'),
      transactions: loadData('transactions'),
      exchanges: loadData('exchanges'),
      coin_targets: (() => { try { return JSON.parse(localStorage.getItem('crypto_tracker_coin_targets') || '{}'); } catch { return {}; } })(),
      next_wallet_id: localStorage.getItem('crypto_tracker_next_wallet_id') || '1',
      next_tx_id: localStorage.getItem('crypto_tracker_next_tx_id') || '1',
      next_ex_id: localStorage.getItem('crypto_tracker_next_ex_id') || '1',
      exported_at: new Date().toISOString(),
      version: 1,
    };
    return JSON.stringify(data, null, 2);
  },

  importData: (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      if (!data.wallets && !data.transactions) throw new Error('Invalid backup file — no wallets or transactions found');
      // Write all data keys
      const wallets = Array.isArray(data.wallets) ? data.wallets : [];
      const transactions = Array.isArray(data.transactions) ? data.transactions : [];
      const exchanges = Array.isArray(data.exchanges) ? data.exchanges : [];
      const targets = (data.coin_targets && typeof data.coin_targets === 'object') ? data.coin_targets : {};
      saveData('wallets', wallets);
      saveData('transactions', transactions);
      saveData('exchanges', exchanges);
      localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(targets));
      // Restore ID counters — compute max from data if not provided
      const maxWalletId = wallets.reduce((m, w) => Math.max(m, w.id || 0), 0);
      const maxTxId = transactions.reduce((m, t) => Math.max(m, t.id || 0), 0);
      const maxExId = exchanges.reduce((m, e) => Math.max(m, e.id || 0), 0);
      localStorage.setItem('crypto_tracker_next_wallet_id', String(Math.max(maxWalletId + 1, parseInt(data.next_wallet_id) || 1)));
      localStorage.setItem('crypto_tracker_next_tx_id', String(Math.max(maxTxId + 1, parseInt(data.next_tx_id) || 1)));
      localStorage.setItem('crypto_tracker_next_ex_id', String(Math.max(maxExId + 1, parseInt(data.next_ex_id) || 1)));
      // Clear caches
      priceCache = {};
      lastPriceFetch = 0;
      coinImageCache = {};
      lastImageFetch = 0;
      return { success: true, wallets: wallets.length, transactions: transactions.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
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
