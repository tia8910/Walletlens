import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('Google Drive backup from the start', () => {
  it('is offered on the setup screen shared by web and Android onboarding', () => {
    const ws = read('components/WelcomeStart.jsx')
    expect(ws).toMatch(/className="su-drive-btn" onClick=\{connectDrive\}/)
    expect(ws).toMatch(/import\('\.\.\/driveSync'\)\)\.connect\(\)/)
    for (const l of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const s = read(`i18n/${l}.js`)
      for (const k of ['wsDriveTitle', 'wsDriveSub', 'wsDriveCta']) expect(s, `${l} ${k}`).toContain(`${k}:`)
    }
  })
  it('is on the home page, and the link starts the connection in the app', () => {
    const tour = read('../public/tour/index.html')
    expect(tour).toMatch(/href="\/dashboard\/\?drive=connect" data-cta="drive_connect">Connect Google Drive</)
    expect(read('App.jsx')).toMatch(/q\.get\('drive'\) !== 'connect'/)
  })
})

describe('the weekly backup-code email is gone', () => {
  beforeEach(() => localStorage.clear())
  it('has no subscription form left', () => {
    expect(read('components/BackupCode.jsx')).not.toMatch(/subscribeBackupEmail|bkWeeklyEmail/)
    expect(read('pages/Dashboard.jsx')).not.toMatch(/EmailBackupPanel|subscribeBackupEmail/)
  })
  it('ends an old subscription on open and sends nothing', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy
    localStorage.setItem('wl_backup_sub', JSON.stringify({ email: 'a@b.co', enabled: true, lastSentAt: '2020-01-01' }))
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([{ coin_id: 'bitcoin' }]))
    const m = await import('./backupSubscription')
    await m.maybeSendWeeklyBackup()
    expect(localStorage.getItem('wl_backup_sub')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('is refused by the mail worker for older builds', () => {
    const w = read('../../workers/voice/index.js')
    expect(w).toMatch(/mode === "backup_email"\) \{[\s\S]{0,300}reason: "discontinued" \}\), \{ status: 410/)
  })
})
