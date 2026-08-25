// Zakat al-Mal calculator.
//
// Two rules drive every decision in this file.
//
// 1. THE HAWL RUNS ON THE POOL, NOT ON EACH ASSET.
//    The clock starts the day total zakatable wealth first reaches nisab.
//    Assets bought later are increments to that pool — they join the running
//    clock, they do not start their own. A per-asset clock ("your BTC: 8
//    months, not due yet") would tell people to underpay, which is the worst
//    thing this feature could do.
//
// 2. THE APP DOES NOT ISSUE FATWA.
//    Every contested input is a setting with a stated default, and the result
//    screen shows the assumptions it used. Where scholars differ, we offer the
//    choice rather than picking for the user and hiding it.
//
// Everything here is pure and takes `now`, so the year-boundary behaviour is
// testable instead of hoped-for. Storage wrappers are at the bottom.

import { categorizeAsset, GOLD_ID, SILVER_ID } from './data/assets'
import { isStablecoin } from './stablecoins'
import { addHijriYears, toHijri, daysBetween, RAMADAN, fromHijri } from './hijri'

export const GRAMS_PER_TROY_OZ = 31.1034768

// The two classical thresholds. Scholars cite 85g / 87.48g for gold and
// 595g / 612.36g for silver depending on the mithqal used; these are the
// widely published figures and the difference is under 3%.
export const NISAB_GOLD_GRAMS = 85
export const NISAB_SILVER_GRAMS = 595

// 1/40th over a lunar year. A solar year is ~11 days longer, so the rate is
// scaled to match — otherwise a solar-year payer underpays slightly forever.
export const RATE_LUNAR = 0.025
export const RATE_SOLAR = 0.02577

export const SOLAR_YEAR_DAYS = 365

export const DEFAULT_SETTINGS = {
  // Silver: the lower threshold, so more people qualify and more reaches
  // those entitled to it. What most contemporary zakat bodies use for cash.
  nisabStandard: 'silver',       // 'silver' | 'gold'
  yearBasis: 'lunar',            // 'lunar' | 'solar'
  // Hanafi: only the start and end of the year matter, dips in between are
  // ignored. Shafi'i/Maliki/Hanbali: wealth must stay at or above nisab
  // throughout or the clock restarts.
  dipRule: 'ignore',             // 'ignore' | 'reset'
  cryptoZakatable: true,
  // Long-term shares are zakatable on the company's underlying zakatable
  // assets, which a price feed cannot know. This is an approximation the user
  // can change, and it is labelled as one.
  longTermSharePortion: 0.30,
  liabilities: 0,
  anchorRamadan: false,
}

/** Value of nisab in USD, or null when we have no metal price to compute it. */
export function nisabValue({ standard = 'silver', goldPerOz, silverPerOz } = {}) {
  const perOz = standard === 'gold' ? goldPerOz : silverPerOz
  if (!Number.isFinite(perOz) || perOz <= 0) return null
  const grams = standard === 'gold' ? NISAB_GOLD_GRAMS : NISAB_SILVER_GRAMS
  return (grams / GRAMS_PER_TROY_OZ) * perOz
}

/** Pull gold/silver spot out of the price map the app already fetches. */
export function metalPrices(prices) {
  const g = prices?.[GOLD_ID]?.usd
  const s = prices?.[SILVER_ID]?.usd
  return {
    goldPerOz: Number.isFinite(g) ? g : null,
    silverPerOz: Number.isFinite(s) ? s : null,
  }
}

export const REASONS = {
  cash: 'cash',
  metals: 'metals',
  stable: 'stable',
  crypto: 'crypto',
  cryptoOff: 'cryptoOff',
  shareTrade: 'shareTrade',
  shareLong: 'shareLong',
  homeOrRental: 'homeOrRental',
  resell: 'resell',
}

/**
 * How much of one holding counts, and why.
 *
 * `portion` is 0..1 of market value. `reason` is a key the UI translates —
 * every row says why it was included or left out, because a number with no
 * explanation is not something anyone can check against their own scholar.
 */
export function classifyHolding(h, settings = DEFAULT_SETTINGS, intents = {}) {
  const cat = categorizeAsset(h)
  const id = h.coin_id

  if (cat === 'cash') return { portion: 1, reason: REASONS.cash }
  if (cat === 'metals') return { portion: 1, reason: REASONS.metals }

  if (cat === 'realestate') {
    // A home, or a property held to rent, is not itself zakatable. One bought
    // to resell is trade goods, and is zakatable at market value.
    return intents[id] === 'resell'
      ? { portion: 1, reason: REASONS.resell }
      : { portion: 0, reason: REASONS.homeOrRental }
  }

  if (cat === 'stocks') {
    // Held to trade: full market value. Held long-term: only the company's
    // underlying zakatable assets, approximated by a percentage.
    if (intents[id] === 'trade') return { portion: 1, reason: REASONS.shareTrade }
    const p = clamp01(settings.longTermSharePortion ?? DEFAULT_SETTINGS.longTermSharePortion)
    return { portion: p, reason: REASONS.shareLong }
  }

  // crypto — stablecoins are money by any reading, so they are not subject to
  // the "is crypto wealth?" toggle the way a volatile token is.
  if (isStablecoin(h.coin_id, h.coin_symbol)) return { portion: 1, reason: REASONS.stable }
  return settings.cryptoZakatable
    ? { portion: 1, reason: REASONS.crypto }
    : { portion: 0, reason: REASONS.cryptoOff }
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function holdingValue(h) {
  const v = Number(h?.value)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * Every holding, with how much of it counts. Rows come back sorted by the
 * amount they contribute so the biggest drivers are at the top.
 */
export function breakdown(holdings = [], settings = DEFAULT_SETTINGS, intents = {}) {
  const rows = holdings.map(h => {
    const value = holdingValue(h)
    const { portion, reason } = classifyHolding(h, settings, intents)
    return {
      id: h.coin_id,
      symbol: h.coin_symbol,
      name: h.coin_name || h.coin_symbol || h.coin_id,
      category: categorizeAsset(h),
      value,
      portion,
      counted: value * portion,
      reason,
    }
  })
  rows.sort((a, b) => b.counted - a.counted || b.value - a.value)
  const gross = rows.reduce((s, r) => s + r.counted, 0)
  const excluded = rows.reduce((s, r) => s + (r.value - r.counted), 0)
  return { rows, gross, excluded }
}

/**
 * Net zakatable wealth: what counts, less what you owe.
 *
 * Debts you owe are deducted — zakat is on net wealth. The app has no
 * liabilities model of its own, so this comes from a field the user fills in.
 */
export function netZakatable(holdings, settings = DEFAULT_SETTINGS, intents = {}) {
  const { gross, rows, excluded } = breakdown(holdings, settings, intents)
  const debts = Math.max(0, Number(settings.liabilities) || 0)
  return { gross, excluded, debts, net: Math.max(0, gross - debts), rows }
}

export function rateFor(settings = DEFAULT_SETTINGS) {
  return settings.yearBasis === 'solar' ? RATE_SOLAR : RATE_LUNAR
}

/** The due date one year on from `start`, in whichever calendar is in use. */
export function dueDateFrom(start, settings = DEFAULT_SETTINGS) {
  if (!start) return null
  if (settings.yearBasis === 'solar') {
    const d = new Date(start.getTime())
    d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d
  }
  return addHijriYears(start, 1)
}

export const HAWL = {
  BELOW: 'below',       // wealth under nisab — no clock running
  RUNNING: 'running',   // clock running, not yet due
  DUE: 'due',           // the year has completed and zakat is payable
}

/**
 * The hawl state machine.
 *
 * Takes the previous state and today's facts, returns the new state. Pure, so
 * the year boundary and the dip rules are testable rather than hoped-for.
 *
 * @param prev  { startedAt: ISO|null, paidFor: ISO[] } or null
 * @param now   Date
 * @param net   today's net zakatable wealth
 * @param nisab today's nisab value, or null if unknown
 */
export function advanceHawl(prev, { now, net, nisab, settings = DEFAULT_SETTINGS }) {
  const paidFor = Array.isArray(prev?.paidFor) ? prev.paidFor.slice() : []
  const startedAt = prev?.startedAt ? new Date(prev.startedAt) : null

  // No nisab price means we cannot judge anything. Freeze rather than guess:
  // resetting someone's clock because a metals API blipped would be worse
  // than showing them a stale state for an hour.
  if (nisab == null) {
    return { startedAt: startedAt ? iso(startedAt) : null, paidFor, status: startedAt ? HAWL.RUNNING : HAWL.BELOW, unknown: true }
  }

  const atOrAbove = net >= nisab

  if (!startedAt) {
    if (!atOrAbove) return { startedAt: null, paidFor, status: HAWL.BELOW }
    return { startedAt: iso(startOfDay(now)), paidFor, status: HAWL.RUNNING }
  }

  const due = dueDateFrom(startedAt, settings)
  const reached = due && daysBetween(now, due) <= 0

  if (!reached) {
    // Mid-year dip. Hanafi ignores it; the majority restart the clock.
    if (!atOrAbove && settings.dipRule === 'reset') {
      return { startedAt: null, paidFor, status: HAWL.BELOW, resetByDip: true }
    }
    return { startedAt: iso(startedAt), paidFor, status: HAWL.RUNNING }
  }

  // The year has completed.
  if (!atOrAbove) {
    // Below nisab on the day it fell due: nothing is owed for this year, and
    // the clock starts again only when wealth next reaches nisab.
    return { startedAt: null, paidFor, status: HAWL.BELOW, lapsed: true }
  }
  if (paidFor.includes(iso(due))) {
    // Already paid this year — the next hawl runs from the anniversary.
    return { startedAt: iso(due), paidFor, status: HAWL.RUNNING, rolledOver: true }
  }
  return { startedAt: iso(startedAt), paidFor, status: HAWL.DUE, dueAt: iso(due) }
}

/** Mark the year ending `due` as paid and roll the clock to the anniversary. */
export function markPaid(prev, due) {
  const paidFor = Array.isArray(prev?.paidFor) ? prev.paidFor.slice() : []
  const key = iso(due)
  if (!paidFor.includes(key)) paidFor.push(key)
  // Keep the list bounded — a decade of anniversaries is plenty of history.
  while (paidFor.length > 20) paidFor.shift()
  return { startedAt: key, paidFor }
}

/**
 * Everything the screen needs, in one call.
 */
export function computeZakat({ holdings = [], prices = {}, settings = DEFAULT_SETTINGS, intents = {}, hawl = null, now = new Date() } = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings }
  const { goldPerOz, silverPerOz } = metalPrices(prices)
  const nisab = nisabValue({ standard: s.nisabStandard, goldPerOz, silverPerOz })
  const wealth = netZakatable(holdings, s, intents)
  const next = advanceHawl(hawl, { now, net: wealth.net, nisab, settings: s })

  const startedAt = next.startedAt ? new Date(next.startedAt) : null
  const due = startedAt ? dueDateFrom(startedAt, s) : null
  const rate = rateFor(s)
  const amount = wealth.net * rate   // always show what is owed / projected

  return {
    settings: s,
    nisab,
    nisabKnown: nisab != null,
    goldPerOz,
    silverPerOz,
    ...wealth,
    aboveNisab: nisab != null && wealth.net >= nisab,
    shortBy: nisab != null && wealth.net < nisab ? nisab - wealth.net : 0,
    status: next.status,
    hawl: next,
    startedAt,
    dueAt: due,
    daysElapsed: startedAt ? daysBetween(startedAt, now) : 0,
    daysRemaining: due ? daysBetween(now, due) : null,
    yearLength: s.yearBasis === 'solar' ? SOLAR_YEAR_DAYS : 354,
    rate,
    amount,
  }
}

/** Next Ramadan 1st, for people who anchor their payment to it. */
export function nextRamadan(now = new Date()) {
  const h = toHijri(now)
  const thisYear = fromHijri({ y: h.y, m: RAMADAN, d: 1 })
  if (thisYear && daysBetween(now, thisYear) >= 0) return thisYear
  return fromHijri({ y: h.y + 1, m: RAMADAN, d: 1 })
}

function startOfDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
function iso(d) {
  const x = d instanceof Date ? d : new Date(d)
  return x.toISOString().slice(0, 10)
}

// ── Storage ───────────────────────────────────────────────────────────────
// Local only. The push service is told a date and never an amount — see
// notify-logic.js. Someone's wealth does not need to leave their phone for
// them to be reminded of a date.

const SETTINGS_KEY = 'wl_zakat_settings'
const HAWL_KEY = 'wl_zakat_hawl'
const INTENTS_KEY = 'wl_zakat_intents'
// Read by push.js when it registers. Only ever a date — see the privacy note
// on the zakat channel in notify-logic.js.
const DUE_KEY = 'wl_zakat_due'

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) }
  } catch { return { ...DEFAULT_SETTINGS } }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...s })) } catch { /* full or blocked */ }
}
export function loadHawl() {
  try {
    const raw = JSON.parse(localStorage.getItem(HAWL_KEY) || 'null')
    if (!raw || typeof raw !== 'object') return null
    return { startedAt: raw.startedAt || null, paidFor: Array.isArray(raw.paidFor) ? raw.paidFor : [] }
  } catch { return null }
}
export function saveHawl(h) {
  try { localStorage.setItem(HAWL_KEY, JSON.stringify({ startedAt: h?.startedAt || null, paidFor: h?.paidFor || [] })) } catch { /* ignore */ }
}
export function loadIntents() {
  try {
    const raw = JSON.parse(localStorage.getItem(INTENTS_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch { return {} }
}
export function saveIntents(m) {
  try { localStorage.setItem(INTENTS_KEY, JSON.stringify(m || {})) } catch { /* ignore */ }
}

/**
 * The due date the push service is allowed to know, as 'YYYY-MM-DD'.
 *
 * Written by the calculator, read by the push registration. It is a date and
 * nothing else: the amount, the portfolio value and whether the user is even
 * above nisab never leave the device.
 */
export function loadDueDate() {
  try {
    const v = localStorage.getItem(DUE_KEY)
    return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null
  } catch { return null }
}
export function saveDueDate(v) {
  try {
    if (v) localStorage.setItem(DUE_KEY, v)
    else localStorage.removeItem(DUE_KEY)
  } catch { /* ignore */ }
}
