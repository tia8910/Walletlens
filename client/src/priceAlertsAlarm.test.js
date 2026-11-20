import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Price alerts ring the same WalletLens alarm as signal and goal alerts, and
// their tab shows the same Alarm card (full-screen, sound, test).
const here = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(here, f), 'utf8')

describe('price alerts and the alarm', () => {
  it('shows the shared Alarm card, with a test, on the Price Alerts tab', () => {
    const src = read('components/PriceAlerts.jsx')
    expect(src).toMatch(/import AlarmSettings from '\.\/AlarmSettings'/)
    expect(src).toMatch(/<AlarmSettings onTest=\{/)
    expect(src).toMatch(/kind: 'price', tone: 'up'/)
  })
  it('uses the one card in Signals & goals too, so both edit the same setting', () => {
    expect(read('components/ProAlerts.jsx')).toMatch(/<AlarmSettings onChange=/)
    expect(read('components/AlarmSettings.jsx')).toMatch(/setAlarmPrefs\(\{ \[k\]: v \}\)/)
  })
  it('rings a fired price alert through the alarm', () => {
    expect(read('components/AlertEngine.jsx')).toMatch(/kind: 'price', tone: alarmTone\(\{ type: 'price'/)
  })
})
