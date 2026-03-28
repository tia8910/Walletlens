const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Wallets
  getWallets: () => request('/wallets'),
  createWallet: (data) => request('/wallets', { method: 'POST', body: JSON.stringify(data) }),
  deleteWallet: (id) => request(`/wallets/${id}`, { method: 'DELETE' }),

  // Transactions
  getTransactions: (walletId) => request(`/transactions${walletId ? `?wallet_id=${walletId}` : ''}`),
  getPortfolio: (walletId) => request(`/transactions/portfolio${walletId ? `?wallet_id=${walletId}` : ''}`),
  addTransaction: (data) => request('/transactions', { method: 'POST', body: JSON.stringify(data) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),

  // Prices
  getPrices: (ids) => request(`/prices?ids=${ids}`),
  searchCoins: (query) => request(`/prices/search?q=${encodeURIComponent(query)}`),
  getMarketData: () => request('/prices/market'),

  // Exchanges
  getExchanges: () => request('/exchanges'),
  addExchange: (data) => request('/exchanges', { method: 'POST', body: JSON.stringify(data) }),
  deleteExchange: (id) => request(`/exchanges/${id}`, { method: 'DELETE' }),
  syncExchange: (id) => request(`/exchanges/${id}/sync`, { method: 'POST' }),
};
