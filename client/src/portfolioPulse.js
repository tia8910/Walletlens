// Portfolio pulse: how hard your money is moving right now, judged against
// your own normal rather than a fixed scale.
//
// The reading is the portfolio-weighted RMS of each holding's 24h move: the
// "typical move" a dollar of yours is making today. A stock-heavy portfolio
// and a meme-coin one have very different normals, so once there are five
// days of readings the level compares today with the median of your last 30
// days. Until then it uses the old fixed scale.

const KEY = 'wl_beat_v1'
export const LEVELS = ['calm', 'normal', 'elevated', 'wild']
export const MIN_DAYS = 5

/** Today's reading and who drives it. Holdings without a price weigh nothing. */
export function pulseReading(holdings = [], totalValue = 0) {
  const live = (Array.isArray(holdings) ? holdings : []).filter(h => h && h.value > 0 && Number.isFinite(Number(h.pct24h)))
  const tv = totalValue > 0 ? totalValue : live.reduce((s, h) => s + h.value, 0)
  if (!(tv > 0) || !live.length) return { rms: 0, contributors: [] }
  let sum = 0
  const parts = live.map(h => {
    const w = h.value / tv
    const p = Number(h.pct24h)
    const e = w * p * p
    sum += e
    return { sym: String(h.coin_symbol || h.coin_id || '').toUpperCase(), id: h.coin_id, weight: w * 100, pct: p, e }
  })
  const contributors = parts
    .filter(x => x.e > 0)
    .map(x => ({ ...x, share: sum > 0 ? (x.e / sum) * 100 : 0 }))
    .sort((a, b) => b.share - a.share)
  return { rms: Math.sqrt(sum), contributors }
}

const median = (xs) => {
  const a = xs.slice().sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/**
 * The level for a reading. `history` is { 'YYYY-MM-DD': rms }; today's own
 * entry is left out of "your normal".
 */
export function pulseLevel(rms, history = {}, today = '') {
  const past = Object.entries(history || {}).filter(([d, v]) => d !== today && Number.isFinite(v) && v > 0).map(([, v]) => v)
  if (past.length >= MIN_DAYS) {
    const normal = median(past)
    const ratio = normal > 0 ? rms / normal : 1
    const level = ratio < 0.6 ? 0 : ratio < 1.3 ? 1 : ratio < 2 ? 2 : 3
    return { level, normal, ratio, days: past.length, learning: false }
  }
  const level = rms < 3 ? 0 : rms < 8 ? 1 : rms < 15 ? 2 : 3
  return { level, normal: null, ratio: null, days: past.length, learning: true }
}

/** Keeps the day's highest reading, for the last 30 days. */
export function recordPulse(rms, day, store = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!(rms > 0) || !day || !store) return {}
  let h = {}
  try { h = JSON.parse(store.getItem(KEY) || '{}') || {} } catch { h = {} }
  if (!(h[day] >= rms)) h[day] = rms
  const keep = Object.keys(h).sort().slice(-30)
  const out = Object.fromEntries(keep.map(k => [k, h[k]]))
  try { store.setItem(KEY, JSON.stringify(out)) } catch { /* full or private */ }
  return out
}

export function loadPulseHistory(store = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try { return JSON.parse(store?.getItem(KEY) || '{}') || {} } catch { return {} }
}
