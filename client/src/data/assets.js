// Asset-class constants. Decoupled from api.js so they can be imported
// by data utilities and pure helpers without dragging in network code.
export const GOLD_ID     = 'metal:xau'   // 1 troy oz gold
export const SILVER_ID   = 'metal:xag'   // 1 troy oz silver
export const COPPER_ID   = 'metal:xcu'   // 1 lb copper
export const PLATINUM_ID = 'metal:xpt'   // 1 troy oz platinum
export const STOCK_PREFIX = 'stock:'     // followed by lowercase ticker
export const XSTOCK_PREFIX = 'xstock:'   // tokenized stock — followed by lowercase ticker
export const FIAT_PREFIX  = 'fiat:'      // followed by lowercase ISO code

export const ASSET_CATEGORIES = {
  crypto:   { key: 'crypto',   label: 'Crypto',    icon: '₿',  color: '#6366f1' },
  fiat:     { key: 'fiat',     label: 'Fiat',      icon: '$',  color: '#0ea5e9' },
  gold:     { key: 'gold',     label: 'Gold',      icon: '🥇', color: '#f59e0b' },
  silver:   { key: 'silver',   label: 'Silver',    icon: '🥈', color: '#94a3b8' },
  copper:   { key: 'copper',   label: 'Copper',    icon: '🟤', color: '#b45309' },
  platinum: { key: 'platinum', label: 'Platinum',  icon: '💎', color: '#cbd5e1' },
  stock:    { key: 'stock',    label: 'Stocks',    icon: '📈', color: 'var(--gd)' },
  tstock:   { key: 'tstock',   label: 'Tokenized Stocks', icon: '🪙', color: '#f0b90b' },
  bond:     { key: 'bond',     label: 'Bonds',     icon: '🏛️', color: '#0284c7' },
  other:    { key: 'other',    label: 'Other',     icon: '🏠🚗⌚', color: '#a78bfa' },
}

// Binance tokenized stocks (xStocks) — each backed 1:1 by the real share and
// tradeable 24/7 on Binance as e.g. AAPLXUSDT. Prices come straight from
// Binance's public API (CORS-enabled). Add here to grow the browsable list.
export const POPULAR_XSTOCKS = [
  { ticker: 'AAPL',  name: 'Apple' },
  { ticker: 'TSLA',  name: 'Tesla' },
  { ticker: 'NVDA',  name: 'NVIDIA' },
  { ticker: 'MSFT',  name: 'Microsoft' },
  { ticker: 'GOOGL', name: 'Alphabet' },
  { ticker: 'AMZN',  name: 'Amazon' },
  { ticker: 'META',  name: 'Meta Platforms' },
  { ticker: 'COIN',  name: 'Coinbase' },
  { ticker: 'MSTR',  name: 'MicroStrategy' },
  { ticker: 'HOOD',  name: 'Robinhood' },
  { ticker: 'CRCL',  name: 'Circle' },
  { ticker: 'PLTR',  name: 'Palantir' },
  { ticker: 'AMD',   name: 'AMD' },
  { ticker: 'NFLX',  name: 'Netflix' },
  { ticker: 'AVGO',  name: 'Broadcom' },
  { ticker: 'ORCL',  name: 'Oracle' },
  { ticker: 'CRM',   name: 'Salesforce' },
  { ticker: 'INTC',  name: 'Intel' },
  { ticker: 'JPM',   name: 'JPMorgan' },
  { ticker: 'V',     name: 'Visa' },
  { ticker: 'MA',    name: 'Mastercard' },
  { ticker: 'WMT',   name: 'Walmart' },
  { ticker: 'MCD',   name: "McDonald's" },
  { ticker: 'KO',    name: 'Coca-Cola' },
  { ticker: 'SPY',   name: 'S&P 500 ETF' },
  { ticker: 'QQQ',   name: 'Nasdaq 100 ETF' },
  { ticker: 'GLD',   name: 'Gold ETF' },
]

// WalletLens id → Binance spot symbol. xstock:aapl → AAPLXUSDT.
export function xstockBinanceSymbol(ticker) {
  return `${String(ticker || '').toUpperCase()}XUSDT`
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
  { ticker: 'SPY',   name: 'S&P 500 ETF',              sector: 'ETF' },
  { ticker: 'QQQ',   name: 'Nasdaq 100 ETF',           sector: 'ETF' },
  { ticker: 'IWM',   name: 'Russell 2000 ETF',         sector: 'ETF' },
  { ticker: 'DIA',   name: 'Dow Jones ETF',            sector: 'ETF' },
  { ticker: 'VOO',   name: 'Vanguard S&P 500',         sector: 'ETF' },
  { ticker: 'VTI',   name: 'Vanguard Total Market',    sector: 'ETF' },
  { ticker: 'GLD',   name: 'Gold ETF (SPDR)',          sector: 'ETF' },
  { ticker: 'TLT',   name: '20Y Treasury ETF',         sector: 'ETF' },
  { ticker: 'ARKK',  name: 'ARK Innovation ETF',       sector: 'ETF' },
  { ticker: 'SOXX',  name: 'Semiconductor ETF',        sector: 'ETF' },
  { ticker: 'XLK',   name: 'Tech Select Sector ETF',   sector: 'ETF' },
  { ticker: 'XLF',   name: 'Financial Select ETF',     sector: 'ETF' },
  { ticker: 'XLV',   name: 'Health Care Select ETF',   sector: 'ETF' },
  { ticker: 'XLC',   name: 'Comm. Services ETF',       sector: 'ETF' },
  { ticker: 'SCHD',  name: 'Schwab US Dividend ETF',   sector: 'ETF' },
  { ticker: 'JEPI',  name: 'JPMorgan Equity Premium',  sector: 'ETF' },
  { ticker: 'JEPQ',  name: 'JPMorgan Nasdaq Eq. Prem', sector: 'ETF' },
  // ── AI / Cloud / SaaS ──
  { ticker: 'NET',   name: 'Cloudflare',               sector: 'Tech' },
  { ticker: 'DDOG',  name: 'Datadog',                  sector: 'Tech' },
  { ticker: 'CRWD',  name: 'CrowdStrike',              sector: 'Tech' },
  { ticker: 'ZS',    name: 'Zscaler',                  sector: 'Tech' },
  { ticker: 'APP',   name: 'AppLovin',                 sector: 'Tech' },
  { ticker: 'TTD',   name: 'The Trade Desk',           sector: 'Tech' },
  { ticker: 'SMCI',  name: 'Super Micro Computer',     sector: 'Tech' },
  { ticker: 'ARM',   name: 'Arm Holdings',             sector: 'Tech' },
  { ticker: 'ASML',  name: 'ASML',                     sector: 'Tech' },
  { ticker: 'TSM',   name: 'TSMC',                     sector: 'Tech' },
  { ticker: 'NFLX',  name: 'Netflix',                  sector: 'Tech' },
  { ticker: 'MSTR',  name: 'Strategy (MicroStrategy)', sector: 'Tech' },
  // ── Mobility / Gig Economy ──
  { ticker: 'UBER',  name: 'Uber',                     sector: 'Tech' },
  { ticker: 'LYFT',  name: 'Lyft',                     sector: 'Tech' },
  { ticker: 'ABNB',  name: 'Airbnb',                   sector: 'Tech' },
  { ticker: 'DASH',  name: 'DoorDash',                 sector: 'Tech' },
  // ── Social / Consumer Internet ──
  { ticker: 'SNAP',  name: 'Snap',                     sector: 'Tech' },
  { ticker: 'PINS',  name: 'Pinterest',                sector: 'Tech' },
  { ticker: 'SPOT',  name: 'Spotify',                  sector: 'Tech' },
  { ticker: 'RBLX',  name: 'Roblox',                   sector: 'Tech' },
  { ticker: 'ZM',    name: 'Zoom',                     sector: 'Tech' },
  { ticker: 'AFRM',  name: 'Affirm',                   sector: 'Tech' },
  // ── China / Asia Tech ──
  { ticker: 'BABA',  name: 'Alibaba',                  sector: 'Tech' },
  { ticker: 'PDD',   name: 'PDD Holdings (Temu)',      sector: 'Tech' },
  { ticker: 'JD',    name: 'JD.com',                   sector: 'Tech' },
  // ── Finance (additional) ──
  { ticker: 'SQ',    name: 'Block (Square)',            sector: 'Finance' },
  { ticker: 'PYPL',  name: 'PayPal',                   sector: 'Finance' },
  { ticker: 'SOFI',  name: 'SoFi Technologies',        sector: 'Finance' },
  { ticker: 'NU',    name: 'Nubank',                   sector: 'Finance' },
  { ticker: 'SCHW',  name: 'Charles Schwab',           sector: 'Finance' },
  { ticker: 'BLK',   name: 'BlackRock',                sector: 'Finance' },
  { ticker: 'PGR',   name: 'Progressive',              sector: 'Finance' },
  { ticker: 'DKNG',  name: 'DraftKings',               sector: 'Finance' },
  // ── Healthcare (additional) ──
  { ticker: 'TMO',   name: 'Thermo Fisher Scientific', sector: 'Health' },
  { ticker: 'ISRG',  name: 'Intuitive Surgical',       sector: 'Health' },
  { ticker: 'ABT',   name: 'Abbott Labs',              sector: 'Health' },
  { ticker: 'AMGN',  name: 'Amgen',                    sector: 'Health' },
  { ticker: 'GILD',  name: 'Gilead Sciences',          sector: 'Health' },
  { ticker: 'VRTX',  name: 'Vertex Pharmaceuticals',   sector: 'Health' },
  { ticker: 'REGN',  name: 'Regeneron',                sector: 'Health' },
  { ticker: 'MRNA',  name: 'Moderna',                  sector: 'Health' },
  // ── Consumer / Media ──
  { ticker: 'DIS',   name: 'Disney',                   sector: 'Consumer' },
  { ticker: 'CMCSA', name: 'Comcast',                  sector: 'Consumer' },
  { ticker: 'LULU',  name: 'Lululemon',                sector: 'Consumer' },
  { ticker: 'HD',    name: 'Home Depot',               sector: 'Consumer' },
  { ticker: 'LOW',   name: "Lowe's",                   sector: 'Consumer' },
  // ── Clean Energy ──
  { ticker: 'NEE',   name: 'NextEra Energy',           sector: 'Energy' },
  { ticker: 'FSLR',  name: 'First Solar',              sector: 'Energy' },
  { ticker: 'ENPH',  name: 'Enphase Energy',           sector: 'Energy' },
  // ── Crypto Mining / Bitcoin-adjacent ──
  { ticker: 'RIOT',  name: 'Riot Platforms',           sector: 'Mining' },
  { ticker: 'MARA',  name: 'MARA Holdings',            sector: 'Mining' },
  { ticker: 'CORZ',  name: 'Core Scientific',          sector: 'Mining' },
  { ticker: 'HUT',   name: 'Hut 8',                   sector: 'Mining' },
  // ── Defense / Aerospace ──
  { ticker: 'LMT',   name: 'Lockheed Martin',          sector: 'Defense' },
  { ticker: 'RTX',   name: 'RTX (Raytheon)',           sector: 'Defense' },
  { ticker: 'BA',    name: 'Boeing',                   sector: 'Defense' },
  { ticker: 'GE',    name: 'GE Aerospace',             sector: 'Defense' },
  // ── Industrial ──
  { ticker: 'CAT',   name: 'Caterpillar',              sector: 'Industrial' },
  { ticker: 'DE',    name: 'Deere & Company',          sector: 'Industrial' },
  // ── Binance bStocks (tokenized 1:1-backed securities, live on Binance exchange) ──
  { ticker: 'NVDAB', name: 'NVIDIA (Binance bStock)',  sector: 'bStock' },
  { ticker: 'TSLAB', name: 'Tesla (Binance bStock)',   sector: 'bStock' },
  { ticker: 'MUBB',  name: 'Micron (Binance bStock)',  sector: 'bStock' },
  { ticker: 'SNDKB', name: 'Sandisk (Binance bStock)', sector: 'bStock' },
  { ticker: 'CRCLB', name: 'Circle Internet (bStock)', sector: 'bStock' },
]

// Single classifier used everywhere — instead of duplicating six
// startsWith / equality checks across pages.
export function assetClass(id) {
  if (!id) return 'crypto'
  if (id === GOLD_ID) return 'gold'
  if (id === SILVER_ID) return 'silver'
  if (id === COPPER_ID) return 'copper'
  if (id === PLATINUM_ID) return 'platinum'
  // Tokenized stocks are stock exposure for valuation/categorisation; their
  // Binance pricing is routed separately by the xstock: prefix.
  if (id.startsWith(XSTOCK_PREFIX)) return 'stock'
  if (id.startsWith(STOCK_PREFIX)) return 'stock'
  if (id.startsWith(FIAT_PREFIX)) return 'fiat'
  if (id.startsWith('bond:')) return 'bond'
  if (id.startsWith('other:')) return 'other'
  return 'crypto'
}

export function isCrypto(id) { return assetClass(id) === 'crypto' }

// ── Token Unlock Database ──────────────────────────────────────────────────
// severity: 'critical' >5%/mo, 'high' 2-5%/mo, 'medium' 0.5-2%/mo of circulating supply
export const TOKEN_UNLOCKS = [
  { coin_id: 'aptos',            symbol: 'APT',  severity: 'critical', unlockPct: 6.8,  nextUnlock: null,          note: '~6.8% of supply monthly from foundation/team vesting' },
  { coin_id: 'sui',              symbol: 'SUI',  severity: 'critical', unlockPct: 5.2,  nextUnlock: null,          note: '~5.2% monthly — large investor + team cliff unlocks ongoing' },
  { coin_id: 'starknet',         symbol: 'STRK', severity: 'critical', unlockPct: 8.1,  nextUnlock: '2025-09-01', note: '~8% monthly; massive team/investor unlocks through 2026' },
  { coin_id: 'zksync',           symbol: 'ZK',   severity: 'critical', unlockPct: 7.4,  nextUnlock: '2025-06-17', note: '17 Jun 2025: large 1-year cliff for early investors' },
  { coin_id: 'sei-network',      symbol: 'SEI',  severity: 'critical', unlockPct: 4.9,  nextUnlock: null,          note: 'Ongoing large team & ecosystem unlocks' },
  { coin_id: 'arbitrum',         symbol: 'ARB',  severity: 'high',     unlockPct: 3.0,  nextUnlock: null,          note: 'Investor/team linear vesting through Mar 2027' },
  { coin_id: 'optimism',         symbol: 'OP',   severity: 'high',     unlockPct: 2.8,  nextUnlock: '2026-05-31', note: 'Ongoing ecosystem + investor unlocks' },
  { coin_id: 'celestia',         symbol: 'TIA',  severity: 'high',     unlockPct: 4.2,  nextUnlock: null,          note: 'Rapid linear unlock of investor/team allocation' },
  { coin_id: 'blur',             symbol: 'BLUR', severity: 'high',     unlockPct: 3.5,  nextUnlock: null,          note: 'Ongoing community + team emissions' },
  { coin_id: 'dydx',             symbol: 'DYDX', severity: 'high',     unlockPct: 2.4,  nextUnlock: null,          note: 'Investor vesting continues through 2026' },
  { coin_id: 'immutable-x',      symbol: 'IMX',  severity: 'high',     unlockPct: 2.1,  nextUnlock: null,          note: 'Project development & investor token releases' },
  { coin_id: 'worldcoin-wld',    symbol: 'WLD',  severity: 'high',     unlockPct: 3.8,  nextUnlock: '2025-07-24', note: '24 Jul 2025: large team unlock (~440M WLD)' },
  { coin_id: 'wormhole',         symbol: 'W',    severity: 'high',     unlockPct: 4.0,  nextUnlock: null,          note: 'Heavy contributor & ecosystem vesting schedule' },
  { coin_id: 'pyth-network',     symbol: 'PYTH', severity: 'high',     unlockPct: 2.6,  nextUnlock: null,          note: 'Publisher rewards + early contributor unlock' },
  { coin_id: 'jito-governance-token', symbol: 'JTO', severity: 'high', unlockPct: 2.3,  nextUnlock: null,          note: 'Insider + team linear vesting' },
  { coin_id: 'avalanche-2',      symbol: 'AVAX', severity: 'medium',   unlockPct: 1.2,  nextUnlock: null,          note: 'Foundation + team ongoing emissions' },
  { coin_id: 'near',             symbol: 'NEAR', severity: 'medium',   unlockPct: 1.4,  nextUnlock: null,          note: 'Ecosystem grants & team vesting' },
  { coin_id: 'apecoin',          symbol: 'APE',  severity: 'medium',   unlockPct: 1.8,  nextUnlock: null,          note: 'DAO treasury + contributor unlocks' },
  { coin_id: 'gmx',              symbol: 'GMX',  severity: 'medium',   unlockPct: 1.0,  nextUnlock: null,          note: 'Protocol incentive emissions' },
  { coin_id: 'eigenlayer',       symbol: 'EIGEN',severity: 'medium',   unlockPct: 2.5,  nextUnlock: '2025-09-30', note: 'Sep 2025: large early contributor unlock' },
]


// ── Crypto category map ────────────────────────────────────────────────────
// Maps CoinGecko coin_id → short category label shown as a badge
export const CRYPTO_CATEGORIES = {
  // Layer 1
  bitcoin: 'L1', ethereum: 'L1', solana: 'L1', cardano: 'L1', avalanche: 'L1',
  'avalanche-2': 'L1', polkadot: 'L1', cosmos: 'L1',
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
  thorchain: 'DeFi', 'lido-dao': 'DeFi', convex: 'DeFi',
  // AI / Data
  'fetch-ai': 'AI', 'ocean-protocol': 'AI', 'singularitynet': 'AI',
  numeraire: 'AI', 'artificial-superintelligence-alliance': 'AI',
  worldcoin: 'AI', 'near-protocol': 'AI', 'grass': 'AI', 'bittensor': 'AI',
  'render-token': 'AI', 'akash-network': 'AI', 'io-net': 'AI',
  // RWA (Real World Assets)
  'ondo-finance': 'RWA', 'mantra-dao': 'RWA',
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
  Tech:       '#6366f1',
  Finance:    '#0ea5e9',
  Health:     '#10b981',
  Consumer:   '#f59e0b',
  Energy:     '#f97316',
  ETF:        '#94a3b8',
  Mining:     '#d97706',
  Defense:    '#64748b',
  Industrial: '#78716c',
  bStock:     '#f0b90b',
}

// Get sector for a stock coin_id like 'stock:aapl'
export function getStockSector(coinId) {
  if (!coinId?.startsWith('stock:')) return null
  const ticker = coinId.replace('stock:', '').toUpperCase()
  const found = POPULAR_TICKERS.find(t => t.ticker === ticker)
  return found?.sector || 'Stock'
}

// ── Dividends ───────────────────────────────────────────────────────────────
// Trailing 12-month dividend per share (USD), curated for the popular tickers.
// We store the per-share amount (the most stable figure — it changes ~quarterly)
// and derive the YIELD live from the current price, so the percentage always
// reflects today's quote. Values are approximate/estimated; non-payers (most
// growth tech) are simply omitted. ETF figures are trailing distributions.
export const STOCK_DIVIDENDS = {
  // Mega-cap tech (token payers)
  AAPL: 1.00, MSFT: 3.32, NVDA: 0.04, AVGO: 2.36, ORCL: 1.60, IBM: 6.68,
  QCOM: 3.40, TXN: 5.44, CSCO: 1.64, TSM: 2.20,
  // Finance
  JPM: 5.00, V: 2.36, MA: 3.04, BAC: 1.04, GS: 12.00, MS: 3.70, WFC: 1.60,
  AXP: 2.88, C: 2.24, SCHW: 1.00, BLK: 20.40, PGR: 0.40,
  // Healthcare
  LLY: 6.00, UNH: 8.40, JNJ: 4.96, ABBV: 6.56, PFE: 1.72, MRK: 3.24,
  AMGN: 9.52, ABT: 2.36, GILD: 3.16, TMO: 1.72,
  // Consumer
  WMT: 0.83, COST: 4.64, MCD: 7.08, NKE: 1.60, SBUX: 2.44, KO: 2.04,
  PEP: 5.42, TGT: 4.48, HD: 9.00, LOW: 4.60, DIS: 1.00, CMCSA: 1.24,
  // Energy / Industrial / Defense
  XOM: 3.96, CVX: 6.52, COP: 3.12, OXY: 0.96, NEE: 2.06,
  CAT: 5.64, DE: 6.20, LMT: 13.20, RTX: 2.52, GE: 1.12,
  // ETFs (trailing annual distributions)
  SPY: 6.80, VOO: 6.50, VTI: 3.60, QQQ: 2.70, DIA: 7.00, SCHD: 1.04,
  JEPI: 4.80, JEPQ: 5.00, TLT: 3.30, IWM: 1.90,
}

// Annual dividend per share for a holding id ('stock:aapl'). null if none/unknown.
export function getAnnualDividend(coinId) {
  if (!coinId?.startsWith('stock:')) return null
  const ticker = coinId.replace('stock:', '').toUpperCase()
  return STOCK_DIVIDENDS[ticker] ?? null
}

// Live dividend yield (%) given a current price. null when no dividend data
// or no valid price.
export function getDividendYield(coinId, price) {
  const dps = getAnnualDividend(coinId)
  if (dps == null || !price || !isFinite(price) || price <= 0) return null
  return (dps / price) * 100
}

// Get crypto category for a coin_id
export function getCryptoCategory(coinId) {
  if (!coinId) return null
  return CRYPTO_CATEGORIES[coinId.toLowerCase()] || null
}
