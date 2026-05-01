import { describe, it, expect, beforeEach } from 'vitest'
import { foldBalances, assetClass, api, GOLD_ID, SILVER_ID, STOCK_PREFIX, FIAT_PREFIX } from './api'

beforeEach(() => {
  localStorage.clear()
})

describe('assetClass', () => {
  it('classifies crypto by default', () => {
    expect(assetClass('bitcoin')).toBe('crypto')
    expect(assetClass('ethereum')).toBe('crypto')
  })
  it('classifies metals by id', () => {
    expect(assetClass(GOLD_ID)).toBe('gold')
    expect(assetClass(SILVER_ID)).toBe('silver')
  })
  it('classifies prefixed ids', () => {
    expect(assetClass(`${STOCK_PREFIX}aapl`)).toBe('stock')
    expect(assetClass(`${FIAT_PREFIX}eur`)).toBe('fiat')
    expect(assetClass('bond:tlt')).toBe('bond')
    expect(assetClass('other:foo')).toBe('other')
  })
  it('handles falsy input', () => {
    expect(assetClass(null)).toBe('crypto')
    expect(assetClass('')).toBe('crypto')
  })
})

describe('foldBalances', () => {
  it('returns empty for no transactions', () => {
    expect(foldBalances([])).toEqual({})
    expect(foldBalances(null)).toEqual({})
  })
  it('sums buys and subtracts sells', () => {
    const out = foldBalances([
      { coin_id: 'bitcoin', coin_symbol: 'btc', type: 'buy', amount: 1.5 },
      { coin_id: 'bitcoin', coin_symbol: 'btc', type: 'buy', amount: 0.5 },
      { coin_id: 'bitcoin', coin_symbol: 'btc', type: 'sell', amount: 0.3 },
    ])
    expect(out.bitcoin.amount).toBeCloseTo(1.7, 6)
    expect(out.bitcoin.symbol).toBe('btc')
  })
  it('handles deposit/withdraw legacy types', () => {
    const out = foldBalances([
      { coin_id: 'eth', type: 'deposit', amount: 2 },
      { coin_id: 'eth', type: 'withdraw', amount: 0.5 },
    ])
    expect(out.eth.amount).toBeCloseTo(1.5, 6)
  })
  it('keeps separate ids separate', () => {
    const out = foldBalances([
      { coin_id: 'a', type: 'buy', amount: 1 },
      { coin_id: 'b', type: 'buy', amount: 2 },
    ])
    expect(out.a.amount).toBe(1)
    expect(out.b.amount).toBe(2)
  })
  it('skips entries with no coin_id', () => {
    const out = foldBalances([
      { type: 'buy', amount: 1 },
      { coin_id: '', type: 'buy', amount: 1 },
    ])
    expect(Object.keys(out).length).toBe(0)
  })
  it('coerces non-numeric amount safely', () => {
    const out = foldBalances([
      { coin_id: 'x', type: 'buy', amount: 'not-a-number' },
    ])
    expect(out.x.amount).toBe(0)
  })
})

describe('api.getPortfolio', () => {
  it('returns empty when no transactions', async () => {
    const portfolio = await api.getPortfolio()
    expect(portfolio).toEqual([])
  })
  it('aggregates net balance and filters out zeroed positions', async () => {
    const txs = [
      { id: 1, wallet_id: 1, coin_id: 'btc', coin_symbol: 'btc', type: 'buy', amount: 2, total_cost: 100 },
      { id: 2, wallet_id: 1, coin_id: 'btc', coin_symbol: 'btc', type: 'sell', amount: 2, total_cost: 200 },
      { id: 3, wallet_id: 1, coin_id: 'eth', coin_symbol: 'eth', type: 'buy', amount: 1, total_cost: 50 },
    ]
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify(txs))
    const portfolio = await api.getPortfolio()
    // BTC fully sold, only ETH remains
    expect(portfolio.length).toBe(1)
    expect(portfolio[0].coin_id).toBe('eth')
    expect(portfolio[0].amount).toBe(1)
  })
  it('filters by walletId when provided', async () => {
    const txs = [
      { id: 1, wallet_id: 1, coin_id: 'btc', coin_symbol: 'btc', type: 'buy', amount: 1, total_cost: 50 },
      { id: 2, wallet_id: 2, coin_id: 'eth', coin_symbol: 'eth', type: 'buy', amount: 1, total_cost: 50 },
    ]
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify(txs))
    const w1 = await api.getPortfolio(1)
    expect(w1.length).toBe(1)
    expect(w1[0].coin_id).toBe('btc')
    const w2 = await api.getPortfolio(2)
    expect(w2[0].coin_id).toBe('eth')
  })
})

describe('api.getCoinTargets', () => {
  it('migrates a legacy single-amount target to a single-target plan', async () => {
    localStorage.setItem(
      'crypto_tracker_coin_targets',
      JSON.stringify({ bitcoin: { amount: 100000 } })
    )
    const out = await api.getCoinTargets()
    expect(out.bitcoin.targets.length).toBe(1)
    expect(out.bitcoin.targets[0].price).toBe(100000)
    expect(out.bitcoin.targets[0].quantity).toBe(null)
  })
  it('preserves a modern target plan unchanged', async () => {
    const plan = { bitcoin: { targets: [{ id: 1, price: 50000, quantity: 0.5 }] } }
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify(plan))
    const out = await api.getCoinTargets()
    expect(out.bitcoin.targets[0].price).toBe(50000)
    expect(out.bitcoin.targets[0].quantity).toBe(0.5)
  })
})

describe('api.previewImportCode', () => {
  it('rejects an invalid code', async () => {
    const r = await api.previewImportCode('not-a-real-backup')
    expect(r.success).toBe(false)
  })
  it('round-trips an export -> preview', async () => {
    localStorage.setItem(
      'crypto_tracker_transactions',
      JSON.stringify([{ id: 1, wallet_id: 1, coin_id: 'btc', coin_symbol: 'btc', type: 'buy', amount: 1, total_cost: 50 }])
    )
    const code = await api.exportCode()
    expect(typeof code).toBe('string')
    expect(code.length).toBeGreaterThan(0)

    const preview = await api.previewImportCode(code)
    expect(preview.success).toBe(true)
    expect(preview.summary.transactions).toBe(1)
    expect(preview.diff.hasChanges).toBe(false) // same data → no diff
  })
})

describe('api.restoreLastImport', () => {
  it('returns success:false when no snapshot exists', async () => {
    const r = await api.restoreLastImport()
    expect(r.success).toBe(false)
  })
  it('restores from a stashed snapshot and clears it', async () => {
    localStorage.setItem(
      'crypto_tracker_pre_import_snapshot',
      JSON.stringify({
        t: 123,
        wallets: [{ id: 1, name: 'Restored' }],
        transactions: [],
        exchanges: [],
        manual_prices: {},
        coin_targets: {},
        ids: { w: '1', t: '1', e: '1' },
      })
    )
    const r = await api.restoreLastImport()
    expect(r.success).toBe(true)
    expect(localStorage.getItem('crypto_tracker_pre_import_snapshot')).toBe(null)
    const wallets = JSON.parse(localStorage.getItem('crypto_tracker_wallets'))
    expect(wallets[0].name).toBe('Restored')
  })
})
