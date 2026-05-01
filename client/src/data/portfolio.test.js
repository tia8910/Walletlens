import { describe, it, expect } from 'vitest'
import { foldBalances, aggregatePortfolio, diffHoldings } from './portfolio'

describe('aggregatePortfolio', () => {
  it('returns empty for empty input', () => {
    expect(aggregatePortfolio([])).toEqual([])
    expect(aggregatePortfolio(null)).toEqual([])
  })
  it('sums total_invested correctly', () => {
    const out = aggregatePortfolio([
      { coin_id: 'btc', coin_symbol: 'btc', type: 'buy', amount: 1, total_cost: 100 },
      { coin_id: 'btc', coin_symbol: 'btc', type: 'buy', amount: 1, total_cost: 200 },
    ])
    expect(out.length).toBe(1)
    expect(out[0].amount).toBe(2)
    expect(out[0].total_invested).toBe(300)
  })
  it('omits zeroed positions', () => {
    const out = aggregatePortfolio([
      { coin_id: 'a', type: 'buy',  amount: 1, total_cost: 10 },
      { coin_id: 'a', type: 'sell', amount: 1, total_cost: 12 },
    ])
    expect(out.length).toBe(0)
  })
  it('keeps the latest non-empty metadata', () => {
    const out = aggregatePortfolio([
      { coin_id: 'eth', coin_symbol: 'eth', coin_name: 'Eth-Old', type: 'buy', amount: 1, total_cost: 50 },
      { coin_id: 'eth', coin_symbol: 'eth', coin_name: 'Ethereum', type: 'buy', amount: 1, total_cost: 60 },
    ])
    expect(out[0].coin_name).toBe('Ethereum')
  })
})

describe('diffHoldings', () => {
  it('reports no changes for identical inputs', () => {
    const txs = [{ coin_id: 'btc', type: 'buy', amount: 1 }]
    expect(diffHoldings(txs, txs).hasChanges).toBe(false)
  })
  it('detects added holdings', () => {
    const d = diffHoldings(
      [],
      [{ coin_id: 'btc', coin_symbol: 'btc', type: 'buy', amount: 1 }]
    )
    expect(d.added.length).toBe(1)
    expect(d.added[0].coin_id).toBe('btc')
    expect(d.removed.length).toBe(0)
  })
  it('detects removed holdings', () => {
    const d = diffHoldings(
      [{ coin_id: 'btc', coin_symbol: 'btc', type: 'buy', amount: 1 }],
      []
    )
    expect(d.removed.length).toBe(1)
    expect(d.added.length).toBe(0)
  })
  it('detects changed amounts', () => {
    const d = diffHoldings(
      [{ coin_id: 'btc', coin_symbol: 'btc', type: 'buy', amount: 1 }],
      [{ coin_id: 'btc', coin_symbol: 'btc', type: 'buy', amount: 2 }]
    )
    expect(d.changed.length).toBe(1)
    expect(d.changed[0].from).toBe(1)
    expect(d.changed[0].to).toBe(2)
  })
})

describe('foldBalances re-export shape', () => {
  it('still produces the expected shape', () => {
    const out = foldBalances([
      { coin_id: 'btc', coin_symbol: 'btc', type: 'buy', amount: 1.25 },
    ])
    expect(out.btc.amount).toBe(1.25)
    expect(out.btc.symbol).toBe('btc')
  })
})
