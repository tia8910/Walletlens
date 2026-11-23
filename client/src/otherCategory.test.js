import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { categorizeAsset } from './data/assets'
import { classifyHolding, REASONS } from './zakat'
import { CLASS_PARAMS } from './growthEngine'
import en from './i18n/en'

// "Other" assets (a house added as Other, a car, art) were counted as crypto
// in the overview, reported from the Android app: categorizeAsset had no rule
// for the other: prefix, so it fell through to crypto, as bonds once did.

const here = dirname(fileURLToPath(import.meta.url))

describe('an Other asset', () => {
  it('is never crypto', () => {
    expect(categorizeAsset({ coin_id: 'other:car', coin_symbol: 'CAR' })).toBe('other')
    expect(categorizeAsset({ coin_id: 'other:painting', coin_symbol: 'PAINTING' })).toBe('other')
  })

  it('goes to real estate when it is property, including the welcome flow\'s Real estate', () => {
    expect(categorizeAsset({ coin_id: 'other:real-estate', coin_symbol: 'PROPERTY' })).toBe('realestate')
    expect(categorizeAsset({ coin_id: 'other:villa cairo', coin_symbol: 'VILLA CAIRO' })).toBe('realestate')
    expect(categorizeAsset({ coin_id: 'other:شقة', coin_symbol: 'شقة' })).toBe('realestate')
  })

  it('leaves crypto, stocks and the rest where they were', () => {
    expect(categorizeAsset({ coin_id: 'bitcoin', coin_symbol: 'BTC' })).toBe('crypto')
    expect(categorizeAsset({ coin_id: 'stock:aapl', coin_symbol: 'AAPL' })).toBe('stocks')
    expect(categorizeAsset({ coin_id: 'bond:us10y', coin_symbol: 'US10Y' })).toBe('bonds')
    expect(categorizeAsset({ coin_id: 'fiat:usd', coin_symbol: 'USD' })).toBe('cash')
  })

  it('has its own slice on the overview, with a name in every language', () => {
    const dash = readFileSync(join(here, 'pages/Dashboard.jsx'), 'utf8')
    expect(dash).toMatch(/CATEGORY_ORDER = \[[^\]]*'other'/)
    expect(dash).toMatch(/other: 'catOther'/)
    expect(en.catOther).toBe('Other')
    for (const lang of ['ar', 'fr', 'es', 'de', 'it']) {
      expect(readFileSync(join(here, `i18n/${lang}.js`), 'utf8')).toMatch(/catOther: /)
    }
  })

  it('is a possession for zakat: not counted unless held to resell', () => {
    const h = { coin_id: 'other:car', coin_symbol: 'CAR', value: 1000 }
    expect(classifyHolding(h)).toEqual({ portion: 0, reason: REASONS.possession })
    expect(classifyHolding(h, undefined, { 'other:car': 'resell' })).toEqual({ portion: 1, reason: REASONS.resell })
  })

  it('has a growth assumption', () => {
    expect(CLASS_PARAMS.other.mu).toBeGreaterThan(0)
  })
})
