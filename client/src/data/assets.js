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
  stock:  { key: 'stock',  label: 'Stocks', icon: '📈', color: 'var(--gd)' },
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
  // ── Mega Cap Tech ──
  { ticker: 'AAPL',  name: 'Apple',              sector: 'Tech' },
  { ticker: 'MSFT',  name: 'Microsoft',           sector: 'Tech' },
  { ticker: 'NVDA',  name: 'NVIDIA',              sector: 'Tech' },
  { ticker: 'GOOGL', name: 'Alphabet',            sector: 'Tech' },
  { ticker: 'META',  name: 'Meta Platforms',      sector: 'Tech' },
  { ticker: 'AMZN',  name: 'Amazon',              sector: 'Tech' },
  { ticker: 'TSLA',  name: 'Tesla',               sector: 'Tech' },
  { ticker: 'AVGO',  name: 'Broadcom',            sector: 'Tech' },
  { ticker: 'ORCL',  name: 'Oracle',              sector: 'Tech' },
  { ticker: 'CRM',   name: 'Salesforce',          sector: 'Tech' },
  { ticker: 'AMD',   name: 'AMD',                 sector: 'Tech' },
  { ticker: 'INTC',  name: 'Intel',               sector: 'Tech' },
  { ticker: 'QCOM',  name: 'Qualcomm',            sector: 'Tech' },
  { ticker: 'IBM',   name: 'IBM',                 sector: 'Tech' },
  { ticker: 'ADBE',  name: 'Adobe',               sector: 'Tech' },
  { ticker: 'NOW',   name: 'ServiceNow',          sector: 'Tech' },
  { ticker: 'PLTR',  name: 'Palantir',            sector: 'Tech' },
  { ticker: 'NET',   name: 'Cloudflare',          sector: 'Tech' },
  { ticker: 'SNOW',  name: 'Snowflake',           sector: 'Tech' },
  // ── Finance ──
  { ticker: 'BRK.B', name: 'Berkshire Hathaway',  sector: 'Finance' },
  { ticker: 'JPM',   name: 'JPMorgan Chase',      sector: 'Finance' },
  { ticker: 'V',     name: 'Visa',                sector: 'Finance' },
  { ticker: 'MA',    name: 'Mastercard',          sector: 'Finance' },
  { ticker: 'BAC',   name: 'Bank of America',     sector: 'Finance' },
  { ticker: 'GS',    name: 'Goldman Sachs',       sector: 'Finance' },
  { ticker: 'MS',    name: 'Morgan Stanley',      sector: 'Finance' },
  { ticker: 'WFC',   name: 'Wells Fargo',         sector: 'Finance' },
  { ticker: 'AXP',   name: 'American Express',    sector: 'Finance' },
  { ticker: 'C',     name: 'Citigroup',           sector: 'Finance' },
  { ticker: 'COIN',  name: 'Coinbase',            sector: 'Finance' },
  { ticker: 'HOOD',  name: 'Robinhood',           sector: 'Finance' },
  // ── Healthcare ──
  { ticker: 'LLY',   name: 'Eli Lilly',           sector: 'Health' },
  { ticker: 'UNH',   name: 'UnitedHealth',        sector: 'Health' },
  { ticker: 'JNJ',   name: 'Johnson & Johnson',   sector: 'Health' },
  { ticker: 'ABBV',  name: 'AbbVie',              sector: 'Health' },
  { ticker: 'PFE',   name: 'Pfizer',              sector: 'Health' },
  { ticker: 'MRK',   name: 'Merck',               sector: 'Health' },
  { ticker: 'NVO',   name: 'Novo Nordisk',        sector: 'Health' },
  // ── Consumer ──
  { ticker: 'WMT',   name: 'Walmart',             sector: 'Consumer' },
  { ticker: 'COST',  name: 'Costco',              sector: 'Consumer' },
  { ticker: 'MCD',   name: "McDonald's",          sector: 'Consumer' },
  { ticker: 'NKE',   name: 'Nike',                sector: 'Consumer' },
  { ticker: 'SBUX',  name: 'Starbucks',           sector: 'Consumer' },
  { ticker: 'KO',    name: 'Coca-Cola',           sector: 'Consumer' },
  { ticker: 'PEP',   name: 'PepsiCo',             sector: 'Consumer' },
  { ticker: 'TGT',   name: 'Target',              sector: 'Consumer' },
  // ── Energy ──
  { ticker: 'XOM',   name: 'ExxonMobil',          sector: 'Energy' },
  { ticker: 'CVX',   name: 'Chevron',             sector: 'Energy' },
  { ticker: 'COP',   name: 'ConocoPhillips',      sector: 'Energy' },
  { ticker: 'OXY',   name: 'Occidental',          sector: 'Energy' },
  // ── ETFs & Indices ──
  { ticker: 'SPY',   name: 'S&P 500 ETF',         sector: 'ETF' },
  { ticker: 'QQQ',   name: 'Nasdaq 100 ETF',      sector: 'ETF' },
  { ticker: 'IWM',   name: 'Russell 2000 ETF',    sector: 'ETF' },
  { ticker: 'DIA',   name: 'Dow Jones ETF',       sector: 'ETF' },
  { ticker: 'VOO',   name: 'Vanguard S&P 500',    sector: 'ETF' },
  { ticker: 'VTI',   name: 'Vanguard Total Market',sector: 'ETF' },
  { ticker: 'GLD',   name: 'Gold ETF (SPDR)',     sector: 'ETF' },
  { ticker: 'TLT',   name: '20Y Treasury ETF',    sector: 'ETF' },
  { ticker: 'ARKK',  name: 'ARK Innovation ETF',  sector: 'ETF' },
  { ticker: 'SOXX',  name: 'Semiconductor ETF',   sector: 'ETF' },
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
