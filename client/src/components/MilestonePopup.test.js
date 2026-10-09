import { describe, it, expect, beforeEach } from 'vitest'
import { detectMilestone } from './MilestonePopup'
import en from '../i18n/en'
import ar from '../i18n/ar'

describe('milestone popups speak the user\'s language', () => {
  beforeEach(() => { try { localStorage.clear() } catch {} })

  it('names its copy by key instead of carrying English text', () => {
    const m = detectMilestone({ totalValue: 120, totalPnL: 5, prevTotalPnL: -1, dayChangePct: 0 })
    expect(m.msg).toBe('msFirstProfit')
    expect(m.title).toBeUndefined()
  })

  it('has every milestone string in English and Arabic', () => {
    for (const k of ['msFirstBuyT', 'msFirstBuyS', 'msFirstBuyCta', 'msFirstProfitT', 'msFirstProfitS',
      'msRoundT', 'msRoundS', 'msGreenDayT', 'msGreenDayS', 'msShare', 'msLater', 'msClose']) {
      expect(en[k], k).toBeTruthy()
      expect(ar[k], k).toBeTruthy()
    }
    expect(ar.msRoundT('$1k')).toContain('$1k')
    expect(ar.msGreenDayT('6.2')).toContain('6.2')
  })
})
