import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V2_PATH, isV2Path, isV2Active, homePath } from './v2Preview'
import { CHART_TIMEFRAMES, DEFAULT_TIMEFRAME } from './chartSignals'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('v2 is live on /dashboard', () => {
  it('is on for every app page', () => {
    for (const p of ['/dashboard', '/coach', '/settings', '/asset/bitcoin']) expect(isV2Active(p)).toBe(true)
  })

  it('sends "Dashboard" to /dashboard, and treats /v2test as the old preview URL', () => {
    expect(homePath()).toBe('/dashboard')
    expect(V2_PATH).toBe('/dashboard')
    expect(isV2Path('/v2test/')).toBe(true)
    expect(isV2Path('/dashboard')).toBe(false)
  })

  it('redirects the old preview URL to the dashboard', () => {
    const app = read('App.jsx')
    expect(app).toMatch(/if \(isV2Path\(location\.pathname\)\) \{\s*navigate\(V2_PATH, \{ replace: true/)
    expect(app).not.toContain('exitV2')
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

describe('v2 Coach has no duplicate sections', () => {
  const coach = read('pages/Coach.jsx')
  const v2Sections = coach.slice(coach.indexOf('const SECTIONS = v2 ? ['), coach.indexOf('] : [', coach.indexOf('const SECTIONS = v2 ? [')))

  it('lists Decision Engine, Wallet Score, Analysis and Alpha, and no shortcut section', () => {
    const ids = [...v2Sections.matchAll(/id: '(\w+)'/g)].map(m => m[1])
    expect(ids).toEqual(['engine', 'eval', 'analysis', 'alpha'])
  })
})

describe('v2 Coach Wallet Score', () => {
  const coach = read('pages/Coach.jsx')
  it("shows the dashboard's evaluation, not Coach's older copy", () => {
    expect(read('pages/Dashboard.jsx')).toMatch(/export const WalletEvalTab = memo\(/)
    expect(coach).toMatch(/v2 && activeSection === 'eval'[\s\S]*?<WalletEvalTab /)
    expect(coach).toContain("{!v2 && activeSection === 'eval'")
  })
})

describe('v2 asset page', () => {
  const page = read('pages/AssetDetail.jsx')
  it('draws the indicator chart only in v2 and keeps the classic chart otherwise', () => {
    expect(page).toMatch(/<IndicatorChart coinId=\{coinId\}/)
    expect(page).toContain('{!v2 && <>')
    expect(page).toMatch(/if \(v2\) return\s+const alive = \{ current: true \}\s+loadChart\(alive\)/)
  })
})

describe('indicator chart', () => {
  const chart = read('components/IndicatorChart.jsx')
  it('opens on daily candles every time, with 1H and 4H available', () => {
    expect(chart).toMatch(/useState\(DEFAULT_TIMEFRAME\)/)
    expect(DEFAULT_TIMEFRAME).toBe('1d')
    expect(Object.keys(CHART_TIMEFRAMES)).toEqual(['15m', '1h', '4h', '1d', '1w'])
  })
  it('has a full-screen view', () => {
    expect(chart).toContain('className="ic-full"')
    expect(chart).toMatch(/setFull\(false\)/)
  })
})

describe('Technicals uses the asset page chart', () => {
  it('replaces the Magic Indicator in Coach → Analysis and on the Technicals page', () => {
    const dash = read('pages/Dashboard.jsx')
    const tech = read('pages/Technicals.jsx')
    expect(dash).toMatch(/tool === 'ta'[^\n]*<TechChartPanel /)
    expect(tech).toContain('<TechChartPanel ')
    expect(dash + tech).not.toContain('MagicAnalysisPanel')
    expect(read('components/TechChartPanel.jsx')).toContain('<IndicatorChart ')
  })
})

describe('v2 bars are solid', () => {
  it('keeps scrolling content from showing through the top and bottom bars', () => {
    const css = read('v2.css')
    const top = css.slice(css.indexOf('html.wl-v2 .wl-topbar {'), css.indexOf('}', css.indexOf('html.wl-v2 .wl-topbar {')))
    expect(top).not.toMatch(/transparent\);\s*$/m)
    expect(top).toMatch(/var\(--v2-b1\);/)
    expect(css).toMatch(/--v2-bar: var\(--v2-b2\);/)
    expect(css).toMatch(/--v2-bar: #ffffff;/)
  })
})
