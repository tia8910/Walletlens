import { describe, it, expect } from 'vitest'
import {
  nisabValue, NISAB_GOLD_GRAMS, NISAB_SILVER_GRAMS, GRAMS_PER_TROY_OZ,
  classifyHolding, breakdown, netZakatable, advanceHawl, markPaid,
  computeZakat, dueDateFrom, rateFor, nextRamadan, DEFAULT_SETTINGS,
  HAWL, REASONS, RATE_LUNAR, RATE_SOLAR,
} from './zakat'
import { GOLD_ID, SILVER_ID } from './data/assets'
import { toHijri, addHijriYears, daysBetween } from './hijri'

const U = (y, m, d) => new Date(Date.UTC(y, m - 1, d))
const h = (id, value, extra = {}) => ({ coin_id: id, coin_symbol: id.split(':').pop(), value, ...extra })

// Round numbers so the arithmetic is checkable by hand.
const PRICES = { [GOLD_ID]: { usd: 3110.34768 }, [SILVER_ID]: { usd: 31.1034768 } }
// gold nisab   = 85/31.1034768 * 3110.34768   = 8500
// silver nisab = 595/31.1034768 * 31.10347680 = 595

describe('nisab', () => {
  it('prices the gold threshold at 85g', () => {
    expect(nisabValue({ standard: 'gold', goldPerOz: 3110.34768 })).toBeCloseTo(8500, 6)
  })

  it('prices the silver threshold at 595g', () => {
    expect(nisabValue({ standard: 'silver', silverPerOz: 31.10347680 })).toBeCloseTo(595, 6)
  })

  it('puts silver well below gold, which is why it is the default', () => {
    const g = nisabValue({ standard: 'gold', goldPerOz: 3110.34768 })
    const s = nisabValue({ standard: 'silver', silverPerOz: 31.10347680 })
    expect(s).toBeLessThan(g)
    expect(DEFAULT_SETTINGS.nisabStandard).toBe('silver')
  })

  it('returns null rather than a wrong number when the price is missing', () => {
    expect(nisabValue({ standard: 'gold', goldPerOz: null })).toBeNull()
    expect(nisabValue({ standard: 'silver', silverPerOz: 0 })).toBeNull()
    expect(nisabValue({ standard: 'silver', silverPerOz: NaN })).toBeNull()
  })

  it('uses the classical gram weights', () => {
    expect(NISAB_GOLD_GRAMS).toBe(85)
    expect(NISAB_SILVER_GRAMS).toBe(595)
    expect(GRAMS_PER_TROY_OZ).toBeCloseTo(31.1034768, 7)
  })
})

describe('what counts, and why', () => {
  const S = DEFAULT_SETTINGS

  it('counts cash in full', () => {
    expect(classifyHolding(h('fiat:usd', 100), S)).toEqual({ portion: 1, reason: REASONS.cash })
  })

  it('counts gold and silver in full', () => {
    expect(classifyHolding(h(GOLD_ID, 100), S).portion).toBe(1)
    expect(classifyHolding(h(SILVER_ID, 100), S).portion).toBe(1)
  })

  it('counts crypto in full by default', () => {
    expect(classifyHolding(h('bitcoin', 100), S)).toEqual({ portion: 1, reason: REASONS.crypto })
  })

  it('still counts stablecoins when crypto is switched off', () => {
    // Someone who does not consider volatile tokens zakatable wealth still
    // holds money when they hold USDT. Excluding it would be indefensible.
    const off = { ...S, cryptoZakatable: false }
    expect(classifyHolding(h('bitcoin', 100), off).portion).toBe(0)
    expect(classifyHolding(h('tether', 100, { coin_symbol: 'USDT' }), off))
      .toEqual({ portion: 1, reason: REASONS.stable })
  })

  it('excludes a home or rental property, includes one bought to resell', () => {
    const prop = h('real:flat', 100000)
    expect(classifyHolding(prop, S, {}).portion).toBe(0)
    expect(classifyHolding(prop, S, {}).reason).toBe(REASONS.homeOrRental)
    expect(classifyHolding(prop, S, { 'real:flat': 'resell' }))
      .toEqual({ portion: 1, reason: REASONS.resell })
  })

  it('counts shares held to trade in full, long-term shares in part', () => {
    const s = h('stock:aapl', 1000)
    expect(classifyHolding(s, S, { 'stock:aapl': 'trade' }))
      .toEqual({ portion: 1, reason: REASONS.shareTrade })
    const long = classifyHolding(s, S, {})
    expect(long.reason).toBe(REASONS.shareLong)
    expect(long.portion).toBeCloseTo(0.30, 6)
  })

  it('clamps a nonsense share portion instead of inventing money', () => {
    expect(classifyHolding(h('stock:aapl', 100), { ...S, longTermSharePortion: 5 }, {}).portion).toBe(1)
    expect(classifyHolding(h('stock:aapl', 100), { ...S, longTermSharePortion: -2 }, {}).portion).toBe(0)
    expect(classifyHolding(h('stock:aapl', 100), { ...S, longTermSharePortion: NaN }, {}).portion).toBe(0)
  })
})

describe('the breakdown', () => {
  const holdings = [
    h('fiat:usd', 1000),
    h('bitcoin', 5000),
    h('stock:aapl', 2000),
    h('real:flat', 300000),
  ]

  it('sums only what counts', () => {
    const b = breakdown(holdings, DEFAULT_SETTINGS, {})
    // 1000 + 5000 + (2000 * 0.30) + 0
    expect(b.gross).toBeCloseTo(6600, 6)
  })

  it('reports what it left out, so the number can be checked', () => {
    const b = breakdown(holdings, DEFAULT_SETTINGS, {})
    // 1400 of the shares + the whole property
    expect(b.excluded).toBeCloseTo(301400, 6)
  })

  it('gives every row a reason', () => {
    for (const r of breakdown(holdings, DEFAULT_SETTINGS, {}).rows) {
      expect(Object.values(REASONS)).toContain(r.reason)
    }
  })

  it('leads with the biggest contributor', () => {
    expect(breakdown(holdings, DEFAULT_SETTINGS, {}).rows[0].id).toBe('bitcoin')
  })

  it('ignores negative and missing values rather than subtracting them', () => {
    const b = breakdown([h('fiat:usd', -50), h('bitcoin', undefined), h('fiat:eur', 10)], DEFAULT_SETTINGS, {})
    expect(b.gross).toBe(10)
  })

  it('deducts debts, and never goes below zero', () => {
    const owing = { ...DEFAULT_SETTINGS, liabilities: 2000 }
    expect(netZakatable(holdings, owing, {}).net).toBeCloseTo(4600, 6)
    const huge = { ...DEFAULT_SETTINGS, liabilities: 999999 }
    expect(netZakatable(holdings, huge, {}).net).toBe(0)
  })
})

describe('the hawl runs on the pool, not on each asset', () => {
  // This is the rule the whole feature turns on. An asset bought mid-year is
  // an increment to the existing pool — it does not get its own clock, and it
  // does not delay the due date.
  it('does not restart when a new asset is added mid-year', () => {
    const start = U(2024, 1, 10)
    let state = advanceHawl(null, { now: start, net: 1000, nisab: 595 })
    expect(state.status).toBe(HAWL.RUNNING)
    expect(state.startedAt).toBe('2024-01-10')

    // Six months later the user buys a large new position.
    state = advanceHawl(state, { now: U(2024, 7, 10), net: 90000, nisab: 595 })
    expect(state.startedAt).toBe('2024-01-10')
    expect(state.status).toBe(HAWL.RUNNING)
  })

  it('charges the full pool at the anniversary, including the late arrival', () => {
    const start = U(2024, 1, 10)
    const hawl = { startedAt: '2024-01-10', paidFor: [] }
    const due = addHijriYears(start, 1)
    const out = computeZakat({
      holdings: [h('fiat:usd', 1000), h('bitcoin', 89000)],
      prices: PRICES, hawl, now: due,
    })
    expect(out.status).toBe(HAWL.DUE)
    expect(out.amount).toBeCloseTo(90000 * 0.025, 6)
  })
})

describe('the hawl state machine', () => {
  it('stays dormant below nisab', () => {
    const s = advanceHawl(null, { now: U(2024, 1, 1), net: 100, nisab: 595 })
    expect(s.status).toBe(HAWL.BELOW)
    expect(s.startedAt).toBeNull()
  })

  it('starts the clock the day wealth reaches nisab', () => {
    const s = advanceHawl(null, { now: U(2024, 1, 1), net: 595, nisab: 595 })
    expect(s.status).toBe(HAWL.RUNNING)
    expect(s.startedAt).toBe('2024-01-01')
  })

  it('falls due on the Hijri anniversary, not the Gregorian one', () => {
    const start = U(2024, 1, 10)
    const hawl = { startedAt: '2024-01-10', paidFor: [] }
    const due = addHijriYears(start, 1)

    // The day before is not yet due.
    const before = advanceHawl(hawl, { now: new Date(due.getTime() - 86400000), net: 1000, nisab: 595 })
    expect(before.status).toBe(HAWL.RUNNING)

    expect(advanceHawl(hawl, { now: due, net: 1000, nisab: 595 }).status).toBe(HAWL.DUE)

    // And the Gregorian anniversary is ~11 days too late to be the trigger.
    expect(daysBetween(due, U(2025, 1, 10))).toBeGreaterThan(9)
  })

  describe('a mid-year dip below nisab', () => {
    const hawl = { startedAt: '2024-01-10', paidFor: [] }
    const mid = U(2024, 6, 1)

    it('is ignored under the Hanafi rule', () => {
      const s = advanceHawl(hawl, { now: mid, net: 10, nisab: 595, settings: { ...DEFAULT_SETTINGS, dipRule: 'ignore' } })
      expect(s.status).toBe(HAWL.RUNNING)
      expect(s.startedAt).toBe('2024-01-10')
    })

    it('restarts the clock under the majority rule', () => {
      const s = advanceHawl(hawl, { now: mid, net: 10, nisab: 595, settings: { ...DEFAULT_SETTINGS, dipRule: 'reset' } })
      expect(s.status).toBe(HAWL.BELOW)
      expect(s.startedAt).toBeNull()
      expect(s.resetByDip).toBe(true)
    })
  })

  it('owes nothing if wealth is below nisab on the day it falls due', () => {
    const start = U(2024, 1, 10)
    const s = advanceHawl({ startedAt: '2024-01-10', paidFor: [] },
      { now: addHijriYears(start, 1), net: 10, nisab: 595 })
    expect(s.status).toBe(HAWL.BELOW)
    expect(s.lapsed).toBe(true)
  })

  it('rolls to the next year once paid, rather than staying due forever', () => {
    const start = U(2024, 1, 10)
    const due = addHijriYears(start, 1)
    const paid = markPaid({ startedAt: '2024-01-10', paidFor: [] }, due)

    const after = advanceHawl(paid, { now: due, net: 1000, nisab: 595 })
    expect(after.status).toBe(HAWL.RUNNING)
    // The new year runs from the anniversary, not from today.
    expect(after.startedAt).toBe(due.toISOString().slice(0, 10))
  })

  it('rolls a clock that was paid but never moved', () => {
    // markPaid advances startedAt itself, so this state should not arise from
    // the app. It can arise from state written before that behaviour existed,
    // and the alternative is a permanently DUE screen that cannot be cleared.
    const start = U(2024, 1, 10)
    const due = addHijriYears(start, 1)
    const stuck = { startedAt: '2024-01-10', paidFor: [due.toISOString().slice(0, 10)] }

    const after = advanceHawl(stuck, { now: due, net: 1000, nisab: 595 })
    expect(after.status).toBe(HAWL.RUNNING)
    expect(after.rolledOver).toBe(true)
    expect(after.startedAt).toBe(due.toISOString().slice(0, 10))
  })

  it('becomes due again a year after being paid', () => {
    const start = U(2024, 1, 10)
    const due1 = addHijriYears(start, 1)
    const paid = markPaid({ startedAt: '2024-01-10', paidFor: [] }, due1)
    const due2 = addHijriYears(due1, 1)
    expect(advanceHawl(paid, { now: due2, net: 1000, nisab: 595 }).status).toBe(HAWL.DUE)
  })

  it('does not double-count one payment across two years', () => {
    const start = U(2024, 1, 10)
    const due1 = addHijriYears(start, 1)
    let state = markPaid({ startedAt: '2024-01-10', paidFor: [] }, due1)
    expect(state.paidFor).toHaveLength(1)
    state = markPaid(state, due1)
    expect(state.paidFor).toHaveLength(1)
  })

  it('freezes rather than resetting when the metal price is unavailable', () => {
    // A blip in the metals API must not wipe someone's year of accrued hawl.
    const s = advanceHawl({ startedAt: '2024-01-10', paidFor: [] },
      { now: U(2024, 6, 1), net: 0, nisab: null, settings: { ...DEFAULT_SETTINGS, dipRule: 'reset' } })
    expect(s.startedAt).toBe('2024-01-10')
    expect(s.unknown).toBe(true)
  })
})

describe('rate and year basis', () => {
  it('is 2.5% over a lunar year', () => {
    expect(rateFor({ yearBasis: 'lunar' })).toBe(RATE_LUNAR)
    expect(RATE_LUNAR).toBe(0.025)
  })

  it('is scaled up for a solar year, which is ~11 days longer', () => {
    expect(rateFor({ yearBasis: 'solar' })).toBe(RATE_SOLAR)
    expect(RATE_SOLAR).toBeGreaterThan(RATE_LUNAR)
  })

  it('uses a Gregorian anniversary when the basis is solar', () => {
    const due = dueDateFrom(U(2024, 3, 1), { ...DEFAULT_SETTINGS, yearBasis: 'solar' })
    expect(due.getTime()).toBe(U(2025, 3, 1).getTime())
  })

  it('uses a Hijri anniversary when the basis is lunar', () => {
    const start = U(2024, 3, 1)
    const due = dueDateFrom(start, DEFAULT_SETTINGS)
    expect(toHijri(due).y).toBe(toHijri(start).y + 1)
  })
})

describe('computeZakat, end to end', () => {
  const holdings = [h('fiat:usd', 10000), h('bitcoin', 20000)]

  it('reports below nisab with how far short', () => {
    const out = computeZakat({ holdings: [h('fiat:usd', 100)], prices: PRICES, now: U(2024, 1, 1) })
    expect(out.aboveNisab).toBe(false)
    expect(out.shortBy).toBeCloseTo(495, 6)
    expect(out.amount).toBe(0)
  })

  it('owes nothing while the year is still running', () => {
    const out = computeZakat({ holdings, prices: PRICES, hawl: { startedAt: '2024-01-10', paidFor: [] }, now: U(2024, 6, 1) })
    expect(out.status).toBe(HAWL.RUNNING)
    expect(out.amount).toBe(0)
    expect(out.daysRemaining).toBeGreaterThan(0)
    expect(out.daysElapsed).toBeGreaterThan(100)
  })

  it('charges 2.5% of net wealth when the year completes', () => {
    const due = addHijriYears(U(2024, 1, 10), 1)
    const out = computeZakat({ holdings, prices: PRICES, hawl: { startedAt: '2024-01-10', paidFor: [] }, now: due })
    expect(out.status).toBe(HAWL.DUE)
    expect(out.amount).toBeCloseTo(750, 6)   // 30000 * 0.025
  })

  it('charges on net of debts', () => {
    const due = addHijriYears(U(2024, 1, 10), 1)
    const out = computeZakat({
      holdings, prices: PRICES, settings: { liabilities: 10000 },
      hawl: { startedAt: '2024-01-10', paidFor: [] }, now: due,
    })
    expect(out.amount).toBeCloseTo(500, 6)   // 20000 * 0.025
  })

  it('says the nisab is unknown rather than showing zero', () => {
    const out = computeZakat({ holdings, prices: {}, now: U(2024, 1, 1) })
    expect(out.nisabKnown).toBe(false)
    expect(out.nisab).toBeNull()
    expect(out.amount).toBe(0)
  })

  it('survives an empty portfolio', () => {
    const out = computeZakat({ holdings: [], prices: PRICES, now: U(2024, 1, 1) })
    expect(out.net).toBe(0)
    expect(out.status).toBe(HAWL.BELOW)
    expect(out.amount).toBe(0)
  })
})

describe('nextRamadan', () => {
  it('finds a date that is actually in Ramadan', () => {
    const r = nextRamadan(U(2024, 1, 1))
    expect(toHijri(r).m).toBe(9)
    expect(toHijri(r).d).toBe(1)
  })

  it('is always in the future', () => {
    for (const now of [U(2024, 1, 1), U(2024, 3, 20), U(2024, 12, 31), U(2025, 6, 15)]) {
      expect(daysBetween(now, nextRamadan(now))).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('zakat state survives a device migration', () => {
  it('backs up the hawl, the settings and the intents', async () => {
    // The hawl start date is the one thing in this feature that cannot be
    // recomputed — it records the day wealth first reached nisab. Losing it on
    // a restore silently restarts the zakat year and moves the date owed.
    const { BACKUP_KEYS } = await import('./backupCore')
    expect(BACKUP_KEYS).toContain('wl_zakat_hawl')
    expect(BACKUP_KEYS).toContain('wl_zakat_settings')
    expect(BACKUP_KEYS).toContain('wl_zakat_intents')
  })

  it('leaves the derived due date behind', async () => {
    // Regenerated from the restored hawl on the first visit to the calculator.
    const { BACKUP_KEYS, DEVICE_ONLY_KEYS } = await import('./backupCore')
    expect(BACKUP_KEYS).not.toContain('wl_zakat_due')
    expect(DEVICE_ONLY_KEYS).toContain('wl_zakat_due')
  })
})
