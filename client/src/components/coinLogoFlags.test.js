import { describe, it, expect } from 'vitest'
import { flagCodeFor } from './CoinLogo'

describe('cash shows its country flag', () => {
  it('maps a currency to its country', () => {
    expect(flagCodeFor('USD')).toBe('us')
    expect(flagCodeFor('aed')).toBe('ae')
    expect(flagCodeFor('EGP')).toBe('eg')
    expect(flagCodeFor('SAR')).toBe('sa')
    expect(flagCodeFor('GBP')).toBe('gb')
    expect(flagCodeFor('JPY')).toBe('jp')
  })

  it('uses the union flag for the euro and a member flag for shared regional currencies', () => {
    expect(flagCodeFor('EUR')).toBe('eu')
    expect(flagCodeFor('XOF')).toBe('sn')
  })

  it('has no flag for gold or anything that is not a currency code', () => {
    expect(flagCodeFor('XAU')).toBe(null)
    expect(flagCodeFor('US')).toBe(null)
    expect(flagCodeFor('')).toBe(null)
  })
})
