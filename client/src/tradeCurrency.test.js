import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isFiatCode, currencyList, currencySymbol, fmtMoney, currencyName } from './data/currencies'

const here = dirname(fileURLToPath(import.meta.url))
const RATES = { USD: 1, EUR: 0.92, EGP: 48.4, SAR: 3.75, MAD: 9.9, XAU: 0.0004, BTC: 0.00001 }

describe('trade currencies', () => {
  it('knows a fiat code from a coin or a metal', () => {
    expect(isFiatCode('EGP', RATES)).toBe(true)
    expect(isFiatCode('usd', null)).toBe(true)
    expect(isFiatCode('XAU', RATES)).toBe(false)
    expect(isFiatCode('BTC', RATES)).toBe(false)
    expect(isFiatCode('ZZZ', RATES)).toBe(false)
    expect(isFiatCode('USDT', RATES)).toBe(false)
  })

  it('lists every currency, popular first', () => {
    const { popular, rest } = currencyList(RATES, 'en')
    expect(popular.slice(0, 2)).toEqual(['USD', 'EUR'])
    expect(popular).toContain('EGP')
    expect(rest).toContain('MAD')
    expect([...popular, ...rest]).not.toContain('XAU')
  })

  it('names and formats in the currency', () => {
    expect(currencyName('EGP', 'en')).toMatch(/Egyptian Pound/)
    expect(currencySymbol('USD')).toBe('$')
    expect(fmtMoney(1000, 'EGP')).toMatch(/1,000\.00/)
  })

  it('the ticket types in the chosen currency and stores USD', () => {
    const ts = readFileSync(join(here, 'components/TradeSheet.jsx'), 'utf8')
    // Spend typed in the currency → quantity at the USD price.
    expect(ts).toMatch(/parseFloat\(val\) \/ fx \/ px/)
    // A typed price is converted back to USD before it is stored.
    expect(ts).toMatch(/setPrice\(v && parseFloat\(v\) >= 0 \? String\(parseFloat\(v\) \/ fx\) : v\)/)
    // Pay with / Receive in reach every currency.
    expect(ts).toMatch(/key: 'MORE'/)
    expect(ts).toMatch(/async function fiatLeg\(T\)/)
    // A local market's stock opens in its own currency.
    expect(ts).toMatch(/MARKET_BY_CODE\[marketOfTicker\(asset\.id\)\]\?\.currency/)
  })

  it('is translated everywhere', () => {
    for (const l of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const s = readFileSync(join(here, `i18n/${l}.js`), 'utf8')
      for (const k of ['tkCurrency', 'tkSearchCurrency', 'tkPopularCur', 'tkAllCurrencies', 'tkNoCurrency', 'tkMoreCurrencies']) expect(s, `${l} ${k}`).toContain(`${k}:`)
    }
  })
})

describe('currency flags ship with the app', () => {
  it('serves the flags from /flags before the CDN', () => {
    const logo = readFileSync(join(here, 'components/CoinLogo.jsx'), 'utf8')
    expect(logo).toMatch(/\[flagLocal\(cc\), flagUrl\(cc\), voiceProxy\(flagUrl\(cc\)\)\]/)
    for (const cc of ['eg', 'sa', 'ae', 'us', 'eu', 'gb', 'kw', 'jp']) {
      expect(readFileSync(join(here, `../public/flags/${cc}.svg`), 'utf8')).toMatch(/<svg/)
    }
  })
})

describe('Home card currency', () => {
  it('shows the portfolio in the picked currency, with every currency and Bitcoin to pick from', () => {
    const home = readFileSync(join(here, 'components/HomeTop.jsx'), 'utf8')
    expect(home).toMatch(/className="nl-cur"/)
    expect(home).toMatch(/splitMoney\(totalValue, cv\)/)
    expect(home).toMatch(/money\(c\.value, cv\)/)
    const dash = readFileSync(join(here, 'pages/Dashboard.jsx'), 'utf8')
    expect(dash).toMatch(/conv=\{curConv\} currency=\{displayCurrency\} onCurrency=/)
    expect(dash).toMatch(/<CurrencyPicker open=\{homeCurPicker\} withBtc/)
  })
})
