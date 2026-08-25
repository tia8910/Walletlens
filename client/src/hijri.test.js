import { describe, it, expect } from 'vitest'
import {
  toHijri, fromHijri, addHijriYears, formatHijri, daysBetween,
  hijriMonthLength, hijriSupported, RAMADAN,
} from './hijri'

const U = (y, m, d) => new Date(Date.UTC(y, m - 1, d))

describe('the runtime can do Hijri at all', () => {
  it('reports support', () => {
    expect(hijriSupported()).toBe(true)
  })
})

describe('Gregorian → Hijri', () => {
  // Fixed points, checked against the Umm al-Qura civil calendar.
  it('converts the 1445 new year', () => {
    expect(toHijri(U(2023, 7, 19))).toEqual({ y: 1445, m: 1, d: 1 })
  })

  it('converts the 1446 new year', () => {
    expect(toHijri(U(2024, 7, 7))).toEqual({ y: 1446, m: 1, d: 1 })
  })

  it('lands in Ramadan 1445 in March 2024', () => {
    const h = toHijri(U(2024, 3, 15))
    expect(h.y).toBe(1445)
    expect(h.m).toBe(RAMADAN)
  })
})

describe('Hijri → Gregorian', () => {
  it('round-trips every day across four years', () => {
    // The search window is the risky part: if the mean-year estimate ever
    // drifts past it, fromHijri returns null and a due date silently vanishes.
    let checked = 0
    for (let t = Date.UTC(2022, 0, 1); t <= Date.UTC(2026, 0, 1); t += 86400000) {
      const g = new Date(t)
      const h = toHijri(g)
      const back = fromHijri(h)
      expect(back, `${g.toISOString().slice(0, 10)} → ${h.y}-${h.m}-${h.d}`).not.toBeNull()
      expect(back.getTime()).toBe(t)
      checked++
    }
    expect(checked).toBeGreaterThan(1400)
  })

  it('rejects a month that does not exist', () => {
    expect(fromHijri({ y: 1446, m: 13, d: 1 })).toBeNull()
    expect(fromHijri({ y: 1446, m: 0, d: 1 })).toBeNull()
  })

  it('refuses day 30 of a 29-day month when clamping is off', () => {
    // Find a real 29-day month rather than assuming one.
    let short = null
    for (let m = 1; m <= 12 && !short; m++) {
      if (hijriMonthLength(1446, m) === 29) short = m
    }
    expect(short, 'some month of 1446 is 29 days').not.toBeNull()
    expect(fromHijri({ y: 1446, m: short, d: 30 }, { clamp: false })).toBeNull()
  })

  it('clamps day 30 to the last day there is', () => {
    let short = null
    for (let m = 1; m <= 12 && !short; m++) {
      if (hijriMonthLength(1446, m) === 29) short = m
    }
    const clamped = fromHijri({ y: 1446, m: short, d: 30 })
    expect(clamped).not.toBeNull()
    expect(toHijri(clamped)).toEqual({ y: 1446, m: short, d: 29 })
  })
})

describe('the zakat anniversary', () => {
  it('advances one Hijri year, not one Gregorian year', () => {
    const start = U(2024, 1, 15)
    const due = addHijriYears(start, 1)
    const h0 = toHijri(start)
    const h1 = toHijri(due)
    expect(h1.y).toBe(h0.y + 1)
    expect(h1.m).toBe(h0.m)
    expect(h1.d).toBe(h0.d)
  })

  it('comes round in roughly a lunar year, ~11 days short of a solar one', () => {
    const start = U(2024, 1, 15)
    const gap = daysBetween(start, addHijriYears(start, 1))
    expect(gap).toBeGreaterThanOrEqual(353)
    expect(gap).toBeLessThanOrEqual(356)
  })

  it('still returns a date when the anniversary day does not exist', () => {
    // Every 30th of a month, over two years: none may return null, because
    // zakat is owed in those years too.
    for (let y = 1445; y <= 1446; y++) {
      for (let m = 1; m <= 12; m++) {
        if (hijriMonthLength(y, m) !== 30) continue
        const start = fromHijri({ y, m, d: 30 })
        const due = addHijriYears(start, 1)
        expect(due, `30/${m}/${y} + 1y`).not.toBeNull()
      }
    }
  })

  it('drifts earlier through the Gregorian year, as a lunar date must', () => {
    const start = U(2024, 6, 1)
    const y1 = addHijriYears(start, 1)
    const y2 = addHijriYears(start, 2)
    expect(y1.getTime()).toBeLessThan(U(2025, 6, 1).getTime())
    expect(y2.getTime()).toBeLessThan(U(2026, 6, 1).getTime())
  })
})

describe('formatting', () => {
  it('names the month in English', () => {
    expect(formatHijri(U(2023, 7, 19))).toBe('1 Muharram 1445 AH')
  })

  it('uses Arabic numerals and month names in Arabic', () => {
    const s = formatHijri(U(2023, 7, 19), { locale: 'ar' })
    expect(s).toMatch(/[؀-ۿ]/)
  })
})

describe('daysBetween', () => {
  it('ignores the time of day', () => {
    const a = new Date(Date.UTC(2024, 0, 1, 23, 59))
    const b = new Date(Date.UTC(2024, 0, 2, 0, 1))
    expect(daysBetween(a, b)).toBe(1)
  })

  it('goes negative for a date already passed', () => {
    expect(daysBetween(U(2024, 5, 10), U(2024, 5, 1))).toBe(-9)
  })
})
