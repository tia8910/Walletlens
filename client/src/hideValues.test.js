import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Hiding values has to hide the values.
//
// The total was masked while the category chips directly beneath it still read
// $13.4k · $7.1k · $6.3k, and every holding still showed its own value, cost
// basis and quantity. The one figure that was covered could be added back up
// from the ones that were not, which makes the mask decorative.
//
// The fix is where the mask lives, not how many call sites were patched: it is
// inside the formatters, so an amount added to this page later is hidden by
// default rather than by somebody remembering to hide it.

const here = dirname(fileURLToPath(import.meta.url))
const dash = readFileSync(join(here, 'pages/Dashboard.jsx'), 'utf8')
const hook = readFileSync(join(here, 'hooks/usePrivateFmt.js'), 'utf8')

describe('the mask lives in the formatter', () => {
  it('masks every amount cv formats', () => {
    expect(dash).toMatch(/const cv = useCallback\(\(usd\) => \(hidden \? VALUE_MASK : cvPub\(usd\)\), \[hidden, cvPub\]\)/)
  })

  it('masks the compact formatter too, which is what the chips use', () => {
    // The chips were the leak: cvN had no mask at all.
    expect(dash).toMatch(/const cvN = useCallback\(\(usd\) => \(hidden \? VALUE_MASK : cvNPub\(usd\)\), \[hidden, cvNPub\]\)/)
    expect(dash).toContain('<span className="dvx-catchip-val">{cvN(value)}</span>')
  })

  it('uses one mask, so two hidden figures look like one feature', () => {
    expect(dash).toMatch(/const VALUE_MASK = '••••'/)
  })
})

describe('what stays visible', () => {
  it('keeps a coin market price readable', () => {
    // It is on the ticker at the top of the same screen. Blanking it hides
    // nothing and costs the row its only reference point.
    expect(dash).toContain("{cvPub(h.price)}")
  })

  it('has exactly one public-formatter call site on a holding row', () => {
    // cvPub is the opt-out. Every new use of it is a decision to show a number
    // while the user has asked for numbers to be hidden, so it should stay rare
    // and obvious.
    // Two: the one inside cv, and the market price. Nothing else.
    const uses = dash.match(/cvPub\(/g) || []
    expect(uses.length, 'cvPub spread beyond the market price').toBe(2)
  })
})

describe('what the first version missed', () => {
  it('masks the quantity', () => {
    // Not formatted by cv, and on its own it gives the position away next to a
    // price that deliberately stays visible.
    expect(dash).toMatch(/\{hidden \? VALUE_MASK : `\$\{Number\(h\.amount\)\.toLocaleString/)
  })

  it('masks the whole P&L pill, not just its amount', () => {
    // "•••• (12.3%)" still says how the position is doing, and reads as broken.
    expect(dash).toMatch(/\{hidden \? VALUE_MASK : `\$\{h\.pnl >= 0 \? '▲' : '▼'\}/)
  })
})

describe('the shared hook reads the key the app actually writes', () => {
  it('is pointed at wl_settings.hideValues', () => {
    // It read 'crypto_tracker_hide_values', which nothing has ever written, so
    // any page wired to it would have reported false forever while the eye on
    // the Dashboard said otherwise. Nothing imported it yet, which is the only
    // reason that never shipped.
    // Named in the comment as the thing that was wrong; what matters is that
    // it is no longer read.
    expect(hook).not.toMatch(/getItem\('crypto_tracker_hide_values'\)/)
    expect(hook).not.toMatch(/const HIDE_KEY/)
    expect(hook).toMatch(/JSON\.parse\(localStorage\.getItem\(SETTINGS_KEY\) \|\| '\{\}'\)\.hideValues === true/)
  })

  it('writes back into the same settings object instead of replacing it', () => {
    // A bare setItem here would drop every other preference in wl_settings.
    expect(hook).toMatch(/\{ \.\.\.s, hideValues: next \}/)
  })
})
