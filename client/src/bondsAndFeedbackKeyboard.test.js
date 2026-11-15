import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { categorizeAsset } from './data/assets'
import { classifyHolding, REASONS } from './zakat'
import { mixParams } from './growthEngine'
import { dockFor, KEYBOARD_FREE } from './hooks/useKeyboardDock'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

// Two reports from the app: a bond was added like crypto, and in the Android
// app the Send feedback sheet hid what was being typed.
describe('bonds are their own class', () => {
  it('a bond is not crypto', () => {
    expect(categorizeAsset({ coin_id: 'bond:us treasury 10y', coin_symbol: 'US TREASURY 10Y' })).toBe('bonds')
    expect(categorizeAsset({ coin_id: 'bond:treasury', coin_symbol: 'T-BOND' })).toBe('bonds')
    expect(categorizeAsset({ coin_id: 'bitcoin', coin_symbol: 'btc' })).toBe('crypto')
  })
  it('the dashboard groups, names and colours them', () => {
    const d = read('pages/Dashboard.jsx')
    expect(d).toMatch(/CATEGORY_ORDER = \[[^\]]*'bonds'/)
    expect(d).toMatch(/bonds: 'catBonds'/)
    expect(d).toMatch(/CATEGORY_COLOR = \{[^}]*bonds:/)
  })
  it('zakat counts a bond in full, as money owed', () => {
    expect(classifyHolding({ coin_id: 'bond:treasury', coin_symbol: 'T-BOND' })).toEqual({ portion: 1, reason: REASONS.bond })
  })
  it('the growth plan models bonds as steady, not as crypto', () => {
    const m = mixParams({ bonds: 1 })
    expect(m.mu).toBeLessThan(0.06)
    expect(m.sig).toBeLessThan(0.1)
  })
})

describe('the feedback sheet stays above the keyboard', () => {
  it('docks inside the visible area when the browser reports the keyboard', () => {
    expect(dockFor({ full: 800, vvHeight: 450, vvTop: 0, typing: true, touch: true })).toEqual({ height: 450, top: 0 })
  })
  it('docks to the top part of the screen in the Android app, which reports nothing', () => {
    expect(dockFor({ full: 800, vvHeight: 800, typing: true, touch: true })).toEqual({ height: Math.round(800 * KEYBOARD_FREE), top: 0 })
  })
  it('stays put when nobody is typing, or with a mouse', () => {
    expect(dockFor({ full: 800, vvHeight: 800, typing: false, touch: true })).toBeNull()
    expect(dockFor({ full: 800, vvHeight: 800, typing: true, touch: false })).toBeNull()
  })
  it('is used by the feedback sheet', () => {
    expect(read('components/FeedbackSheet.jsx')).toMatch(/ref=\{dock\.ref\} onFocus=\{dock\.onFocus\} onBlur=\{dock\.onBlur\}/)
    expect(read('pages/Settings.css')).toMatch(/\.sx-sheet\.kb-dock \{/)
  })
})
