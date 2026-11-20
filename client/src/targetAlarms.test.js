import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./push', () => ({ syncAlerts: vi.fn() }))
const { hasTargetAlarm, setTargetAlarm, targetAlarmKeys, PRICE_ALERTS_KEY } = await import('./targetAlarms')
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// A sell target's Alarm switch is a real "rises above" price alert, so the
// alert engine rings it like any other.
describe('target alarms', () => {
  beforeEach(() => localStorage.clear())

  it('adds a rises-above alert at the target price, once', () => {
    setTargetAlarm({ coinId: 'avalanche-2', symbol: 'AVAX', price: 10 }, true)
    setTargetAlarm({ coinId: 'avalanche-2', symbol: 'AVAX', price: 10 }, true)
    const list = JSON.parse(localStorage.getItem(PRICE_ALERTS_KEY))
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ coin_id: 'avalanche-2', condition: 'above', targetPrice: 10, triggered: false, source: 'target' })
    expect(hasTargetAlarm('avalanche-2', 10)).toBe(true)
    expect(targetAlarmKeys().has('avalanche-2@10')).toBe(true)
  })

  it('removes only that alert when switched off', () => {
    localStorage.setItem(PRICE_ALERTS_KEY, JSON.stringify([{ id: 9, coin_id: 'avalanche-2', condition: 'below', targetPrice: 5, triggered: false }]))
    setTargetAlarm({ coinId: 'avalanche-2', symbol: 'AVAX', price: 10 }, true)
    setTargetAlarm({ coinId: 'avalanche-2', symbol: 'AVAX', price: 10 }, false)
    const list = JSON.parse(localStorage.getItem(PRICE_ALERTS_KEY))
    expect(list).toEqual([{ id: 9, coin_id: 'avalanche-2', condition: 'below', targetPrice: 5, triggered: false }])
  })
})

describe('Targets page layout', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pages/Dashboard.jsx'), 'utf8')
  it('opens with the plan summary, then every target ranked, with an alarm each', () => {
    expect(src).toMatch(/className="tg3-hero"/)
    expect(src).toMatch(/: \(Number\(b\.reached\) - Number\(a\.reached\)\) \|\| \(a\.away - b\.away\)/)
    expect(src).toMatch(/onChange=\{\(\) => toggleAlarm\(x\)\}/)
  })
})
