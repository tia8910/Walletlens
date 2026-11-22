import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DAY_MS, deadlineMs, daysLeft, isPaused, stepsFor, sharesOk, readiness, planRows, planRowReady, looksLikeSecret,
} from './guardianModel'
import { GUARDIAN_COPY } from './guardianCopy'

const NOW = new Date('2027-03-01T12:00:00Z').getTime()
const iso = (t) => new Date(t).toISOString()

describe('Guardian deadline and steps', () => {
  it('counts from the last open, or from the end of a pause', () => {
    const cfg = { active: true, intervalDays: 60, lastCheckin: iso(NOW - 10 * DAY_MS) }
    expect(daysLeft(cfg, NOW)).toBe(50)
    const paused = { ...cfg, pausedUntil: iso(NOW + 20 * DAY_MS) }
    expect(isPaused(paused, NOW)).toBe(true)
    expect(deadlineMs(paused)).toBe(NOW + 80 * DAY_MS)
    expect(deadlineMs({ ...cfg, active: false })).toBe(0)
  })

  it('lists the steps in order, with the trusted person only when there is one', () => {
    expect(stepsFor(60).map(s => [s.id, s.day])).toEqual([['seen', 0], ['reminder', 53], ['email', 60], ['heirs', 74]])
    expect(stepsFor(30, { trusted: true }).map(s => s.id)).toEqual(['seen', 'reminder', 'email', 'trusted', 'heirs'])
  })

  it('shares are optional, but when set must add up to 100', () => {
    expect(sharesOk([{ share: null }, { share: null }])).toBe(true)
    expect(sharesOk([{ share: 60 }, { share: 40 }])).toBe(true)
    expect(sharesOk([{ share: 60 }, { share: 30 }])).toBe(false)
    expect(sharesOk([{ share: 60 }, { share: null }])).toBe(false)
  })
})

describe('legacy readiness', () => {
  it('scores what an heir would miss', () => {
    const cfg = { heirs: [{ share: 100 }], message: 'hi', plan: [{ sym: 'BTC', kind: 'hardware', place: 'Safe' }] }
    const r = readiness(cfg, { holdings: ['BTC', 'ETH'], notifications: true }, NOW)
    const done = Object.fromEntries(r.items.map(i => [i.id, i.done]))
    expect(done).toMatchObject({ heirs: true, message: true, plan: false, trusted: false, notify: true, backup: false })
    expect(r.items.find(i => i.id === 'plan')).toMatchObject({ ready: 1, total: 2 })
    expect(r.score).toBe(43)
  })

  it('builds one plan row per holding, keeping what was saved', () => {
    const rows = planRows(['btc', 'ETH', 'BTC'], [{ sym: 'BTC', kind: 'exchange', place: 'Binance' }])
    expect(rows.map(r => r.sym)).toEqual(['BTC', 'ETH'])
    expect(planRowReady(rows[0])).toBe(true)
    expect(planRowReady(rows[1])).toBe(false)
  })
})

describe('secrets never go into the plan', () => {
  it('spots a recovery phrase, a private key and an extended key', () => {
    expect(looksLikeSecret('abandon ability able about above absent absorb abstract absurd abuse access accident')).toBe(true)
    expect(looksLikeSecret('my words: abandon ability able about above absent absorb abstract absurd abuse access accident')).toBe(true)
    expect(looksLikeSecret('0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318')).toBe(true)
    expect(looksLikeSecret('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ')).toBe(true)
  })
  it('lets ordinary directions through', () => {
    expect(looksLikeSecret('Ledger in the home safe, recovery sheet with our lawyer Nadia')).toBe(false)
    expect(looksLikeSecret('Binance account in my name; call support with a death certificate')).toBe(false)
    expect(looksLikeSecret('')).toBe(false)
  })
})

describe('Guardian copy', () => {
  it('every language has every line, and functions stay functions', () => {
    const keys = Object.keys(GUARDIAN_COPY.en)
    for (const [lang, pack] of Object.entries(GUARDIAN_COPY)) {
      for (const k of keys) {
        expect(pack[k], `${lang}.${k}`).toBeDefined()
        expect(typeof pack[k], `${lang}.${k}`).toBe(typeof GUARDIAN_COPY.en[k])
      }
    }
  })
  it('uses no em dashes', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'guardianCopy.js'), 'utf8')
    expect(src).not.toContain('—')
  })
})

describe('the phone reminder on Android', () => {
  const java = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..',
    'walletlens_source/release_package/app/src/main/java/live/walletlens/twa', f), 'utf8')
  it('queues a week and three days ahead, replaced on every check-in, never an exact alarm', () => {
    const w = java('GuardianReminder.java')
    expect(w).toMatch(/deadlineMs - 7 \* DAY_MS/)
    expect(w).toMatch(/deadlineMs - 3 \* DAY_MS/)
    expect(w).toMatch(/ExistingWorkPolicy\.REPLACE/)
    expect(w).not.toMatch(/AlarmManager|setExact/)
    expect(java('WalletLensBridge.java')).toMatch(/@JavascriptInterface\s+public boolean scheduleGuardianReminder\(/)
    expect(java('WalletLensMessagingService.java')).toMatch(/case "guardian":/)
  })
  it('the web side moves both reminders after a check-in', () => {
    const pg = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'components/PortfolioGuardian.jsx'), 'utf8')
    const checkin = pg.slice(pg.indexOf('export async function silentCheckin'), pg.indexOf('function Field'))
    expect(checkin).toMatch(/syncGuardianReminders\(\)/)
    expect(pg).toMatch(/b\.scheduleGuardianReminder\(String\(at\)/)
  })
})
