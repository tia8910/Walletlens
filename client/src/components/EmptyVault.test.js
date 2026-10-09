import { describe, it, expect } from 'vitest'
import { frame, orbPos } from './EmptyVault'

const SHOT = { id: 'shot', launch: [2.5, 3.0, 3.5], items: [
  { sym: 'BTC', amt: '0.5', v: 41250, c: '#f7931a' },
  { sym: 'NVDA', amt: '20', v: 2760, c: '#76b900' },
  { sym: 'GOLD', amt: '2 oz', v: 5300, c: '#e8b825' } ] }

describe('empty Home stage timeline', () => {
  it('starts empty: nothing has landed and the total is $0', () => {
    const f = frame(SHOT, 0, 0)
    expect(f.value).toBe(0)
    expect(f.chips.every(c => !c.landed && !c.flying)).toBe(true)
  })

  it('flies each chip after its launch and lands it one second later', () => {
    const f = frame(SHOT, 3.2, 0)
    expect(f.chips[0].flying).toBe(true)
    expect(f.chips[1].flying).toBe(true)
    expect(f.chips[2].flying).toBe(false)
    expect(frame(SHOT, 3.6, 0).chips[0].landed).toBe(true)
  })

  it('ends the build on the full example total, with the ring split by value', () => {
    const f = frame(SHOT, 6, 0)
    expect(Math.round(f.value)).toBe(41250 + 2760 + 5300)
    const share = f.chips.reduce((s, c) => s + c.seg.f, 0)
    expect(share).toBeCloseTo(1, 6)
    expect(f.chips[0].seg.f).toBeGreaterThan(f.chips[2].seg.f)
  })

  it('fades out before the next scene', () => {
    expect(frame(SHOT, 6, 0).alpha).toBe(1)
    expect(frame(SHOT, 8.9, 0).alpha).toBe(0)
  })

  it('keeps the orbs on their orbit and larger in front', () => {
    const front = orbPos(0, Math.PI / 2 / 0.12)   // sin = 1: nearest
    const back = orbPos(0, (3 * Math.PI / 2) / 0.12)
    expect(front.s).toBeGreaterThan(back.s)
    expect(front.depth).toBeCloseTo(1, 6)
  })
})
