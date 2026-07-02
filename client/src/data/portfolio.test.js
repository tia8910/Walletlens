import { describe, it, expect } from 'vitest'
import { foldBalances, diffHoldings } from './portfolio'

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
