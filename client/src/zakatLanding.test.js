import { describe, it, expect } from 'vitest'
import { computeZakatFromInputs } from './pages/ZakatCalculatorPage'
import {
  GRAMS_PER_TROY_OZ, NISAB_GOLD_GRAMS, NISAB_SILVER_GRAMS, RATE_LUNAR, RATE_SOLAR,
} from './zakat'

// The landing calculator is the page's whole reason to exist, and its output is
// a religious obligation rather than a nice-to-have figure. These fix the
// arithmetic that a rendered screenshot would show as plausible either way.

// Round numbers so an expectation reads as the sum a person would do by hand.
const GOLD_OZ = 2000
const SILVER_OZ = 25

const base = { goldPerOz: GOLD_OZ, silverPerOz: SILVER_OZ }

describe('nisab', () => {
  it('prices the silver standard at 595 grams', () => {
    const { nisab } = computeZakatFromInputs(base)
    expect(nisab).toBeCloseTo((NISAB_SILVER_GRAMS / GRAMS_PER_TROY_OZ) * SILVER_OZ, 6)
  })

  it('prices the gold standard at 85 grams', () => {
    const { nisab } = computeZakatFromInputs({ ...base, standard: 'gold' })
    expect(nisab).toBeCloseTo((NISAB_GOLD_GRAMS / GRAMS_PER_TROY_OZ) * GOLD_OZ, 6)
  })

  it('puts the gold threshold far above the silver one', () => {
    // This is the entire reason the standard is offered as a choice rather
    // than hard-coded: at any modern metal price the two are nowhere near
    // each other, and which one you use decides whether you owe anything.
    const silver = computeZakatFromInputs(base).nisab
    const gold = computeZakatFromInputs({ ...base, standard: 'gold' }).nisab
    expect(gold).toBeGreaterThan(silver * 5)
  })

  it('reports null rather than zero when no metal price is available', () => {
    // Zero would read as "nisab is $0", which makes every visitor liable.
    const { nisab, due, amount } = computeZakatFromInputs({ cash: 100000 })
    expect(nisab).toBeNull()
    expect(due).toBe(false)
    expect(amount).toBe(0)
  })
})

describe('what is counted', () => {
  it('converts gold and silver by weight, not by count', () => {
    const { goldValue, silverValue } = computeZakatFromInputs({
      ...base, goldGrams: GRAMS_PER_TROY_OZ, silverGrams: GRAMS_PER_TROY_OZ * 2,
    })
    expect(goldValue).toBeCloseTo(GOLD_OZ, 6)
    expect(silverValue).toBeCloseTo(SILVER_OZ * 2, 6)
  })

  it('counts shares held to trade in full', () => {
    const { shareValue } = computeZakatFromInputs({ ...base, shares: 10000, sharesLongTerm: false })
    expect(shareValue).toBe(10000)
  })

  it('counts long-term shares at the 30% approximation', () => {
    const { shareValue } = computeZakatFromInputs({ ...base, shares: 10000, sharesLongTerm: true })
    expect(shareValue).toBeCloseTo(3000, 6)
  })

  it('subtracts debts that are due', () => {
    const { net } = computeZakatFromInputs({ ...base, cash: 10000, debts: 2500 })
    expect(net).toBe(7500)
  })

  it('floors at zero when debts exceed assets', () => {
    // Owing more than you hold means no zakat, never a negative obligation.
    const { net, amount } = computeZakatFromInputs({ ...base, cash: 1000, debts: 9999 })
    expect(net).toBe(0)
    expect(amount).toBe(0)
  })
})

describe('the rate and the threshold', () => {
  const wealthy = { ...base, cash: 100000 }

  it('is 2.5% over a lunar year', () => {
    const { rate, amount, due } = computeZakatFromInputs(wealthy)
    expect(due).toBe(true)
    expect(rate).toBe(RATE_LUNAR)
    expect(amount).toBeCloseTo(2500, 6)
  })

  it('is scaled to 2.577% over a solar year', () => {
    // A solar year is eleven days longer, so paying the lunar rate on it
    // underpays slightly and permanently.
    const { rate, amount } = computeZakatFromInputs({ ...wealthy, basis: 'solar' })
    expect(rate).toBe(RATE_SOLAR)
    expect(amount).toBeCloseTo(100000 * RATE_SOLAR, 6)
    expect(amount).toBeGreaterThan(2500)
  })

  it('owes nothing below nisab', () => {
    const nisab = computeZakatFromInputs(base).nisab
    const { due, amount } = computeZakatFromInputs({ ...base, cash: nisab - 1 })
    expect(due).toBe(false)
    expect(amount).toBe(0)
  })

  it('owes at exactly nisab, not only above it', () => {
    // "at or above" — an off-by-one here excuses the person right on the
    // threshold, which is the one case the rule is explicit about.
    const nisab = computeZakatFromInputs(base).nisab
    const { due, amount } = computeZakatFromInputs({ ...base, cash: nisab })
    expect(due).toBe(true)
    expect(amount).toBeCloseTo(nisab * RATE_LUNAR, 6)
  })
})

describe('input handling', () => {
  it('treats blanks, junk and negatives as nothing rather than as errors', () => {
    const { net } = computeZakatFromInputs({
      ...base, cash: '', goldGrams: 'abc', crypto: -500, shares: undefined,
    })
    expect(net).toBe(0)
  })

  it('accepts typed numbers with thousands separators', () => {
    // People paste "12,500" out of a banking app.
    const { net } = computeZakatFromInputs({ ...base, cash: '12,500' })
    expect(net).toBe(12500)
  })
})
