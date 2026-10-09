// Currencies for the trade ticket: names, symbols and money formatting for
// any ISO 4217 code the FX feed (api.getFiatRates, units per 1 USD) covers.

/** Shown first in the picker. */
export const POPULAR_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'EGP', 'KWD', 'QAR', 'TRY', 'INR', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY']

// Coins and tokens that look like currency codes but are not fiat.
const NOT_FIAT = new Set(['BTC', 'ETH', 'XAU', 'XAG', 'XPT', 'XPD', 'XDR', 'USDT', 'USDC'])

/** Whether `code` is a fiat currency the rates know. */
export function isFiatCode(code, rates) {
  const c = String(code || '').toUpperCase()
  return /^[A-Z]{3}$/.test(c) && !NOT_FIAT.has(c) && (c === 'USD' || Number(rates?.[c]) > 0)
}

/** The currency's name in the reader's language, or the code. */
export function currencyName(code, lang = 'en') {
  try { return new Intl.DisplayNames([lang, 'en'], { type: 'currency' }).of(code) || code } catch { return code }
}

/** The short symbol people write: $, €, E£, ﷼… or the code when there is none. */
export function currencySymbol(code) {
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0)
    return parts.find(p => p.type === 'currency')?.value || code
  } catch { return code }
}

/** An amount in `code`, with two decimals. */
export function fmtMoney(n, code = 'USD') {
  const v = Number(n || 0)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
  } catch {
    return `${code} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}

/** Every code the rates cover, popular ones first, the rest by name. */
export function currencyList(rates, lang = 'en') {
  const all = Object.keys(rates || { USD: 1 }).filter(c => isFiatCode(c, rates))
  if (!all.includes('USD')) all.push('USD')
  const pop = POPULAR_CURRENCIES.filter(c => all.includes(c))
  const rest = all.filter(c => !pop.includes(c))
    .map(c => [c, currencyName(c, lang)])
    .sort((a, b) => a[1].localeCompare(b[1], lang))
    .map(([c]) => c)
  return { popular: pop, rest }
}
