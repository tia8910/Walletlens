import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bybitAllowed, restrictedZone, stripHidden, hideStrip, STRIP_SNOOZE_MS, BYBIT_URL, pickedCrypto,
  validBonus, currentBonus, applyRemote, BYBIT_BONUS, pickedOffer,
} from './bybitOffer'
import { DEVICE_ONLY_KEYS } from './backupCore'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('where the Bybit offer may appear', () => {
  it('uses the referral code', () => {
    expect(BYBIT_URL).toMatch(/ref=BM64KOV/)
  })

  it('stays hidden where Bybit does not serve or may not be promoted', () => {
    for (const z of ['Europe/London', 'America/New_York', 'US/Pacific', 'America/Indiana/Indianapolis',
      'America/Toronto', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tehran']) {
      expect(restrictedZone(z), z).toBe(true)
      expect(bybitAllowed({ zone: z, remote: true }), z).toBe(false)
    }
  })

  it('shows elsewhere once the site switch is on', () => {
    for (const z of ['Africa/Cairo', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata']) {
      expect(bybitAllowed({ zone: z, remote: true }), z).toBe(true)
    }
  })

  it('fails closed until the site switch says on', () => {
    expect(bybitAllowed({ zone: 'Africa/Cairo', remote: false })).toBe(false)
  })

  it('ships with the switch on, and never serves it stale', () => {
    expect(JSON.parse(read('../public/offers.json')).enabled).toBe(true)
    expect(read('../public/_headers')).toMatch(/\/offers\.json\n\s+Content-Type: application\/json\n\s+Cache-Control: no-cache/)
  })
})

describe('the holdings strip', () => {
  beforeEach(() => localStorage.clear())

  it('hides for 30 days once dismissed, then returns', () => {
    const now = 1_700_000_000_000
    expect(stripHidden(now)).toBe(false)
    hideStrip(now)
    expect(stripHidden(now + STRIP_SNOOZE_MS - 1)).toBe(true)
    expect(stripHidden(now + STRIP_SNOOZE_MS + 1)).toBe(false)
  })

  it('keeps its state on this device, out of the backup', () => {
    expect(DEVICE_ONLY_KEYS).toContain('wl_bybit_strip_hidden_until')
    expect(DEVICE_ONLY_KEYS).toContain('wl_offers_remote')
  })
})

describe('the bonus amount', () => {
  beforeEach(() => localStorage.clear())

  it('comes from the switch file, so a new prize needs no release', () => {
    expect(currentBonus()).toBe(BYBIT_BONUS)
    applyRemote({ enabled: true, bybit: { bonus: '$30' } })
    expect(currentBonus()).toBe('$30')
    applyRemote({ enabled: true, bybit: { bonus: '50 USDT' } })
    expect(currentBonus()).toBe('50 USDT')
  })

  it('goes back to the default when the file drops it', () => {
    applyRemote({ enabled: true, bybit: { bonus: '$30' } })
    applyRemote({ enabled: true })
    expect(currentBonus()).toBe(BYBIT_BONUS)
  })

  it('accepts only a plain amount, and keeps the last good one otherwise', () => {
    for (const ok of ['$20', '€25', '£10', '$12.50', '100 USDT', '30USDC']) expect(validBonus(ok), ok).toBe(ok)
    for (const bad of ['free money', '$20 guaranteed', '<b>$20</b>', '', 20, null, '$1234567'])
      expect(validBonus(bad), String(bad)).toBeNull()
    applyRemote({ enabled: true, bybit: { bonus: '$30' } })
    applyRemote({ enabled: true, bybit: { bonus: 'free money!!' } })
    expect(currentBonus()).toBe('$30')
  })

  it('is read by every placement rather than written into it', () => {
    const c = read('components/BybitOffer.jsx')
    expect(c).not.toMatch(/\$20/)
    // The crypto card, the stocks card and the strip.
    expect(c.match(/const \{ allowed, bonus \} = useBybitOffer\(\)/g)).toHaveLength(3)
    expect(JSON.parse(read('../public/offers.json')).bybit.bonus).toBe('$20')
    expect(DEVICE_ONLY_KEYS).toContain('wl_bybit_bonus')
  })
})

describe('the interest picker', () => {
  beforeEach(() => localStorage.clear())

  it('counts only an explicit crypto choice', () => {
    expect(pickedCrypto()).toBe(false)
    localStorage.setItem('wl_interests', JSON.stringify([]))
    expect(pickedCrypto()).toBe(false)
    localStorage.setItem('wl_interests', JSON.stringify(['stocks', 'metals']))
    expect(pickedCrypto()).toBe(false)
    localStorage.setItem('wl_interests', JSON.stringify(['stocks', 'crypto']))
    expect(pickedCrypto()).toBe(true)
  })

  it('puts the strip on the dashboard for them, once, even with no crypto held', () => {
    const d = read('pages/Dashboard.jsx')
    expect(d).toMatch(/<BybitInterestStrip holdsCrypto=\{enriched\.some\(h => categorizeAsset\(h\) === 'crypto'\)\} holdsStocks=\{enriched\.some\(h => categorizeAsset\(h\) === 'stocks'\)\} holdsMetals=\{enriched\.some\(h => categorizeAsset\(h\) === 'metals'\)\} \/>/)
    // Holding crypto or stocks moves it under that list rather than showing it twice.
    expect(read('components/BybitOffer.jsx')).toMatch(/if \(holdsCrypto \|\| holdsStocks \|\| holdsMetals \|\| !picked\) return null/)
  })
})

describe('tokenized stocks', () => {
  beforeEach(() => localStorage.clear())

  it('are offered to people who picked stocks or ETFs, crypto first when both', () => {
    expect(pickedOffer()).toBeNull()
    localStorage.setItem('wl_interests', JSON.stringify(['cash']))
    expect(pickedOffer()).toBeNull()
    localStorage.setItem('wl_interests', JSON.stringify(['gold']))
    expect(pickedOffer()).toBe('metals')
    localStorage.setItem('wl_interests', JSON.stringify(['gold', 'stocks']))
    expect(pickedOffer()).toBe('stocks')
    localStorage.setItem('wl_interests', JSON.stringify(['etfs']))
    expect(pickedOffer()).toBe('stocks')
    localStorage.setItem('wl_interests', JSON.stringify(['stocks', 'crypto']))
    expect(pickedOffer()).toBe('crypto')
  })

  it('sit on stock pages and in Technical Analysis for a stock', () => {
    const a = read('pages/AssetDetail.jsx')
    expect(a).toMatch(/assetClass\(coinId\) === 'stock' \? 'stocks'/)
    expect(a).toMatch(/\['gold', 'silver', 'copper', 'platinum'\]\.includes\(assetClass\(coinId\)\) \? 'metals'/)
    expect(a.match(/\{showStockOffer && <BybitStockCard symbol=\{coin\.symbol\} kind=\{tradFiKind\}/g)).toHaveLength(2)
    expect(read('components/TechChartPanel.jsx')).toMatch(/kind="metals" placement="technicals_metal"/)
    expect(read('components/TechChartPanel.jsx')).toMatch(/assetClass\(cur\.coin_id\) === 'stock' && <BybitStockCard/)
  })

  it('get one strip on the dashboard, and never beside the crypto one', () => {
    const d = read('pages/Dashboard.jsx')
    expect(d).toMatch(/cat === 'stocks' && !isDemo && !grouped\.crypto\?\.length && <BybitStrip variant="stocks"/)
    expect(d).toMatch(/cat === 'metals' && !isDemo && !grouped\.crypto\?\.length && !grouped\.stocks\?\.length && <BybitStrip variant="metals"/)
  })

  it('say plainly that a token is not the share', () => {
    const en = read('i18n/en.js')
    expect(en).toMatch(/byStocksFine: "[^"]*you don't own the share[^"]*high risk[^"]*availability varies by region/)
  })
})

describe('placements', () => {
  it('sits on the crypto asset page and once after the crypto holdings', () => {
    expect(read('pages/AssetDetail.jsx').match(/\{showFlow && <BybitCard /g)).toHaveLength(2)
    expect(read('pages/Dashboard.jsx')).toMatch(/\{cat === 'crypto' && !isDemo && <BybitStrip \/>\}/)
    // Technical Analysis: under the smart money card, crypto only (the panel
    // never charts a stablecoin).
    expect(read('components/TechChartPanel.jsx')).toMatch(/<BybitCard symbol=\{cur\.coin_symbol\} placement="technicals" \/>/)
  })

  it('always carries the referral disclosure', () => {
    const c = read('components/BybitOffer.jsx')
    expect(c).toMatch(/t\('byFine'\)/)
    expect(c).toMatch(/t\('byStripFine'\)/)
    expect(c).toMatch(/t\('byPartner'\)/)
  })

  it('is not a popup after adding an asset', () => {
    expect(read('components/BybitOffer.jsx')).not.toMatch(/sheet|modal/i)
  })
})
