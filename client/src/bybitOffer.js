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
import { track, trackReferral } from './analytics'

export const BYBIT_URL = 'https://www.bybit.com/invite?ref=BM64KOV&medium=referral&utm_campaign=evergreen'
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

// Read once per session and remembered, so an offline phone keeps the last
// answer instead of guessing.
let remoteChecked = false
function checkRemote() {
  if (remoteChecked || typeof fetch === 'undefined') return
  remoteChecked = true
  fetch('/offers.json', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      if (!j || typeof j.enabled !== 'boolean') return
      try { localStorage.setItem(REMOTE_KEY, j.enabled ? '1' : '0') } catch {}
      emit()
    })
    .catch(() => {})
}

const listeners = new Set()
function emit() { listeners.forEach(fn => fn()) }

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

// ── The strip's dismissal ───────────────────────────────────────────────────

const STRIP_KEY = 'wl_bybit_strip_hidden_until'
export const STRIP_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

export function stripHidden(now = Date.now()) {
  try { return Number(localStorage.getItem(STRIP_KEY) || 0) > now } catch { return false }
}
export function hideStrip(now = Date.now()) {
  try { localStorage.setItem(STRIP_KEY, String(now + STRIP_SNOOZE_MS)) } catch {}
  track('bybit_offer_dismiss', { source: 'holdings' })
}

// ── Clicks ──────────────────────────────────────────────────────────────────

/** Opens the referral link and records which placement sent it. No personal data. */
export function openBybit(placement) {
  try {
    track('exchange_referral_click', { exchange: 'Bybit', source: placement })
    trackReferral({ exchange: 'Bybit', source: placement })
  } catch { /* analytics never blocks the link */ }
  try { window.open(BYBIT_URL, '_blank', 'noopener,noreferrer') } catch { /* no window */ }
}
