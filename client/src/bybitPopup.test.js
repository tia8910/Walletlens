import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validEnd, applyRemote, currentEndsAt, timeLeft, popupDue, closePopup, markPopupShown } from './bybitOffer'
import { DEVICE_ONLY_KEYS } from './backupCore'

const here = dirname(fileURLToPath(import.meta.url))
const END = Date.parse('2026-10-14T09:00:00Z')

describe('the Bybit popup', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

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

  it('shows once per session, and ends after a claim or Don\'t show again', () => {
    const now = END - 1000
    expect(popupDue({ now, allowed: true, end: END })).toBe(true)
    markPopupShown()
    expect(popupDue({ now, allowed: true, end: END })).toBe(false)
    // A new session: the app opened again.
    sessionStorage.clear()
    expect(popupDue({ now, allowed: true, end: END })).toBe(true)
    closePopup('later')
    expect(popupDue({ now, allowed: true, end: END })).toBe(false)
    sessionStorage.clear()
    expect(popupDue({ now, allowed: true, end: END })).toBe(true)
    closePopup('done')
    sessionStorage.clear()
    expect(popupDue({ now, allowed: true, end: END })).toBe(false)
  })

  it('keeps its state on this device only', () => {
    expect(DEVICE_ONLY_KEYS).toContain('wl_bybit_popup')
    expect(DEVICE_ONLY_KEYS).toContain('wl_bybit_ends')
  })

  it('is on every app screen, and the site sets a deadline', () => {
    const app = readFileSync(join(here, 'App.jsx'), 'utf8')
    expect(app).toMatch(/shellReady && !isLanding && \(onboardDone \|\| !\(isStandalone && isAndroid\)\) && <Suspense fallback=\{null\}><BybitPopup \/>/)
    const offers = JSON.parse(readFileSync(join(here, '../public/offers.json'), 'utf8'))
    expect(validEnd(offers.bybit.endsAt)).not.toBeNull()
  })

  it('is translated everywhere', () => {
    for (const l of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const s = readFileSync(join(here, `i18n/${l}.js`), 'utf8')
      for (const k of ['byPopHead', 'byPopS1', 'byPopS2', 'byPopEnds', 'byPopPartner', 'byPopCta', 'byPopNever']) expect(s, `${l} ${k}`).toContain(`${k}:`)
    }
  })
})

describe('the Bybit popup in Google Analytics', () => {
  const src = readFileSync(join(here, 'components/BybitOffer.jsx'), 'utf8')
  it('sends its own view, click and dismiss events', () => {
    for (const e of ['bybit_popup_view', 'bybit_popup_click', 'bybit_popup_dismiss']) expect(src).toContain(`'${e}'`)
    for (const via of ["'x'", "'outside'", "'escape'", "'never'"]) expect(src).toContain(via)
  })
  it('still feeds the shared referral report', () => {
    expect(src).toMatch(/trackReferralEvent\('referral_view', 'popup'/)
    expect(src).toMatch(/openBybit\('popup', 'crypto'\)/)
  })
})

describe('the Bybit popup appears promptly', () => {
  const src = readFileSync(join(here, 'components/BybitOffer.jsx'), 'utf8')
  it('opens 1.5 s in and re-checks every second behind another dialog', () => {
    expect(src).toMatch(/const OPEN_DELAY_MS = 1500/)
    expect(src).toMatch(/\}, 1000\) \}, OPEN_DELAY_MS\)/)
  })
  it('is not held back by a dialog kept hidden in the page', () => {
    expect(src).toMatch(/function screenBusy\(\)/)
    expect(src).toMatch(/getClientRects\(\)\.length/)
  })
})

describe('the Bybit reward is worded as Welcome Gifts', () => {
  it('names no amount in any language, and the partner card says the same', () => {
    for (const l of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const s = readFileSync(join(here, `i18n/${l}.js`), 'utf8')
      expect(s, l).toMatch(/byGift: "/)
      const pop = s.match(/byPopHead: "([^"]+)"/)[1]
      expect(pop, l).not.toMatch(/\$|20|USDT/)
    }
    const ex = readFileSync(join(here, 'components/ExchangePartners.jsx'), 'utf8')
    expect(ex).toContain("bonus: 'Get Welcome Gifts from our partner Bybit'")
    expect(ex).not.toMatch(/20 USDT/)
  })
})
