import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Google Drive backup was fully built — connect, encrypt, upload, restore,
// automatic re-backup — and reachable from exactly one place: Settings. The
// Backup tab, which is where someone goes when they are thinking about backups,
// offered only the WLZ code and the weekly email. The feature was not missing,
// it was unfindable.
//
// These are source checks. They cannot prove the panel renders, but they pin
// the three things that made it invisible or would break it again:
//
// 1. The Backup & Restore card asks for the Drive panel at all.
// 2. Only ONE mounted DataPanel asks for it. DataPanel appears six times, and
//    the manage tab and the import-chooser modal it opens are on screen
//    together — two live DriveBackup panels would both answer the OAuth return
//    and fire two connects.
// 3. The OAuth redirect comes back to a tab where the panel is mounted.
//    DriveCallback navigates to /dashboard carrying only { driveConnected },
//    so nothing in that state says "manage" unless we say it.

const SRC = dirname(fileURLToPath(import.meta.url))
const dash  = readFileSync(join(SRC, 'pages', 'Dashboard.jsx'), 'utf8')
const drive = readFileSync(join(SRC, 'components', 'DriveBackup.jsx'), 'utf8')
const cb    = readFileSync(join(SRC, 'pages', 'DriveCallback.jsx'), 'utf8')

describe('Drive backup is reachable from the Backup section', () => {
  it('renders DriveBackup inside DataPanel', () => {
    expect(dash).toMatch(/<DriveBackup embedded \/>/)
  })

  it('gates it on the drive prop, which defaults to off', () => {
    expect(dash).toMatch(/function DataPanel\(\{[^}]*\bdrive = false\b/)
    expect(dash).toMatch(/\{drive && \(/)
  })

  it('turns it on for the Backup & Restore card', () => {
    // The card is the one titled t('backupTitle') in the manage tab.
    const card = dash.match(/<h3>\{t\('backupTitle'\)\}<\/h3>\s*<DataPanel[^/]*\/>/)
    expect(card, "the Backup & Restore card's DataPanel").not.toBeNull()
    expect(card[0]).toMatch(/<DataPanel drive\b/)
  })

  it('turns it on for exactly one call site, so two never mount at once', () => {
    const enabled = dash.match(/<DataPanel\s+drive\b/g) || []
    expect(enabled).toHaveLength(1)
  })
})

describe('the OAuth redirect lands where the panel is mounted', () => {
  it('DriveCallback still returns with driveConnected and no tab', () => {
    // If this ever starts carrying a tab of its own, the rule below is dead
    // weight and should be reconsidered rather than left to rot.
    expect(cb).toMatch(/state:\s*\{\s*driveConnected:\s*true\s*\}/)
    expect(cb).not.toMatch(/tab:/)
  })

  it('Dashboard opens the manage tab on driveConnected', () => {
    expect(dash).toMatch(/if \(location\.state\?\.driveConnected\) return 'manage'/)
  })

  it('does not rely on sessionStorage to get there', () => {
    // The driveConnected rule must come before the saved-tab fallback, which
    // is absent in private mode.
    const rule  = dash.indexOf("location.state?.driveConnected) return 'manage'")
    const saved = dash.indexOf('sessionStorage.getItem(ACTIVE_TAB_KEY)')
    expect(rule).toBeGreaterThan(-1)
    expect(saved).toBeGreaterThan(-1)
    expect(rule).toBeLessThan(saved)
  })
})

describe('the embedded panel does not nest a card inside a card', () => {
  it('drops the section chrome when embedded', () => {
    const embedded = drive.slice(drive.indexOf('if (embedded) {'))
    const upToStandalone = embedded.slice(0, embedded.indexOf('return (\n    <div className="settings-section'))
    expect(upToStandalone).not.toMatch(/settings-section glass-card/)
  })

  it('keeps the standalone card for Settings', () => {
    expect(drive).toMatch(/<div className="settings-section glass-card">/)
  })

  it('shares one body between both wrappers', () => {
    // Two copies of the panel's markup would drift. There is one `body`.
    expect(drive).toMatch(/const body = \(/)
    expect((drive.match(/\{body\}/g) || []).length).toBe(2)
  })
})
