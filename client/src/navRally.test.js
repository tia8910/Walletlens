import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The bottom bar's Candle rally: the active tab rallies into a green candle.
const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'v3.css'), 'utf8')

describe('bottom bar candle rally', () => {
  it('stands every tab on a flat candle', () => {
    expect(css).toMatch(/html\.wl-v3 \.wl-nav-item \.wl-nav-icon::before \{[^}]*height: 4px;[^}]*opacity: 0\.2/)
  })
  it('rallies the active tab into a full candle in the theme colour, with a wick', () => {
    expect(css).toMatch(/\.wl-nav-item\.active \.wl-nav-icon::before \{[^}]*height: 100%;[^}]*rgb\(var\(--g-rgb\)\)/)
    expect(css).toMatch(/\.wl-nav-item \.wl-nav-icon::after \{[^}]*background: rgb\(var\(--g-rgb\)\)/)
    expect(css).toMatch(/\.wl-nav-item\.active \.wl-nav-icon::after \{ transform: none; opacity: 1;/)
  })
  it('keeps the wick behind the candle but inside the bar, never clipped', () => {
    expect(css).toMatch(/\.wl-nav-item \.wl-nav-icon \{[^}]*isolation: isolate;[^}]*overflow: visible !important/)
  })
  it('turns the active icon white so it reads on the green body', () => {
    expect(css).toMatch(/\.wl-nav-item\.active \.wl-nav-icon \{ color: #fff !important; \}/)
  })
  it('holds still for people who ask for less motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*html\.wl-v3 \.wl-nav-item \.wl-nav-icon::before, html\.wl-v3 \.wl-nav-item \.wl-nav-icon::after \{ transition: none; \}/)
  })
})
