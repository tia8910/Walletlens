import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The empty Home offers a returning user their way back: restore from Drive.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')
const dash = read('pages/Dashboard.jsx')
const empty = dash.slice(dash.indexOf('function EmptyPortfolio({'), dash.indexOf('// After the first asset: a small progress card'))

describe('empty portfolio: restore from Google Drive', () => {
  it('offers the connection, and only where Drive is configured', () => {
    expect(empty).toMatch(/\{driveOn && \(\s*<div className="wl-st-drive">/)
    expect(empty).toMatch(/isDriveConfigured\(\)/)
    expect(empty).toMatch(/<button type="button" onClick=\{connectDrive\}/)
  })
  it('starts the same connection as the welcome screen, without mounting a second Drive panel', () => {
    expect(empty).toMatch(/import\('\.\.\/driveSync'\)\)\.connect\(\)/)
    expect(empty).not.toMatch(/<DriveBackup/)
  })
  it('says so when Google cannot be reached, and frees the button', () => {
    expect(empty).toMatch(/catch \{ setDrive\('failed'\) \}/)
    expect(empty).toMatch(/drive === 'failed' && <p className="wl-st-drive-err" role="alert">/)
    expect(empty).toMatch(/disabled=\{drive === 'busy'\}/)
  })
  it('keeps the other ways back beside it, as tap-sized tiles', () => {
    for (const k of ['importBackup', 'importExcel', 'guideCta']) expect(empty).toContain(`t('${k}')`)
    expect(read('index.css')).toMatch(/\.wl-st-more button \{[^}]*min-height: 64px/)
  })
  it('has its words in every app language', () => {
    for (const l of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const s = read(`i18n/${l}.js`)
      for (const k of ['stReturning', 'stDriveTitle', 'stDriveSub', 'stDriveFail']) expect(s, `${l} ${k}`).toContain(`${k}:`)
    }
  })
})
