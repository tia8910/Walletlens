// Asset-class constants. Decoupled from api.js so they can be imported
// by data utilities and pure helpers without dragging in network code.
export const GOLD_ID     = 'metal:xau'   // 1 troy oz gold
export const SILVER_ID   = 'metal:xag'   // 1 troy oz silver
export const STOCK_PREFIX = 'stock:'     // followed by lowercase ticker
export const FIAT_PREFIX  = 'fiat:'      // followed by lowercase ISO code

export const ASSET_CATEGORIES = {
  crypto: { key: 'crypto', label: 'Crypto', icon: '◆', color: '#6366f1' },
  fiat:   { key: 'fiat',   label: 'Fiat',   icon: '💵', color: '#0ea5e9' },
  gold:   { key: 'gold',   label: 'Gold',   icon: '🥇', color: '#f59e0b' },
  silver: { key: 'silver', label: 'Silver', icon: '🥈', color: '#94a3b8' },
  stock:  { key: 'stock',  label: 'Stocks', icon: '📈', color: '#10b981' },
  bond:   { key: 'bond',   label: 'Bonds',  icon: '📜', color: '#0284c7' },
  other:  { key: 'other',  label: 'Other',  icon: '◈', color: '#a78bfa' },
}
export const NON_CRYPTO_CATEGORIES = ['fiat', 'gold', 'silver', 'stock', 'bond', 'other']

export const PRESET_ASSETS = {
  gold:   { coin_id: GOLD_ID,   symbol: 'XAU', name: 'Gold (1 oz)',   unit: 'oz' },
  silver: { coin_id: SILVER_ID, symbol: 'XAG', name: 'Silver (1 oz)', unit: 'oz' },
}

export const POPULAR_FIAT = [
  { code: 'USD', name: 'US Dollar',         symbol: '$' },
  { code: 'EUR', name: 'Euro',              symbol: '€' },
  { code: 'GBP', name: 'British Pound',     symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen',      symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc',       symbol: 'Fr' },
  { code: 'CAD', name: 'Canadian Dollar',   symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CNY', name: 'Chinese Yuan',      symbol: '¥' },
  { code: 'INR', name: 'Indian Rupee',      symbol: '₹' },
  { code: 'AED', name: 'UAE Dirham',        symbol: 'د.إ' },
]

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
]

// Single classifier used everywhere — instead of duplicating six
// startsWith / equality checks across pages.
export function assetClass(id) {
  if (!id) return 'crypto'
  if (id === GOLD_ID) return 'gold'
  if (id === SILVER_ID) return 'silver'
  if (id.startsWith(STOCK_PREFIX)) return 'stock'
  if (id.startsWith(FIAT_PREFIX)) return 'fiat'
  if (id.startsWith('bond:')) return 'bond'
  if (id.startsWith('other:')) return 'other'
  return 'crypto'
}

export function isCrypto(id) { return assetClass(id) === 'crypto' }
