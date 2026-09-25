import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REFERRAL_EXCHANGES, restrictedZone, offersAllowed, offersSettingOn, setOffersSetting,
  readVault, writeVault, starterPackSeen, markStarterPackSeen,
} from './referrals'

// Partner referral links, and the safeguards every placement goes through.

const SRC = dirname(fileURLToPath(import.meta.url))
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8')

beforeEach(() => { localStorage.clear() })

describe('the links', () => {
  it('are the partner referral links', () => {
    expect(REFERRAL_EXCHANGES.map(e => e.url)).toEqual([
      'https://www.binance.com/register?ref=46303978',
      'https://okx.com/join/85929296',
      'https://www.bybit.com/invite?ref=BM64KOV&medium=referral&utm_campaign=evergreen',
    ])
  })
})

describe('where offers are hidden', () => {
  it('hides them in the UK, where crypto promotions need FCA approval', () => {
    for (const tz of ['Europe/London', 'Europe/Belfast', 'Europe/Jersey']) expect(restrictedZone(tz)).toBe(true)
  })

  it('hides them in the US, where these exchanges do not serve', () => {
    for (const tz of ['America/New_York', 'America/Los_Angeles', 'America/Indiana/Indianapolis', 'Pacific/Honolulu', 'US/Eastern']) {
      expect(restrictedZone(tz)).toBe(true)
    }
  })

  it('shows them elsewhere, including the rest of the Americas and Europe', () => {
    for (const tz of ['Africa/Cairo', 'Asia/Dubai', 'Europe/Paris', 'America/Toronto', 'America/Sao_Paulo', 'Asia/Riyadh', '']) {
      expect(restrictedZone(tz)).toBe(false)
    }
  })
})

describe('the switches', () => {
  it('needs the setting, the remote switch and an allowed region all at once', () => {
    expect(offersAllowed({ zone: 'Africa/Cairo', remote: true, setting: true })).toBe(true)
    expect(offersAllowed({ zone: 'Africa/Cairo', remote: false, setting: true })).toBe(false)
    expect(offersAllowed({ zone: 'Africa/Cairo', remote: true, setting: false })).toBe(false)
    expect(offersAllowed({ zone: 'Europe/London', remote: true, setting: true })).toBe(false)
  })

  it('is on until the person turns it off, and keeps their other settings', () => {
    localStorage.setItem('wl_settings', JSON.stringify({ currency: 'EGP' }))
    expect(offersSettingOn()).toBe(true)
    setOffersSetting(false)
    expect(offersSettingOn()).toBe(false)
    expect(JSON.parse(localStorage.getItem('wl_settings')).currency).toBe('EGP')
  })

  it('is off until the site switches it on', () => {
    // Held for now: offers.json ships disabled, and a phone that has not
    // heard from the site yet shows nothing either.
    expect(offersAllowed({ zone: 'Africa/Cairo', setting: true })).toBe(false)
    localStorage.setItem('wl_offers_remote', '1')
    expect(offersAllowed({ zone: 'Africa/Cairo', setting: true })).toBe(true)
  })

  it('ships the remote switch off, uncached', () => {
    expect(JSON.parse(readFileSync(join(SRC, '..', 'public', 'offers.json'), 'utf8')).enabled).toBe(false)
    expect(readFileSync(join(SRC, '..', 'public', '_headers'), 'utf8')).toMatch(/\/offers\.json\n\s+Content-Type: application\/json\n\s+Cache-Control: no-cache/)
  })
})

describe('what is remembered', () => {
  it('keeps unwrapped gifts and a hidden vault', () => {
    expect(readVault()).toEqual({ opened: [], hidden: false })
    writeVault({ opened: ['okx'], hidden: true })
    expect(readVault()).toEqual({ opened: ['okx'], hidden: true })
  })

  it('shows the starter pack once', () => {
    expect(starterPackSeen()).toBe(false)
    markStarterPackSeen()
    expect(starterPackSeen()).toBe(true)
  })
})

describe('every placement', () => {
  const offers = read('components', 'PartnerOffers.jsx')

  it('is gated and carries the disclosure', () => {
    for (const name of ['RewardsVault', 'WhereToBuy', 'NoExchangeOffer', 'StarterPack']) {
      const body = new RegExp(`export function ${name}\\([\\s\\S]*?\\n}\\n`).exec(offers)[0]
      expect(body, name).toMatch(/useOffersAllowed\(\)/)
      expect(body, name).toMatch(/<Disclosure/)
    }
  })

  it('says "up to" for every amount, in every language', () => {
    expect(offers).toMatch(/t\('refUpTo'\)\(ex\.reward\)/)
    for (const lang of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const file = read('i18n', `${lang}.js`)
      expect(file, lang).toMatch(/refDisclosure: "/)
      expect(file, lang).toMatch(/refUpTo: \(a\) =>/)
    }
  })
})
