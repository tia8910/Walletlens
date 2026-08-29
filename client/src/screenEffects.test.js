import { describe, it, expect } from 'vitest'
import {
  decideEffect, dayKey, pickLeader,
  EXPLODE, ROCKET, ATH, EMPTY_STATE, ROCKET_THRESHOLD_PCT,
} from './screenEffects'

// The three occasions are rare by design, which is exactly what makes them
// hard to check by hand: the burst fires once a day, the rocket needs a 5%
// day, and the all-time high needs a record. Opening the app on the right
// morning is not a test strategy, so the decision is pure and the awkward
// parts are answered here.

const DAY = 86_400_000
const noon = Date.UTC(2026, 7, 20, 12, 0, 0)

/** decideEffect with the boring arguments filled in. */
function decide(over = {}) {
  return decideEffect({ now: noon, totalValue: 1000, changePct: 0, state: EMPTY_STATE, ...over })
}

describe('dayKey', () => {
  it('reads the offset as minutes EAST of UTC', () => {
    // 23:30 UTC is already tomorrow in Cairo (+120). Getting this sign
    // backwards rolls the day over at the wrong hour, and the "first open
    // today" burst then fires in the middle of an evening session.
    const late = Date.UTC(2026, 7, 20, 23, 30)
    expect(dayKey(late, 0)).toBe('2026-08-20')
    expect(dayKey(late, 120)).toBe('2026-08-21')
    expect(dayKey(late, -300)).toBe('2026-08-20')
  })

  it('is stable across a whole local day', () => {
    const tz = -420  // US Pacific
    const start = Date.UTC(2026, 7, 20, 7, 0)   // local midnight
    expect(dayKey(start, tz)).toBe('2026-08-20')
    expect(dayKey(start + DAY - 1, tz)).toBe('2026-08-20')
    expect(dayKey(start + DAY, tz)).toBe('2026-08-21')
  })
})

describe('the first open of the day', () => {
  it('bursts when the stored day is not today', () => {
    const { effect } = decide()
    expect(effect).toBe(EXPLODE)
  })

  it('does not burst again the same day', () => {
    const first = decide()
    const second = decide({ state: first.nextState })
    expect(second.effect).toBeNull()
  })

  it('bursts again the next day', () => {
    const first = decide()
    const next = decide({ now: noon + DAY, state: first.nextState })
    expect(next.effect).toBe(EXPLODE)
  })

  it('carries the leading asset so the burst has a logo', () => {
    const leader = { symbol: 'BTC', image: 'x.png' }
    expect(decide({ leader }).payload.leader).toEqual(leader)
  })
})

describe('the rocket', () => {
  const up = { changePct: ROCKET_THRESHOLD_PCT + 1 }

  it('launches on a day up more than the threshold', () => {
    expect(decide(up).effect).toBe(ROCKET)
  })

  it('does not launch just below the threshold', () => {
    // 4.9% is a good day. It is not this.
    const { effect } = decide({ changePct: ROCKET_THRESHOLD_PCT - 0.1 })
    expect(effect).toBe(EXPLODE)   // still the day's first open
  })

  it('launches exactly at the threshold', () => {
    expect(decide({ changePct: ROCKET_THRESHOLD_PCT }).effect).toBe(ROCKET)
  })

  it('launches once a day, not once a poll', () => {
    // Without the rocketDay guard this fires on every price refresh for as
    // long as the day stays green, which is most of a good day.
    const first = decide(up)
    expect(first.effect).toBe(ROCKET)
    const again = decide({ ...up, state: first.nextState })
    expect(again.effect).toBeNull()
  })

  it('launches again the next day if that day is also up', () => {
    const first = decide(up)
    const tomorrow = decide({ ...up, now: noon + DAY, state: first.nextState })
    expect(tomorrow.effect).toBe(ROCKET)
  })

  it('spends the day marker even though the burst did not play', () => {
    // Both are "the app opened today" events. Leaving the day unmarked would
    // fire the burst an hour later and read as celebrating twice for one
    // occasion.
    const { nextState } = decide(up)
    expect(nextState.day).toBe(dayKey(noon, 0))
  })
})

describe('the all-time high', () => {
  const seen = { ...EMPTY_STATE, ath: 1000, day: dayKey(noon, 0) }

  it('celebrates a value above the stored high', () => {
    expect(decide({ totalValue: 1001, state: seen }).effect).toBe(ATH)
  })

  it('does not celebrate matching the stored high', () => {
    expect(decide({ totalValue: 1000, state: seen }).effect).toBeNull()
  })

  it('stays silent on a device that has never stored a high', () => {
    // THE RULE THIS PROTECTS: a fresh install's very first number is
    // technically a record. Celebrating it would mean every new user's first
    // sight of the app is the effect that is supposed to be the rarest.
    const { effect, nextState } = decide({ state: EMPTY_STATE })
    expect(effect).toBe(EXPLODE)
    expect(nextState.ath).toBe(1000)   // recorded, just not celebrated
  })

  it('outranks the rocket and the burst', () => {
    const { effect } = decide({ totalValue: 5000, changePct: 40, state: seen })
    expect(effect).toBe(ATH)
  })

  it('leaves the rocket available later the same day', () => {
    // The ATH consumed the moment, not the day's rocket. A portfolio that
    // sets a record at 9am and is still up 6% at noon has earned both.
    const record = decide({ totalValue: 5000, changePct: 40, state: seen })
    expect(record.nextState.rocketDay).toBe('')
    const later = decide({ totalValue: 4900, changePct: 40, state: record.nextState })
    expect(later.effect).toBe(ROCKET)
  })

  it('raises the stored high whenever the value is a record', () => {
    const { nextState } = decide({ totalValue: 9000, state: seen })
    expect(nextState.ath).toBe(9000)
  })

  it('never lowers the stored high', () => {
    const { nextState } = decide({ totalValue: 10, state: seen })
    expect(nextState.ath).toBe(1000)
  })
})

describe('before prices land', () => {
  it('decides nothing on a zero portfolio', () => {
    // totalValue is briefly 0 on every load. Every comparison below it would
    // be nonsense, and a 0 stored as an all-time high would make the next
    // real number a "record" forever after.
    const { effect, nextState } = decide({ totalValue: 0, changePct: 99 })
    expect(effect).toBeNull()
    expect(nextState.ath).toBe(0)
  })

  it('still marks the day, so the burst is not spent on an empty screen', () => {
    // Deliberate: the day IS marked. The alternative — burst later once
    // prices arrive — was tried and it fires mid-scroll, detached from the
    // act of opening the app.
    const { nextState } = decide({ totalValue: 0 })
    expect(nextState.day).toBe(dayKey(noon, 0))
  })

  it('survives a missing or corrupt stored state', () => {
    for (const state of [undefined, null, {}, { ath: 'x', day: 5 }]) {
      expect(() => decide({ state })).not.toThrow()
      expect(decide({ state }).nextState.ath).toBe(1000)
    }
  })
})

describe('pickLeader', () => {
  const h = (coin_symbol, pct24h, coin_image = '') => ({ coin_symbol, pct24h, coin_image })

  it('picks the best day, not the biggest holding', () => {
    expect(pickLeader([h('btc', 2), h('sol', 19), h('eth', 5)]).symbol).toBe('SOL')
  })

  it('ignores holdings with no daily change', () => {
    expect(pickLeader([h('btc', null), h('eth', 1)]).symbol).toBe('ETH')
  })

  it('returns null rather than an empty badge', () => {
    // The overlay falls back to a plain burst, which looks deliberate. A logo
    // slot holding nothing does not.
    expect(pickLeader([])).toBeNull()
    expect(pickLeader(null)).toBeNull()
    expect(pickLeader([h('', 5)])).toBeNull()
  })

  it('picks the least-bad day when everything is down', () => {
    expect(pickLeader([h('btc', -9), h('eth', -2)]).symbol).toBe('ETH')
  })
})
