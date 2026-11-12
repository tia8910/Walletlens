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

describe('add button never goes blank', () => {
  // Opacity of a keyframes block at a point of its own timeline (0..100).
  const kf = (name) => {
    const body = css.match(new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}\\s*$`, 'm'))[1]
    const stops = []
    for (const [, sel, op] of body.matchAll(/([\d.%, ]+)\{ opacity: (?:var\(--wl-ss-on, )?([\d.]+)\)?;/g)) for (const p of sel.split(',')) stops.push([parseFloat(p), Number(op)])
    stops.sort((a, b) => a[0] - b[0])
    return (x) => { const i = stops.findIndex(s => s[0] >= x); if (i <= 0) return stops[Math.max(0, i)][1]; const [a, b] = [stops[i - 1], stops[i]]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]) }
  }
  it('always shows one glyph at least two thirds visible, all through the loop', () => {
    const plus = kf('wl-ss-plus-glyph'), asset = kf('wl-ss-asset-glyph'), last = kf('wl-ss-last-glyph')
    const slots = [[6, asset], [7.5, asset], [9, asset], [10.5, last]]
    let min = 1
    for (let t = 0; t < 12; t += 0.02) {
      const ops = [plus((t / 12) * 100), ...slots.map(([d, f]) => f((((t - d + 12) % 12) / 12) * 100))]
      min = Math.min(min, Math.max(...ops))
      // And never two at once: the last asset is gone before the plus is back in full.
      expect(ops.filter(o => o > 0.9).length, `at ${t.toFixed(2)}s`).toBeLessThanOrEqual(1)
    }
    expect(min).toBeGreaterThan(0.6)
    expect(css).toMatch(/\.wl-ss-g\.wl-ss-usd \{ animation-name: wl-ss-last-glyph; \}/)
  })
})
