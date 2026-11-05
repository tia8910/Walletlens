import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The bottom bar's Lens glide: a magnifier that rests on the active tab.
const here = dirname(fileURLToPath(import.meta.url))
const nav = readFileSync(join(here, 'components/BottomNav.jsx'), 'utf8')
const css = readFileSync(join(here, 'v3.css'), 'utf8')

describe('bottom bar lens', () => {
  it('is decoration on the new look only: hidden from screen readers, never takes a tap', () => {
    expect(nav).toMatch(/\{v3 && <span className="wl-lens" aria-hidden="true">/)
    expect(css).toMatch(/html\.wl-v3 \.wl-lens \{[^}]*pointer-events: none/)
  })
  it('is placed from the active tab it measures, and hides when no tab is active', () => {
    expect(nav).toMatch(/querySelector\('\.wl-nav-item\.active'\)/)
    expect(nav).toMatch(/--wl-lens-x/)
    expect(nav).toMatch(/nav\.dataset\.lens = 'off'/)
    expect(css).toMatch(/\.wl-bottom-nav\[data-lens="on"\] \.wl-lens \{ opacity: 1;/)
  })
  it('glides only after the first placement, so it never sweeps in from the edge', () => {
    expect(nav).toMatch(/classList\.add\('wl-lens-ready'\)/)
    expect(css).toMatch(/\.wl-bottom-nav\.wl-lens-ready \.wl-lens \{\s*transition: left/)
  })
  it('takes the theme colour for its rim and handle', () => {
    expect(css).toMatch(/\.wl-lens \{[^}]*box-shadow: 0 0 0 2px rgb\(var\(--g-rgb\)\)/)
    expect(css).toMatch(/\.wl-lens::after \{[^}]*background: rgb\(var\(--g-rgb\)\)/)
  })
  it('holds still for people who ask for less motion', () => {
    const rm = css.match(/prefers-reduced-motion: reduce\) \{\s*html\.wl-v3 \.wl-lens,[\s\S]*?\n\}/)
    expect(rm).not.toBeNull()
    expect(rm[0]).toMatch(/transition: none/)
    expect(rm[0]).toMatch(/\.wl-lens-glint \{ animation: none; \}/)
  })
})
