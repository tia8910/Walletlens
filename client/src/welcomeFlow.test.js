import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The web welcome is a full-screen flow of motion graphics. No component
// harness here, so this reads the source for the rules that matter.
const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/WelcomeModal.jsx'), 'utf8')
const css = readFileSync(join(here, 'components/WelcomeFlow.css'), 'utf8')

describe('the welcome flow', () => {
  it('covers the whole screen and stops the page scrolling underneath', () => {
    expect(css).toMatch(/\.wx \{\s*position: fixed; inset: 0;/)
    expect(css).toMatch(/height: 100dvh/)
    expect(src).toMatch(/document\.body\.style\.overflow = 'hidden'/)
  })

  it('offers the App Lock step only where App Lock can work', () => {
    expect(src).toMatch(/const stepsFor = \(canLock\) => canLock \? STEPS : STEPS\.filter\(s => !s\.isSecurityStep\)/)
    expect(src).toMatch(/const steps = useMemo\(\(\) => stepsFor\(bioAvailable\)/)
  })

  it('records completion under the same key as before, so nobody sees it twice', () => {
    expect(src).toMatch(/const KEY = 'wl_welcomed_v2'/)
    expect(src).toMatch(/wl-welcome-done/)
  })

  it('paints itself in the chosen theme and respects reduced motion', () => {
    expect(src).toMatch(/'--ac': ac/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('does not advertise import by wallet address', () => {
    expect(src.toLowerCase()).not.toMatch(/wallet address/)
  })
})
