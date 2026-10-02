import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isNewLook, setNewLook, applyLookParam } from './newLook'
import { moodOf } from './components/HomeTop.jsx'

// The light card redesign is previewed behind a switch. These pin what makes
// it safe to preview: it is off by default, it scopes itself, and it moves
// features rather than removing them.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('the new-look switch', () => {
  beforeEach(() => localStorage.clear())

  it('is off by default and follows Settings or a ?look= link', () => {
    expect(isNewLook()).toBe(false)
    applyLookParam('?look=new'); expect(isNewLook()).toBe(true)
    applyLookParam('?utm=x'); expect(isNewLook()).toBe(true)
    applyLookParam('?look=classic'); expect(isNewLook()).toBe(false)
    setNewLook(true); expect(isNewLook()).toBe(true)
  })

  it('only styles the app while it is on', () => {
    const css = read('v3.css')
    // Every shell rule is scoped under html.wl-v3; component classes are new.
    for (const line of css.split('\n').filter(l => /^[^\s/@}].*\{/.test(l))) {
      expect(line, line).toMatch(/^(html\.wl-v3|\.nl-|@)/)
    }
    expect(read('App.jsx')).toMatch(/useNewLookClass\(v2 && newLook\)/)
  })
})

describe('nothing is removed', () => {
  it('the bottom bar moves Targets into More, and More lists every menu destination', () => {
    const nav = read('components/BottomNav.jsx')
    const bar = nav.slice(nav.indexOf('const V3_NAV_ITEMS'), nav.indexOf('const DASHBOARD_LP_ITEMS'))
    expect(bar).toMatch(/route: '\/more'/)
    const more = read('pages/More.jsx')
    const menu = read('App.jsx')
    const v2Menu = menu.slice(menu.indexOf('const DrawerV2'), menu.indexOf('const DrawerV2') + 9000)
    const dests = (src) => new Set([...src.matchAll(/go\((?:home|'(\/[a-z/-]*)')(?:, \{ (?:tab: '(\w+)'|section: '(\w+)', tool: '(\w+)') \})?\)/g)]
      .map(m => m[2] ? `tab:${m[2]}` : m[3] ? `${m[1]}#${m[4]}` : m[1]).filter(Boolean))
    const missing = [...dests(v2Menu)].filter(d => !dests(more).has(d) && d !== '/settings' || d === '/settings' && !more.includes("go('/settings')"))
    expect(missing).toEqual([])
    expect(more).toMatch(/zakatOn \? \[\{ icon: 'crescent'/)
  })

  it('Home keeps Buy, Sell and History when it replaces the quick strip', () => {
    const dash = read('pages/Dashboard.jsx')
    expect(dash).toMatch(/onBuy=\{\(\) => openSheet\('buy', 'home_hero'\)\} onSell=\{\(\) => openSheet\('sell', 'home_hero'\)\}/)
    expect(dash).toMatch(/onHistory=\{\(\) => navigate\('\/transactions'\)\}/)
    expect(read('components/HomeTop.jsx')).toMatch(/onClick=\{onHistory\}/)
  })

  it('the summary line says today and is fed today\'s move', () => {
    expect(read('pages/Dashboard.jsx')).toMatch(/<PortfolioBrief [^>]*totalPnLPct=\{totalValue - todayPnLVal > 0 \? \(todayPnLVal/)
  })
})

describe('Home shows each figure once', () => {
  const dash = read('pages/Dashboard.jsx')
  const top = read('components/HomeTop.jsx')
  it('keeps one holdings list, the full one with its filters and actions', () => {
    expect(top).not.toContain('nl-row')
    expect(dash).toContain('className="dvx-holdings"')
  })
  it('folds the summary sentence into the mood banner and the category cards into the breakdown', () => {
    expect(top).toMatch(/briefParts\(enriched, totalValue, dayPct, t\)\?\.rest/)
    expect(dash).toMatch(/enriched\.length > 0 && !nlHome && <PortfolioBrief/)
    expect(dash).toMatch(/catBreakdown\.length > 0 && !nlHome && \(\s*<div className="dvx-cat-summary-row">/)
    expect(dash).toContain('className="glass-card dvx-cat-breakdown"')
  })
})

describe('the mood of Home', () => {
  it('celebrates big days and stays calm on red ones', () => {
    expect(moodOf(5.1)).toBe('big')
    expect(moodOf(1.2)).toBe('up')
    expect(moodOf(0.1)).toBe('flat')
    expect(moodOf(-3.2)).toBe('down')
  })
})
