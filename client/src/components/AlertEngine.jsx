import { useEffect, useRef } from 'react'
import { api } from '../api'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { showLocalNotification } from '../localNotify'
import { deliverAlarm } from '../alarm'
import { syncSignals, serverFiredSignals } from '../push'
import { hasNativeGoals, goalPayload, syncNativeGoals, nativeFiredGoals } from '../goalNative'
import { computeChartSignals, loadChartParams } from '../chartSignals'
import {
  loadProAlerts, saveProAlerts, evaluateSignal, evaluateGoal, portfolioSummary, alarmKind, alarmTone,
} from '../alertRules'

// Checks every alert while the app is open, on any page, and rings the
// full-screen alarm (AlarmOverlay) when one fires.
//
// Price alerts used to be checked inside the Alerts tab, so they only went
// off while that tab was on screen. They are checked here now, with the
// signal and goal alerts. When the app is closed, price alerts and chart
// signal alerts arrive as alarm pushes from the server (the signal rules are
// sent there, since they hold nothing private). Goal alerts need the
// portfolio, which never leaves the device, so they fire while it is open.

export const PRICE_ALERTS_KEY = 'walletlens_price_alerts'
export const TICK_MS = 60_000
export const SIGNAL_EVERY_MS = 15 * 60_000

const readJson = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
const money = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 1 ? 2 : 6 })}`

/**
 * One pass over every alert. Returns the alarms to ring (already saved as
 * fired). Everything it needs comes in, so the test drives it directly.
 */
export async function checkAlerts({ t, getPrices, getPortfolio, getCandles, now = Date.now(), lastSignalCheck = {}, chartParams, getServerFired, getNativeGoalFired, onGoals }) {
  const fired = []
  const priceAlerts = readJson(PRICE_ALERTS_KEY)
  let pro = loadProAlerts()
  const armedPrice = priceAlerts.filter(a => !a.triggered && !a.snoozed)
  const goals = pro.filter(r => r.type === 'goal' && !r.triggered)
  const signals = pro.filter(r => r.type === 'signal' && !r.triggered)
  if (!armedPrice.length && !goals.length && !signals.length) return fired

  const holdings = goals.length ? (await getPortfolio().catch(() => [])) || [] : []
  const ids = [...new Set([...armedPrice.map(a => a.coin_id), ...holdings.map(h => h.coin_id)])].filter(Boolean)
  const prices = ids.length ? (await getPrices(ids.join(',')).catch(() => ({}))) || {} : {}

  // ── Price alerts ──
  let priceChanged = false
  const nextPrice = priceAlerts.map(a => {
    if (a.triggered || a.snoozed) return a
    const cur = Number(prices[a.coin_id]?.usd ?? prices[a.coin_id]?.price ?? 0)
    if (!(cur > 0)) return a
    const hit = a.condition === 'above' ? cur >= a.targetPrice : cur <= a.targetPrice
    if (!hit) return a
    priceChanged = true
    const sym = String(a.coin_symbol || a.coin_id).toUpperCase()
    fired.push({
      id: `price:${a.id}`, kind: 'price', tone: alarmTone({ type: 'price', condition: a.condition }),
      title: `${t(a.condition === 'above' ? 'paHitAbove' : 'paHitBelow')} ${sym}`,
      body: t('paTargetBody')(sym, money(cur), money(a.targetPrice)),
      price: money(cur), url: `/asset/${encodeURIComponent(a.coin_id)}`,
    })
    return { ...a, triggered: true, triggeredAt: new Date(now).toISOString(), triggeredPrice: cur }
  })
  if (priceChanged) {
    try { localStorage.setItem(PRICE_ALERTS_KEY, JSON.stringify(nextPrice)) } catch { /* full */ }
    try { window.dispatchEvent(new Event('wl-alerts-changed')) } catch { /* no window */ }
  }

  // ── Goals ──
  let proChanged = false
  if (goals.length) {
    const summary = portfolioSummary(holdings, prices)
    // Goals the Android app already rang while closed: marked, not rung again.
    const nativeFired = getNativeGoalFired ? getNativeGoalFired() : new Set()
    pro = pro.map(r => {
      if (r.type !== 'goal' || r.triggered) return r
      if (nativeFired.has(`${r.id}:${r.armedAt}`)) { proChanged = true; return { ...r, triggered: true, triggeredAt: now } }
      const res = evaluateGoal(r, summary)
      if (res.wasTrue !== r.wasTrue) proChanged = true
      if (!res.hit) return res.wasTrue !== r.wasTrue ? { ...r, wasTrue: res.wasTrue } : r
      proChanged = true
      const shown = r.kind.startsWith('value') ? money(res.value) : `${res.value >= 0 && r.kind.startsWith('pnl') ? '+' : ''}${res.value.toFixed(1)}%`
      fired.push({
        id: `goal:${r.id}`, kind: 'goal', tone: alarmTone(r),
        title: t(`alGoalTitle_${r.kind}`)(r.kind === 'weight_above' ? String(r.symbol || '').toUpperCase() : null),
        body: t(`alGoalBody_${r.kind}`)(r.kind.startsWith('value') ? money(r.target) : `${Math.abs(Number(r.target))}%`, String(r.symbol || '').toUpperCase()),
        price: shown, url: '/dashboard',
      })
      return { ...r, wasTrue: true, triggered: true, triggeredAt: now, triggeredValue: res.value }
    })
  }

  // The goals still armed, for the Android app's own check while closed.
  if (onGoals && goals.length) {
    try { onGoals({ goals: pro.filter(r => r.type === 'goal' && !r.triggered), holdings, prices }) } catch { /* best effort */ }
  }

  // ── Signals: each chart at most every 15 minutes ──
  const params = chartParams || loadChartParams()
  // Rules the push server already rang while the app was closed: marked as
  // fired here without ringing the same alarm a second time.
  let serverFired = new Set()
  if (signals.length && getServerFired) { try { serverFired = await getServerFired() } catch { serverFired = new Set() } }
  for (const r of signals) {
    if (serverFired.has(`${r.id}:${r.armedAt}`)) {
      proChanged = true
      pro = pro.map(x => x.id === r.id ? { ...x, triggered: true, triggeredAt: now } : x)
      continue
    }
    const key = `${r.coin_id}|${r.tf}`
    if (now - (lastSignalCheck[key] || 0) < SIGNAL_EVERY_MS) continue
    lastSignalCheck[key] = now
    let candles = []
    try { candles = (await getCandles(r.coin_id, r.symbol, r.tf || '1d', 200, Number(prices[r.coin_id]?.usd) || 0))?.candles || [] } catch { candles = [] }
    if (candles.length < 30) continue
    const res = evaluateSignal(r, candles, computeChartSignals(candles, params))
    if (!res.hit) continue
    proChanged = true
    const sym = String(r.symbol || r.coin_id).toUpperCase()
    fired.push({
      id: `signal:${r.id}`, kind: alarmKind(r), tone: alarmTone(r),
      title: t('alSigTitle')(sym, t(`alEv_${r.event}`)),
      body: t('alSigBody')(t(r.tf === '4h' ? 'alTf4h' : 'alTf1d'), res.rsi != null ? Math.round(res.rsi) : null),
      price: money(res.price), url: `/asset/${encodeURIComponent(r.coin_id)}`,
    })
    pro = pro.map(x => x.id === r.id ? { ...x, triggered: true, triggeredAt: now, triggeredPrice: res.price } : x)
  }
  if (proChanged) saveProAlerts(pro)
  return fired
}

export default function AlertEngine() {
  const { t } = useLanguage()
  const tRef = useRef(t)
  tRef.current = t
  const lastSignalCheck = useRef({})
  const busy = useRef(false)

  useEffect(() => {
    let alive = true
    // What the server already rang, asked at most every 5 minutes.
    let firedAt = 0, fired = new Set()
    const firedFromServer = async () => {
      if (Date.now() - firedAt > 5 * 60_000) { fired = await serverFiredSignals(); firedAt = Date.now() }
      return fired
    }
    // Goals go to the Android app's own 15 minute check, when they or the
    // holdings change and at least every 15 minutes for fresh prices.
    let goalStamp = '', goalAt = 0
    const handGoals = ({ goals, holdings, prices }) => {
      if (!hasNativeGoals()) return
      const payload = goalPayload({ goals, holdings, prices, t: tRef.current, alarmTone })
      const stamp = JSON.stringify([payload.rules, payload.holdings])
      if (stamp === goalStamp && Date.now() - goalAt < 15 * 60_000) return
      if (syncNativeGoals(payload)) { goalStamp = stamp; goalAt = Date.now() }
    }
    // The rules go to the push server, so they ring with the app closed too.
    const sync = () => { syncSignals().catch(() => {}) }
    const tick = async () => {
      if (busy.current) return
      busy.current = true
      try {
        const fired = await checkAlerts({
          t: tRef.current,
          getPrices: (ids) => Promise.resolve(api.getPrices(ids)),
          getPortfolio: () => Promise.resolve(api.getPortfolio()),
          getCandles: (...a) => api.getCandles(...a),
          lastSignalCheck: lastSignalCheck.current,
          getServerFired: firedFromServer,
          getNativeGoalFired: nativeFiredGoals,
          onGoals: handGoals,
        })
        // No goals left: tell the Android check to stop.
        if (hasNativeGoals() && !loadProAlerts().some(r => r.type === 'goal' && !r.triggered)) handGoals({ goals: [], holdings: [], prices: {} })
        if (!alive) return
        for (const a of fired) {
          // As an alarm, if the user keeps alarms on (native in the Android
          // app). Alarms off, or away from a browser tab: a plain notification.
          const how = deliverAlarm(a)
          if (how === 'off' || (how === 'page' && typeof document !== 'undefined' && document.hidden)) {
            showLocalNotification(a.title, { body: a.body, tag: a.id, data: { url: a.url, channel: 'alerts' } })
          }
          track('alert_triggered', { kind: a.kind })
        }
      } catch { /* the next tick tries again */ } finally { busy.current = false }
    }
    const first = setTimeout(() => { tick(); sync() }, 4000)
    const every = setInterval(tick, TICK_MS)
    // A new or re-armed alert is checked straight away.
    const onChange = () => { setTimeout(tick, 300); setTimeout(sync, 1500) }
    window.addEventListener('wl-alerts-changed', onChange)
    return () => { alive = false; clearTimeout(first); clearInterval(every); window.removeEventListener('wl-alerts-changed', onChange) }
  }, [])

  return null
}
