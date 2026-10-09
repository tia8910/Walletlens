import { describe, it, expect } from 'vitest'
import { pickDexPair } from './api'

const pair = (symbol, priceUsd, liq, h24 = 0) => ({ baseToken: { symbol }, priceUsd: String(priceUsd), liquidity: { usd: liq }, priceChange: { h24 } })

describe('pickDexPair', () => {
  it('takes the deepest pool of the right symbol', () => {
    const got = pickDexPair([pair('BASECAT', 0.001, 20000, 2), pair('BASECAT', 0.0011, 90000, -1.5), pair('CAT', 5, 1e7)], 'basecat')
    expect(got).toEqual({ usd: 0.0011, change: -1.5 })
  })
  it('ignores pools with under $10k of liquidity', () => {
    expect(pickDexPair([pair('BASECAT', 0.001, 9000)], 'BASECAT')).toBeNull()
  })
  it('keeps to pools near a known price', () => {
    const got = pickDexPair([pair('BASECAT', 0.5, 1e6), pair('BASECAT', 0.0012, 30000)], 'BASECAT', 0.001)
    expect(got.usd).toBe(0.0012)
  })
  it('answers null for nothing usable', () => {
    expect(pickDexPair(undefined, 'X')).toBeNull()
    expect(pickDexPair([pair('X', 0, 1e6)], 'X')).toBeNull()
  })
})
