// A sell target's "Alarm" switch is a price alert: "rises above <target>" on
// that asset, in the same list Price Alerts keeps. So the same engine checks
// it on every page, it rings the WalletLens alarm, it reaches the push server
// for when the app is closed, and it shows on the Price Alerts tab too.

import { syncAlerts } from './push'

export const PRICE_ALERTS_KEY = 'walletlens_price_alerts'

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(PRICE_ALERTS_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}
function save(list) {
  try { localStorage.setItem(PRICE_ALERTS_KEY, JSON.stringify(list)) } catch { /* full or private */ }
  try { syncAlerts() } catch { /* push off */ }
  try { window.dispatchEvent(new Event('wl-alerts-changed')) } catch { /* no window */ }
}
function nextId() {
  let n = 1
  try {
    n = parseInt(localStorage.getItem('wl_alert_id') || '0', 10) + 1
    localStorage.setItem('wl_alert_id', String(n))
  } catch { n = Date.now() }
  return n
}

const same = (a, coinId, price, condition = 'above') =>
  a.coin_id === coinId && a.condition === condition && !a.triggered && Math.abs(Number(a.targetPrice) - price) <= price * 1e-9

/** Whether an armed "rises above" alert exists for this target. */
export function hasTargetAlarm(coinId, price, list = load()) {
  return list.some(a => same(a, coinId, Number(price)))
}

/** Turns the alarm for a target on or off. Returns the new state. */
export function setTargetAlarm({ coinId, symbol, price }, on) {
  const p = Number(price)
  const list = load()
  const has = list.some(a => same(a, coinId, p))
  if (on && !has) {
    list.unshift({ id: nextId(), coin_id: coinId, coin_symbol: symbol || coinId, condition: 'above', targetPrice: p, triggered: false, createdAt: new Date().toISOString(), source: 'target' })
    save(list)
  } else if (!on && has) {
    save(list.filter(a => !same(a, coinId, p)))
  }
  return on
}

/** The set of `${coinId}@${price}` keys that have an alarm, for one render. */
export function targetAlarmKeys() {
  const list = load()
  return new Set(list.filter(a => a.condition === 'above' && !a.triggered).map(a => `${a.coin_id}@${Number(a.targetPrice)}`))
}

/** A stop-loss alarm: "falls below <price>", same list and engine. */
export function setStopAlarm({ coinId, symbol, price }, on) {
  const p = Number(price)
  const list = load()
  const has = list.some(a => same(a, coinId, p, 'below'))
  if (on && !has) {
    list.unshift({ id: nextId(), coin_id: coinId, coin_symbol: symbol || coinId, condition: 'below', targetPrice: p, triggered: false, createdAt: new Date().toISOString(), source: 'sell-plan' })
    save(list)
  } else if (!on && has) {
    save(list.filter(a => !same(a, coinId, p, 'below')))
  }
  return on
}

/** The set of `${coinId}@${price}` keys with an armed "falls below" alarm. */
export function stopAlarmKeys() {
  const list = load()
  return new Set(list.filter(a => a.condition === 'below' && !a.triggered).map(a => `${a.coin_id}@${Number(a.targetPrice)}`))
}
