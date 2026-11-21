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

describe('the add button', () => {
  it('keeps its own animation, untouched by the pulse', () => {
    const css = read('v3.css')
    expect(css.slice(css.indexOf('/* Living pulse'))).not.toMatch(/wl-ss|wl-nav-fab/)
  })
})

describe('the bar moves from the start', () => {
  const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v }, removeItem: k => { delete m[k] } } }
  const el = () => document.createElement('div')
  it('remembers today\'s reading for the next start', async () => {
    const { setNavPulse: set, initNavPulse: init } = await import('./navPulse?remember')
    const store = mem()
    set({ level: 2, up: true }, el(), store)
    const root = el()
    init('', root, store)
    expect(root.getAttribute('data-wl-pulse')).toBe('2')
    expect(root.getAttribute('data-wl-day')).toBe('up')
  })
  it('forgets a reading from another day', async () => {
    const { initNavPulse: init } = await import('./navPulse?stale')
    const store = mem()
    store.setItem('wl_nav_pulse', JSON.stringify({ level: 3, up: false, day: 'Mon Jan 01 2001' }))
    const root = el()
    init('', root, store)
    expect(root.hasAttribute('data-wl-pulse')).toBe(false)
  })
  it('?pulse=3&day=down previews a level, and Home does not overwrite it', async () => {
    const { setNavPulse: set, initNavPulse: init } = await import('./navPulse?preview')
    const root = el()
    init('?pulse=3&day=down', root, mem())
    set(null, root, mem())
    expect(root.getAttribute('data-wl-pulse')).toBe('3')
    expect(root.getAttribute('data-wl-day')).toBe('down')
  })
})
