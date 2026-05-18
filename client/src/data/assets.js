// Asset-class constants. Decoupled from api.js so they can be imported
// by data utilities and pure helpers without dragging in network code.
export const GOLD_ID     = 'metal:xau'   // 1 troy oz gold
export const SILVER_ID   = 'metal:xag'   // 1 troy oz silver
export const COPPER_ID   = 'metal:xcu'   // 1 lb copper
export const PLATINUM_ID = 'metal:xpt'   // 1 troy oz platinum
export const STOCK_PREFIX = 'stock:'     // followed by lowercase ticker
export const FIAT_PREFIX  = 'fiat:'      // followed by lowercase ISO code

export const ASSET_CATEGORIES = {
  crypto: { key: 'crypto', label: 'Crypto', icon: '◆', color: '#6366f1' },
  fiat:   { key: 'fiat',   label: 'Fiat',   icon: '💵', color: '#0ea5e9' },
  gold:     { key: 'gold',     label: 'Gold',     icon: '🥇', color: '#f59e0b' },
  silver:   { key: 'silver',   label: 'Silver',   icon: '🥈', color: '#94a3b8' },
  copper:   { key: 'copper',   label: 'Copper',   icon: '🟤', color: '#b45309' },
  platinum: { key: 'platinum', label: 'Platinum', icon: '⬜', color: '#cbd5e1' },
  stock:  { key: 'stock',  label: 'Stocks', icon: '📈', color: 'var(--gd)' },
  bond:   { key: 'bond',   label: 'Bonds',  icon: '📜', color: '#0284c7' },
  other:  { key: 'other',  label: 'Other',  icon: '◈', color: '#a78bfa' },
}
export const NON_CRYPTO_CATEGORIES = ['fiat', 'gold', 'silver', 'stock', 'bond', 'other']

export const PRESET_ASSETS = {
  gold:     { coin_id: GOLD_ID,     symbol: 'XAU', name: 'Gold (1 oz)',     unit: 'oz' },
  silver:   { coin_id: SILVER_ID,   symbol: 'XAG', name: 'Silver (1 oz)',   unit: 'oz' },
  copper:   { coin_id: COPPER_ID,   symbol: 'XCU', name: 'Copper (1 lb)',   unit: 'lb' },
  platinum: { coin_id: PLATINUM_ID, symbol: 'XPT', name: 'Platinum (1 oz)', unit: 'oz' },
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
  { code: 'EGP', name: 'Egyptian Pound',   symbol: 'E£' },
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
  if (id === COPPER_ID) return 'copper'
  if (id === PLATINUM_ID) return 'platinum'
  if (id.startsWith(STOCK_PREFIX)) return 'stock'
  if (id.startsWith(FIAT_PREFIX)) return 'fiat'
  if (id.startsWith('bond:')) return 'bond'
  if (id.startsWith('other:')) return 'other'
  return 'crypto'
}

export function isCrypto(id) { return assetClass(id) === 'crypto' }

// ── Crypto category map ────────────────────────────────────────────────────
// Maps CoinGecko coin_id → short category label shown as a badge
export const CRYPTO_CATEGORIES = {
  // Layer 1
  bitcoin: 'L1', ethereum: 'L1', solana: 'L1', cardano: 'L1', avalanche: 'L1',
  'avalanche-2': 'L1', polkadot: 'L1', cosmos: 'L1', 'near-protocol': 'L1',
  algorand: 'L1', tezos: 'L1', elrond: 'L1', multiversx: 'L1', fantom: 'L1',
  aptos: 'L1', sui: 'L1', ton: 'L1', 'the-open-network': 'L1', stellar: 'L1',
  tron: 'L1', hedera: 'L1', 'hedera-hashgraph': 'L1', iota: 'L1', nano: 'L1',
  // Layer 2 / Scaling
  polygon: 'L2', 'matic-network': 'L2', arbitrum: 'L2', optimism: 'L2',
  base: 'L2', 'immutable-x': 'L2', 'loopring': 'L2', starknet: 'L2',
  'starkware': 'L2', 'zksync': 'L2', 'polygon-ecosystem-token': 'L2',
  // DeFi
  uniswap: 'DeFi', aave: 'DeFi', maker: 'DeFi', 'maker-dao': 'DeFi',
  'curve-dao-token': 'DeFi', compound: 'DeFi', synthetix: 'DeFi',
  'yearn-finance': 'DeFi', sushi: 'DeFi', 'sushiswap': 'DeFi',
  'pancakeswap-token': 'DeFi', '1inch': 'DeFi', balancer: 'DeFi',
  'kyber-network': 'DeFi', dydx: 'DeFi', 'gmx': 'DeFi', jupiter: 'DeFi',
  thorchain: 'DeFi', 'lido-dao': 'DeFi', convex: 'DeFi', frax: 'DeFi',
  // AI / Data
  'fetch-ai': 'AI', 'ocean-protocol': 'AI', 'singularitynet': 'AI',
  numeraire: 'AI', 'artificial-superintelligence-alliance': 'AI',
  worldcoin: 'AI', 'near-protocol': 'AI', 'grass': 'AI', 'bittensor': 'AI',
  'render-token': 'AI', 'akash-network': 'AI', 'io-net': 'AI',
  // RWA (Real World Assets)
  chainlink: 'RWA', 'ondo-finance': 'RWA', 'mantra-dao': 'RWA',
  polymesh: 'RWA', centrifuge: 'RWA', 'maple-finance': 'RWA',
  goldfinch: 'RWA', realtoken: 'RWA',
  // Meme
  dogecoin: 'Meme', 'shiba-inu': 'Meme', pepe: 'Meme', 'bonk': 'Meme',
  floki: 'Meme', 'baby-doge-coin': 'Meme', 'dogwifcoin': 'Meme',
  'book-of-meme': 'Meme', 'cat-in-a-dogs-world': 'Meme', memecoin: 'Meme',
  // GameFi / NFT
  'axie-infinity': 'GameFi', 'the-sandbox': 'GameFi', decentraland: 'GameFi',
  'gala': 'GameFi', 'illuvium': 'GameFi', 'stepn': 'GameFi',
  'blur': 'NFT', 'apecoin': 'NFT', 'flow': 'GameFi',
  // Infrastructure / Oracle
  'chainlink': 'Oracle', 'band-protocol': 'Oracle', 'api3': 'Oracle',
  filecoin: 'Infra', 'arweave': 'Infra', helium: 'Infra',
  'the-graph': 'Infra', 'livepeer': 'Infra',
  // Exchange tokens
  'binancecoin': 'CEX', 'okb': 'CEX', 'kucoin-shares': 'CEX',
  'crypto-com-chain': 'CEX', 'huobi-token': 'CEX', 'gate': 'CEX',
  // Privacy
  monero: 'Privacy', 'zcash': 'Privacy', dash: 'Privacy',
  // Stablecoins
  tether: 'Stable', 'usd-coin': 'Stable', dai: 'Stable',
  'binance-usd': 'Stable', 'true-usd': 'Stable', 'frax': 'Stable',
  'usdd': 'Stable', 'gemini-dollar': 'Stable',
}

// Category badge color map
export const CRYPTO_CATEGORY_COLORS = {
  L1:      '#6366f1',
  L2:      '#8b5cf6',
  DeFi:    '#06b6d4',
  AI:      '#a855f7',
  RWA:     '#f59e0b',
  Meme:    '#f97316',
  GameFi:  '#10b981',
  NFT:     '#ec4899',
  Infra:   '#64748b',
  Oracle:  '#0ea5e9',
  CEX:     '#f0b90b',
  Privacy: '#94a3b8',
  Stable:  '#22c55e',
}

// Stock sector colors
export const STOCK_SECTOR_COLORS = {
  Tech:     '#6366f1',
  Finance:  '#0ea5e9',
  Health:   '#10b981',
  Consumer: '#f59e0b',
  Energy:   '#f97316',
  ETF:      '#94a3b8',
}

// Get sector for a stock coin_id like 'stock:aapl'
export function getStockSector(coinId) {
  if (!coinId?.startsWith('stock:')) return null
  const ticker = coinId.replace('stock:', '').toUpperCase()
  const found = POPULAR_TICKERS.find(t => t.ticker === ticker)
  return found?.sector || 'Stock'
}

// Get crypto category for a coin_id
export function getCryptoCategory(coinId) {
  if (!coinId) return null
  return CRYPTO_CATEGORIES[coinId.toLowerCase()] || null
}
