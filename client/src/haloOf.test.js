import { describe, it, expect } from 'vitest'
import { haloOf } from './components/NlHoldings.jsx'

describe('logo halo follows the day', () => {
  it('is green on an up day and red on a down one', () => {
    expect(haloOf({ price: 1, pct24h: 3 }).cls).toBe('is-up')
    expect(haloOf({ price: 1, pct24h: -9 }).cls).toBe('is-down')
  })
  it('grows and quickens with the move, full at 10%', () => {
    const small = haloOf({ price: 1, pct24h: -1 }).style
    const big = haloOf({ price: 1, pct24h: -12 }).style
    expect(parseFloat(big['--halo-s'])).toBeGreaterThan(parseFloat(small['--halo-s']))
    expect(parseFloat(big['--halo-d'])).toBeLessThan(parseFloat(small['--halo-d']))
    expect(big['--halo-s']).toBe('14.0px')
  })
  it('stays still when flat or unpriced', () => {
    expect(haloOf({ price: 1, pct24h: 0 }).cls).toBe('is-flat')
    expect(haloOf({ price: 0, pct24h: 5 }).cls).toBe('is-flat')
  })
})
