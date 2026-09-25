// Exchange partner offers — the referral links and every rule about where they
// may appear.
//
// Four placements read from here: the Rewards Vault card on the dashboard,
// "where to buy" on a crypto asset's page, "where did you buy?" in the buy
// ticket, and the starter pack shown once after setup. They all go through
// offersAllowed(), so there is one switch for all of them:
//
//   • the person's own setting (Settings → Show partner offers),
//   • a remote switch, /offers.json on the site, so the offers can be turned
//     off everywhere within minutes (the Play app loads the site, so no app
//     update is needed) if a store or regulator objects,
//   • and a region check. Crypto promotions in the UK must be approved by an
//     FCA-authorised firm, and Binance.com and Bybit do not serve the US, so
//     the offers stay hidden where the phone's time zone says UK or US.
//
// Every placement carries the disclosure line (a referral link, WalletLens may
// earn a commission, terms apply) and every amount is "up to": the bonuses are
// conditional (ID check, deposit, trading) and are set by each exchange.

import { useEffect, useState } from 'react'
import { track, trackReferral } from './analytics'

export const REFERRAL_EXCHANGES = [
  {
    id: 'binance', name: 'Binance', reward: '100 USD',
    url: 'https://www.binance.com/register?ref=46303978',
    color: '#F0B90B', ink: '#1a1400', bg: '#1a1400', subKey: 'refSubBinance',
  },
  {
    id: 'okx', name: 'OKX', reward: '100 USDT',
    url: 'https://okx.com/join/85929296',
    color: '#BEF227', ink: '#0a0f00', bg: '#0a0a0f', subKey: 'refSubOkx',
  },
  {
    id: 'bybit', name: 'Bybit', reward: '$20',
    url: 'https://www.bybit.com/invite?ref=BM64KOV&medium=referral&utm_campaign=evergreen',
    color: '#F7A600', ink: '#1a1000', bg: '#1a1000', subKey: 'refSubBybit',
  },
]

/** The combined headline figure: 100 + 100 + 20. */
export const REFERRAL_TOTAL = '$220'

// ── Region ──────────────────────────────────────────────────────────────────

const UK_ZONES = new Set(['Europe/London', 'Europe/Belfast', 'Europe/Jersey', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'GB', 'GB-Eire'])
const US_ZONES = new Set([
  'America/New_York', 'America/Detroit', 'America/Chicago', 'America/Menominee', 'America/Denver', 'America/Boise',
  'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'America/Juneau', 'America/Sitka', 'America/Metlakatla',
  'America/Yakutat', 'America/Nome', 'America/Adak', 'Pacific/Honolulu', 'America/Puerto_Rico',
])
const US_PREFIXES = ['US/', 'America/Indiana/', 'America/Kentucky/', 'America/North_Dakota/']

/** Whether a time zone places the phone in the UK or the US. */
export function restrictedZone(tz) {
  if (!tz) return false
  return UK_ZONES.has(tz) || US_ZONES.has(tz) || US_PREFIXES.some(p => tz.startsWith(p))
}

function currentZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { return '' }
}

// ── Switches ────────────────────────────────────────────────────────────────

const REMOTE_KEY = 'wl_offers_remote'
const SETTINGS_KEY = 'wl_settings'

function readSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } catch { return {} }
}

/** The person's own choice; on unless they turned it off. */
export function offersSettingOn() {
  return readSettings().showOffers !== false
}

export function setOffersSetting(on) {
  try {
    const s = readSettings()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, showOffers: !!on }))
  } catch { /* private mode */ }
  emit()
}

// Off until the site says on. Failing closed means a phone that has never
// reached /offers.json shows nothing, and turning the offers on or off is a
// one-line change to that file.
function remoteOn() {
  try { return localStorage.getItem(REMOTE_KEY) === '1' } catch { return false }
}

/**
 * Whether partner offers may be shown at all. `zone` and `remote` are there
 * for tests; the app passes nothing.
 */
export function offersAllowed({ zone = currentZone(), remote = remoteOn(), setting = offersSettingOn() } = {}) {
  return setting && remote && !restrictedZone(zone)
}

// The remote switch is read once per session and remembered, so a phone that
// is offline keeps the last answer instead of guessing.
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

/** Re-renders when any switch changes. */
export function useOffersAllowed() {
  const [, bump] = useState(0)
  useEffect(() => {
    const fn = () => bump(n => n + 1)
    listeners.add(fn)
    checkRemote()
    return () => { listeners.delete(fn) }
  }, [])
  return offersAllowed()
}

// ── Clicks ──────────────────────────────────────────────────────────────────

/** Opens an exchange's referral link and records which placement sent it. */
export function openReferral(ex, placement) {
  try {
    track('exchange_referral_click', { exchange: ex.name, source: placement })
    trackReferral({ exchange: ex.name, source: placement })
  } catch { /* analytics never blocks the link */ }
  try { window.open(ex.url, '_blank', 'noopener,noreferrer') } catch { /* no window */ }
}

// ── Remembered state for the vault and the starter pack ────────────────────

const VAULT_KEY = 'wl_rewards_vault'
const STARTER_KEY = 'wl_starter_pack_seen'

export function readVault() {
  try {
    const v = JSON.parse(localStorage.getItem(VAULT_KEY) || '{}')
    return { opened: Array.isArray(v.opened) ? v.opened : [], hidden: !!v.hidden }
  } catch { return { opened: [], hidden: false } }
}
export function writeVault(v) {
  try { localStorage.setItem(VAULT_KEY, JSON.stringify(v)) } catch {}
}

export function starterPackSeen() {
  try { return localStorage.getItem(STARTER_KEY) === '1' } catch { return true }
}
export function markStarterPackSeen() {
  try { localStorage.setItem(STARTER_KEY, '1') } catch {}
}
