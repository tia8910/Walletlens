// The numbers behind Grow My Net Worth, kept apart from the screen so they can
// be tested on their own.
//
// THE ASSUMPTIONS ARE DELIBERATELY SOBER.
//
// The first version assumed +20% a year for large crypto and +25% for small,
// on volatilities of 65% and 105%. Run on a crypto-heavy portfolio that printed
// a "could be as high as $960k" next to a $143k median and called a goal four
// years out "almost certain". Nobody plans a life on that.
//
// These are long-run, middle-of-the-road figures of the kind published in
// capital-market assumption reports: stocks a little under their century
// average, gold barely ahead of inflation, cash at inflation plus a sliver.
// Crypto has no century of data, so it gets a modest median with a very wide
// spread, and small caps a lower median than large, because most of them do
// not survive a decade. All are median (geometric) annual growth, nominal.

export const CLASS_PARAMS = {
  crypto_large: { mu: 0.10,  sig: 0.60, label: 'Crypto (large)' },
  crypto_small: { mu: 0.05,  sig: 0.90, label: 'Crypto (small)' },
  stocks:       { mu: 0.075, sig: 0.16, label: 'Stocks & ETFs' },
  metals:       { mu: 0.045, sig: 0.15, label: 'Precious metals' },
  realestate:   { mu: 0.055, sig: 0.10, label: 'Real estate' },
  cash:         { mu: 0.035, sig: 0.01, label: 'Cash' },
}

/** Long-run inflation used for "in today's money". */
export const INFLATION = 0.03

// Cross-class correlation: risk assets loosely co-move; cash doesn't.
function corr(a, b) {
  if (a === b) return 1
  if (a === 'cash' || b === 'cash') return 0.05
  const cryptoish = c => c.startsWith('crypto')
  if (cryptoish(a) && cryptoish(b)) return 0.85
  return 0.45
}

/**
 * The portfolio's median growth and volatility from its class weights.
 * @param {Record<string, number>} weights class -> share (0..1)
 */
export function mixParams(weights) {
  const entries = Object.entries(weights || {}).filter(([c, w]) => w > 0 && CLASS_PARAMS[c])
  const total = entries.reduce((s, [, w]) => s + w, 0) || 1
  const norm = entries.map(([c, w]) => [c, w / total])
  const mu = norm.reduce((s, [c, w]) => s + w * CLASS_PARAMS[c].mu, 0)
  let variance = 0
  for (const [ci, wi] of norm) {
    for (const [cj, wj] of norm) {
      variance += wi * wj * corr(ci, cj) * CLASS_PARAMS[ci].sig * CLASS_PARAMS[cj].sig
    }
  }
  return { mu, sig: Math.sqrt(Math.max(variance, 0)) }
}

/** Median growth with inflation taken out, for "in today's money". */
export const realGrowth = (mu) => (1 + mu) / (1 + INFLATION) - 1

/* ── deterministic RNG so re-renders don't repaint different futures ────── */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function gauss(rnd) {
  let u = 0, v = 0
  while (u === 0) u = rnd()
  while (v === 0) v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]

/**
 * Monte-Carlo of monthly growth with a monthly contribution.
 *
 * Antithetic pairs (every random draw is also used negated) and 1,000 paths
 * keep the percentile lines smooth: with 300 independent paths the "likely"
 * line wobbled visibly from one quarter to the next, which read as a forecast
 * of a dip that the model never meant.
 *
 * @returns band: [{ m, p10, p25, p50, p75, p90 }] sampled through the horizon
 */
export function simulate({ start, monthly, months, mu, sig, goal = 0, paths = 1000, seed = 42 }) {
  const rnd = mulberry32(seed)
  const mDrift = Math.log(1 + mu) / 12
  const mSig = sig / Math.sqrt(12)
  const step = months > 120 ? 6 : months > 36 ? 3 : 1
  const sampleMonths = []
  for (let m = step; m <= months; m += step) sampleMonths.push(m)
  if (sampleMonths[sampleMonths.length - 1] !== months) sampleMonths.push(months)
  const half = Math.ceil(paths / 2)
  const n = half * 2
  const snap = sampleMonths.map(() => new Float64Array(n))
  const terminal = new Float64Array(n)
  let goalHits = 0

  for (let p = 0; p < half; p++) {
    let a = start, b = start, si = 0
    for (let m = 1; m <= months; m++) {
      const z = gauss(rnd)
      a = a * Math.exp(mDrift + mSig * z) + monthly
      b = b * Math.exp(mDrift - mSig * z) + monthly
      if (sampleMonths[si] === m) { snap[si][2 * p] = a; snap[si][2 * p + 1] = b; si++ }
    }
    terminal[2 * p] = a; terminal[2 * p + 1] = b
    // Still at or above the goal at the end, not merely touching it once:
    // with crypto-sized swings many futures brush the goal and fall back, and
    // counting those printed good odds beside a likely line that ends short.
    if (goal > 0) goalHits += (a >= goal ? 1 : 0) + (b >= goal ? 1 : 0)
  }

  const band = sampleMonths.map((m, i) => {
    const s = Array.from(snap[i]).sort((x, y) => x - y)
    return { m, p10: pct(s, 0.10), p25: pct(s, 0.25), p50: pct(s, 0.50), p75: pct(s, 0.75), p90: pct(s, 0.90) }
  })
  const t = Array.from(terminal).sort((x, y) => x - y)
  return {
    band,
    p10Terminal: pct(t, 0.10), p25Terminal: pct(t, 0.25), p50Terminal: pct(t, 0.50),
    p75Terminal: pct(t, 0.75), p90Terminal: pct(t, 0.90),
    probGoal: goal > 0 ? goalHits / n : null,
  }
}

/**
 * What this person actually puts in each month, from their own trades.
 *
 * Net money in (buys minus sells) per calendar month over the last year, and
 * the MEDIAN of those months, zeros included. The median matters: importing a
 * portfolio writes every holding as a buy on one day, and an average would
 * turn that single import into a monthly habit of saving tens of thousands.
 *
 * @returns {{ monthly: number, months: number } | null} null with too little history
 */
export function monthlyFromHistory(transactions, now = new Date()) {
  const key = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const byMonth = new Map()
  let first = null
  for (const t of transactions || []) {
    const d = new Date(t.date || t.created_at || '')
    if (Number.isNaN(d.getTime()) || d > now) continue
    const amt = Number(t.total_cost) || (Number(t.amount) || 0) * (Number(t.price_per_unit) || 0)
    const sign = t.type === 'buy' ? 1 : t.type === 'sell' ? -1 : 0
    if (!sign || !amt) continue
    if (!first || d < first) first = d
    byMonth.set(key(d), (byMonth.get(key(d)) || 0) + sign * amt)
  }
  if (!first) return null
  const months = []
  const cur = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const firstMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1))
  // Last 12 full-or-current months, but never before the first trade.
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - i, 1))
    if (d < firstMonth) break
    months.push(byMonth.get(key(d)) || 0)
  }
  if (months.length < 3) return null
  const sorted = [...months].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  return { monthly: Math.max(0, Math.round(median / 25) * 25), months: months.length }
}

/** First month the median line reaches the goal, interpolated; null if never. */
export function goalCrossing(band, start, goal) {
  if (!band?.length || !(goal > 0)) return null
  if (start >= goal) return 0
  let prev = { m: 0, p50: start }
  for (const pt of band) {
    if (pt.p50 >= goal) {
      const span = pt.p50 - prev.p50
      const f = span > 0 ? (goal - prev.p50) / span : 0
      return prev.m + f * (pt.m - prev.m)
    }
    prev = pt
  }
  return null
}
