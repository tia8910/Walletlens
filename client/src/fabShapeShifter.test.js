import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The add button's shape-shifter: the plus dissolves into each asset glyph.
const here = dirname(fileURLToPath(import.meta.url))
const nav = readFileSync(join(here, 'components/BottomNav.jsx'), 'utf8')
const css = readFileSync(join(here, 'v3.css'), 'utf8')
const PHASES = ['plus', 'btc', 'stk', 'au', 'usd']

describe('add button shape-shifter', () => {
  it('is decoration: hidden from screen readers and never takes a tap', () => {
    expect(nav).toMatch(/<span className="wl-ss" aria-hidden="true">/)
    expect(css).toMatch(/html\.wl-v3 \.wl-ss, [^{]*\{[^}]*pointer-events: none/)
  })
  it('has a glyph, ring and glow for every phase, in loop order', () => {
    expect(nav).toMatch(/SS_PHASES = \['plus', 'btc', 'stk', 'au', 'usd'\]/)
    for (const k of PHASES) {
      expect(nav).toContain(`wl-ss-g wl-ss-${k}`)
      expect(css).toMatch(new RegExp(`\\.wl-ss-ring\\.wl-ss-${k}\\s*\\{ background: conic-gradient`))
      expect(css).toMatch(new RegExp(`\\.wl-ss-glow\\.wl-ss-${k}\\s*\\{ background:`))
    }
  })
  it('plays the plus first in the theme colour, then each asset in its own slot', () => {
    expect(css).toMatch(/\.wl-ss-ring\.wl-ss-plus \{ background: conic-gradient\([^)]*rgb\(var\(--g-rgb\)\)/)
    expect(css).toMatch(/\.wl-ss \.wl-ss-btc \{ animation-delay: 6s; \}/)
    expect(css).toMatch(/\.wl-ss \.wl-ss-stk \{ animation-delay: 7\.5s; \}/)
    expect(css).toMatch(/\.wl-ss \.wl-ss-au\s+\{ animation-delay: 9s; \}/)
    expect(css).toMatch(/\.wl-ss \.wl-ss-usd \{ animation-delay: 10\.5s; \}/)
  })
  it('hides every layer until its phase, so only one shows at a time', () => {
    expect(css).toMatch(/\.wl-ss-glow \{[^}]*opacity: 0;/)
    expect(css).toMatch(/\.wl-ss-ring \{[^}]*opacity: 0;/)
    expect(css).toMatch(/\.wl-ss-g \{[^}]*opacity: 0;/)
  })
  it('holds still on the plus for people who ask for less motion', () => {
    const rm = css.match(/prefers-reduced-motion: reduce\) \{\s*html\.wl-v3 \.wl-ss-rings[\s\S]*?\n\}/)
    expect(rm).not.toBeNull()
    expect(rm[0]).toMatch(/animation: none/)
    expect(rm[0]).toMatch(/\.wl-ss-g\.wl-ss-plus, html\.wl-v3 \.wl-ss-ring\.wl-ss-plus \{ opacity: 1; \}/)
  })
})
