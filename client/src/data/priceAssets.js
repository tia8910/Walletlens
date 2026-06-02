// Programmatic live-price pages: /price/:slug — "X price today".
// Targets very high recurring search volume ("bitcoin price", "gold price").
//   slug   — clean URL segment (e.g. "bitcoin-price")
//   id     — internal asset id (CoinGecko id for crypto; "stock:AAPL" / "metal:XAU")
//   cgId   — CoinGecko id usable with the public simple/price endpoint (crypto + paxg-backed metals); null when not resolvable client-side
//   blurb  — one evergreen sentence about the asset (NO price numbers, which go stale)
export const PRICE_ASSETS = [
  // ── Crypto ──────────────────────────────────────────────────────────────
  { slug: 'bitcoin-price', id: 'bitcoin', cgId: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', type: 'crypto', blurb: 'the original cryptocurrency and the largest by market capitalisation, often held as a long-term store of value.' },
  { slug: 'ethereum-price', id: 'ethereum', cgId: 'ethereum', name: 'Ethereum', symbol: 'ETH', type: 'crypto', blurb: 'the leading smart-contract platform that powers most of DeFi, NFTs and thousands of tokens.' },
  { slug: 'solana-price', id: 'solana', cgId: 'solana', name: 'Solana', symbol: 'SOL', type: 'crypto', blurb: 'a high-throughput blockchain known for fast, low-cost transactions and a busy app ecosystem.' },
  { slug: 'xrp-price', id: 'ripple', cgId: 'ripple', name: 'XRP', symbol: 'XRP', type: 'crypto', blurb: 'a digital asset focused on fast, low-cost cross-border payments and settlement.' },
  { slug: 'cardano-price', id: 'cardano', cgId: 'cardano', name: 'Cardano', symbol: 'ADA', type: 'crypto', blurb: 'a proof-of-stake blockchain built on peer-reviewed academic research.' },
  { slug: 'dogecoin-price', id: 'dogecoin', cgId: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', type: 'crypto', blurb: 'the original meme coin, now a widely held community cryptocurrency.' },
  { slug: 'bnb-price', id: 'binancecoin', cgId: 'binancecoin', name: 'BNB', symbol: 'BNB', type: 'crypto', blurb: 'the native token of the BNB Chain ecosystem, used for fees and a wide range of apps.' },
  { slug: 'avalanche-price', id: 'avalanche-2', cgId: 'avalanche-2', name: 'Avalanche', symbol: 'AVAX', type: 'crypto', blurb: 'a fast smart-contract platform using a novel consensus design and customisable subnets.' },
  { slug: 'polkadot-price', id: 'polkadot', cgId: 'polkadot', name: 'Polkadot', symbol: 'DOT', type: 'crypto', blurb: 'a protocol connecting many specialised blockchains into one interoperable network.' },
  { slug: 'chainlink-price', id: 'chainlink', cgId: 'chainlink', name: 'Chainlink', symbol: 'LINK', type: 'crypto', blurb: 'the leading decentralised oracle network, feeding real-world data to smart contracts.' },
  { slug: 'litecoin-price', id: 'litecoin', cgId: 'litecoin', name: 'Litecoin', symbol: 'LTC', type: 'crypto', blurb: 'one of the earliest Bitcoin alternatives, designed for faster and cheaper payments.' },
  { slug: 'polygon-price', id: 'matic-network', cgId: 'matic-network', name: 'Polygon', symbol: 'POL', type: 'crypto', blurb: 'a scaling ecosystem for Ethereum offering low fees and high throughput.' },
  { slug: 'shiba-inu-price', id: 'shiba-inu', cgId: 'shiba-inu', name: 'Shiba Inu', symbol: 'SHIB', type: 'crypto', blurb: 'a popular Ethereum-based meme token with a large and active community.' },
  { slug: 'tron-price', id: 'tron', cgId: 'tron', name: 'TRON', symbol: 'TRX', type: 'crypto', blurb: 'a blockchain focused on content, entertainment and high-volume stablecoin transfers.' },
  { slug: 'uniswap-price', id: 'uniswap', cgId: 'uniswap', name: 'Uniswap', symbol: 'UNI', type: 'crypto', blurb: 'the governance token of one of the largest decentralised exchanges.' },

  // ── Precious metals ─────────────────────────────────────────────────────
  // Gold has a CoinGecko proxy (PAX Gold) priced ~1oz; silver/platinum show graceful fallback.
  { slug: 'gold-price', id: 'metal:XAU', cgId: 'pax-gold', name: 'Gold', symbol: 'XAU', type: 'metal', blurb: "the world's most enduring store of value and inflation hedge, held by central banks and investors for centuries." },
  { slug: 'silver-price', id: 'metal:XAG', cgId: null, name: 'Silver', symbol: 'XAG', type: 'metal', blurb: 'a precious metal used both as an inflation hedge and in industrial applications like solar and electronics.' },
  { slug: 'platinum-price', id: 'metal:XPT', cgId: null, name: 'Platinum', symbol: 'XPT', type: 'metal', blurb: 'a rare precious metal used in catalytic converters, jewellery and hydrogen fuel cells.' },

  // ── Stocks & ETFs (no public client-side feed → graceful fallback to app) ──
  { slug: 'apple-stock-price', id: 'stock:AAPL', cgId: null, name: 'Apple', symbol: 'AAPL', type: 'stock', blurb: "one of the world's most valuable companies, known for the iPhone, Mac and a large services business." },
  { slug: 'nvidia-stock-price', id: 'stock:NVDA', cgId: null, name: 'NVIDIA', symbol: 'NVDA', type: 'stock', blurb: 'the leading designer of GPUs for gaming, data centres and AI model training.' },
  { slug: 'tesla-stock-price', id: 'stock:TSLA', cgId: null, name: 'Tesla', symbol: 'TSLA', type: 'stock', blurb: 'an electric vehicle and clean-energy company known for its cars and energy storage products.' },
  { slug: 'microsoft-stock-price', id: 'stock:MSFT', cgId: null, name: 'Microsoft', symbol: 'MSFT', type: 'stock', blurb: 'a global technology leader in cloud computing, enterprise software and gaming.' },
  { slug: 'amazon-stock-price', id: 'stock:AMZN', cgId: null, name: 'Amazon', symbol: 'AMZN', type: 'stock', blurb: 'a global leader in e-commerce and cloud infrastructure through Amazon Web Services.' },
]

export const findPriceAsset = (slug) => PRICE_ASSETS.find(a => a.slug === slug)
