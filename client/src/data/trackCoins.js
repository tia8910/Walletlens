// Curated assets for the programmatic /track/:slug landing pages.
//   slug   — clean, readable URL segment (e.g. "avalanche", "apple-stock", "gold")
//   id     — internal asset ID: CoinGecko id for crypto, "stock:TICKER" for stocks, "metal:SYM" for metals
//   type   — 'crypto' | 'stock' | 'metal'
//   blurb  — short, evergreen, factual description (no price/rank claims that go stale)
// Quality over quantity: each page is genuinely useful and distinct to avoid
// thin/doorway-content penalties.
export const TRACK_COINS = [
  { slug: 'bitcoin', id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', type: 'crypto', blurb: 'the original cryptocurrency and the largest by market capitalisation, often held as "digital gold" and a long-term store of value.' },
  { slug: 'ethereum', id: 'ethereum', name: 'Ethereum', symbol: 'ETH', type: 'crypto', blurb: 'the leading smart-contract platform, powering most of DeFi, NFTs and thousands of tokens.' },
  { slug: 'solana', id: 'solana', name: 'Solana', symbol: 'SOL', type: 'crypto', blurb: 'a high-throughput blockchain known for fast, low-cost transactions and a busy app ecosystem.' },
  { slug: 'xrp', id: 'ripple', name: 'XRP', symbol: 'XRP', type: 'crypto', blurb: 'a digital asset focused on fast, low-cost cross-border payments and settlement.' },
  { slug: 'cardano', id: 'cardano', name: 'Cardano', symbol: 'ADA', type: 'crypto', blurb: 'a proof-of-stake blockchain built on peer-reviewed academic research.' },
  { slug: 'dogecoin', id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', type: 'crypto', blurb: 'the original meme coin, now a widely held community cryptocurrency used for tips and payments.' },
  { slug: 'bnb', id: 'binancecoin', name: 'BNB', symbol: 'BNB', type: 'crypto', blurb: 'the native token of the BNB Chain ecosystem, used for fees and a wide range of apps.' },
  { slug: 'polkadot', id: 'polkadot', name: 'Polkadot', symbol: 'DOT', type: 'crypto', blurb: 'a protocol connecting many specialised blockchains into one interoperable network.' },
  { slug: 'chainlink', id: 'chainlink', name: 'Chainlink', symbol: 'LINK', type: 'crypto', blurb: 'the leading decentralised oracle network, feeding real-world data to smart contracts.' },
  { slug: 'litecoin', id: 'litecoin', name: 'Litecoin', symbol: 'LTC', type: 'crypto', blurb: 'one of the earliest Bitcoin alternatives, designed for faster and cheaper payments.' },
  { slug: 'avalanche', id: 'avalanche-2', name: 'Avalanche', symbol: 'AVAX', type: 'crypto', blurb: 'a fast smart-contract platform using a novel consensus design and customisable subnets.' },
  { slug: 'polygon', id: 'matic-network', name: 'Polygon', symbol: 'POL', type: 'crypto', blurb: 'a scaling ecosystem for Ethereum offering low fees and high throughput.' },
  { slug: 'tron', id: 'tron', name: 'TRON', symbol: 'TRX', type: 'crypto', blurb: 'a blockchain focused on content, entertainment and high-volume stablecoin transfers.' },
  { slug: 'shiba-inu', id: 'shiba-inu', name: 'Shiba Inu', symbol: 'SHIB', type: 'crypto', blurb: 'a popular Ethereum-based meme token with a large and active community.' },
  { slug: 'uniswap', id: 'uniswap', name: 'Uniswap', symbol: 'UNI', type: 'crypto', blurb: 'the governance token of one of the largest decentralised exchanges.' },
  { slug: 'cosmos', id: 'cosmos', name: 'Cosmos', symbol: 'ATOM', type: 'crypto', blurb: 'the hub of an interconnected "internet of blockchains" built for interoperability.' },
  { slug: 'stellar', id: 'stellar', name: 'Stellar', symbol: 'XLM', type: 'crypto', blurb: 'a payments network for fast, low-cost transfers between currencies.' },
  { slug: 'monero', id: 'monero', name: 'Monero', symbol: 'XMR', type: 'crypto', blurb: 'a privacy-focused cryptocurrency with confidential, untraceable transactions.' },
  { slug: 'bitcoin-cash', id: 'bitcoin-cash', name: 'Bitcoin Cash', symbol: 'BCH', type: 'crypto', blurb: 'a Bitcoin fork emphasising larger blocks for cheaper everyday payments.' },
  { slug: 'aave', id: 'aave', name: 'Aave', symbol: 'AAVE', type: 'crypto', blurb: 'a leading decentralised protocol for lending and borrowing crypto assets.' },
  { slug: 'algorand', id: 'algorand', name: 'Algorand', symbol: 'ALGO', type: 'crypto', blurb: 'a pure proof-of-stake blockchain focused on speed, low fees and instant finality.' },
  { slug: 'near', id: 'near', name: 'NEAR Protocol', symbol: 'NEAR', type: 'crypto', blurb: 'a developer-friendly, sharded proof-of-stake blockchain built for usability.' },
  { slug: 'tezos', id: 'tezos', name: 'Tezos', symbol: 'XTZ', type: 'crypto', blurb: 'a self-amending blockchain with on-chain governance and upgrades.' },
  { slug: 'ethereum-classic', id: 'ethereum-classic', name: 'Ethereum Classic', symbol: 'ETC', type: 'crypto', blurb: 'the original Ethereum chain that retained proof-of-work after the 2016 fork.' },
  // $LENZ — WalletLens's own native token on Sui (see /lenz and sui-token/).
  // Intentionally NOT enabled yet: a /track/ page needs a live, queryable price,
  // and $LENZ has no market/price source until it is deployed and has liquidity.
  // Enabling now would ship a thin, price-less page (the very doorway content this
  // list avoids). Once $LENZ is listed on a supported price source (e.g. CoinGecko),
  // set `id` to its CoinGecko id and uncomment:
  // { slug: 'lenz', id: 'REPLACE_WITH_COINGECKO_ID', name: 'WalletLens', symbol: 'LENZ', type: 'crypto', blurb: 'the native token of the WalletLens ecosystem, a Sui coin with a fixed 10M supply and locked minting.' },
]

export const TRACK_STOCKS = [
  { slug: 'apple-stock', id: 'stock:AAPL', name: 'Apple', symbol: 'AAPL', type: 'stock', blurb: "one of the world's most valuable public companies, known for the iPhone, Mac, iPad and a growing services business." },
  { slug: 'microsoft-stock', id: 'stock:MSFT', name: 'Microsoft', symbol: 'MSFT', type: 'stock', blurb: 'a global technology leader in cloud computing (Azure), enterprise software (Office 365) and gaming.' },
  { slug: 'nvidia-stock', id: 'stock:NVDA', name: 'NVIDIA', symbol: 'NVDA', type: 'stock', blurb: 'the leading designer of GPUs for gaming, data centres and AI model training.' },
  { slug: 'tesla-stock', id: 'stock:TSLA', name: 'Tesla', symbol: 'TSLA', type: 'stock', blurb: 'an electric vehicle and clean-energy company known for its Model S, 3, X and Y cars and energy storage products.' },
  { slug: 'amazon-stock', id: 'stock:AMZN', name: 'Amazon', symbol: 'AMZN', type: 'stock', blurb: 'a global leader in e-commerce and cloud infrastructure through Amazon Web Services (AWS).' },
  { slug: 'google-stock', id: 'stock:GOOGL', name: 'Alphabet (Google)', symbol: 'GOOGL', type: 'stock', blurb: "the parent company of Google, the world's dominant search engine, alongside YouTube, Google Cloud, and Waymo." },
  { slug: 'meta-stock', id: 'stock:META', name: 'Meta Platforms', symbol: 'META', type: 'stock', blurb: 'the parent of Facebook, Instagram and WhatsApp, with growing investments in augmented and virtual reality.' },
  { slug: 'sp500-etf', id: 'stock:SPY', name: 'S&P 500 ETF (SPY)', symbol: 'SPY', type: 'stock', blurb: "the SPDR S&P 500 ETF — the world's most traded ETF, tracking 500 of the largest US publicly listed companies." },
  { slug: 'nasdaq-etf', id: 'stock:QQQ', name: 'Nasdaq-100 ETF (QQQ)', symbol: 'QQQ', type: 'stock', blurb: 'the Invesco QQQ ETF, tracking the 100 largest non-financial companies listed on the Nasdaq exchange.' },
  { slug: 'voo-etf', id: 'stock:VOO', name: 'Vanguard S&P 500 ETF (VOO)', symbol: 'VOO', type: 'stock', blurb: "the Vanguard S&P 500 ETF — one of the world's most popular index funds, offering low-cost broad US market exposure." },
]

export const TRACK_METALS = [
  { slug: 'gold', id: 'metal:XAU', name: 'Gold', symbol: 'XAU', type: 'metal', blurb: "the world's most enduring store of value and inflation hedge, held by central banks and private investors for centuries." },
  { slug: 'silver', id: 'metal:XAG', name: 'Silver', symbol: 'XAG', type: 'metal', blurb: 'a precious metal used both as an inflation hedge and in industrial applications including solar panels and electronics.' },
  { slug: 'platinum', id: 'metal:XPT', name: 'Platinum', symbol: 'XPT', type: 'metal', blurb: 'a rare precious metal primarily used in catalytic converters, jewellery, and growing hydrogen fuel cell applications.' },
]

export const ALL_TRACK_ASSETS = [...TRACK_COINS, ...TRACK_STOCKS, ...TRACK_METALS]

export const findTrackAsset = (slug) => ALL_TRACK_ASSETS.find(c => c.slug === slug)
// backward compat
export const findTrackCoin = findTrackAsset
