import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reclassifyAsset, GOLD_ID } from './data/assets'
import { makeAssetPicker } from './components/SmartImport.jsx'
import { api } from './api'

const here = dirname(fileURLToPath(import.meta.url))

// Imports used to file every row as a crypto under its lowercased ticker, so
// USDT and gold from a screenshot each became a second copy of an asset the
// user already had.
describe('an imported row is the asset it names', () => {
  it('files gold, silver and cash under their own class', () => {
    expect(reclassifyAsset('xau', 'XAU', 'crypto')).toMatchObject({ coin_id: GOLD_ID, category: 'gold' })
    expect(reclassifyAsset('gold', 'GOLD', undefined)).toMatchObject({ coin_id: GOLD_ID, category: 'gold' })
    expect(reclassifyAsset('usd', 'USD', 'crypto')).toMatchObject({ coin_id: 'fiat:usd', category: 'fiat' })
    expect(reclassifyAsset('eur', 'EUR', 'crypto')).toMatchObject({ coin_id: 'fiat:eur', category: 'fiat' })
  })
  it('leaves real crypto, and anything filed in another class, alone', () => {
    expect(reclassifyAsset('bitcoin', 'BTC', 'crypto')).toBeNull()
    expect(reclassifyAsset('pax-gold', 'PAXG', 'crypto')).toBeNull()
    expect(reclassifyAsset('stock:aapl', 'AAPL', 'stock')).toBeNull()
    expect(reclassifyAsset(GOLD_ID, 'XAU', 'gold')).toBeNull()
  })
  it('reuses the holding already under that ticker, then the market coin', () => {
    const pick = makeAssetPicker(
      [{ coin_id: 'tether', coin_symbol: 'USDT', coin_name: 'Tether', category: 'crypto', value: 100 },
       { coin_id: 'stock:aapl', coin_symbol: 'AAPL', coin_name: 'Apple', category: 'stock', value: 50 }],
      [{ id: 'the-open-network', symbol: 'ton', name: 'Toncoin', image: 'x.png' }],
    )
    expect(pick('usdt')).toMatchObject({ coin_id: 'tether', category: 'crypto' })
    expect(pick('AAPL')).toMatchObject({ coin_id: 'stock:aapl', category: 'stock' })
    expect(pick('TON')).toMatchObject({ coin_id: 'the-open-network', coin_image: 'x.png' })
    expect(pick('ZZZ', 'Mystery')).toMatchObject({ coin_id: 'zzz', coin_name: 'Mystery' })
  })
})

describe('duplicates already saved fold together', () => {
  beforeEach(() => localStorage.clear())
  it('one Tether and one gold holding, however the rows were saved', async () => {
    const base = { wallet_id: 1, type: 'buy', amount: 1, price_per_unit: 1, coin_name: '', coin_image: '', exchange: '', notes: '', date: '2026-01-01' }
    const txs = [
      { ...base, id: 1, category: 'crypto', coin_id: 'tether', coin_symbol: 'USDT', amount: 100, total_cost: 100 },
      { ...base, id: 2, category: 'crypto', coin_id: 'usdt', coin_symbol: 'USDT', amount: 50, total_cost: 50 },
      { ...base, id: 3, category: 'gold', coin_id: GOLD_ID, coin_symbol: 'XAU', amount: 1, total_cost: 3000 },
      { ...base, id: 4, category: 'crypto', coin_id: 'xau', coin_symbol: 'XAU', amount: 2, total_cost: 6000 },
    ]
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify(txs))
    const h = await api.getPortfolio()
    expect(h.map(x => x.coin_id).sort()).toEqual([GOLD_ID, 'tether'].sort())
    expect(h.find(x => x.coin_id === 'tether').amount).toBe(150)
    expect(h.find(x => x.coin_id === GOLD_ID)).toMatchObject({ amount: 3, category: 'gold' })
  })
})

describe('the Android app hands every picked photo to the page', () => {
  it('reads the picker\'s ClipData, not only the first file', () => {
    const java = readFileSync(join(here, '../../walletlens_source/release_package/app/src/main/java/live/walletlens/twa/AppShellActivity.java'), 'utf8')
    expect(java).toMatch(/ClipData clip = data\.getClipData\(\)/)
    expect(java).toMatch(/cb\.onReceiveValue\(resultCode == RESULT_OK \? pickedUris\(resultCode, data\) : null\)/)
    expect(java).toMatch(/EXTRA_ALLOW_MULTIPLE/)
  })
})

describe('several overlapping screenshots', () => {
  it('one row per holding, unit prices, and the market price where none was read', async () => {
    const { tidyImportRows } = await import('./components/SmartImport.jsx')
    const rows = [
      { symbol: 'AR', name: 'Arweave', amount: 500.79, price: 2177.4, type: 'buy' },
      { symbol: 'PYTH', name: 'Pyth Network', amount: 10000, price: 0.073, type: 'buy' },
      { symbol: 'STONKBROKER', name: 'StonkBroker', amount: 26339, price: 0.0109, type: 'buy' },
      { symbol: 'XAU', name: 'Gold', amount: 1.4472, price: 4286.2, type: 'buy' },
      { symbol: 'PYTH', name: 'Pyth Network', amount: 10000, price: 0.0735, type: 'buy' },
      { symbol: 'ST', name: 'StonkBroker', amount: 26339, price: 0.0107, type: 'buy' },
      { symbol: 'XAU', name: 'Gold', amount: 1.4472, price: 4286.2, type: 'buy' },
      { symbol: 'APT', name: 'Aptos', amount: 399.6, price: 0, type: 'buy' },
    ]
    const market = { AR: 4.4, PYTH: 0.074, STONKBROKER: 0.011, XAU: 4290, APT: 1.9 }
    const out = tidyImportRows(rows, r => market[r.symbol] || 0)
    expect(out.map(r => r.symbol)).toEqual(['AR', 'PYTH', 'STONKBROKER', 'XAU', 'APT'])
    expect(out[0].price).toBeCloseTo(2177.4 / 500.79, 4)   // value read as price, put back
    expect(out[1].price).toBe(0.073)                        // a real fill is left alone
    expect(out[3].price).toBe(4286.2)
    expect(out[4].price).toBe(1.9)                          // none read: the market's
  })
})
