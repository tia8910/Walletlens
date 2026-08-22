// The rule these exist for is "must not replay on every price refresh".
// It fails silently and it fails in production, so it is worth more coverage
// than the rest of the module put together.
import { describe, it, expect } from 'vitest'
import {
  pulseClass, marketPeriodKey, comparable, detectEvents, selectOne,
  applyFired, pruneState, seedRecords, emptyState, breadthOf, AURORA_MIN_ASSETS,
  PORTFOLIO_RAIN_PCT, PORTFOLIO_DIP_PCT, PORTFOLIO_STORM_PCT, AURORA_BREADTH,
  SIGNATURE_PCT, MILESTONES, MAX_TICK_DELTA_PCT, COOLDOWN_MS, MAJOR_COOLDOWN_MS,
  PORTFOLIO_SURGE_PCT, PRIORITY,
  CHAMPION_MIN_PCT, CHAMPION_LEAD_PCT, CHAMPION_MIN_ASSETS,
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
  // The day's champion is a separate, once-a-day event that now co-occurs with
  // almost anything green — it is a daily moment, not a rare one. These tests
  // are about crossings, so they look at crossings. Only one event is ever
  // shown to the user anyway: selectOne() runs a priority contest over
  // whatever detectEvents returns.
  const crossingsOnly = (events) => events.filter(e => e.type !== 'champion')

  it('fires when a threshold is newly crossed', () => {
    const { prev, next } = crossing(7.4, 8.2)
    const events = crossingsOnly(detectEvents({ prev, next, now: T0 }))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'rocket', symbol: 'BTC', threshold: 8 })
  })

  it('does NOT fire when the value was already above the threshold', () => {
    // The whole point of the module. A refresh at +8.2% after a previous
    // reading of +8.1% is not a crossing, it is the same fact twice.
    const { prev, next } = crossing(8.1, 8.2)
    expect(crossingsOnly(detectEvents({ prev, next, now: T0 }))).toEqual([])
  })

  it('does not fire twice for the same threshold in one period', () => {
    const { prev, next } = crossing(7.4, 8.2)
    const first = crossingsOnly(detectEvents({ prev, next, now: T0 }))
    expect(first).toHaveLength(1)

    const state = applyFired(emptyState(), first[0])

    // Dip back under and cross again in the same day — still silent.
    const again = crossingsOnly(detectEvents({
      prev: { btc: { changePct: 7.1, source: 'cg' } },
      next: next,
      state,
      now: T0,
    }))
    expect(again).toEqual([])
  })

  it('fires again once the market period has rolled over', () => {
    const { prev, next } = crossing(7.4, 8.2)
    const state = applyFired(emptyState(), crossingsOnly(detectEvents({ prev, next, now: T0 }))[0])

    const tomorrow = T0 + 24 * 60 * 60 * 1000
    const events = crossingsOnly(detectEvents({ prev, next, state, now: tomorrow }))
    expect(events).toHaveLength(1)
  })

  it('uses the right ladder for each class', () => {
    // 6% is a rocket for a stock and nothing at all for an altcoin.
    const stock = crossingsOnly(detectEvents({
      prev: { aapl: { changePct: 4 } },
      next: { aapl: { changePct: 6, cls: 'equity', symbol: 'AAPL' } },
      now: T0,
    }))
    expect(stock).toHaveLength(1)

    const alt = crossingsOnly(detectEvents({
      prev: { doge: { changePct: 4 } },
      next: { doge: { changePct: 6, cls: 'altcoin', symbol: 'DOGE' } },
      now: T0,
    }))
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
  // Priorities come from the table, never from a literal. Hardcoding them
  // meant adding an event type silently reclassified these: rocket's 2 became
  // ath's number, so the rocket started counting as a major event.
  const rocket = { type: 'rocket', priority: PRIORITY.rocket, changePct: 9 }
  const ath = { type: 'ath', priority: PRIORITY.ath }
  const milestone = { type: 'milestone', priority: PRIORITY.milestone }

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

  it('retires targets that were already met before the first run', () => {
    // Otherwise a returning user with a backlog of met targets gets them one
    // per price refresh, because each fires once and only one fires at a time.
    const hit = [{ id: 't1', symbol: 'ETH', price: 4200 }, { id: 't2', symbol: 'SOL', price: 300 }]
    const seeded = seedRecords(emptyState(), 120000, hit)
    expect(seeded.locksHit).toEqual(['t1', 't2'])
    expect(detectEvents({ state: seeded, totalValue: 120000, targetsHit: hit, now: T0 })).toEqual([])

    // A target crossed after that still lands.
    const fresh = [...hit, { id: 't3', symbol: 'BTC', price: 150000 }]
    const events = detectEvents({ state: seeded, totalValue: 120000, targetsHit: fresh, now: T0 })
    expect(events.map(e => e.targetId)).toEqual(['t3'])
  })

  it('has a sane milestone ladder', () => {
    expect(MILESTONES).toEqual([...MILESTONES].sort((a, b) => a - b))
    expect(MILESTONES[0]).toBe(10e3)
  })
})

describe('the portfolio flying', () => {
  // The event that exists because the other three are nearly unobservable.
  // A rocket needs a crossing between two consecutive refreshes; this is a
  // statement about today, so it is true from the first observation onward.
  const day = (h = 15) => new Date(`2026-03-04T${String(h).padStart(2, '0')}:00:00Z`).getTime()

  it('fires on the first observation of a good day, with no previous sample', () => {
    const events = detectEvents({
      prev: {}, next: {}, state: emptyState(), totalValue: 50000,
      portfolioChangePct: 4.2, now: day(),
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'fireworks', changePct: 4.2 })
  })

  it('stays quiet below the threshold', () => {
    const events = detectEvents({
      state: emptyState(), totalValue: 50000,
      portfolioChangePct: PORTFOLIO_SURGE_PCT - 0.01, now: day(),
    })
    expect(events).toEqual([])
  })

  it('fires exactly at the threshold', () => {
    const events = detectEvents({
      state: emptyState(), totalValue: 50000,
      portfolioChangePct: PORTFOLIO_SURGE_PCT, now: day(),
    })
    expect(events.map(e => e.type)).toContain('fireworks')
  })

  it('fires once a day, not once a refresh', () => {
    // The failure this prevents: a rally that holds above the threshold all
    // afternoon, firing again on every price poll.
    let state = emptyState()
    const first = detectEvents({ state, totalValue: 50000, portfolioChangePct: 6, now: day(9) })
    expect(first.map(e => e.type)).toContain('fireworks')

    state = applyFired(state, first.find(e => e.type === 'fireworks'), 50000)

    for (const h of [10, 12, 16, 21]) {
      const again = detectEvents({ state, totalValue: 50000, portfolioChangePct: 7, now: day(h) })
      expect(again.map(e => e.type)).not.toContain('fireworks')
    }
  })

  it('is available again the next day', () => {
    let state = emptyState()
    const first = detectEvents({ state, totalValue: 50000, portfolioChangePct: 6, now: day() })
    state = applyFired(state, first.find(e => e.type === 'fireworks'), 50000)

    const tomorrow = new Date('2026-03-05T15:00:00Z').getTime()
    const next = detectEvents({ state, totalValue: 50000, portfolioChangePct: 5, now: tomorrow })
    expect(next.map(e => e.type)).toContain('fireworks')
  })

  it('needs a portfolio to celebrate', () => {
    const events = detectEvents({
      state: emptyState(), totalValue: 0, portfolioChangePct: 12, now: day(),
    })
    expect(events.map(e => e.type)).not.toContain('fireworks')
  })

  it('ignores a missing or unusable figure', () => {
    for (const pct of [undefined, NaN, null, Infinity]) {
      const events = detectEvents({
        state: emptyState(), totalValue: 50000, portfolioChangePct: pct, now: day(),
      })
      expect(events.map(e => e.type)).not.toContain('fireworks')
    }
  })

  it('loses to a milestone but beats an all-time high', () => {
    // Crossing $100K on a flying day is the bigger story; a new high on a
    // flying day is the same story told twice, and fireworks is the better
    // telling of it.
    const state = { ...emptyState(), ath: 90000, milestonesHit: [10e3, 25e3, 50e3] }
    const events = detectEvents({
      state, totalValue: 100000, portfolioChangePct: 8, now: day(),
    })
    const types = events.map(e => e.type)
    expect(types).toContain('fireworks')
    expect(types).toContain('milestone')

    expect(selectOne(events, {}, day()).type).toBe('milestone')

    const withoutMilestone = events.filter(e => e.type !== 'milestone')
    expect(selectOne(withoutMilestone, {}, day()).type).toBe('fireworks')
  })
})


describe('down days', () => {
  // A portfolio app that only speaks when things go well is a cheerleader.
  // These fire on bad days too — the restraint lives in the copy and the
  // visuals, not in refusing to acknowledge them.
  const base = { totalValue: 20000, state: emptyState(), now: Date.parse('2026-08-21T12:00:00Z') }
  const types = (e) => e.map(x => x.type)

  it('says nothing about an ordinary wobble', () => {
    expect(types(detectEvents({ ...base, portfolioChangePct: -2 }))).not.toContain('dip')
  })

  it('acknowledges a real down day', () => {
    expect(types(detectEvents({ ...base, portfolioChangePct: PORTFOLIO_DIP_PCT })))
      .toContain('dip')
  })

  it('escalates to storm, and does not also fire dip', () => {
    // Both describe the same day. Firing both would acknowledge one fact twice.
    const e = types(detectEvents({ ...base, portfolioChangePct: PORTFOLIO_STORM_PCT }))
    expect(e).toContain('storm')
    expect(e).not.toContain('dip')
  })

  it('holds losses to a wider bar than gains', () => {
    // Deliberate asymmetry: mirroring +3/+8 exactly would make the app chime
    // about bad news more readily than good.
    expect(Math.abs(PORTFOLIO_DIP_PCT)).toBeGreaterThan(3)
    expect(Math.abs(PORTFOLIO_STORM_PCT)).toBeGreaterThan(PORTFOLIO_RAIN_PCT)
  })

  it('does not repeat on the next price refresh', () => {
    // The whole reason this module exists.
    const first = detectEvents({ ...base, portfolioChangePct: -6 })
    const dip = first.find(e => e.type === 'dip')
    const after = applyFired(base.state, dip, base.totalValue)
    expect(types(detectEvents({ ...base, state: after, portfolioChangePct: -6 })))
      .not.toContain('dip')
  })

  it('a storm closes out the milder dip for the day', () => {
    const storm = detectEvents({ ...base, portfolioChangePct: -12 }).find(e => e.type === 'storm')
    const after = applyFired(base.state, storm, base.totalValue)
    // Recovering to -6 later the same day must not then trigger the dip.
    expect(types(detectEvents({ ...base, state: after, portfolioChangePct: -6 })))
      .not.toContain('dip')
  })

  it('outranks a single asset having a good day', () => {
    // Telling someone one coin is up while the portfolio is down 10% reads as
    // the app not paying attention.
    const winner = selectOne([
      { type: 'rocket', priority: PRIORITY.rocket, changePct: 12 },
      { type: 'storm', priority: PRIORITY.storm, changePct: -10 },
    ])
    expect(winner.type).toBe('storm')
  })
})

describe('the other added events', () => {
  const base = { totalValue: 20000, state: emptyState(), now: Date.parse('2026-08-21T12:00:00Z') }
  const types = (e) => e.map(x => x.type)

  it('rain needs a day well past fireworks', () => {
    expect(types(detectEvents({ ...base, portfolioChangePct: 4 }))).not.toContain('rain')
    expect(types(detectEvents({ ...base, portfolioChangePct: PORTFOLIO_RAIN_PCT }))).toContain('rain')
  })

  it('aurora reads how much is green, not what it is worth', () => {
    expect(types(detectEvents({ ...base, breadth: 0.4 }))).not.toContain('aurora')
    expect(types(detectEvents({ ...base, breadth: AURORA_BREADTH }))).toContain('aurora')
    // No breadth data at all must not be read as a flat market.
    expect(types(detectEvents({ ...base, breadth: null }))).not.toContain('aurora')
  })

  it('breadth needs enough assets to mean anything', () => {
    const up = Array(AURORA_MIN_ASSETS).fill(1)
    expect(breadthOf(up)).toBe(1)
    expect(breadthOf(up.slice(1))).toBeNull()
    // Null, not zero: no data must never be read as "nothing is up".
    expect(breadthOf([])).toBeNull()
    expect(breadthOf(undefined)).toBeNull()
  })

  it('breadth counts what is up, and ignores what has no number', () => {
    expect(breadthOf([3, 1, -2, 0, 5])).toBe(0.6)
    // Flat is not up — a stablecoin sitting at 0 must not count as green.
    expect(breadthOf([0, 0, 0, 0, 0])).toBe(0)
    // An unpriced asset drops out rather than counting as red, which would
    // otherwise let a failed price fetch quietly suppress the event.
    expect(breadthOf([2, 2, 2, undefined, null, NaN, 2, -1])).toBe(0.8)
  })

  // The champion reads the sample map rather than taking a leader from the
  // caller, so these build one directly. `cls` has to be a real class or the
  // asset is skipped as silent.
  const field = (...pcts) => Object.fromEntries(
    pcts.map((changePct, i) => [`a${i}`, { changePct, cls: 'altcoin', symbol: `A${i}`, image: '' }])
  )

  it('crowns the day’s best holding, however ordinary the day', () => {
    // A daily moment, not a rare one. The old rules wanted a 12% move five
    // points clear of second place, which meant the single most exciting case —
    // the whole portfolio running together — produced nothing at all.
    expect(types(detectEvents({ ...base, next: field(3, 1, 0) }))).toContain('champion')
    expect(types(detectEvents({ ...base, next: field(0.4, 0.2, 0.1) }))).toContain('champion')
    // Three holdings up 25% together: no daylight over second place, and
    // exactly the morning the feature exists for.
    expect(types(detectEvents({ ...base, next: field(25, 24, 23) }))).toContain('champion')
  })

  it('fires for a portfolio of one', () => {
    // There is no field to lead, and it is still that holding's best day.
    expect(types(detectEvents({ ...base, next: field(6) }))).toContain('champion')
  })

  it('crowns nobody when nothing is up', () => {
    // "Top gainer" means a gain. A celebration over the least-bad holding on a
    // red day reads as mockery — the storm and down-day effects own that
    // morning.
    expect(types(detectEvents({ ...base, next: field(-2, -5, -9) }))).not.toContain('champion')
    // And a rounding artefact is not a winner.
    expect(types(detectEvents({ ...base, next: field(0.01, 0, -0.01) }))).not.toContain('champion')
  })

  it('picks the best one, not merely a positive one', () => {
    const champ = detectEvents({ ...base, next: field(2, 9, 4) }).find(e => e.type === 'champion')
    expect(champ.symbol).toBe('A1')
    expect(champ.changePct).toBe(9)
  })

  it('champion ignores stablecoins when picking the winner', () => {
    // A stablecoin is `silent`, so it can neither win nor count as the runner
    // up it has to be beaten by.
    const next = {
      ...field(9, 0.5, 0.2),
      usdt: { changePct: 40, cls: 'silent', symbol: 'USDT' },
    }
    const champ = detectEvents({ ...base, next }).find(e => e.type === 'champion')
    expect(champ.symbol).toBe('A0')
  })

  it('champion crowns one winner a day', () => {
    const next = field(9, 1, 0)
    const first = detectEvents({ ...base, next }).find(e => e.type === 'champion')
    expect(first.image).toBe('')
    const after = applyFired(base.state, first, base.totalValue)
    expect(types(detectEvents({ ...base, state: after, next }))).not.toContain('champion')
  })

  it('champion outranks the rocket, and loses to a bad day', () => {
    // The better sentence about the same fact wins; a portfolio-level event
    // still beats both.
    expect(PRIORITY.champion).toBeLessThan(PRIORITY.rocket)
    expect(PRIORITY.champion).toBeGreaterThan(PRIORITY.storm)
  })

  it('a target announces itself exactly once, ever', () => {
    const hit = [{ id: 't1', symbol: 'ETH', price: 4200 }]
    const first = detectEvents({ ...base, targetsHit: hit })
    expect(types(first)).toContain('lock')
    const after = applyFired(base.state, first.find(e => e.type === 'lock'), base.totalValue)
    expect(types(detectEvents({ ...base, state: after, targetsHit: hit }))).not.toContain('lock')
  })

  it('the second asset to cross gets the quieter shockwave', () => {
    // Four identical launches would turn the signature moment into noise;
    // dropping the rest would pretend they did not happen.
    const mk = (pct) => ({ changePct: pct, cls: 'crypto-major', symbol: 'X', source: 'live', fresh: true })
    const prev = { a: mk(1), b: mk(1), c: mk(1) }
    const next = { a: mk(30), b: mk(30), c: mk(30) }
    const e = detectEvents({ ...base, prev, next })
    expect(e.filter(x => x.type === 'rocket')).toHaveLength(1)
    expect(e.filter(x => x.type === 'shockwave').length).toBeGreaterThan(0)
  })
})
