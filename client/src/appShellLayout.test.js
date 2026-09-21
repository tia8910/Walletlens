import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Android shell renders the same header the web does — App.jsx puts
// .wl-topbar above <main className="wl-content twa-mode"> with nothing hiding
// it in the app — so it needs the same clearance. Two leftover rules from the
// Trusted Web Activity, which genuinely had no topbar of its own, forced that
// padding to 0.5rem and then to 0 with !important. They outranked every
// calc(var(--wl-topbar-h)) rule including the media-query ones, so the top of
// the first card sat under the fixed bar on every Android screen: the import
// card lost its heading and its Excel row.

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'index.css'), 'utf8')
const app = readFileSync(join(here, 'App.jsx'), 'utf8')

describe('the app shell clears its own header', () => {
  it('still renders the web header in the app', () => {
    // If this ever stops being true, the padding rules below are the wrong
    // fix and this whole file should be revisited rather than deleted.
    expect(app).toMatch(/<header className="wl-topbar" ref=\{topbarRef\}>/)
    expect(app).toMatch(/className=\{`wl-content\$\{isStandalone \? ' twa-mode' : ''\}`\}/)
    expect(css).not.toMatch(/\.twa-mode[^{]*\.wl-topbar[^{]*\{[^}]*display:\s*none/)
  })

  it('does not override the measured clearance in app mode', () => {
    for (const m of css.matchAll(/[^\n}]*twa-mode[^{]*\{[^}]*\}/g)) {
      expect(m[0]).not.toMatch(/padding-top/)
    }
  })

  it('measures the header rather than hardcoding its height', () => {
    // The header is one row or two depending on whether the price strip is on
    // and whether it wraps, so a constant is wrong in at least two states.
    expect(app).toMatch(/setProperty\('--wl-topbar-h'/)
    expect(app).toMatch(/new ResizeObserver\(publish\)/)
  })

  it('reserves that height on every width', () => {
    const rules = [...css.matchAll(/\.wl-content\s*\{[^}]*padding-top:[^;]+;/g)].map(m => m[0])
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule).toMatch(/var\(--wl-topbar-h/)
    }
  })
})
