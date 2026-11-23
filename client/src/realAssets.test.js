import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  sanitizeMeta, saveRealAsset, getRealAsset, loadRealAssets, setRealValue, kindFor, estimatedPrice, estimatedPrices,
  summarize, projection, valueByYear, notesFor, cashLadder, loansOn, monthlyIncome, todoList, newAssetId, DEFAULT_GROWTH,
} from './realAssets'
import { REAL_ASSETS_COPY } from './realAssetsCopy'
import { api } from './api'

// Real assets in depth: a flat, a car, a watch, a business or money owed get
// a value that keeps up with time, what is really yours, the yield, how fast
// it turns into cash, smart notes and a to-do list, all kept on the device.

const here = dirname(fileURLToPath(import.meta.url))
const YEAR = 365.25 * 86_400_000
const NOW = Date.UTC(2026, 10, 23)

beforeEach(() => localStorage.clear())

describe('what is kept about a real asset', () => {
  it('only known fields, of the right types', () => {
    const m = sanitizeMeta({ kind: 'home', use: 'rent', rent: '380', loanLeft: -5, city: '  Cairo ', size: 140, hack: '<x>', anchor: { price: 62000, at: 5 } })
    expect(m).toEqual({ kind: 'home', growth: DEFAULT_GROWTH.home, anchor: { price: 62000, at: 5 }, use: 'rent', city: 'Cairo', size: 140, rent: 380 })
    expect(sanitizeMeta({ kind: 'spaceship' }).kind).toBe('other')
    expect(sanitizeMeta({ kind: 'car', growth: -400 }).growth).toBe(-50)
  })

  it('is saved for other: ids only, and kept in the full backup code', async () => {
    expect(saveRealAsset('bitcoin', { kind: 'home' })).toBeNull()
    saveRealAsset('other:flat', { kind: 'home', rent: 380 })
    expect(getRealAsset('other:flat').rent).toBe(380)
    const api = readFileSync(join(here, 'api.js'), 'utf8')
    expect(api).toMatch(/ra: loadData\(RA_STORE, \{\}\)/)
    expect(api).toMatch(/if \(realAssets\) saveData\(RA_STORE, realAssets\)/)
  })
})

describe('the value', () => {
  it('starts from the last real price and changes by the yearly rate', () => {
    const m = { kind: 'home', growth: 5, anchor: { price: 62000, at: NOW - 3 * YEAR } }
    expect(estimatedPrice(m, NOW)).toBeCloseTo(62000 * 1.05 ** 3, 0)
    expect(estimatedPrice({ kind: 'home', growth: 5 }, NOW)).toBeNull()
  })

  it('a car loses value', () => {
    const m = { kind: 'car', growth: -15, anchor: { price: 24000, at: NOW - 2 * YEAR } }
    expect(estimatedPrice(m, NOW)).toBeCloseTo(24000 * 0.85 ** 2, 0)
  })

  it('a new real price restarts the estimate from today', () => {
    saveRealAsset('other:flat', { kind: 'home', growth: 5, anchor: { price: 62000, at: NOW - 3 * YEAR } })
    setRealValue('other:flat', 80000, NOW)
    expect(estimatedPrices(NOW)['other:flat']).toBe(80000)
  })

  it('feeds the price the portfolio shows', () => {
    const src = readFileSync(join(here, 'api.js'), 'utf8')
    expect(src).toMatch(/if \(estimates\[id\] > 0\) result\[id\] = \{ usd: estimates\[id\], usd_24h_change: 0, source: 'estimate' \}/)
  })

  it('getPrices returns the estimate for a described asset, the manual price otherwise', async () => {
    saveRealAsset('other:flat', { kind: 'home', growth: 0, anchor: { price: 70000, at: Date.now() - 1000 } })
    api.setManualPrice('other:flat', 1)
    api.setManualPrice('other:watch', 900)
    const p = await api.getPrices('other:flat,other:watch')
    expect(p['other:flat'].usd).toBeCloseTo(70000, 0)
    expect(p['other:flat'].source).toBe('estimate')
    expect(p['other:watch'].usd).toBe(900)
  })
})

describe('the asset page numbers', () => {
  const m = { kind: 'home', growth: 5, rent: 380, loanLeft: 18500, loanMonthly: 190, anchor: { price: 62000, at: NOW - 3 * YEAR } }
  const s = summarize(m, { amount: 1, total_invested: 62000 }, 71400, NOW)

  it('value, range, gain, what is yours and the yield', () => {
    expect(s.value).toBe(71400)
    expect(s.low).toBeLessThan(71400)
    expect(s.high).toBeGreaterThan(71400)
    expect(s.gainPct).toBeCloseTo(15.16, 1)
    expect(s.equity).toBe(52900)
    expect(s.yieldPct).toBeCloseTo(6.39, 1)
    expect(s.netMonthly).toBe(190)
    expect(s.sellDays).toBe(90)
  })

  it('five years ahead, and a car year by year', () => {
    const p = projection(100, 10, 5)
    expect(p).toHaveLength(6)
    expect(p[5]).toBeCloseTo(161.05, 1)
    const years = valueByYear({ kind: 'car', growth: -15, year: 2022, anchor: { price: 24000, at: Date.UTC(2022, 0, 1) } }, NOW, 3)
    expect(years[0].year).toBe(2022)
    expect(years.at(-1).year).toBe(2029)
    expect(years.find(y => y.year === 2026).past).toBe(true)
    expect(years.find(y => y.year === 2027).past).toBe(false)
  })

  it('notes: an old value, insurance due, an old car, rent against the loan, the legacy plan', () => {
    const old = { ...m, insuranceDue: '2026-12-10' }
    const ids = notesFor(old, s, { now: NOW, inPlan: false }).map(n => n.id)
    expect(ids).toEqual(expect.arrayContaining(['stale', 'insurance', 'rentCovers', 'goodYield', 'legacy']))
    const car = { kind: 'car', growth: -15, year: 2021, anchor: { price: 1, at: NOW } }
    expect(notesFor(car, { growth: -15, yieldPct: null }, { now: NOW }).map(n => n.id)).toContain('sellCar')
    expect(notesFor({ kind: 'art', growth: 3 }, { growth: 3, yieldPct: null }, { now: NOW }).map(n => n.id)).toContain('noStart')
  })
})

describe('Home: everything owned', () => {
  it('how fast it turns into cash, loans, income and the to-do list', () => {
    saveRealAsset('other:flat', { kind: 'home', rent: 380, loanLeft: 18500, anchor: { price: 62000, at: NOW - 2 * YEAR } })
    saveRealAsset('other:car', { kind: 'car', insuranceDue: '2026-12-16', anchor: { price: 24000, at: NOW } })
    const rows = [
      { coin_id: 'bitcoin', value: 40000 },
      { coin_id: 'other:flat', coin_name: 'Flat', value: 71400 },
      { coin_id: 'other:car', coin_name: 'Car', value: 17800 },
    ]
    expect(cashLadder(rows)).toEqual({ today: 40000, weeks: 17800, months: 71400 })
    expect(loansOn(rows)).toBe(18500)
    expect(monthlyIncome(rows)).toBe(380)
    const todo = todoList(rows, loadRealAssets(), NOW)
    // An overdue check comes before insurance due in 23 days.
    expect(todo.map(t => t.what)).toEqual(['value', 'insurance'])
  })

  it('guesses what an undescribed Other asset is from its name', () => {
    expect(kindFor('other:real-estate', null)).toBe('home')
    expect(kindFor('other:family car', null)).toBe('car')
    expect(kindFor('other:rolex', null)).toBe('gem')
    expect(kindFor('other:thing', null)).toBe('other')
  })

  it('a new asset gets a free id', () => {
    expect(newAssetId('Flat in Cairo', [])).toBe('other:flat-in-cairo')
    expect(newAssetId('Flat in Cairo', ['other:flat-in-cairo'])).toBe('other:flat-in-cairo-2')
    expect(newAssetId('شقة', [])).toBe('other:شقة')
  })
})

describe('the copy', () => {
  it('has every key in every language, and no em dashes', () => {
    const keys = Object.keys(REAL_ASSETS_COPY.en)
    for (const [lang, pack] of Object.entries(REAL_ASSETS_COPY)) {
      for (const k of keys) expect(typeof pack[k], `${lang}.${k}`).toBe(typeof REAL_ASSETS_COPY.en[k])
    }
    expect(readFileSync(join(here, 'realAssetsCopy.js'), 'utf8')).not.toContain('—')
  })

  it('is wired: the route, the asset page, Home and the trade sheet', () => {
    expect(readFileSync(join(here, 'App.jsx'), 'utf8')).toMatch(/path="\/real-assets\/new" element=\{<RealAssetAdd \/>\}/)
    expect(readFileSync(join(here, 'pages/AssetDetail.jsx'), 'utf8')).toMatch(/startsWith\('other:'\) && \(\s+<RealAssetPanel/)
    expect(readFileSync(join(here, 'pages/Dashboard.jsx'), 'utf8')).toMatch(/<RealAssetsCard rows=\{enriched\}/)
    expect(readFileSync(join(here, 'components/TradeSheet.jsx'), 'utf8')).toMatch(/navigate\('\/real-assets\/new'\)/)
  })
})
