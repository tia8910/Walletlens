import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validEnd, applyRemote, currentEndsAt, timeLeft, popupDue, closePopup, POPUP_SNOOZE_MS } from './bybitOffer'
import { DEVICE_ONLY_KEYS } from './backupCore'

const here = dirname(fileURLToPath(import.meta.url))
const END = Date.parse('2026-10-14T09:00:00Z')

describe('the Bybit popup', () => {
  beforeEach(() => localStorage.clear())

  it('reads the end date from offers.json and drops a bad or missing one', () => {
    expect(validEnd('2026-10-14T09:00:00Z')).toBe(END)
    expect(validEnd('next week')).toBeNull()
    expect(validEnd('2026-10-14')).toBeNull()
    applyRemote({ enabled: true, bybit: { bonus: '$20', endsAt: '2026-10-14T09:00:00Z' } })
    expect(currentEndsAt()).toBe(END)
    applyRemote({ enabled: true, bybit: { bonus: '$20' } })
    expect(currentEndsAt()).toBeNull()
  })

  it('counts down to the real deadline and stops at it', () => {
    const now = END - ((4 * 24 + 15) * 3600 + 59 * 60 + 10) * 1000
    expect(timeLeft(END, now)).toEqual({ d: 4, h: 15, m: 59, s: 10 })
    expect(timeLeft(END, END)).toBeNull()
  })

  it('is due only while allowed and before the end', () => {
    const now = END - 1000
    expect(popupDue({ now, allowed: true, end: END })).toBe(true)
    expect(popupDue({ now, allowed: false, end: END })).toBe(false)
    expect(popupDue({ now: END, allowed: true, end: END })).toBe(false)
    expect(popupDue({ now, allowed: true, end: null })).toBe(false)
  })

  it('waits a day after Later, and ends after a claim or Don\'t show again', () => {
    const now = END - 3 * POPUP_SNOOZE_MS
    closePopup('later', now)
    expect(popupDue({ now: now + 1000, allowed: true, end: END })).toBe(false)
    expect(popupDue({ now: now + POPUP_SNOOZE_MS + 1, allowed: true, end: END })).toBe(true)
    closePopup('done', now)
    expect(popupDue({ now: now + 2 * POPUP_SNOOZE_MS, allowed: true, end: END })).toBe(false)
  })

  it('keeps its state on this device only', () => {
    expect(DEVICE_ONLY_KEYS).toContain('wl_bybit_popup')
    expect(DEVICE_ONLY_KEYS).toContain('wl_bybit_ends')
  })

  it('is on Home, and the site sets a deadline', () => {
    const dash = readFileSync(join(here, 'pages/Dashboard.jsx'), 'utf8')
    expect(dash).toMatch(/<BybitPopup blocked=/)
    const offers = JSON.parse(readFileSync(join(here, '../public/offers.json'), 'utf8'))
    expect(validEnd(offers.bybit.endsAt)).not.toBeNull()
  })

  it('is translated everywhere', () => {
    for (const l of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const s = readFileSync(join(here, `i18n/${l}.js`), 'utf8')
      for (const k of ['byPopHead', 'byPopS1', 'byPopS2', 'byPopEnds', 'byPopCta', 'byPopNever']) expect(s, `${l} ${k}`).toContain(`${k}:`)
    }
  })
})
