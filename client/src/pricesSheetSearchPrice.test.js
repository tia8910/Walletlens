import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import en from './i18n/en.js'

// Searching the Market prices sheet showed a bare dash for most coins, with
// nothing to say whether a price was coming or there was none.
const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/PricesSheet.jsx'), 'utf8')
const api = readFileSync(join(here, 'api.js'), 'utf8')

describe('prices for coins found by search', () => {
  it('says the price is coming, then that there is none', () => {
    expect(src).toMatch(/pricing \? t\('nlPricing'\) : t\('nlNoPrice'\)/)
    const dict = en.translation || en
    expect(JSON.stringify(dict)).toMatch(/"nlNoPrice"/)
  })
  it('puts priced coins first once prices settle, not while they arrive', () => {
    expect(src).toMatch(/if \(!pricing\) more\.sort\(\(a, b\) => \(a\.price == null\) - \(b\.price == null\)\)/)
  })
  it('does not count a CoinGecko row with no price as priced', () => {
    expect(api).toMatch(/if \(!c\?\.id \|\| !\(Number\(c\.current_price\) > 0\)\) continue;/)
  })
  it('lets DexScreener use the ticker search gave, only for a single token', () => {
    expect(api).toMatch(/_searchSymbols\[c\.id\] = String\(c\.symbol\)\.toUpperCase\(\)/)
    expect(api).toMatch(/\{ unique: !!hinted \}/)
  })
})
