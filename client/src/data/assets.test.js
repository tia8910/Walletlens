import { describe, it, expect } from 'vitest'
import {
  ASSET_CATEGORIES, NON_CRYPTO_CATEGORIES,
  GOLD_ID, SILVER_ID, STOCK_PREFIX, FIAT_PREFIX,
  PRESET_ASSETS, POPULAR_FIAT, POPULAR_TICKERS,
  assetClass, isCrypto,
} from './assets'

describe('asset constants', () => {
  it('exports the seven canonical categories', () => {
    expect(Object.keys(ASSET_CATEGORIES).sort())
      .toEqual(['bond', 'crypto', 'fiat', 'gold', 'other', 'silver', 'stock'])
  })
  it('NON_CRYPTO_CATEGORIES omits crypto', () => {
    expect(NON_CRYPTO_CATEGORIES).not.toContain('crypto')
  })
  it('preset assets reference the canonical metal ids', () => {
    expect(PRESET_ASSETS.gold.coin_id).toBe(GOLD_ID)
    expect(PRESET_ASSETS.silver.coin_id).toBe(SILVER_ID)
  })
  it('POPULAR_FIAT contains USD and EUR', () => {
    const codes = POPULAR_FIAT.map(f => f.code)
    expect(codes).toContain('USD')
    expect(codes).toContain('EUR')
  })
  it('POPULAR_TICKERS includes blue chips', () => {
    const tickers = POPULAR_TICKERS.map(t => t.ticker)
    expect(tickers).toContain('AAPL')
    expect(tickers).toContain('NVDA')
  })
})

describe('assetClass + isCrypto', () => {
  it('classifies stock prefix', () => {
    expect(assetClass(`${STOCK_PREFIX}aapl`)).toBe('stock')
    expect(isCrypto(`${STOCK_PREFIX}aapl`)).toBe(false)
  })
  it('classifies fiat prefix', () => {
    expect(assetClass(`${FIAT_PREFIX}eur`)).toBe('fiat')
  })
  it('classifies metals by exact id', () => {
    expect(assetClass(GOLD_ID)).toBe('gold')
    expect(assetClass(SILVER_ID)).toBe('silver')
  })
  it('classifies bonds and other', () => {
    expect(assetClass('bond:tlt')).toBe('bond')
    expect(assetClass('other:foo')).toBe('other')
  })
  it('defaults unknown to crypto', () => {
    expect(assetClass('bitcoin')).toBe('crypto')
    expect(assetClass(null)).toBe('crypto')
    expect(isCrypto('bitcoin')).toBe(true)
  })
})
