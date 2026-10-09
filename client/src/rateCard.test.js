import { describe, it, expect, beforeEach } from 'vitest'
import { rateCardDue } from './components/RateCard'

const seedOpens = (n) => localStorage.setItem('wl_review_state_v3', JSON.stringify({ opens: n }))

describe('the Rate WalletLens card', () => {
  beforeEach(() => localStorage.clear())
  it('shows in the Android app as soon as there is a portfolio, from the first day', () => {
    seedOpens(1)
    expect(rateCardDue({ android: true, holdings: 1 })).toBe(true)
    expect(rateCardDue({ android: false, holdings: 1 })).toBe(false)
    expect(rateCardDue({ android: true, holdings: 0 })).toBe(false)
  })
  it('waits after Not now and ends after Rate', () => {
    seedOpens(3)
    const now = Date.now()
    localStorage.setItem('wl_rate_card', String(now + 1000))
    expect(rateCardDue({ android: true, holdings: 2, now })).toBe(false)
    expect(rateCardDue({ android: true, holdings: 2, now: now + 2000 })).toBe(true)
    localStorage.setItem('wl_rate_card', 'done')
    expect(rateCardDue({ android: true, holdings: 2, now: now + 10 ** 10 })).toBe(false)
  })
})
