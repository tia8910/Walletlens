import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setNavPulse } from './navPulse'

const read = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), f), 'utf8')
const html = document.documentElement

describe('living pulse in the bottom bar', () => {
  beforeEach(() => setNavPulse(null))
  it('marks the level and the day on the page', () => {
    setNavPulse({ level: 3, up: false })
    expect(html.getAttribute('data-wl-pulse')).toBe('3')
    expect(html.getAttribute('data-wl-day')).toBe('down')
  })
  it('clears when there is no pulse or it is not a level', () => {
    setNavPulse({ level: 1, up: true })
    setNavPulse(null)
    expect(html.hasAttribute('data-wl-pulse')).toBe(false)
    setNavPulse({ level: 7, up: true })
    expect(html.hasAttribute('data-wl-day')).toBe(false)
  })
  it('Home only sets it when the numbers are shown, real and priced', () => {
    const src = read('pages/Dashboard.jsx')
    expect(src).toMatch(/const blocked = hidden \|\| isDemo \|\| pricesFailed \|\| unpriced\.length > 0\n\s*setNavPulse\(pulse && !blocked \? \{ level: pulse\.level\.level, up: todayPnLVal >= 0 \} : null\)/)
  })
  it('every bar icon has a living part, still under reduced motion', () => {
    const nav = read('components/BottomNav.jsx')
    for (const c of ['pv-tile', 'pv-c1', 'pv-c2', 'pv-bar', 'pv-dots']) expect(nav).toContain(`className="${c}"`)
    const css = read('v3.css')
    const block = css.slice(css.indexOf('/* Living pulse'))
    expect(block).toMatch(/@media \(prefers-reduced-motion: no-preference\)/)
    for (const l of ['0', '1', '2', '3']) expect(block).toContain(`html.wl-v3[data-wl-pulse="${l}"]`)
  })
})
