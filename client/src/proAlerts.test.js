import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluateSignal, evaluateGoal, portfolioSummary, goalHolds, makeRule, rearm, alarmKind,
  loadProAlerts, saveProAlerts, PRO_ALERTS_KEY,
} from './alertRules'
import { checkAlerts, PRICE_ALERTS_KEY } from './components/AlertEngine'
import { raiseAlarm, clearAlarm, subscribeAlarms, _resetAlarms, ALARM_KINDS } from './alarm'
import en from './i18n/en'

// Signal and goal alerts, and the full-screen alarm they ring.

const DAY = 864e5
const T0 = Date.UTC(2026, 10, 1)
const candles = (n, close = (i) => 100 + i) => Array.from({ length: n }, (_, i) => ({ t: T0 + i * DAY, o: close(i), h: close(i) + 1, l: close(i) - 1, c: close(i) }))

describe('signal alerts', () => {
  const cs = candles(10)
  const armed = (event, at = T0 + 3.5 * DAY) => ({ type: 'signal', event, armedAt: at })

  it('fire on a Buy or Sell signal on a closed candle after they were set', () => {
    const calc = { signals: [{ i: 2, side: 'buy' }, { i: 6, side: 'buy' }, { i: 7, side: 'sell' }] }
    expect(evaluateSignal(armed('buy'), cs, calc)).toEqual({ hit: true, at: cs[6].t, price: cs[6].c })
    expect(evaluateSignal(armed('sell'), cs, calc)).toEqual({ hit: true, at: cs[7].t, price: cs[7].c })
    // Only a signal from before the alert was set: nothing.
    expect(evaluateSignal(armed('buy', T0 + 7.5 * DAY), cs, { signals: [{ i: 2, side: 'buy' }] }).hit).toBe(false)
  })

  it('never fire on the candle still forming, which can change before it closes', () => {
    expect(evaluateSignal(armed('buy'), cs, { signals: [{ i: 9, side: 'buy' }] }).hit).toBe(false)
    expect(evaluateSignal(armed('golden'), cs, { crosses: [{ i: 9, kind: 'golden' }] }).hit).toBe(false)
  })

  it('fire on a golden or death cross', () => {
    const calc = { crosses: [{ i: 5, kind: 'small-golden' }, { i: 6, kind: 'golden' }, { i: 8, kind: 'death' }] }
    expect(evaluateSignal(armed('golden'), cs, calc).at).toBe(cs[6].t)
    expect(evaluateSignal(armed('death'), cs, calc).at).toBe(cs[8].t)
  })

  it('fire when RSI crosses 70 upwards or 30 downwards, not while it stays there', () => {
    const rsi = [50, 55, 60, 65, 68, 72, 75, 74, 73, 71]
    expect(evaluateSignal(armed('rsi_high'), cs, { rsi })).toMatchObject({ hit: true, at: cs[5].t, rsi: 72 })
    // Above 70 the whole time since it was set: no new crossing.
    expect(evaluateSignal(armed('rsi_high', T0 + 6.5 * DAY), cs, { rsi }).hit).toBe(false)
    const low = [50, 40, 35, 31, 29, 28, 33, 35, 36, 37]
    expect(evaluateSignal(armed('rsi_low'), cs, { rsi: low })).toMatchObject({ hit: true, at: cs[4].t, rsi: 29 })
  })
})

describe('portfolio goals', () => {
  const holdings = [
    { coin_id: 'bitcoin', amount: 0.1, total_invested: 5000 },
    { coin_id: 'metal:xau', amount: 1, total_invested: 3000 },
  ]
  const at = (btc, gold = 4000) => portfolioSummary(holdings, { bitcoin: { usd: btc }, 'metal:xau': { usd: gold } })

  it('measure value, all time P&L and each asset\'s share', () => {
    const s = at(60000)
    expect(s.total).toBe(10000)
    expect(s.pnlPct).toBeCloseTo(25, 6)
    expect(s.weights.bitcoin).toBeCloseTo(60, 6)
    expect(s.complete).toBe(true)
    // A holding with no price: not judged, so a failed fetch cannot fake a crash.
    expect(portfolioSummary(holdings, { bitcoin: { usd: 60000 } }).complete).toBe(false)
  })

  it('know each kind of goal', () => {
    const s = at(60000)
    expect(goalHolds({ kind: 'value_above', target: 9000 }, s)).toBe(true)
    expect(goalHolds({ kind: 'value_below', target: 9000 }, s)).toBe(false)
    expect(goalHolds({ kind: 'pnl_above', target: 20 }, s)).toBe(true)
    expect(goalHolds({ kind: 'pnl_below', target: 10 }, at(30000))).toBe(true)   // 7000 on 8000: −12.5%
    expect(goalHolds({ kind: 'weight_above', target: 55, coin_id: 'bitcoin' }, s)).toBe(true)
  })

  it('fire only on reaching the goal, not the moment one already met is saved', () => {
    const rule = { kind: 'value_above', target: 9000, wasTrue: null }
    const first = evaluateGoal(rule, at(60000))                 // already above: remembered, no alarm
    expect(first).toMatchObject({ hit: false, wasTrue: true })
    const dip = evaluateGoal({ ...rule, wasTrue: true }, at(40000))
    expect(dip).toMatchObject({ hit: false, wasTrue: false })
    const back = evaluateGoal({ ...rule, wasTrue: false }, at(60000))
    expect(back).toMatchObject({ hit: true, wasTrue: true, value: 10000 })
  })
})

describe('rules', () => {
  beforeEach(() => localStorage.clear())
  it('are kept on the device, and watching again forgets the last firing', () => {
    const r = makeRule({ type: 'goal', kind: 'value_above', target: 1 }, 1000)
    saveProAlerts([{ ...r, triggered: true, triggeredAt: 5, wasTrue: true }])
    expect(JSON.parse(localStorage.getItem(PRO_ALERTS_KEY))[0].id).toBe(r.id)
    const again = rearm(loadProAlerts()[0], 9000)
    expect(again).toMatchObject({ triggered: false, triggeredAt: null, armedAt: 9000, wasTrue: null })
  })
  it('each have an alarm of their own', () => {
    expect(alarmKind({ type: 'price' })).toBe('price')
    expect(alarmKind({ type: 'goal' })).toBe('goal')
    expect(['buy', 'sell', 'golden', 'death', 'rsi_high'].map(e => alarmKind({ type: 'signal', event: e }))).toEqual(['buy', 'sell', 'cross', 'cross', 'rsi'])
    for (const k of ['price', 'buy', 'sell', 'cross', 'rsi', 'goal']) expect(ALARM_KINDS).toContain(k)
  })
})

describe('the alert engine', () => {
  beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true) })
  afterEach(() => vi.restoreAllMocks())
  const T = (k) => en[k] ?? k

  it('fires a price alert on any page, marking it so it fires once', async () => {
    localStorage.setItem(PRICE_ALERTS_KEY, JSON.stringify([{ id: 1, coin_id: 'bitcoin', coin_symbol: 'btc', condition: 'above', targetPrice: 70000, triggered: false }]))
    const deps = { t: T, getPrices: async () => ({ bitcoin: { usd: 71000 } }), getPortfolio: async () => [], getCandles: async () => ({ candles: [] }) }
    const fired = await checkAlerts(deps)
    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ kind: 'price', url: '/asset/bitcoin' })
    expect(fired[0].title).toContain('BTC')
    expect(JSON.parse(localStorage.getItem(PRICE_ALERTS_KEY))[0].triggered).toBe(true)
    expect(await checkAlerts(deps)).toHaveLength(0)
  })

  it('fires a goal when the portfolio reaches it', async () => {
    saveProAlerts([{ ...makeRule({ type: 'goal', kind: 'value_above', target: 9000 }), wasTrue: false }])
    const fired = await checkAlerts({
      t: T,
      getPortfolio: async () => [{ coin_id: 'bitcoin', amount: 0.1, total_invested: 5000 }],
      getPrices: async () => ({ bitcoin: { usd: 95000 } }),
      getCandles: async () => ({ candles: [] }),
    })
    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ kind: 'goal', title: 'Portfolio goal reached', price: '$9,500' })
    expect(fired[0].body).toBe('Your portfolio is worth $9,000 or more.')
    expect(loadProAlerts()[0].triggered).toBe(true)
  })

  it('checks each chart at most every 15 minutes', async () => {
    saveProAlerts([makeRule({ type: 'signal', coin_id: 'bitcoin', symbol: 'btc', event: 'buy', tf: '1d' })])
    const getCandles = vi.fn(async () => ({ candles: candles(60) }))
    const seen = {}
    const deps = { t: T, getPrices: async () => ({}), getPortfolio: async () => [], getCandles, lastSignalCheck: seen }
    await checkAlerts({ ...deps, now: 1_000_000 })
    await checkAlerts({ ...deps, now: 1_000_000 + 60_000 })
    expect(getCandles).toHaveBeenCalledTimes(1)
    await checkAlerts({ ...deps, now: 1_000_000 + 16 * 60_000 })
    expect(getCandles).toHaveBeenCalledTimes(2)
  })
})

describe('the alarm queue', () => {
  beforeEach(() => _resetAlarms())
  it('shows one alarm at a time and does not queue the same one twice', () => {
    const shown = []
    subscribeAlarms(a => shown.push(a?.id ?? null))
    raiseAlarm({ id: 'a', kind: 'buy', title: 'A' })
    raiseAlarm({ id: 'a', kind: 'buy', title: 'A' })
    raiseAlarm({ id: 'b', kind: 'goal', title: 'B' })
    clearAlarm()
    clearAlarm()
    expect(shown).toEqual([null, 'a', 'a', 'b', null])
  })
})

describe('wiring', () => {
  const read = (p) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), p), 'utf8')
  it('checks alerts on every page and rings them full screen', () => {
    const app = read('App.jsx')
    expect(app).toMatch(/<AlertEngine \/><AlarmOverlay \/>/)
    // The Alerts tab no longer decides whether a price alert fired.
    const pa = read('components/PriceAlerts.jsx')
    expect(pa).not.toMatch(/playAlarm\(|fireNotification\(/)
    expect(pa).toMatch(/wl-alerts-changed/)
    expect(read('pages/Dashboard.jsx')).toMatch(/alertTab === 'pro' && \(/)
    const overlay = read('components/AlarmOverlay.jsx')
    expect(overlay).toMatch(/role="alertdialog"/)
    expect(overlay).toMatch(/onClick=\{snooze\}/)
    expect(overlay).toMatch(/onClick=\{dismiss\}/)
  })
})
