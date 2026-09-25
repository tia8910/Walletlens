import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V2_PATH, isV2Path, isV2Active, exitV2, homePath } from './v2Preview'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('v2 preview session', () => {
  beforeEach(() => { sessionStorage.clear(); document.documentElement.className = '' })

  it('is off until /v2test is opened', () => {
    expect(isV2Active('/dashboard')).toBe(false)
    expect(isV2Active('/coach')).toBe(false)
  })

  it('follows the tab to other pages once /v2test is opened', () => {
    expect(isV2Active('/v2test/')).toBe(true)
    expect(isV2Active('/coach')).toBe(true)
    expect(isV2Active('/settings')).toBe(true)
  })

  it('ends with "Back to classic design"', () => {
    isV2Active(V2_PATH)
    document.documentElement.classList.add('wl-v2')
    exitV2()
    expect(isV2Active('/dashboard')).toBe(false)
    expect(document.documentElement.classList.contains('wl-v2')).toBe(false)
  })

  it('sends "Dashboard" to the preview URL only inside the preview', () => {
    expect(homePath(true)).toBe('/v2test')
    expect(homePath(false)).toBe('/dashboard')
    expect(isV2Path('/v2test/')).toBe(true)
    expect(isV2Path('/dashboard')).toBe(false)
  })
})

describe('v2 navigation keeps every destination', () => {
  const nav = read('components/BottomNav.jsx')
  const app = read('App.jsx')
  const v2Bar = nav.slice(nav.indexOf('const V2_NAV_ITEMS'), nav.indexOf('const DASHBOARD_LP_ITEMS'))
  const v2Menu = app.slice(app.indexOf('const DrawerV2'), app.indexOf('// ── Memoized app footer'))

  it('has four tabs: Dashboard, Goals, Targets, Coach', () => {
    const ids = [...v2Bar.matchAll(/byId\('(\w+)'\)|id: '(\w+)'/g)].map(m => m[1] || m[2])
    expect(ids).toEqual(['dashboard', 'goals', 'targets', 'coach'])
  })

  it('moves Watchlist, Alerts and Backup into the menu', () => {
    expect(v2Menu).toMatch(/tab: 'watchlist'/)
    expect(v2Menu).toMatch(/tab: 'alerts'/)
    expect(v2Menu).toMatch(/tab: 'manage'/)
  })

  it('keeps every destination the classic menu has', () => {
    const classic = app.slice(app.indexOf('const Drawer = memo'), app.indexOf('const V2_ICONS'))
    const dests = (src) => new Set([
      ...[...src.matchAll(/go\('(\/[a-z/-]*)'/g)].map(m => m[1]).filter(p => p !== '/dashboard'),
      ...[...src.matchAll(/tab: '(\w+)'/g)].map(m => m[1]),
      // v2 opens the analysis tools (ai, risk) in Coach, named by tool.
      ...[...src.matchAll(/tool: '(\w+)'/g)].map(m => m[1]),
    ])
    const missing = [...dests(classic)].filter(d => !dests(v2Menu).has(d))
    expect(missing).toEqual([])
  })

  it('leaves the classic bottom bar at six tabs', () => {
    const classic = nav.slice(nav.indexOf('const NAV_ITEMS'), nav.indexOf('const byId'))
    expect([...classic.matchAll(/^\s{4}id: '(\w+)'/gm)].map(m => m[1]))
      .toEqual(['dashboard', 'watchlist', 'analysis', 'alerts', 'targets', 'backup'])
  })
})

describe('v2 styles stay inside the preview', () => {
  it('scopes every rule that could reach classic markup', () => {
    const css = read('v2.css').replace(/\/\*[\s\S]*?\*\//g, '')
    // Selectors of top-level rules. v2-only classes (.wl-v2-*) and the
    // attribute-scoped variants of them cannot match the classic app.
    const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
      .flatMap(m => m[2].split(',').map(s => s.trim()))
      .filter(Boolean)
    // Keyframe steps (30%, from, to) are not selectors and match nothing.
    const isKeyframeStep = (s) => /^(\d+(\.\d+)?%|from|to)$/.test(s)
    const loose = selectors.filter(s => !isKeyframeStep(s) && !s.startsWith('html.wl-v2') && !/\.wl-v2-/.test(s))
    expect(loose).toEqual([])
  })
})

describe('v2 trade ticket', () => {
  const sheet = read('components/TradeSheet.jsx')
  const ticket = sheet.slice(sheet.indexOf('// ── v2 ticket'), sheet.lastIndexOf('\n  return (\n    <>'))

  it('records the side the user is on, not the side the sheet opened on', () => {
    // Opening Buy and switching to Sell used to save a buy.
    expect(sheet).toMatch(/wallet_id: wid, type: mode,/)
    expect(sheet).not.toMatch(/wallet_id: wid, type,/)
  })

  it('keeps every choice the classic sheet offers', () => {
    for (const piece of ['CATEGORIES.map', 'BUY_WITH_OPTIONS', 'SELL_FOR_OPTIONS', '{assetPicker}',
      '{confirmNoneOverlay}', '<TradeSignal', 'setWalletId', 'setDate', 'switchMetalUnit', 'switchAmtMode', 'submit()']) {
      expect(ticket, piece).toContain(piece)
    }
  })

  it('confirms with a slide, and the slide is disabled until the trade is complete', () => {
    expect(ticket).toMatch(/<SlideToConfirm[^>]*disabled=\{!ready\}/)
  })
})

describe('v2 merges Analysis into Coach', () => {
  const coach = read('pages/Coach.jsx')
  const dash = read('pages/Dashboard.jsx')

  it('hosts the same AI analysis, Technicals and Risk tools in Coach', () => {
    expect(dash).toMatch(/export function ToolsTab\(/)
    expect(coach).toMatch(/import\('\.\/Dashboard'\)\.then\(m => \(\{ default: m\.ToolsTab \}\)\)/)
    expect(coach).toMatch(/v2 && activeSection === 'analysis'[\s\S]*<ToolsTab /)
  })

  it('sends anything that opens the tools tab to Coach while previewing', () => {
    expect(dash).toMatch(/navigate\('\/coach', \{ state: \{ section: 'analysis', tool \} \}\)/)
  })

  it('keeps Coach shortcuts inside Coach instead of bouncing to the old tab', () => {
    expect(coach).toContain("if (v2) openAnalysis('ai')")
    expect(coach).toContain("if (v2) openAnalysis('risk')")
  })
})
