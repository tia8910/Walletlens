// Shared stablecoin detection — stablecoins are cash, not investments, so they
// are excluded from technical / on-chain / Magic Indicator analysis.

export const STABLECOIN_IDS = new Set([
  'tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd', 'frax',
  'pax-dollar', 'gemini-dollar', 'liquity-usd', 'usdd', 'first-digital-usd',
  'paypal-usd', 'euro-coin', 'stasis-eurs', 'usds', 'usual-usd',
  'nusd', 'fei-protocol', 'rai', 'usde', 'ethena-usde',
  'mountain-protocol-usdm', 'magic-internet-money', 'gho', 'crvusd',
])

export const STABLECOIN_SYMBOLS = new Set([
  'usdt', 'usdc', 'dai', 'busd', 'tusd', 'frax', 'usdp', 'gusd', 'lusd',
  'usdd', 'fdusd', 'pyusd', 'eurc', 'eurs', 'usds', 'usd0', 'susd',
  'usde', 'usdm', 'mim', 'gho', 'crvusd', 'usd', 'eur', 'gbp', 'jpy',
])

export function isStablecoin(coinId, coinSymbol) {
  const id = (coinId || '').toLowerCase()
  const sym = (coinSymbol || '').toLowerCase()
  if (STABLECOIN_IDS.has(id)) return true
  if (STABLECOIN_SYMBOLS.has(sym)) return true
  return false
}
