import { describe, it, expect, vi } from 'vitest'

vi.mock('../api', () => ({ api: {} }))
vi.mock('../push', () => ({ syncAlerts: vi.fn() }))
const { smartRow } = await import('./AISellPlan.jsx')

const row = {
  coinId: 'aptos', sym: 'APT', amount: 2000, price: 0.4,
  ta: { rsiState: 'overbought', bb: { pctB: 1.2 }, macd: { hist: 0.01 }, trend: 'uptrend' },
  targets: [
    { label: 'Sell 40% near R1', price: 0.5, note: '' },
    { label: 'Sell 35% near R2', price: 0.8, note: '' },
    { label: 'Sell 25% near R3', price: 1.2, note: '' },
    { label: 'Stop-loss under support', price: 0.3, note: '' },
  ],
}

describe('Smart Sell Plan: smartRow', () => {
  it('sizes every sell level from the holding and adds them up', () => {
    const s = smartRow(row, [])
    expect(s.levels[0].qty).toBe(800)
    expect(s.levels[0].proceeds).toBe(400)
    expect(s.planQty).toBe(2000)
    expect(s.planValue).toBeCloseTo(400 + 560 + 600)
    expect(s.levels[3].kind).toBe('stop')
  })
  it('marks a level already in your targets and places your targets against resistance', () => {
    const s = smartRow(row, [{ price: 0.81, quantity: 600 }, { price: 2, quantity: 100 }])
    expect(s.levels[1].mine).toBe(true)
    expect(s.levels[1].addable).toBe(false)
    expect(s.levels[0].addable).toBe(true)
    expect(s.yours.map(y => y.where)).toEqual(['R2', 'above'])
    expect(s.left).toBe(1300)
  })
  it('counts how many sell signals agree', () => {
    expect(smartRow(row, []).sellCount).toBe(2)
  })
  it('never offers a level at or under today\'s price as a target', () => {
    const s = smartRow({ ...row, targets: [{ label: 'Sell 40% now', price: 0.4, note: '' }] }, [])
    expect(s.levels[0].addable).toBe(false)
  })
})

describe('Smart Sell Plan: broken stops', () => {
  it('flags a stop already above today\'s price instead of arming it', () => {
    const s = smartRow({ coinId: 'x', sym: 'X', amount: 1, price: 0.37, targets: [{ label: 'Set hard stop at -30%', price: 0.7, note: '' }] }, [])
    expect(s.levels[0].broken).toBe(true)
  })
})
