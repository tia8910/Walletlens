// The Bybit referral: the link, and every rule about where it may appear.
//
// Two placements read from here, both on crypto only: a card on a crypto
// asset's page (under the smart money flow card) and a slim strip after the
// crypto holdings. Both go through bybitAllowed(), so there is one switch:
//
//   • a remote switch, /offers.json on the site, so the offer can be turned
//     off everywhere within minutes (the Play app loads the site, so no app
//     update is needed) if a store or regulator objects;
//   • a region check. Bybit does not serve the US, the UK, Canada, Singapore,
//     mainland China or sanctioned countries, and a UK crypto promotion needs
//     an FCA-authorised approver, so the offer stays hidden where the phone's
//     time zone says it is in one of those.
//
// Every placement carries the disclosure line: a referral link, the bonus is
// paid by Bybit, terms apply.

import { useEffect, useState } from 'react'
import { track } from './analytics'
import { INTERESTS_EVENT } from './data/interestsEvent'

export const BYBIT_URL = 'https://www.bybit.com/invite?ref=BM64KOV&medium=referral&utm_campaign=evergreen'
/** The bonus shown when the site has not said otherwise. */
export const BYBIT_BONUS = '$20'

// ── Region ──────────────────────────────────────────────────────────────────

const BLOCKED_ZONES = new Set([
  // United Kingdom and Crown dependencies
  'Europe/London', 'Europe/Belfast', 'Europe/Jersey', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'GB', 'GB-Eire',
  // United States
  'America/New_York', 'America/Detroit', 'America/Chicago', 'America/Menominee', 'America/Denver', 'America/Boise',
  'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'America/Juneau', 'America/Sitka', 'America/Metlakatla',
  'America/Yakutat', 'America/Nome', 'America/Adak', 'Pacific/Honolulu', 'America/Puerto_Rico',
  // Canada
  'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns',
  'America/Regina', 'America/Moncton', 'America/Whitehorse', 'America/Yellowknife', 'America/Iqaluit',
  // Singapore, mainland China, and sanctioned countries
  'Asia/Singapore', 'Singapore', 'Asia/Shanghai', 'Asia/Urumqi', 'Asia/Chongqing', 'Asia/Harbin', 'PRC',
  'Asia/Pyongyang', 'Asia/Tehran', 'Iran', 'America/Havana', 'Cuba', 'Asia/Damascus', 'Europe/Simferopol',
])
const BLOCKED_PREFIXES = ['US/', 'Canada/', 'America/Indiana/', 'America/Kentucky/', 'America/North_Dakota/']

/** Whether a time zone places the phone where Bybit may not be promoted. */
export function restrictedZone(tz) {
  if (!tz) return false
  return BLOCKED_ZONES.has(tz) || BLOCKED_PREFIXES.some(p => tz.startsWith(p))
}

function currentZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { return '' }
}

// ── Remote switch ───────────────────────────────────────────────────────────

const REMOTE_KEY = 'wl_offers_remote'
const BONUS_KEY = 'wl_bybit_bonus'

// Off until the site says on. Failing closed means a phone that has never
// reached /offers.json shows nothing, and turning the offer off is a
// one-line change to that file.
function remoteOn() {
  try { return localStorage.getItem(REMOTE_KEY) === '1' } catch { return false }
}

/** Whether the offer may be shown. The arguments are there for tests. */
export function bybitAllowed({ zone = currentZone(), remote = remoteOn() } = {}) {
  return remote && !restrictedZone(zone)
}

// ── The amount ──────────────────────────────────────────────────────────────
//
// Bybit changes its sign-up reward from time to time. The amount lives in
// /offers.json next to the on/off switch, so a new figure reaches every card
// and strip (and the Play app) with a one-line edit, no release:
//
//   { "enabled": true, "bybit": { "bonus": "$30" } }
//
// Only a plain amount is accepted — "$30", "€25", "50 USDT" — so a typo in the
// file cannot put arbitrary text into a promotion. Anything else, or no value
// at all, falls back to BYBIT_BONUS.

const AMOUNT = /^(?:[$€£]\s?\d{1,5}(?:[.,]\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?\s?(?:USD|USDT|USDC|EUR))$/

/** The amount if it is a plain amount, otherwise null. */
export function validBonus(v) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length <= 12 && AMOUNT.test(t) ? t : null
}

/** The amount to show: the site's, as last read, or the default. */
export function currentBonus() {
  try { return validBonus(localStorage.getItem(BONUS_KEY)) || BYBIT_BONUS } catch { return BYBIT_BONUS }
}

/** Stores what the switch file says. Exported for tests. */
export function applyRemote(j) {
  if (!j || typeof j.enabled !== 'boolean') return false
  try {
    localStorage.setItem(REMOTE_KEY, j.enabled ? '1' : '0')
    const bonus = validBonus(j.bybit?.bonus)
    if (bonus) localStorage.setItem(BONUS_KEY, bonus)
    // Removed from the file means back to the default, not stuck on the old one.
    else if (!j.bybit || j.bybit.bonus === undefined) localStorage.removeItem(BONUS_KEY)
  } catch { /* private mode */ }
  return true
}

// Read once per session and remembered, so an offline phone keeps the last
// answer instead of guessing.
let remoteChecked = false
function checkRemote() {
  if (remoteChecked || typeof fetch === 'undefined') return
  remoteChecked = true
  fetch('/offers.json', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(j => { if (applyRemote(j)) emit() })
    .catch(() => {})
}

const listeners = new Set()
function emit() { listeners.forEach(fn => fn()) }

/** Whether to show the offer, and for how much. Re-renders when either changes. */
export function useBybitOffer() {
  const allowed = useBybitAllowed()
  return { allowed, bonus: currentBonus() }
}

/** Re-renders when the switch changes. */
export function useBybitAllowed() {
  const [, bump] = useState(0)
  useEffect(() => {
    const fn = () => bump(n => n + 1)
    listeners.add(fn)
    checkRemote()
    return () => { listeners.delete(fn) }
  }, [])
  return bybitAllowed()
}

// ── Interest ────────────────────────────────────────────────────────────────

/**
 * Whether this person chose crypto in the interest picker.
 *
 * An explicit choice, unlike the price ticker's default: the ticker is
 * information and can assume, an offer is a promotion and should be earned.
 * Someone who already holds crypto sees the strip under that list anyway.
 */
export function pickedCrypto() {
  try {
    const v = JSON.parse(localStorage.getItem('wl_interests') || 'null')
    return Array.isArray(v) && v.includes('crypto')
  } catch { return false }
}

/** Whether this person chose stocks (or ETFs) in the interest picker. */
export function pickedStocks() {
  try {
    const v = JSON.parse(localStorage.getItem('wl_interests') || 'null')
    return Array.isArray(v) && (v.includes('stocks') || v.includes('etfs'))
  } catch { return false }
}

/** Whether this person chose gold, silver or commodities in the interest picker. */
export function pickedMetals() {
  try {
    const v = JSON.parse(localStorage.getItem('wl_interests') || 'null')
    return Array.isArray(v) && ['gold', 'silver', 'commodities'].some(k => v.includes(k))
  } catch { return false }
}

/**
 * Which Bybit offer the interest picker earns: 'crypto', 'stocks', 'metals'
 * or null. One offer per person, in that order.
 */
export function pickedOffer() {
  return pickedCrypto() ? 'crypto' : pickedStocks() ? 'stocks' : pickedMetals() ? 'metals' : null
}

/** pickedOffer(), kept current when the picker is saved again from Settings. */
export function usePickedOffer() {
  const [on, setOn] = useState(pickedOffer)
  useEffect(() => {
    const sync = () => setOn(pickedOffer())
    window.addEventListener(INTERESTS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(INTERESTS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return on
}

// ── The strip's dismissal ───────────────────────────────────────────────────

const STRIP_KEY = 'wl_bybit_strip_hidden_until'
export const STRIP_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

export function stripHidden(now = Date.now()) {
  try { return Number(localStorage.getItem(STRIP_KEY) || 0) > now } catch { return false }
}
export function hideStrip(now = Date.now(), placement = 'holdings', offer = 'crypto') {
  try { localStorage.setItem(STRIP_KEY, String(now + STRIP_SNOOZE_MS)) } catch {}
  trackReferralEvent('referral_dismiss', placement, offer)
}

// ── Analytics ───────────────────────────────────────────────────────────────
//
// Three GA4 events, one set of parameters, so views, clicks and dismissals
// line up in one report and click-through is clicks ÷ views:
//
//   referral_view     the offer was at least half on screen (once per
//                     placement per session, however often it re-renders)
//   referral_click    the button was tapped — the one to mark as a key event
//   referral_dismiss  the strip's ✕
//
//   exchange   'Bybit'
//   placement  where: asset_page, technicals, holdings, dashboard_interest, …
//   offer      what: crypto | stocks | metals
//   bonus      the amount shown, as read from offers.json
//
// Nothing about the person or their portfolio rides along.

export const REFERRAL_EXCHANGE = 'Bybit'

function referralParams(placement, offer) {
  return { exchange: REFERRAL_EXCHANGE, placement, offer, bonus: currentBonus() }
}

/** Sends one referral event. Never throws: analytics must not block the link. */
export function trackReferralEvent(name, placement, offer = 'crypto', extra = {}) {
  try { track(name, { ...referralParams(placement, offer), ...extra }) } catch { /* ignore */ }
}

const viewed = new Set()
// The ref callback is recreated on every render; watching each element once
// keeps that from stacking observers on the same card.
const watched = typeof WeakSet !== 'undefined' ? new WeakSet() : null

/**
 * Fires referral_view once per placement and offer per session, when the
 * element is at least half visible. Returns a ref callback for the element.
 */
export function viewRef(placement, offer = 'crypto') {
  return (el) => {
    const key = `${placement}:${offer}`
    if (!el || viewed.has(key) || watched?.has(el)) return
    watched?.add(el)
    if (typeof IntersectionObserver === 'undefined') {
      viewed.add(key); trackReferralEvent('referral_view', placement, offer); return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting) && !viewed.has(key)) {
        viewed.add(key)
        trackReferralEvent('referral_view', placement, offer)
        io.disconnect()
      }
    }, { threshold: 0.5 })
    io.observe(el)
  }
}

// ── Clicks ──────────────────────────────────────────────────────────────────

/** Opens the referral link and records which placement and offer sent it. */
export function openBybit(placement, offer = 'crypto') {
  // 'beacon' so the hit leaves even as the browser switches to Bybit.
  trackReferralEvent('referral_click', placement, offer, { transport_type: 'beacon' })
  try { window.open(BYBIT_URL, '_blank', 'noopener,noreferrer') } catch { /* no window */ }
}
