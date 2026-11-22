import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  dueGuardianReminder, sanitizeGuardianDue, mergeSubForWrite, normalizeSub as normalize, copy, CHANNEL_URL, CHANNEL_DELIVERY,
} from '../../push-api/notify-logic.js'
import { guardianDueDay, DAY_MS } from './guardianModel'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dayKey = (t) => new Date(t).toISOString().slice(0, 10)

describe('the Guardian phone reminder', () => {
  it('fires a week and three days before the deadline, once each', () => {
    const due = '2027-05-20'
    expect(dueGuardianReminder({ dueDate: due, today: '2027-05-13' })).toEqual({ days: 7, key: '2027-05-20:7' })
    expect(dueGuardianReminder({ dueDate: due, today: '2027-05-17' })).toEqual({ days: 3, key: '2027-05-20:3' })
    expect(dueGuardianReminder({ dueDate: due, today: '2027-05-15' })).toBeNull()
    expect(dueGuardianReminder({ dueDate: due, today: '2027-05-13', sent: ['2027-05-20:7'] })).toBeNull()
  })

  it('accepts only a plausible deadline', () => {
    expect(sanitizeGuardianDue(dayKey(Date.now() + 40 * DAY_MS))).not.toBeNull()
    expect(sanitizeGuardianDue(dayKey(Date.now() + 400 * DAY_MS))).toBeNull()
    expect(sanitizeGuardianDue('nonsense')).toBeNull()
    expect(sanitizeGuardianDue(null)).toBeNull()
  })

  it('a moved deadline (the app was opened) starts the reminders again', () => {
    const fresh = normalize({ guardianDue: dayKey(Date.now() + 60 * DAY_MS), guardianSent: [] })
    const mutated = { ...normalize({ guardianDue: dayKey(Date.now() + 5 * DAY_MS) }), guardianSent: ['x:7'] }
    expect(mergeSubForWrite(mutated, fresh).guardianSent).toEqual([])
    expect(mergeSubForWrite(mutated, fresh).guardianDue).toBe(fresh.guardianDue)
  })

  it('opens the Guardian page, is heard, and is written in every language', () => {
    expect(CHANNEL_URL.guardian).toBe('/guardian')
    expect(CHANNEL_DELIVERY.guardian.urgency).toBe('high')
    for (const lang of ['en', 'ar', 'fr', 'es', 'de', 'it']) expect(copy('guardianBody', lang)(7)).toContain('7')
  })

  it('the deadline day counts from the later of the last open and the end of a pause', () => {
    const base = new Date(2027, 0, 1, 12).getTime()
    expect(guardianDueDay({ active: true, intervalDays: 30, lastCheckin: new Date(base).toISOString() })).toBe('2027-01-31')
    expect(guardianDueDay({ active: true, intervalDays: 30, lastCheckin: new Date(base).toISOString(), pausedUntil: new Date(base + 10 * DAY_MS).toISOString() })).toBe('2027-02-10')
    expect(guardianDueDay({ active: false })).toBeNull()
  })

  it('the daily job sends it at midday without a preference switch', () => {
    const jobs = readFileSync(join(ROOT, 'workers/push/jobs.js'), 'utf8')
    expect(jobs).toMatch(/h === GUARDIAN_HOUR && !!sub\.guardianDue/)
    expect(jobs).toMatch(/channel: "guardian"/)
    const index = readFileSync(join(ROOT, 'workers/push/index.js'), 'utf8')
    expect(index).toMatch(/guardianDue: body\.guardianDue !== undefined \? sanitizeGuardianDue/)
    expect(index).toMatch(/if \(body\.guardianDue !== undefined\) \{/)
  })
})
