import { describe, it, expect } from 'vitest'
import {
  dueZakatReminder, sanitizeZakatDue, parseDayKey, trimZakatSent,
  ZAKAT_MILESTONES, DEFAULT_PREFS, sanitizePrefs, COPY, copy,
  CHANNEL_URL, CHANNEL_DELIVERY, LANGS,
} from '../../push-api/notify-logic.js'
import { DEFAULT_PUSH_PREFS } from './push'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The zakat channel is the only one that fires without consulting a price,
// and the only one whose trigger the user set themselves a year earlier. What
// the server is told is a DATE — these tests pin that, because the privacy
// promise is the reason the feature is shaped this way.

describe('what the server is allowed to store', () => {
  it('accepts a plain calendar date', () => {
    const soon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
    expect(sanitizeZakatDue(soon)).toBe(soon)
  })

  it('rejects anything that is not a date', () => {
    for (const bad of ['', 'tomorrow', '2025-13-01', '2025-02-31', '20250101', 42, {}, [], true]) {
      expect(sanitizeZakatDue(bad), String(bad)).toBeNull()
    }
  })

  it('accepts an explicit null, which is how a paid year is cleared', () => {
    expect(sanitizeZakatDue(null)).toBeNull()
  })

  it('rejects a date too far out to have come from a zakat year', () => {
    const far = new Date(Date.now() + 3 * 365 * 86400000).toISOString().slice(0, 10)
    expect(sanitizeZakatDue(far)).toBeNull()
  })

  it('rejects a date long past', () => {
    const old = new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10)
    expect(sanitizeZakatDue(old)).toBeNull()
  })

  it('catches a day that rolls into the next month', () => {
    expect(parseDayKey('2025-02-31')).toBeNaN()
    expect(parseDayKey('2025-04-31')).toBeNaN()
    expect(Number.isFinite(parseDayKey('2024-02-29'))).toBe(true)  // leap year
  })
})

describe('which reminder fires', () => {
  const due = '2025-06-10'

  it('fires a month out, a week out, and on the day', () => {
    expect(dueZakatReminder({ dueDate: due, today: '2025-05-11' })).toMatchObject({ days: 30 })
    expect(dueZakatReminder({ dueDate: due, today: '2025-06-03' })).toMatchObject({ days: 7 })
    expect(dueZakatReminder({ dueDate: due, today: '2025-06-10' })).toMatchObject({ days: 0 })
  })

  it('stays quiet on every other day', () => {
    for (const today of ['2025-05-12', '2025-06-01', '2025-06-09', '2025-01-01']) {
      expect(dueZakatReminder({ dueDate: due, today }), today).toBeNull()
    }
  })

  it('never sends the same reminder twice', () => {
    const first = dueZakatReminder({ dueDate: due, today: '2025-06-10', sent: [] })
    expect(first).not.toBeNull()
    expect(dueZakatReminder({ dueDate: due, today: '2025-06-10', sent: [first.key] })).toBeNull()
  })

  it('keys reminders per due date, so next year still fires', () => {
    const a = dueZakatReminder({ dueDate: '2025-06-10', today: '2025-06-10' })
    const b = dueZakatReminder({ dueDate: '2026-05-30', today: '2026-05-30' })
    expect(a.key).not.toBe(b.key)
    expect(dueZakatReminder({ dueDate: '2026-05-30', today: '2026-05-30', sent: [a.key] })).not.toBeNull()
  })

  it('does not nag daily once the date has passed', () => {
    // Someone who has not paid does not need telling every morning; the app
    // shows the state, and this channel is not the place to keep pushing.
    for (const today of ['2025-06-11', '2025-06-20', '2025-08-01']) {
      expect(dueZakatReminder({ dueDate: due, today }), today).toBeNull()
    }
  })

  it('returns null rather than throwing on rubbish input', () => {
    expect(dueZakatReminder({ dueDate: null, today: '2025-06-10' })).toBeNull()
    expect(dueZakatReminder({ dueDate: due, today: 'nope' })).toBeNull()
    expect(dueZakatReminder({ dueDate: undefined, today: undefined })).toBeNull()
  })

  it('offers exactly the three milestones, longest first', () => {
    expect(ZAKAT_MILESTONES).toEqual([30, 7, 0])
  })
})

describe('the sent-key list stays bounded', () => {
  it('keeps the most recent keys', () => {
    const many = Array.from({ length: 40 }, (_, i) => `2025-01-01:${i}`)
    const kept = trimZakatSent(many)
    expect(kept.length).toBeLessThanOrEqual(12)
    expect(kept[kept.length - 1]).toBe('2025-01-01:39')
  })

  it('survives a corrupt stored value', () => {
    expect(trimZakatSent(null)).toEqual([])
    expect(trimZakatSent('nope')).toEqual([])
    expect(trimZakatSent([1, 'ok', {}])).toEqual(['ok'])
  })
})

describe('the channel is wired like every other one', () => {
  it('is on by default, on both sides', () => {
    expect(DEFAULT_PREFS.zakat).toBe(true)
    expect(DEFAULT_PUSH_PREFS).toEqual(DEFAULT_PREFS)
  })

  it('can be switched off', () => {
    expect(sanitizePrefs({ zakat: false }).zakat).toBe(false)
    expect(sanitizePrefs({}).zakat).toBe(true)
  })

  it('opens a route that exists', () => {
    // A notification is a cold navigation carrying nothing but a URL, and the
    // calculator lives on the analysis tab.
    expect(CHANNEL_URL.zakat).toBe('/dashboard?tab=tools')
  })

  it('expires in a day rather than web-push’s four-week default', () => {
    // Unlike a price, a due date is still true this evening.
    expect(CHANNEL_DELIVERY.zakat.ttl).toBe(24 * 60 * 60)
  })

  it('wakes the device, because it makes a sound', () => {
    // notificationSound.test.js holds the invariant that the loud channels and
    // the high-urgency ones are the same set. Asserted here too so the reason
    // sits next to the channel it applies to.
    expect(CHANNEL_DELIVERY.zakat.urgency).toBe('high')
  })

  it.each(LANGS)('has title and body copy in %s', (lang) => {
    for (const days of [30, 7, 0]) {
      const title = copy('zakatTitle', lang)(days)
      const body = copy('zakatBody', lang)(days)
      expect(typeof title).toBe('string')
      expect(title.trim().length).toBeGreaterThan(0)
      expect(typeof body).toBe('string')
      expect(body.trim().length).toBeGreaterThan(0)
    }
  })

  it('says "today" on the day and counts down before it', () => {
    for (const lang of LANGS) {
      const onDay = COPY.zakatBody[lang](0)
      const ahead = COPY.zakatBody[lang](7)
      expect(onDay).not.toBe(ahead)
      expect(ahead).toContain('7')
    }
  })

  it('never puts an amount in the copy', () => {
    // The server does not have one, and a template that expected one would be
    // the first step towards asking for it.
    for (const lang of LANGS) {
      for (const days of [30, 7, 0]) {
        const text = COPY.zakatTitle[lang](days) + ' ' + COPY.zakatBody[lang](days)
        expect(text).not.toMatch(/[$€£]|\bUSD\b/)
      }
    }
  })
})

describe('the server\u2019s Prefs interface matches the table it describes', () => {
  // main.ts is TypeScript and this suite is not, so the interface can drift
  // from DEFAULT_PREFS without anything here noticing — which is how `levels`
  // came to be read at the level crossing while absent from the type.
  it('declares exactly the keys DEFAULT_PREFS has', () => {
    const SRC = dirname(fileURLToPath(import.meta.url))
    const main = readFileSync(join(SRC, '..', '..', 'push-api', 'main.ts'), 'utf8')
    const block = main.match(/interface Prefs \{([^}]*)\}/)
    expect(block, 'interface Prefs in main.ts').not.toBeNull()
    const declared = [...block[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]).sort()
    expect(declared).toEqual(Object.keys(DEFAULT_PREFS).sort())
  })
})
