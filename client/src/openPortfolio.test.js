import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openPortfolio, PORTFOLIO_URL } from './openPortfolio'

const read = (p) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), p), 'utf8')

describe('after a restore', () => {
  beforeEach(() => { sessionStorage.setItem('wl_active_tab', 'manage') })

  it('opens Overview, not the tab used last', () => {
    const loc = { href: '' }
    vi.stubGlobal('location', loc)
    const scroll = vi.fn()
    vi.stubGlobal('scrollTo', scroll)
    openPortfolio()
    expect(sessionStorage.getItem('wl_active_tab')).toBe('overview')
    expect(loc.href).toBe('/dashboard?tab=overview')
    expect(scroll).toHaveBeenCalledWith(0, 0)
    vi.unstubAllGlobals()
  })

  it('is what every restore path uses', () => {
    expect(PORTFOLIO_URL).toBe('/dashboard?tab=overview')
    for (const f of ['components/DriveBackup.jsx', 'pages/BackupView.jsx']) {
      const src = read(f)
      expect(src, f).toMatch(/openPortfolio\(\)/)
      expect(src, f).not.toMatch(/location\.href = ['"]\/dashboard['"]/)
    }
  })
})
