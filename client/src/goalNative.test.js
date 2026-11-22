import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { goalPayload, quoteKeyFor, syncNativeGoals, nativeFiredGoals, hasNativeGoals } from './goalNative'
import { checkAlerts } from './components/AlertEngine'
import { PRO_ALERTS_KEY, alarmTone } from './alertRules'
import { parseQuoteList } from '../../workers/push/index.js'

// Goal alerts (portfolio value, P&L, a holding's share) with the Android app
// closed: the app hands the goals and holdings to the phone's own 15 minute
// check, which asks the server for prices by asset only.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ANDROID = join(ROOT, 'walletlens_source/release_package/app/src/main/java/live/walletlens/twa')
const t = (k) => (k.startsWith('alGoal') ? (...a) => `${k}|${a.join('|')}` : k)

describe('what the Android check is given', () => {
  it('each goal with its text, each holding with amount, cost and price key, and the last prices', () => {
    const goals = [{ type: 'goal', id: 'g1', armedAt: 9, kind: 'value_above', target: 10000, wasTrue: false }]
    const holdings = [
      { coin_id: 'bitcoin', coin_symbol: 'BTC', amount: 0.1, total_invested: 5000 },
      { coin_id: 'stock:aapl', coin_symbol: 'AAPL', amount: 3, total_invested: 500 },
      { coin_id: 'fiat:usd', coin_symbol: 'USD', amount: 100, total_invested: 100 },
    ]
    const prices = { bitcoin: { usd: 90000 }, 'stock:aapl': { usd: 200 }, 'fiat:usd': { usd: 1 } }
    const p = goalPayload({ goals, holdings, prices, t, alarmTone })
    expect(p.rules).toEqual([{
      id: 'g1', armedAt: 9, kind: 'value_above', target: 10000, coin_id: null, wasTrue: false, tone: 'up',
      title: 'alGoalTitle_value_above|', body: 'alGoalBody_value_above|$10,000|',
    }])
    expect(p.holdings).toEqual([
      { coin_id: 'bitcoin', amount: 0.1, invested: 5000, q: 'crypto:bitcoin:BTC' },
      { coin_id: 'stock:aapl', amount: 3, invested: 500, q: 'stock:aapl:AAPL' },
      { coin_id: 'fiat:usd', amount: 100, invested: 100 },
    ])
    expect(p.prices).toEqual({ bitcoin: 90000, 'stock:aapl': 200, 'fiat:usd': 1 })
  })

  it('no goals: no holdings either, which stops the check', () => {
    const p = goalPayload({ goals: [], holdings: [{ coin_id: 'bitcoin', amount: 1 }], prices: {}, t, alarmTone })
    expect(p).toEqual({ rules: [], holdings: [], prices: {} })
  })

  it('a metal is priced as a metal', () => {
    expect(quoteKeyFor({ coin_id: 'metal:xau', coin_symbol: 'XAU' })).toBe('metal:xau:XAU')
  })
})

describe('the bridge', () => {
  afterEach(() => { delete window.AndroidBridge })

  it('is used only inside the Android app', () => {
    expect(hasNativeGoals()).toBe(false)
    expect(syncNativeGoals({ rules: [] })).toBe(false)
    expect(nativeFiredGoals().size).toBe(0)
    const syncGoalAlerts = vi.fn(() => true)
    window.AndroidBridge = { syncGoalAlerts, goalAlertsFired: () => '["g1:9"]' }
    expect(syncNativeGoals({ rules: [] })).toBe(true)
    expect(syncGoalAlerts).toHaveBeenCalledWith('{"rules":[]}')
    expect([...nativeFiredGoals()]).toEqual(['g1:9'])
  })
})

describe('the app, on opening', () => {
  beforeEach(() => { localStorage.clear() })

  it('marks a goal the phone already rang, without ringing it again', async () => {
    localStorage.setItem(PRO_ALERTS_KEY, JSON.stringify([{ type: 'goal', id: 'g1', armedAt: 9, kind: 'value_above', target: 10, wasTrue: false }]))
    const fired = await checkAlerts({
      t, getPrices: async () => ({ bitcoin: { usd: 100 } }),
      getPortfolio: async () => [{ coin_id: 'bitcoin', amount: 1, total_invested: 50 }],
      getCandles: async () => ({ candles: [] }),
      getNativeGoalFired: () => new Set(['g1:9']),
    })
    expect(fired).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(PRO_ALERTS_KEY))[0].triggered).toBe(true)
  })

  it('hands the still-armed goals to the phone', async () => {
    localStorage.setItem(PRO_ALERTS_KEY, JSON.stringify([{ type: 'goal', id: 'g1', armedAt: 9, kind: 'value_above', target: 1000, wasTrue: false }]))
    const onGoals = vi.fn()
    await checkAlerts({
      t, getPrices: async () => ({ bitcoin: { usd: 100 } }),
      getPortfolio: async () => [{ coin_id: 'bitcoin', amount: 1, total_invested: 50 }],
      getCandles: async () => ({ candles: [] }), onGoals,
    })
    expect(onGoals).toHaveBeenCalledTimes(1)
    expect(onGoals.mock.calls[0][0].goals.map(g => g.id)).toEqual(['g1'])
    expect(onGoals.mock.calls[0][0].holdings).toHaveLength(1)
  })
})

describe('the server price lookup', () => {
  it('takes assets only, in a strict shape, at most 60', () => {
    expect(parseQuoteList('crypto:bitcoin:BTC,stock:aapl:AAPL,metal:xau:XAU')).toEqual([
      { kind: 'crypto', id: 'bitcoin', symbol: 'BTC', key: 'crypto:bitcoin:BTC' },
      { kind: 'stock', id: 'aapl', symbol: 'AAPL', key: 'stock:aapl:AAPL' },
      { kind: 'metal', id: 'xau', symbol: 'XAU', key: 'metal:xau:XAU' },
    ])
    expect(parseQuoteList('fiat:usd:USD,crypto::BTC,junk,crypto:a b:X')).toEqual([])
    expect(parseQuoteList(Array.from({ length: 80 }, (_, i) => `crypto:c${i}:C${i}`).join(','))).toHaveLength(60)
  })
})

describe('the Android check', () => {
  const read = (f) => readFileSync(join(ANDROID, f), 'utf8')

  it('runs every 15 minutes while online, only while there is a goal', () => {
    const w = read('GoalAlertWorker.java')
    expect(w).toMatch(/PeriodicWorkRequest\.Builder\(GoalAlertWorker\.class, 15, TimeUnit\.MINUTES\)/)
    expect(w).toMatch(/NetworkType\.CONNECTED/)
    expect(w).toMatch(/if \(live\.isEmpty\(\)\) \{\s+wm\.cancelUniqueWork\(WORK_NAME\)/)
    expect(w).not.toMatch(/setExact|CATEGORY_ALARM|FullScreenIntent/)
  })

  it('follows the app\'s rule: rings on the move to met, once per arming, as an alarm when alarms are on', () => {
    const w = read('GoalAlertWorker.java')
    expect(w).toMatch(/if \(!holds \|\| before\) continue;/)
    expect(w).toMatch(/if \(priced != holdings\.length\(\) \|\| priced == 0\) return Result\.success\(\);/)
    expect(w).toMatch(/NotificationHelper\.alarmEnabled\(ctx\)\) helper\.showAlarm/)
    for (const k of ['value_above', 'value_below', 'pnl_above', 'pnl_below', 'weight_above']) expect(w).toContain(`case "${k}"`)
    expect(w).toMatch(/return pnlPct <= -Math\.abs\(x\);/)
  })

  it('is reachable from the page', () => {
    const b = read('WalletLensBridge.java')
    expect(b).toMatch(/@JavascriptInterface\s+public boolean syncGoalAlerts\(String json\)/)
    expect(b).toMatch(/@JavascriptInterface\s+public String goalAlertsFired\(\)/)
  })
})
