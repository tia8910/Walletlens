import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { landingPath } from './components/LandingLink'
import { LANDING_ROUTES } from '../scripts/landings/build.mjs'

// Zakat and Portfolio Guardian in the app link to their landing pages, in the
// reader's language, and every link lands on a page the build writes.

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf8')

describe('feature landing links', () => {
  it('points at a page the landing build writes, in every language', () => {
    for (const page of ['zakat', 'guardian']) {
      for (const lang of ['en', 'ar', 'fr', 'es', 'de', 'it']) expect(LANDING_ROUTES).toContain(landingPath(page, lang))
    }
    expect(landingPath('zakat', 'en')).toBe('/zakat/')
    expect(landingPath('guardian', 'ar')).toBe('/ar/portfolio-guardian/')
    expect(landingPath('zakat', 'xx')).toBe('/zakat/')
  })

  it('is shown on the Guardian page, the zakat tab and both settings sections', () => {
    expect(read('./pages/Guardian.jsx')).toContain('<LandingLink page="guardian"')
    expect(read('./components/ZakatCalculator.jsx')).toContain('<LandingLink page="zakat"')
    expect(read('./components/ZakatSwitch.jsx')).toContain('<LandingLink page="zakat"')
    const settings = read('./pages/Settings.jsx')
    expect(settings).toContain('<LandingLink page="zakat"')
    expect(settings).toContain('<LandingLink page="guardian"')
  })

  it('is a plain link, since the pages are static HTML outside the router', () => {
    const src = read('./components/LandingLink.jsx')
    expect(src).toContain('href={landingPath(page, lang)}')
    expect(src).not.toMatch(/from 'react-router-dom'/)
    expect(src.slice(src.indexOf('const COPY'), src.indexOf('export default'))).not.toMatch(/[—–]| - /)
  })
})
