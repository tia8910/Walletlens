import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeHoldings, summarize, signalFrom, evaluateAlerts, badgeFor, money, DEFAULT_SETTINGS, assetClass,
} from '../../extension/lib/core.js'

// The browser extension's shared core (extension/lib/core.js) and its store
// listing. The extension ships outside the web build, so these are its tests.

const here = dirname(fileURLToPath(import.meta.url))
const ext = p => readFileSync(join(here, '../../extension', p), 'utf8')

describe('extension core', () => {
  it('sums holdings at average cost, so a sale keeps P&L honest', () => {
    const m = computeHoldings([
      { coin_id: 'bitcoin', type: 'buy', amount: 2, total_cost: 100 },
      { coin_id: 'bitcoin', type: 'sell', amount: 1, total_cost: 80 },
      { coin_id: 'ethereum', type: 'buy', amount: 1, total_cost: 10, wallet_id: 2 },
    ])
    expect(m.get('bitcoin')).toMatchObject({ amount: 1, totalCost: 50 })
    expect([...computeHoldings([{ coin_id: 'x', type: 'buy', amount: 1, total_cost: 1, wallet_id: 2 }, { coin_id: 'y', type: 'buy', amount: 1, total_cost: 1, wallet_id: 3 }], 2).keys()]).toEqual(['x'])
  })

  it('values the portfolio and its day change', () => {
    const m = computeHoldings([{ coin_id: 'bitcoin', type: 'buy', amount: 1, total_cost: 90 }, { coin_id: 'real:home', type: 'buy', amount: 1, total_cost: 100 }])
    const s = summarize(m, { bitcoin: { usd: 110, chg: 10 }, 'real:home': { usd: 100, chg: null, estimated: true } })
    expect(s.total).toBe(210)
    expect(s.dayChange).toBeCloseTo(10)
    expect(s.pnl).toBe(20)
    expect(assetClass('real:home')).toBe('property')
    expect(assetClass('stock:aapl')).toBe('stocks')
  })

  it('reads a trend into buy, sell or hold with a stop below and targets above', () => {
    const wave = (dir) => Array.from({ length: 90 }, (_, i) => { const c = 100 * (1 + dir * i * 0.002 + Math.sin(i / 2.3 + 2) * 0.03); return [i, c, c * 1.01, c * 0.99, c] })
    const up = signalFrom(wave(1)), down = signalFrom(wave(-1))
    expect(up.action).toBe('buy')
    expect(up.stop).toBeLessThan(up.last)
    expect(up.tp[0]).toBeGreaterThan(up.last)
    expect(down.action).toBe('sell')
    expect(down.stop).toBeGreaterThan(down.last)
    expect(signalFrom([[0, 1, 1, 1, 1]])).toBeNull()
  })

  it('fires a price alert once, then switches it off; move and digest at most once a day', () => {
    const settings = { ...DEFAULT_SETTINGS, digest: { on: true, hour: 9, lastDay: '' }, alerts: [{ id: 'a', kind: 'below', coinId: 'ethereum', name: 'Ethereum', usd: 3800, on: true }], _rates: { USD: 1 } }
    const now = new Date('2026-10-10T10:00:00')
    const first = evaluateAlerts(settings, { prices: { ethereum: { usd: 3700 } }, dayPct: -4, total: 1000, now })
    expect(first.notes.map(n => n.id)).toEqual(['alert-a', 'move-2026-10-10', 'digest-2026-10-10'])
    expect(first.settings.alerts[0].on).toBe(false)
    const again = evaluateAlerts({ ...first.settings, _rates: { USD: 1 } }, { prices: { ethereum: { usd: 3600 } }, dayPct: -5, total: 900, now })
    expect(again.notes).toEqual([])
  })

  it('never puts a balance in a notification when balances are hidden', () => {
    const r = evaluateAlerts({ ...DEFAULT_SETTINGS, hideBalances: true, digest: { on: true, hour: 0, lastDay: '' }, _rates: { USD: 1 } }, { prices: {}, dayPct: 5, total: 123456, now: new Date('2026-10-10T10:00:00') })
    expect(r.notes.length).toBe(2)
    for (const n of r.notes) expect(n.title + n.message).not.toMatch(/123/)
  })

  it('formats money in the chosen currency and the badge in four characters', () => {
    expect(money(1234.5, 'EGP', { EGP: 48 })).toBe('EGP 59,256')
    expect(money(5, 'EUR', {})).toBe('$5.00')
    expect(badgeFor(1.39)).toEqual({ text: '+1.4', color: '#10b981' })
    expect(badgeFor(-12.4).text).toBe('-12')
  })
})

describe('extension package and listing', () => {
  const manifest = JSON.parse(ext('manifest.json'))
  const listing = ext('STORE_LISTING.md')
  const BRANDS = /binance|coinbase|kraken|robinhood|metamask|bybit|okx|ledger|trezor|etoro/i

  it('is version 2 with a name and summary inside the store limits', () => {
    expect(manifest.version).toBe('2.0.0')
    expect(manifest.name.length).toBeLessThanOrEqual(75)
    expect(manifest.description.length).toBeLessThanOrEqual(132)
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' })
  })

  it('names no other company in the listing, the manifest or the popup (the 1.5 rejection)', () => {
    const description = listing.slice(listing.indexOf('## Description'), listing.indexOf('## Single purpose'))
    expect(description).not.toMatch(BRANDS)
    expect(JSON.stringify(manifest)).not.toMatch(BRANDS)
    expect(ext('popup.html')).not.toMatch(BRANDS)
    expect(description.length).toBeLessThan(16000)
  })

  it('gives every asset a picture and connects Google Drive through the site', () => {
    const popup = ext('popup.js'), html = ext('popup.html')
    const coins = popup.match(/const BUNDLED_COINS = new Set\((\[[^\]]*\])\)/)[1].match(/'([a-z0-9]+)'/g).map(x => x.slice(1, -1))
    expect(coins.length).toBeGreaterThan(40)
    for (const c of coins) expect(() => ext(`logos/coins/${c}.svg`)).not.toThrow()
    for (const a of ['gold', 'silver', 'platinum', 'copper', 'home', 'bond', 'other', 'cash']) expect(() => ext(`logos/assets/${a}.svg`)).not.toThrow()
    expect(popup).toContain("const DRIVE_CONNECT = SITE + '/dashboard?drive=connect'")
    expect(html).toContain('id="drive-card"')
    expect(html).toContain('Restore from Google Drive')
    // The content script shares only whether Drive is on and when it last ran.
    const content = ext('content.js')
    expect(content).toMatch(/return \{ connected, backupAt \}/)
    expect(content).not.toMatch(/sendMessage\([^)]*wl_drive_(token|refresh)/)
  })

  it('explains every permission it asks for', () => {
    for (const perm of manifest.permissions) expect(listing).toMatch(new RegExp(`\\*\\*${perm}\\*\\*:`))
  })
})
