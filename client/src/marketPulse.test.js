// The rule these exist for is "must not replay on every price refresh".
// It fails silently and it fails in production, so it is worth more coverage
// than the rest of the module put together.
import { describe, it, expect } from 'vitest'
import {
  pulseClass, marketPeriodKey, comparable, detectEvents, selectOne,
  applyFired, pruneState, seedRecords, emptyState,
  SIGNATURE_PCT, MILESTONES, MAX_TICK_DELTA_PCT, COOLDOWN_MS, MAJOR_COOLDOWN_MS,
} from './marketPulse'

const T0 = new Date('2026-03-04T15:00:00Z').getTime()

/** A crypto major sitting just under its threshold, then over it. */
function crossing(from, to, extra = {}) {
  return {
    prev: { btc: { changePct: from, source: 'cg', ...extra } },
    next: { btc: { changePct: to, source: 'cg', cls: 'crypto-major', symbol: 'BTC', ...extra } },
  }
}

describe('pulseClass', () => {
  it('sorts each asset into the ladder it belongs to', () => {
    expect(pulseClass({ category: 'crypto', mcTier: 'mega' })).toBe('crypto-major')
    expect(pulseClass({ category: 'crypto', mcTier: 'large' })).toBe('crypto-major')
    expect(pulseClass({ category: 'crypto', mcTier: 'small' })).toBe('altcoin')
    expect(pulseClass({ category: 'stocks' })).toBe('equity')
    expect(pulseClass({ category: 'metals' })).toBe('metal')
  })

  it('silences everything that would react to nothing', () => {
    // A stablecoin's peg drift is not news, cash does not move, and real
    // estate only "moves" when the user edits the number themselves.
    expect(pulseClass({ category: 'crypto', isStable: true })).toBe('silent')
    expect(pulseClass({ category: 'cash' })).toBe('silent')
    expect(pulseClass({ category: 'realestate' })).toBe('silent')
    expect(pulseClass({})).toBe('silent')
  })
})

describe('marketPeriodKey', () => {
  it('gives each class its own boundary, not one global midnight', () => {
    const crypto = marketPeriodKey('crypto-major', T0)
    const equity = marketPeriodKey('equity', T0)
    const metal = marketPeriodKey('metal', T0)
    expect(crypto).not.toBe(equity)
    expect(equity).not.toBe(metal)
    expect(crypto).toMatch(/^crypto-major:\d{4}-\d{2}-\d{2}$/)
  })

  it('rolls the crypto key at UTC midnight and not before', () => {
    const before = marketPeriodKey('crypto-major', Date.parse('2026-03-04T23:59:00Z'))
    const after = marketPeriodKey('crypto-major', Date.parse('2026-03-05T00:01:00Z'))
    expect(before).not.toBe(after)
  })

  it('puts New York and UTC on different dates late in the UTC day', () => {
    // 01:00 UTC Thursday is still Wednesday evening in New York. A single
    // global reset would clear equity flags a day early for US holders.
    const t = Date.parse('2026-03-05T01:00:00Z')
    expect(marketPeriodKey('equity', t).endsWith('2026-03-04')).toBe(true)
    expect(marketPeriodKey('crypto-major', t).endsWith('2026-03-05')).toBe(true)
  })

  it('has no period for silent classes', () => {
    expect(marketPeriodKey('silent', T0)).toBeNull()
  })
})

describe('comparable', () => {
  it('accepts two ordinary consecutive samples', () => {
    expect(comparable({ changePct: 2 }, { changePct: 3 })).toBe(true)
  })

  it('rejects a sample served from cache', () => {
    // A cached price followed by a fresh one is the most common way to
    // manufacture a crossing that never happened.
    expect(comparable({ changePct: 2 }, { changePct: 9, fresh: false })).toBe(false)
  })

  it('rejects a comparison across a provider failover', () => {
    // Two sources disagreeing by a few percent looks exactly like a move.
    expect(comparable(
      { changePct: 2, source: 'coingecko' },
      { changePct: 9, source: 'binance' },
    )).toBe(false)
  })

  it('rejects a jump too large to be real', () => {
    const jump = MAX_TICK_DELTA_PCT + 1
    expect(comparable({ changePct: 0 }, { changePct: jump })).toBe(false)
    expect(comparable({ changePct: 0 }, { changePct: MAX_TICK_DELTA_PCT - 1 })).toBe(true)
  })

  it('rejects a missing or non-numeric sample', () => {
    expect(comparable(null, { changePct: 9 })).toBe(false)
    expect(comparable({ changePct: 2 }, { changePct: NaN })).toBe(false)
  })
})

describe('detectEvents — crossings', () => {
  it('fires when a threshold is newly crossed', () => {
    const { prev, next } = crossing(7.4, 8.2)
    const events = detectEvents({ prev, next, now: T0 })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'rocket', symbol: 'BTC', threshold: 8 })
  })

  it('does NOT fire when the value was already above the threshold', () => {
    // The whole point of the module. A refresh at +8.2% after a previous
    // reading of +8.1% is not a crossing, it is the same fact twice.
    const { prev, next } = crossing(8.1, 8.2)
    expect(detectEvents({ prev, next, now: T0 })).toEqual([])
  })

  it('does not fire twice for the same threshold in one period', () => {
    const { prev, next } = crossing(7.4, 8.2)
    const first = detectEvents({ prev, next, now: T0 })
    expect(first).toHaveLength(1)

    const state = applyFired(emptyState(), first[0])

    // Dip back under and cross again in the same day — still silent.
    const again = detectEvents({
      prev: { btc: { changePct: 7.1, source: 'cg' } },
      next: next,
      state,
      now: T0,
    })
    expect(again).toEqual([])
  })

  it('fires again once the market period has rolled over', () => {
    const { prev, next } = crossing(7.4, 8.2)
    const state = applyFired(emptyState(), detectEvents({ prev, next, now: T0 })[0])

    const tomorrow = T0 + 24 * 60 * 60 * 1000
    const events = detectEvents({ prev, next, state, now: tomorrow })
    expect(events).toHaveLength(1)
  })

  it('uses the right ladder for each class', () => {
    // 6% is a rocket for a stock and nothing at all for an altcoin.
    const stock = detectEvents({
      prev: { aapl: { changePct: 4 } },
      next: { aapl: { changePct: 6, cls: 'equity', symbol: 'AAPL' } },
      now: T0,
    })
    expect(stock).toHaveLength(1)

    const alt = detectEvents({
      prev: { doge: { changePct: 4 } },
      next: { doge: { changePct: 6, cls: 'altcoin', symbol: 'DOGE' } },
      now: T0,
    })
    expect(alt).toEqual([])
    expect(SIGNATURE_PCT.altcoin).toBeGreaterThan(SIGNATURE_PCT.equity)
  })

  it('never fires for a silent class however far it moves', () => {
    const events = detectEvents({
      prev: { usdt: { changePct: 0 } },
      next: { usdt: { changePct: 30, cls: 'silent', symbol: 'USDT' } },
      now: T0,
    })
    expect(events).toEqual([])
  })

  it('ignores downward crossings entirely in V1', () => {
    const events = detectEvents({
      prev: { btc: { changePct: -7 } },
      next: { btc: { changePct: -9, cls: 'crypto-major', symbol: 'BTC' } },
      now: T0,
    })
    expect(events).toEqual([])
  })
})

describe('detectEvents — portfolio records', () => {
  const state = { ...emptyState(), ath: 50000, milestonesHit: [10e3, 25e3, 50e3] }

  it('fires on a genuine new all-time high', () => {
    const events = detectEvents({ state, totalValue: 51000, now: T0 })
    expect(events.map(e => e.type)).toContain('ath')
  })

  it('stays quiet below the existing high', () => {
    expect(detectEvents({ state, totalValue: 49000, now: T0 })).toEqual([])
  })

  it('fires the highest newly crossed milestone, not all of them', () => {
    // One large deposit can pass several at once; only the top is the story.
    const events = detectEvents({ state, totalValue: 260000, now: T0 })
    const milestones = events.filter(e => e.type === 'milestone')
    expect(milestones).toHaveLength(1)
    expect(milestones[0].value).toBe(250e3)
  })

  it('greets a first-time user with silence, not a fake record', () => {
    // ath of 0 means we have never observed this portfolio. Someone enabling
    // the setting on a year-old portfolio must not be told it is an all-time
    // high and that they just passed $100K.
    const events = detectEvents({ state: emptyState(), totalValue: 120000, now: T0 })
    expect(events).toEqual([])
  })
})

describe('selectOne', () => {
  const rocket = { type: 'rocket', priority: 2, changePct: 9 }
  const ath = { type: 'ath', priority: 1 }
  const milestone = { type: 'milestone', priority: 0 }

  it('plays the portfolio event over the asset event', () => {
    expect(selectOne([rocket, ath], {}, T0).type).toBe('ath')
    expect(selectOne([rocket, ath, milestone], {}, T0).type).toBe('milestone')
  })

  it('picks the biggest mover when priorities tie', () => {
    const small = { type: 'rocket', priority: 2, changePct: 8.1 }
    const big = { type: 'rocket', priority: 2, changePct: 22 }
    expect(selectOne([small, big], {}, T0).changePct).toBe(22)
  })

  it('drops the rest rather than queueing them', () => {
    // Five majors crossing together during a rally is one event, not five.
    const rally = ['btc', 'eth', 'sol', 'ada', 'dot'].map(id => ({
      type: 'rocket', priority: 2, assetId: id, changePct: 9,
    }))
    expect(selectOne(rally, {}, T0)).toBeTruthy()
    expect(Array.isArray(selectOne(rally, {}, T0))).toBe(false)
  })

  it('honours the global cooldown', () => {
    const justPlayed = { lastAt: T0 - 1000 }
    expect(selectOne([rocket], justPlayed, T0)).toBeNull()
    expect(selectOne([rocket], { lastAt: T0 - COOLDOWN_MS - 1 }, T0)).toBeTruthy()
  })

  it('gives major events a longer cooldown of their own', () => {
    // Past the global cooldown but not the major one.
    const t = T0
    const cooldown = { lastAt: t - COOLDOWN_MS - 1, lastMajorAt: t - 6000 }
    expect(MAJOR_COOLDOWN_MS).toBeGreaterThan(COOLDOWN_MS)
    expect(selectOne([ath], cooldown, t)).toBeNull()
    expect(selectOne([rocket], cooldown, t)).toBeTruthy()
  })

  it('returns null for nothing', () => {
    expect(selectOne([], {}, T0)).toBeNull()
    expect(selectOne(null, {}, T0)).toBeNull()
  })
})

describe('state', () => {
  it('does not mutate the state it is given', () => {
    const before = emptyState()
    const frozen = JSON.stringify(before)
    applyFired(before, { type: 'ath', value: 100 })
    expect(JSON.stringify(before)).toBe(frozen)
  })

  it('tracks the high-water mark even when no event fired', () => {
    // Otherwise a user with sound off banks a false record the moment they
    // turn it on.
    const next = applyFired(emptyState(), null, 8000)
    expect(next.ath).toBe(8000)
  })

  it('prunes flags from finished periods but keeps records', () => {
    const { prev, next } = crossing(7.4, 8.2)
    let state = applyFired(emptyState(), detectEvents({ prev, next, now: T0 })[0])
    state = { ...state, ath: 90000, milestonesHit: [10e3] }
    expect(Object.keys(state.fired)).toHaveLength(1)

    const pruned = pruneState(state, T0 + 3 * 24 * 60 * 60 * 1000)
    expect(Object.keys(pruned.fired)).toHaveLength(0)
    expect(pruned.ath).toBe(90000)
    expect(pruned.milestonesHit).toEqual([10e3])
  })

  it('keeps flags that belong to the current period', () => {
    const { prev, next } = crossing(7.4, 8.2)
    const state = applyFired(emptyState(), detectEvents({ prev, next, now: T0 })[0])
    expect(Object.keys(pruneState(state, T0 + 60000).fired)).toHaveLength(1)
  })

  it('seeds an existing portfolio so nothing fires retroactively', () => {
    const seeded = seedRecords(emptyState(), 120000)
    expect(seeded.ath).toBe(120000)
    expect(seeded.milestonesHit).toContain(100e3)
    expect(seeded.milestonesHit).not.toContain(250e3)
    expect(detectEvents({ state: seeded, totalValue: 120000, now: T0 })).toEqual([])

    // And the next real milestone still lands.
    const events = detectEvents({ state: seeded, totalValue: 260000, now: T0 })
    expect(events.some(e => e.type === 'milestone' && e.value === 250e3)).toBe(true)
  })

  it('ignores a zero portfolio when seeding', () => {
    expect(seedRecords(emptyState(), 0)).toEqual(emptyState())
  })

  it('has a sane milestone ladder', () => {
    expect(MILESTONES).toEqual([...MILESTONES].sort((a, b) => a - b))
    expect(MILESTONES[0]).toBe(10e3)
  })
})
