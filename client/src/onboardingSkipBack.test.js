import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import en from './i18n/en'

// Small enhancements to the onboarding, the story itself unchanged:
// Skip in the empty top corner, the phone's Back stepping back through the
// story instead of leaving the app, and an "Alarms" chip on the welcome.
// Source checks, like onboardingSlides.test.js: there is no component harness.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/NativeOnboarding.jsx'), 'utf8')
const css = readFileSync(join(here, 'components/NativeOnboarding.css'), 'utf8')

describe('onboarding', () => {
  it('offers Skip on every step but the last, and skipping lands on the launch step', () => {
    expect(src).toMatch(/\{!s\.final \? <button className="ocx-skip" onClick=\{skip\}>\{t\('obSkip'\)\}<\/button>/)
    expect(src).toMatch(/goTo\(total - 1\)/)
    expect(css).toMatch(/\.ocx-skip \{/)
    // count stays centred whatever the corners hold
    expect(css).toMatch(/\.ocx-top-row \{ display: grid; grid-template-columns: 1fr auto 1fr;/)
  })

  it('lets the phone\'s Back step back instead of leaving the app, and tidies up after', () => {
    expect(src).toMatch(/window\.history\.pushState\(\{ \.\.\.\(window\.history\.state \|\| \{\}\), wlOnboard: true \}, ''\)/)
    expect(src).toMatch(/if \(stepRef\.current > 0\) \{\s*goPrevRef\.current\(\)/)
    expect(src).toMatch(/if \(window\.history\.state\?\.wlOnboard\) window\.history\.back\(\)/)
  })

  it('shows Alarms among the welcome chips', () => {
    expect(src).toMatch(/'obFeatAlarms'/)
    expect(src).toMatch(/obFeatAlarms: 'bell'/)
    expect(en.obFeatAlarms).toBe('Alarms')
  })
})
