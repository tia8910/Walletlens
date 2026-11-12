import { describe, it, expect, beforeEach } from 'vitest'
import { api, cleanTx } from './api'
import { loadData } from './data/storage'

// Bad data must not crash a screen or poison a total. Each case here was a
// crash, a vanished holding or a NaN before it was a test.
describe('data integrity', () => {
  beforeEach(() => localStorage.clear())
  const buy = (w, o) => api.addTransaction({ wallet_id: w.id, type: 'buy', coin_id: 'bitcoin', coin_symbol: 'BTC', ...o })

  it('adds amounts saved as text as numbers, not as joined text', async () => {
    const w = await api.createWallet({ name: 'A' })
    await buy(w, { amount: '0.5', price_per_unit: '100' })
    await buy(w, { amount: '0.5', price_per_unit: '100' })
    const [h] = await api.getPortfolio()
    expect(h.amount).toBe(1)
    expect(h.total_invested).toBe(100)
  })

  it('reads text amounts already in storage the same way', async () => {
    const w = await api.createWallet({ name: 'A' })
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([
      { id: 1, wallet_id: w.id, type: 'buy', coin_id: 'bitcoin', coin_symbol: 'BTC', amount: '2', price_per_unit: 10, total_cost: '20', date: '2026-01-01' },
      { id: 2, wallet_id: w.id, type: 'sell', coin_id: 'bitcoin', coin_symbol: 'BTC', amount: '0.5', price_per_unit: 10, total_cost: 5, date: '2026-01-02' },
    ]))
    const [h] = await api.getPortfolio()
    expect(h.amount).toBe(1.5)
    expect(h.total_invested).toBe(15)
  })

  it('never lets a missing price or a bad amount turn a total into NaN', async () => {
    const w = await api.createWallet({ name: 'A' })
    await buy(w, { amount: 1, price_per_unit: undefined })
    await buy(w, { amount: NaN, price_per_unit: 100 })
    await buy(w, { amount: -2, price_per_unit: 50 })
    const [h] = await api.getPortfolio()
    expect(h.amount).toBe(3)
    expect(h.total_invested).toBe(100)
    for (const t of loadData('transactions')) for (const k of ['amount', 'price_per_unit', 'total_cost']) expect(Number.isFinite(t[k]), k).toBe(true)
  })

  it('lists trades when one has no date', async () => {
    const w = await api.createWallet({ name: 'A' })
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([
      { id: 1, wallet_id: w.id, type: 'buy', coin_id: 'bitcoin', coin_symbol: 'BTC', amount: 1, price_per_unit: 5, total_cost: 5 },
      { id: 2, wallet_id: w.id, type: 'buy', coin_id: 'ethereum', coin_symbol: 'ETH', amount: 1, price_per_unit: 5, total_cost: 5, date: '2026-01-01' },
    ]))
    const list = await api.getTransactions()
    expect(list.map(t => t.id)).toEqual([2, 1])
  })

  it('treats storage of the wrong shape as empty, not as a crash', async () => {
    for (const bad of ['{"a":1}', 'null', '"text"', '{not json']) {
      localStorage.setItem('crypto_tracker_transactions', bad)
      expect(loadData('transactions')).toEqual([])
      expect(await api.getPortfolio()).toEqual([])
      expect(await api.getTransactions()).toEqual([])
    }
    localStorage.setItem('crypto_tracker_manual_prices', '[1,2]')
    expect(loadData('manual_prices', {})).toEqual({})
  })

  it('mends a restored trade: numbers as numbers, and a date', () => {
    const t = cleanTx({ id: 1, amount: '2', price_per_unit: '10', created_at: '2026-03-04T10:00:00Z' })
    expect(t).toMatchObject({ amount: 2, price_per_unit: 10, total_cost: 20, date: '2026-03-04' })
    expect(cleanTx({ amount: 1, price_per_unit: 1, total_cost: 7, date: '2026-01-02T00:00:00Z' })).toMatchObject({ total_cost: 7, date: '2026-01-02' })
    expect(cleanTx({ amount: 1 }).date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps a portfolio whole through a backup and restore', async () => {
    const w = await api.createWallet({ name: 'A' })
    await buy(w, { amount: 0.25, price_per_unit: 60000, date: '2026-01-10' })
    const before = await api.getPortfolio()
    const code = await api.exportCode()
    localStorage.clear()
    expect((await api.importCode(code)).success).toBe(true)
    expect(await api.getPortfolio()).toEqual(before)
  })
})
