// The coins the screenshot reader knows with no network at all.
//
// The full list (coins.json, the top 1000) is fetched when it can be. This is
// what is left when it cannot, on a first use offline or with the data
// service down: the big coins and stablecoins people actually hold, in rough
// market-cap order, so a shared ticker resolves to the larger coin.
const LIST = `BTC Bitcoin|ETH Ethereum|USDT Tether|XRP XRP|BNB BNB|SOL Solana|USDC USD Coin|DOGE Dogecoin|TRX TRON|ADA Cardano
|LINK Chainlink|AVAX Avalanche|SUI Sui|XLM Stellar|TON Toncoin|SHIB Shiba Inu|HBAR Hedera|BCH Bitcoin Cash|DOT Polkadot|LTC Litecoin
|HYPE Hyperliquid|LEO UNUS SED LEO|DAI Dai|USDE Ethena USDe|XMR Monero|PEPE Pepe|UNI Uniswap|NEAR NEAR Protocol|APT Aptos|AAVE Aave
|ICP Internet Computer|ONDO Ondo|ETC Ethereum Classic|POL Polygon|TAO Bittensor|CRO Cronos|KAS Kaspa|MNT Mantle|VET VeChain|ALGO Algorand
|RENDER Render|FIL Filecoin|ARB Arbitrum|OP Optimism|ATOM Cosmos|FET Artificial Superintelligence Alliance|INJ Injective|TIA Celestia|IMX Immutable|STX Stacks
|SEI Sei|BONK Bonk|WIF dogwifhat|FLOKI FLOKI|JUP Jupiter|GRT The Graph|THETA Theta Network|RUNE THORChain|LDO Lido DAO|QNT Quant
|XTZ Tezos|EOS EOS|SAND The Sandbox|MANA Decentraland|AXS Axie Infinity|GALA GALA|FLOW Flow|EGLD MultiversX|NEO NEO|KAIA Kaia
|CRV Curve DAO|MKR Maker|SNX Synthetix|COMP Compound|CAKE PancakeSwap|PENDLE Pendle|ENA Ethena|WLD Worldcoin|TRUMP Official Trump|PYTH Pyth Network
|JASMY JasmyCoin|CHZ Chiliz|ZEC Zcash|DASH Dash|IOTA IOTA|XDC XDC Network|ENS Ethereum Name Service|AR Arweave|1INCH 1inch|ZRO LayerZero
|FDUSD First Digital USD|TUSD TrueUSD|PYUSD PayPal USD|USDS USDS|PAXG PAX Gold|XAUT Tether Gold|WBTC Wrapped Bitcoin|WETH WETH|STETH Lido Staked Ether|NOT Notcoin`

export const IMPORT_COINS = LIST.split('|').map((s, i) => {
  const t = s.trim()
  const sp = t.indexOf(' ')
  return { symbol: t.slice(0, sp), name: t.slice(sp + 1), rank: i + 1 }
})
