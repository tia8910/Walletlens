import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isNewLook, setNewLook, applyLookParam } from './newLook'
import { moodOf } from './components/HomeTop.jsx'

// The light card redesign is previewed behind a switch. These pin what makes
// it safe: it is on by default, can be switched back, it scopes itself, and it moves
// features rather than removing them.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('the new-look switch', () => {
  beforeEach(() => localStorage.clear())

  it('is on by default and follows Settings or a ?look= link', () => {
    expect(isNewLook()).toBe(true)
    setNewLook(false); expect(isNewLook()).toBe(false)
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

describe('home card and holdings', () => {
  it('lists every holding, not a five-row preview under "All"', () => {
    const src = read('components/NlHoldings.jsx')
    expect(src).not.toMatch(/slice\(0, PREVIEW\)/)
    expect(src).toMatch(/const shown = base\n/)
  })

  it('names the wallet on the card and lets several wallets be switched', () => {
    const top = read('components/HomeTop.jsx')
    expect(top).toMatch(/className=\{`nl-wallet/)
    expect(top).toMatch(/wallets\.length > 1 && \([\s\S]*?<select value=\{walletId\}/)
    expect(read('pages/Dashboard.jsx')).toMatch(/<HomeTop[\s\S]{0,400}walletId=\{selectedWalletId\} onWallet=/)
  })

  it('breaks the total down by category and takes the theme colour', () => {
    expect(read('components/HomeTop.jsx')).toMatch(/className="nl-hero-cats"/)
    expect(read('pages/Dashboard.jsx')).toMatch(/<HomeTop[\s\S]{0,200}cats=\{catBreakdown\}/)
    const hero = read('v3.css').match(/\.nl-hero \{[\s\S]*?\n\}/)[0]
    expect(hero).toMatch(/var\(--g\)/)
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
  it('keeps one holdings list, in the mockup rows, with every tool the old list had', () => {
    expect(top).not.toContain('nl-row')
    const hold = read('components/NlHoldings.jsx')
    for (const piece of ['setSearch', 'setSort', 'setDir', 'setBreakEven', 'onExcel', 'onPdf', 'setCat', 'selectedStats', 'bindRow(h)']) expect(hold, piece).toContain(piece)
    expect(dash).toMatch(/\{nlHomeView && \(\s*<>\s*<NlHoldings/)
    expect(dash).toMatch(/\{!nlHome && <div className="glass-card">/)
    // The old row's ⋮ panel actions moved into the long-press menu.
    for (const k of ['dsSetTarget', 'dsSetVision', 'dsRiskScan', 'nlSelect']) expect(dash).toMatch(new RegExp(`holdingMenu[\\s\\S]*t\\('${k}'\\)`))
    // Magic Score opened the same chart as Technicals; it is gone.
    expect(dash).not.toContain("t('dsMagicScore')")
  })
  it('opens the voice panel and scrolls down to it once it has loaded', () => {
    const dash = read('pages/Dashboard.jsx')
    expect(dash).toContain('<div className="dvx-voice-import-panel">')
    expect(dash).toMatch(/kind === 'voice' \? '\.dvx-voice-import-panel'/)
  })
  it('moves the analysis cards to Portfolio insights, reachable from Home and More', () => {
    expect(dash).toMatch(/const nlHomeView = nlHome && !nlInsights/)
    expect(dash).toMatch(/onClick=\{openInsights\}/)
    expect(read('pages/More.jsx')).toMatch(/go\(home, \{ tab: 'overview', insights: true \}\)/)
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

describe('the top of the new look', () => {
  const app = read('App.jsx')
  it('keeps one price strip; smart money moves into its popup', () => {
    expect(app).toMatch(/<PriceTicker v3=\{v2 && newLook\} \/>/)
    expect(app).toMatch(/\{!\(v2 && newLook\) && <SmartMoneyTicker \/>\}/)
    const sheet = read('components/PricesSheet.jsx')
    expect(sheet).toContain('useSmartFlows(')
    expect(read('components/PriceTicker.jsx')).toMatch(/className="nl-ticker-all" onClick=\{\(\) => setSheet\(true\)\}/)
  })
  it('puts Report an issue in the top bar, sending the page instead of an answer', () => {
    expect(app).toMatch(/<AiReport surface="topbar" general output=\{\(\) => `Reported from \$\{location\.pathname\}`\}/)
  })
  it('draws each theme by its own mark on More', () => {
    expect(read('pages/More.jsx')).toMatch(/th\.logo \? <img src=\{th\.logo\}/)
  })
})

describe('checking holdings and filtering to them', () => {
  it('a tick tool checks rows, and a Selected chip shows only those', () => {
    const hold = read('components/NlHoldings.jsx')
    expect(hold).toMatch(/onClick=\{\(\) => \(picking \? onToggleSelect\(h\) : onAsset\(h\)\)\}/)
    expect(hold).toMatch(/const base = selOn \? rows\.filter\(h => selected\.has\(h\.coin_id\)\) : rows/)
    expect(read('pages/Dashboard.jsx')).toMatch(/onToggleSelect=\{\(h\) => setSelectedAssets/)
  })
})
