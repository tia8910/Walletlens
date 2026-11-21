import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The bottom bar's Lifted bubble: the active tab rises into a ringed bubble.
const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'v3.css'), 'utf8')

describe('bottom bar lifted bubble', () => {
  it('sits every tab flat in a round, unfilled spot', () => {
    expect(css).toMatch(/html\.wl-v3 \.wl-nav-item \.wl-nav-icon \{[^}]*border-radius: 50% !important;[^}]*background: transparent !important/)
  })
  it('lifts the active tab into a bubble ringed in the theme colour', () => {
    expect(css).toMatch(/\.wl-nav-item\.active \.wl-nav-icon \{[^}]*transform: translateY\(-16px\);[^}]*background: var\(--nl-card, #fff\) !important;[^}]*0 0 0 2px rgb\(var\(--g-rgb\)\)/)
  })
  it('no longer draws the candle body or wick', () => {
    expect(css).not.toMatch(/\.wl-nav-icon::(before|after)/)
  })
  it('holds still for people who ask for less motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*html\.wl-v3 \.wl-nav-item \.wl-nav-icon \{ transition: none; \}/)
  })
})
