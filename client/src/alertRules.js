// Signal and goal alerts: what each kind watches, and when it fires.
//
// Two families, kept on the device like every other alert (the portfolio
// never leaves it):
//
//   signal  one asset's chart, from the same on-device engine the chart draws
//           (chartSignals.js): the Buy or Sell signal, a golden or death
//           cross, RSI turning overbought or oversold.
//   goal    the whole portfolio: its value above or below a figure, its
//           all-time P&L above or below a percentage, or one asset growing
//           past a share of it.
//
// Everything here is pure, so the rules are tested without a clock, a
// network or a screen. AlertEngine runs them; AlarmOverlay rings them.

export const PRO_ALERTS_KEY = 'wl_pro_alerts'
export const MAX_PRO_ALERTS = 30

export const SIGNAL_EVENTS = ['buy', 'sell', 'golden', 'death', 'rsi_high', 'rsi_low']
export const GOAL_KINDS = ['value_above', 'value_below', 'pnl_above', 'pnl_below', 'weight_above']
export const SIGNAL_FRAMES = ['1d', '4h']

export const RSI_HIGH = 70
export const RSI_LOW = 30

export function loadProAlerts() {
  try {
    const v = JSON.parse(localStorage.getItem(PRO_ALERTS_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

export function saveProAlerts(list) {
  try { localStorage.setItem(PRO_ALERTS_KEY, JSON.stringify(list.slice(0, MAX_PRO_ALERTS))) } catch { /* full or private */ }
  try { window.dispatchEvent(new Event('wl-alerts-changed')) } catch { /* no window */ }
}

/** A new rule, armed from now. */
export function makeRule(fields, now = Date.now()) {
  return { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: now, armedAt: now, triggered: false, ...fields }
}

/** The same rule watching again from now, its last firing forgotten. */
export function rearm(rule, now = Date.now()) {
  return { ...rule, triggered: false, triggeredAt: null, triggeredPrice: null, triggeredValue: null, armedAt: now, wasTrue: null }
}

/**
 * Whether a signal rule has happened on the chart since it was armed.
 *
 * Only closed candles count: a signal on the candle still forming can vanish
 * before it closes, and an alarm for something that then did not happen is
 * worse than one a candle late. A candle counts as after the rule was armed
 * when it closed after that (the next candle opened after it).
 *
 * @returns {{ hit: boolean, at?: number, price?: number }}
 */
export function evaluateSignal(rule, candles, calc) {
  const n = candles?.length || 0
  if (n < 3 || !calc) return { hit: false }
  const lastClosed = n - 2
  const closedAfterArming = (i) => i <= lastClosed && Number(candles[i + 1]?.t) > Number(rule.armedAt || 0)
  const at = (i) => ({ hit: true, at: Number(candles[i].t), price: Number(candles[i].c) })

  if (rule.event === 'buy' || rule.event === 'sell') {
    const s = [...(calc.signals || [])].reverse().find(x => x.side === rule.event && closedAfterArming(x.i))
    return s ? at(s.i) : { hit: false }
  }
  if (rule.event === 'golden' || rule.event === 'death') {
    const x = [...(calc.crosses || [])].reverse().find(c => c.kind === rule.event && closedAfterArming(c.i))
    return x ? at(x.i) : { hit: false }
  }
  if (rule.event === 'rsi_high' || rule.event === 'rsi_low') {
    const rsi = calc.rsi || []
    // The most recent closed candle on which RSI crossed the line.
    for (let i = lastClosed; i >= 1 && closedAfterArming(i); i--) {
      const now = Number(rsi[i]), before = Number(rsi[i - 1])
      if (!Number.isFinite(now) || !Number.isFinite(before)) continue
      if (rule.event === 'rsi_high' && now >= RSI_HIGH && before < RSI_HIGH) return { ...at(i), rsi: now }
      if (rule.event === 'rsi_low' && now <= RSI_LOW && before > RSI_LOW) return { ...at(i), rsi: now }
    }
    return { hit: false }
  }
  return { hit: false }
}

/**
 * The portfolio figures goals are measured against, in USD.
 * `holdings` are getPortfolio()'s rows; `prices` id → { usd }.
 */
export function portfolioSummary(holdings, prices) {
  let total = 0, invested = 0, priced = 0
  const values = {}
  for (const h of holdings || []) {
    const usd = Number(prices?.[h.coin_id]?.usd)
    const v = Number.isFinite(usd) && usd > 0 ? usd * Number(h.amount || 0) : null
    invested += Number(h.total_invested || 0)
    if (v == null) continue
    priced++
    values[h.coin_id] = (values[h.coin_id] || 0) + v
    total += v
  }
  const weights = {}
  for (const [id, v] of Object.entries(values)) weights[id] = total > 0 ? (v / total) * 100 : 0
  return {
    total,
    invested,
    pnlPct: invested > 0 ? ((total - invested) / invested) * 100 : 0,
    weights,
    // Goals are judged only once every holding has a price, so a coin that
    // failed to load cannot fake a crash in the total.
    complete: priced === (holdings || []).length && priced > 0,
  }
}

/** Whether a goal's condition holds right now. */
export function goalHolds(rule, s) {
  const x = Number(rule.target)
  if (!Number.isFinite(x)) return false
  switch (rule.kind) {
    case 'value_above': return s.total >= x
    case 'value_below': return s.total <= x
    case 'pnl_above': return s.pnlPct >= x
    case 'pnl_below': return s.pnlPct <= -Math.abs(x)
    case 'weight_above': return (s.weights?.[rule.coin_id] || 0) >= x
    default: return false
  }
}

/**
 * Whether a goal fires: only on the move from not holding to holding. A goal
 * already met when it is set is remembered as met (no alarm the moment it is
 * saved) and fires the next time it is reached.
 *
 * @returns {{ hit: boolean, wasTrue: boolean|null, value?: number }}
 */
export function evaluateGoal(rule, s) {
  if (!s?.complete) return { hit: false, wasTrue: rule.wasTrue ?? null }
  const holds = goalHolds(rule, s)
  const value = rule.kind.startsWith('value') ? s.total : rule.kind.startsWith('pnl') ? s.pnlPct : (s.weights?.[rule.coin_id] || 0)
  if (rule.wasTrue == null) return { hit: false, wasTrue: holds, value }
  return { hit: holds && rule.wasTrue === false, wasTrue: holds, value }
}

/** The alarm's sound and colour family for a rule. */
export function alarmKind(rule) {
  if (rule.type === 'price') return 'price'
  if (rule.type === 'goal') return 'goal'
  if (rule.event === 'buy') return 'buy'
  if (rule.event === 'sell') return 'sell'
  if (rule.event === 'golden' || rule.event === 'death') return 'cross'
  return 'rsi'
}
