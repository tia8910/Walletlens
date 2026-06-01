// Curated top coins for the programmatic /track/:slug landing pages.
//   slug   — clean, readable URL segment (e.g. "avalanche")
//   id     — CoinGecko id, used to deep-link to /asset/:id (e.g. "avalanche-2")
//   blurb  — short, evergreen, factual description (no price/rank claims that go stale)
// Quality over quantity: each page is genuinely useful and distinct to avoid
// thin/doorway-content penalties.
export const TRACK_COINS = [
  { slug: 'bitcoin', id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', blurb: 'the original cryptocurrency and the largest by market capitalisation, often held as "digital gold" and a long-term store of value.' },
  { slug: 'ethereum', id: 'ethereum', name: 'Ethereum', symbol: 'ETH', blurb: 'the leading smart-contract platform, powering most of DeFi, NFTs and thousands of tokens.' },
  { slug: 'solana', id: 'solana', name: 'Solana', symbol: 'SOL', blurb: 'a high-throughput blockchain known for fast, low-cost transactions and a busy app ecosystem.' },
  { slug: 'xrp', id: 'ripple', name: 'XRP', symbol: 'XRP', blurb: 'a digital asset focused on fast, low-cost cross-border payments and settlement.' },
  { slug: 'cardano', id: 'cardano', name: 'Cardano', symbol: 'ADA', blurb: 'a proof-of-stake blockchain built on peer-reviewed academic research.' },
  { slug: 'dogecoin', id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', blurb: 'the original meme coin, now a widely held community cryptocurrency used for tips and payments.' },
  { slug: 'bnb', id: 'binancecoin', name: 'BNB', symbol: 'BNB', blurb: 'the native token of the BNB Chain ecosystem, used for fees and a wide range of apps.' },
  { slug: 'polkadot', id: 'polkadot', name: 'Polkadot', symbol: 'DOT', blurb: 'a protocol connecting many specialised blockchains into one interoperable network.' },
  { slug: 'chainlink', id: 'chainlink', name: 'Chainlink', symbol: 'LINK', blurb: 'the leading decentralised oracle network, feeding real-world data to smart contracts.' },
  { slug: 'litecoin', id: 'litecoin', name: 'Litecoin', symbol: 'LTC', blurb: 'one of the earliest Bitcoin alternatives, designed for faster and cheaper payments.' },
  { slug: 'avalanche', id: 'avalanche-2', name: 'Avalanche', symbol: 'AVAX', blurb: 'a fast smart-contract platform using a novel consensus design and customisable subnets.' },
  { slug: 'polygon', id: 'matic-network', name: 'Polygon', symbol: 'POL', blurb: 'a scaling ecosystem for Ethereum offering low fees and high throughput.' },
  { slug: 'tron', id: 'tron', name: 'TRON', symbol: 'TRX', blurb: 'a blockchain focused on content, entertainment and high-volume stablecoin transfers.' },
  { slug: 'shiba-inu', id: 'shiba-inu', name: 'Shiba Inu', symbol: 'SHIB', blurb: 'a popular Ethereum-based meme token with a large and active community.' },
  { slug: 'uniswap', id: 'uniswap', name: 'Uniswap', symbol: 'UNI', blurb: 'the governance token of one of the largest decentralised exchanges.' },
  { slug: 'cosmos', id: 'cosmos', name: 'Cosmos', symbol: 'ATOM', blurb: 'the hub of an interconnected "internet of blockchains" built for interoperability.' },
  { slug: 'stellar', id: 'stellar', name: 'Stellar', symbol: 'XLM', blurb: 'a payments network for fast, low-cost transfers between currencies.' },
  { slug: 'monero', id: 'monero', name: 'Monero', symbol: 'XMR', blurb: 'a privacy-focused cryptocurrency with confidential, untraceable transactions.' },
  { slug: 'bitcoin-cash', id: 'bitcoin-cash', name: 'Bitcoin Cash', symbol: 'BCH', blurb: 'a Bitcoin fork emphasising larger blocks for cheaper everyday payments.' },
  { slug: 'aave', id: 'aave', name: 'Aave', symbol: 'AAVE', blurb: 'a leading decentralised protocol for lending and borrowing crypto assets.' },
  { slug: 'algorand', id: 'algorand', name: 'Algorand', symbol: 'ALGO', blurb: 'a pure proof-of-stake blockchain focused on speed, low fees and instant finality.' },
  { slug: 'near', id: 'near', name: 'NEAR Protocol', symbol: 'NEAR', blurb: 'a developer-friendly, sharded proof-of-stake blockchain built for usability.' },
  { slug: 'tezos', id: 'tezos', name: 'Tezos', symbol: 'XTZ', blurb: 'a self-amending blockchain with on-chain governance and upgrades.' },
  { slug: 'ethereum-classic', id: 'ethereum-classic', name: 'Ethereum Classic', symbol: 'ETC', blurb: 'the original Ethereum chain that retained proof-of-work after the 2016 fork.' },
]

export const findTrackCoin = (slug) => TRACK_COINS.find(c => c.slug === slug)
