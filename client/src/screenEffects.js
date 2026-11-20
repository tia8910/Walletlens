// Which full-screen effect, if any, this moment has earned.
//
// Four occasions, and no others, each one EARNED by the numbers:
//
//   explode  the first open of the day, when you are up since yesterday
//   sunrise  the first open of the day on a flat or red morning: calm, honest
//   rocket   a day better than 9 in 10 of your own last 30 days (and +2%);
//            with too little history, the old fixed +5% day
//   ath      your profit is 0.5% (of the portfolio) above its previous high,
//            on two price updates in a row, so a deposit or one stray tick
//            never counts as a record
//
// Nothing plays while values are hidden, in the demo, or while prices are
// offline or partly missing (`blocked`), and nothing is spent then either.
//
// Everything here is pure. It takes the current numbers and the stored state,
// and returns the effect plus the state to store next: no clock, no
// localStorage, no audio, no DOM.

export const EXPLODE = 'explode'
export const SUNRISE = 'sunrise'
export const ROCKET = 'rocket'
export const ATH = 'ath'

/** Fallback: with too little history, a day up this much launches the rocket. */
export const ROCKET_THRESHOLD_PCT = 5
/** Never a rocket for less than this, however quiet your history. */
export const ROCKET_MIN_PCT = 2
/** Days of history needed before the rocket compares you with yourself. */
export const ROCKET_MIN_DAYS = 10
/** A new high has to clear the old one by this share of the portfolio. */
export const ATH_MARGIN = 0.005
/** ...on this many price updates in a row. */
export const ATH_CONFIRM = 2
/** ...the second at least this long after the first, so two renders of the
 *  same numbers a moment apart never count as two updates. */
export const ATH_CONFIRM_MS = 2 * 60 * 1000

/** The shape stored between sessions. */
export const EMPTY_STATE = { day: '', athP: null, athTs: 0, athPending: 0, athPendingTs: 0, rocketDay: '' }

/**
 * The user's calendar day, not UTC's.
 *
 * `tzOffsetMin` is minutes EAST of UTC, the same convention the push service
 * reasons in.
 */
export function dayKey(now, tzOffsetMin = 0) {
  const local = new Date(now + tzOffsetMin * 60_000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalize(state) {
  const s = state || {}
  const athP = s.athP == null || !Number.isFinite(Number(s.athP)) ? null : Number(s.athP)
  return {
    day: typeof s.day === 'string' ? s.day : '',
    athP,
    athTs: Number.isFinite(Number(s.athTs)) ? Number(s.athTs) : 0,
    athPending: Number.isFinite(Number(s.athPending)) ? Number(s.athPending) : 0,
    athPendingTs: Number.isFinite(Number(s.athPendingTs)) ? Number(s.athPendingTs) : 0,
    rocketDay: typeof s.rocketDay === 'string' ? s.rocketDay : '',
  }
}

/**
 * Daily returns, in percent, from the stored portfolio snapshots
 * ({ ts, v, inv }): the last snapshot of each local day against the day
 * before's. Measured on PROFIT (value minus invested), so money added or
 * taken out is not a "move". Today is left out; the last 30 days are kept.
 */
export function dailyReturnsFromSnapshots(snaps = [], tzOffsetMin = 0, now = Date.now()) {
  const today = dayKey(now, tzOffsetMin)
  const lastOfDay = new Map()
  for (const s of Array.isArray(snaps) ? snaps : []) {
    if (!s || !(s.v > 0) || !Number.isFinite(s.ts)) continue
    const k = dayKey(s.ts, tzOffsetMin)
    if (k === today) continue
    const prev = lastOfDay.get(k)
    if (!prev || s.ts > prev.ts) lastOfDay.set(k, s)
  }
  const days = [...lastOfDay.values()].sort((a, b) => a.ts - b.ts)
  const out = []
  for (let i = 1; i < days.length; i++) {
    const a = days[i - 1], b = days[i]
    if (b.ts - a.ts > 1.5 * 86_400_000) continue // a gap is not one day's move
    const pa = a.v - (a.inv || 0), pb = b.v - (b.inv || 0)
    out.push(((pb - pa) / a.v) * 100)
  }
  return out.slice(-30)
}

/**
 * Decide the one effect to play, and what to remember afterwards.
 *
 * @param {object}  o
 * @param {number}  o.now             epoch ms
 * @param {number}  o.tzOffsetMin     minutes east of UTC
 * @param {number}  o.totalValue      portfolio total
 * @param {number}  o.invested        money put in (null when unknown)
 * @param {number}  o.changePct       portfolio change on the day, percent
 * @param {number[]} o.dailyReturns   your own recent daily returns, percent
 * @param {boolean} o.blocked         hidden, demo, prices offline or missing
 * @param {boolean} o.athOnly         one wallet on screen: only its own profit
 *                                    high counts; the day's effects are the
 *                                    whole portfolio's and are left alone
 * @param {object}  o.leader          best-performing holding: { symbol, image, pct }
 * @param {object}  o.state           previous return's `nextState`
 * @returns {{ effect: string|null, payload: object|null, nextState: object }}
 */
export function decideEffect({
  now,
  tzOffsetMin = 0,
  totalValue = 0,
  invested = null,
  changePct = 0,
  dailyReturns = [],
  blocked = false,
  athOnly = false,
  leader = null,
  state,
} = {}) {
  const prev = normalize(state)
  // Nothing plays, and nothing is spent: the moment is still there once the
  // numbers can be trusted again.
  if (blocked) return { effect: null, payload: null, nextState: prev }

  const today = dayKey(now, tzOffsetMin)
  const firstOpenToday = !athOnly && prev.day !== today
  const next = { ...prev, day: athOnly ? prev.day : today }

  // Before prices land the total is briefly 0; no comparison means anything.
  if (!(totalValue > 0)) return { effect: null, payload: null, nextState: next }

  const profit = invested != null && invested > 0 ? totalValue - invested : totalValue
  // A device that has never stored a high arms one quietly: the first number
  // anyone sees is never a "record".
  if (next.athP == null) { next.athP = profit; next.athTs = now; next.athPending = 0 }

  if (firstOpenToday) {
    const up = changePct > 0
    return {
      effect: up ? EXPLODE : SUNRISE,
      payload: { leader: up ? leader || null : null, changePct },
      nextState: next,
    }
  }

  // The record: clear the old high by a margin, and hold it for two updates.
  if (prev.athP != null && profit > prev.athP + totalValue * ATH_MARGIN) {
    // The first sighting starts the clock; only a later update, far enough
    // apart to be a fresh price, can confirm it.
    const held = prev.athPending >= 1 && now - prev.athPendingTs >= ATH_CONFIRM_MS
    const pending = prev.athPending >= 1 ? (held ? prev.athPending + 1 : prev.athPending) : 1
    if (pending >= ATH_CONFIRM) {
      next.athP = profit; next.athTs = now; next.athPending = 0; next.athPendingTs = 0
      return {
        effect: ATH,
        payload: { totalValue, gain: profit - prev.athP, since: prev.athTs || null },
        nextState: next,
      }
    }
    next.athPending = pending
    next.athPendingTs = prev.athPending >= 1 ? prev.athPendingTs : now
  } else {
    next.athPending = 0
    next.athPendingTs = 0
  }

  // The rocket, once a day: a top day measured against your own history.
  if (!athOnly && prev.rocketDay !== today && changePct >= ROCKET_MIN_PCT) {
    const hist = (Array.isArray(dailyReturns) ? dailyReturns : []).filter(Number.isFinite)
    let fire = false
    let beats = null
    if (hist.length >= ROCKET_MIN_DAYS) {
      beats = hist.filter(r => r < changePct).length
      fire = beats / hist.length >= 0.9
    } else {
      fire = changePct >= ROCKET_THRESHOLD_PCT
    }
    if (fire) {
      next.rocketDay = today
      return {
        effect: ROCKET,
        payload: { changePct, leader: leader || null, beats, of: beats == null ? null : hist.length },
        nextState: next,
      }
    }
  }

  return { effect: null, payload: null, nextState: next }
}

/**
 * The holding that had the best day, for the effects that show one.
 *
 * Returns null rather than a zero-value placeholder when there is nothing to
 * show; the overlay falls back to a plain burst, which looks deliberate,
 * whereas an empty logo does not.
 */
export function pickLeader(holdings) {
  if (!Array.isArray(holdings) || !holdings.length) return null
  let best = null
  for (const h of holdings) {
    const pct = Number(h?.pct24h)
    if (!Number.isFinite(pct)) continue
    if (!best || pct > best.pct) {
      best = {
        pct,
        symbol: String(h.coin_symbol || '').toUpperCase(),
        image: h.coin_image || '',
        // Carried so the overlay has a second source for the logo. A holding
        // added before its icon resolved has no coin_image, but the app's own
        // image cache usually has one by the time an effect fires, and a blank
        // centre would leave the whole explode looking broken.
        assetId: h.coin_id || '',
      }
    }
  }
  return best && best.symbol
    ? { symbol: best.symbol, image: best.image, assetId: best.assetId, pct: best.pct }
    : null
}
