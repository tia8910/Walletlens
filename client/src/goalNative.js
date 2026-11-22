// Goal alerts with the Android app closed.
//
// Goals are about the portfolio's amounts and cost, which never leave the
// phone, so the push server cannot ring them. The Android app can: it keeps
// what this hands over (the goal rules with their text already written, the
// holdings, the last prices) and checks every 15 minutes (GoalAlertWorker).
// It asks the server for prices by asset only.

import { toWatchAssets } from './push'

const bridge = () => {
  const b = typeof window !== 'undefined' ? window.AndroidBridge : null
  return b && typeof b.syncGoalAlerts === 'function' ? b : null
}

export const hasNativeGoals = () => !!bridge()

const money = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 1 ? 2 : 6 })}`

/** The price lookup key for one holding ("kind:id:symbol"), or '' for cash and custom assets. */
export function quoteKeyFor(h) {
  const w = toWatchAssets([h])[0]
  return w ? `${w.kind}:${w.id}:${w.symbol}` : ''
}

/**
 * What the Android check needs: each armed goal with its alarm text, each
 * holding's amount, cost and price lookup key, and the last prices seen.
 */
export function goalPayload({ goals, holdings, prices, t, alarmTone }) {
  const rules = goals.map(r => ({
    id: r.id, armedAt: r.armedAt || r.createdAt || 0, kind: r.kind, target: Number(r.target),
    coin_id: r.coin_id || null, wasTrue: r.wasTrue ?? null, tone: alarmTone(r),
    title: t(`alGoalTitle_${r.kind}`)(r.kind === 'weight_above' ? String(r.symbol || '').toUpperCase() : null),
    body: t(`alGoalBody_${r.kind}`)(r.kind.startsWith('value') ? money(r.target) : `${Math.abs(Number(r.target))}%`, String(r.symbol || '').toUpperCase()),
  }))
  const rows = goals.length ? (holdings || []) : []
  const last = {}
  for (const h of rows) {
    const usd = Number(prices?.[h.coin_id]?.usd)
    if (Number.isFinite(usd) && usd > 0) last[h.coin_id] = usd
  }
  return {
    rules,
    holdings: rows.map(h => {
      const q = quoteKeyFor(h)
      return { coin_id: h.coin_id, amount: Number(h.amount || 0), invested: Number(h.total_invested || 0), ...(q ? { q } : {}) }
    }),
    prices: last,
  }
}

/** Hand the goals to the Android check. Returns whether the app took them. */
export function syncNativeGoals(payload) {
  const b = bridge()
  if (!b) return false
  try { return !!b.syncGoalAlerts(JSON.stringify(payload)) } catch { return false }
}

/** Goals the Android check rang while the app was closed, as "id:armedAt" keys. */
export function nativeFiredGoals() {
  const b = typeof window !== 'undefined' ? window.AndroidBridge : null
  if (!b || typeof b.goalAlertsFired !== 'function') return new Set()
  try {
    const v = JSON.parse(b.goalAlertsFired() || '[]')
    return new Set(Array.isArray(v) ? v.map(String) : [])
  } catch { return new Set() }
}
