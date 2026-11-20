import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// A bell beside each holding on the overview opens Price Alerts with that
// asset already chosen and the target at today's price.
const here = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(here, f), 'utf8')

describe('set alert from a holding', () => {
  it('draws a bell beside each row, outside select mode', () => {
    const src = read('components/NlHoldings.jsx')
    expect(src).toMatch(/\{onAlert && !picking && \(/)
    expect(src).toMatch(/className="nl-row-more nl-row-alert"/)
    expect(src).toMatch(/onAlert\(h\)/)
  })
  it('opens Price Alerts with the asset preset', () => {
    const dash = read('pages/Dashboard.jsx')
    expect(dash).toMatch(/const \[alertPreset, setAlertPreset\]/)
    expect(dash).toMatch(/setAlertPreset\(\{ coinId: h\.coin_id, nonce: Date\.now\(\) \}\); setActiveTab\('alerts'\)/)
    expect(dash).toMatch(/preset=\{alertPreset\}/)
    const pa = read('components/PriceAlerts.jsx')
    expect(pa).toMatch(/setCoinId\(preset\.coinId\)/)
    expect(pa).toMatch(/setShowForm\(true\)/)
  })
})

describe('set alert from the asset page', () => {
  it('offers an Alert button beside Buy and Sell for a held asset', () => {
    const src = read('pages/AssetDetail.jsx')
    expect(src).toMatch(/className="action-btn alert-btn detail-act"/)
    expect(src).toMatch(/navigate\('\/dashboard', \{ state: \{ tab: 'alerts', alertCoin: coinId \} \}\)/)
  })
  it('opens Price Alerts with that asset chosen', () => {
    expect(read('pages/Dashboard.jsx')).toMatch(/if \(location\.state\?\.alertCoin\) setAlertPreset\(\{ coinId: location\.state\.alertCoin/)
  })
})
