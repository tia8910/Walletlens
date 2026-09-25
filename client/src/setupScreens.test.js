import { describe, it, expect } from 'vitest'
import { initialRows, rowValue, setupAsset, SETUP_CATS } from './components/WelcomeStart'

// "Build your dashboard": one row per asset, each with a picker for which
// asset, and a live net worth over them.

describe('the rows it starts with', () => {
  it('follows what they said they track', () => {
    const rows = initialRows(['crypto', 'stocks', 'silver'], 'EUR')
    expect(rows.map(r => r.cat)).toEqual(['metal', 'crypto', 'stock'])
    expect(rows[0].asset.id).toBe('metal:xag')
    expect(rows[1].asset.id).toBe('bitcoin')
    // A stock row opens empty, for the picker to fill.
    expect(rows[2].asset).toBeNull()
  })

  it('offers the usual balances and open stock and other rows when nothing was picked', () => {
    const rows = initialRows([], 'EGP')
    expect(rows.map(r => r.cat)).toEqual(['cash', 'stable', 'metal', 'crypto', 'stock', 'other'])
    expect(rows[0].asset.id).toBe('fiat:egp')
  })
})

describe('what each row is worth', () => {
  const prices = { bitcoin: { usd: 100000 }, 'metal:xau': { usd: 3110.34768 }, 'fiat:eur': { usd: 1.2 } }
  const row = (asset, amt) => ({ asset, amt })

  it('prices coins, currencies and metals', () => {
    expect(rowValue(row(setupAsset('crypto', 'bitcoin'), '0.5'), prices)).toBe(50000)
    expect(rowValue(row(setupAsset('cash', 'EUR'), '100'), prices)).toBeCloseTo(120)
    expect(rowValue(row(setupAsset('metal', 'gold-oz'), '2'), prices)).toBeCloseTo(6220.7, 1)
  })

  it('converts grams of gold to ounces', () => {
    expect(rowValue(row(setupAsset('metal', 'gold-g'), '31.1034768'), prices)).toBeCloseTo(3110.35, 1)
  })

  it('takes dollars and stablecoins at face value before prices land', () => {
    expect(rowValue(row(setupAsset('cash', 'USD'), '250'), {})).toBe(250)
    expect(rowValue(row(setupAsset('stable', 'tether'), '40'), {})).toBe(40)
  })

  it('counts property and other things by the value typed', () => {
    expect(rowValue(row(setupAsset('other', 'real-estate'), '250000'), {})).toBe(250000)
    const custom = setupAsset('other', 'Watch collection')
    expect(custom.id).toBe('other:watch-collection')
    expect(rowValue(row(custom, '8000'), {})).toBe(8000)
  })

  it('is worth nothing without an asset or an amount', () => {
    expect(rowValue(row(null, '5'), prices)).toBe(0)
    expect(rowValue(row(setupAsset('crypto', 'bitcoin'), ''), prices)).toBe(0)
  })
})

describe('the picker', () => {
  it('has a tab for every kind of asset', () => {
    expect(SETUP_CATS).toEqual(['cash', 'stable', 'metal', 'crypto', 'stock', 'other'])
  })

  it('files stocks and bonds under the ids the rest of the app reads', () => {
    expect(setupAsset('stock', 'nvda')).toMatchObject({ id: 'stock:nvda', sym: 'NVDA', category: 'stock' })
    expect(setupAsset('other', 'bonds')).toMatchObject({ id: 'bond:bonds', category: 'bond' })
  })
})
