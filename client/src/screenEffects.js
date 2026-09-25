// Which full-screen effect, if any, this moment has earned.
//
// Three occasions, and no others:
//
//   explode  the first time the app is opened on a given day
//   rocket   the portfolio is up more than 5% on the day
//   ath      the portfolio is worth more than it has ever been
//
// Everything here is pure. It takes the current numbers and the stored state,
// and returns the effect plus the state to store next — no clock, no
// localStorage, no audio, no DOM. That is what makes the awkward parts (a day
// boundary in the user's own timezone, an all-time high on a device that has
// never recorded one) answerable in a test rather than by opening the app on
// the right morning.

export const EXPLODE = 'explode'
export const ROCKET = 'rocket'
export const ATH = 'ath'

/** A day is up more than this, in percent, to launch the rocket. */
export const ROCKET_THRESHOLD_PCT = 5

/** The shape stored between sessions. */
export const EMPTY_STATE = { day: '', ath: 0, rocketDay: '' }

/**
 * The user's calendar day, not UTC's.
 *
 * `tzOffsetMin` is minutes EAST of UTC, the same convention the push service
 * reasons in. Getting the sign backwards here would roll the day over at the
 * wrong hour and fire the "first open today" effect in the middle of an
 * evening session.
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
  return {
    day: typeof s.day === 'string' ? s.day : '',
    ath: Number.isFinite(Number(s.ath)) ? Number(s.ath) : 0,
    rocketDay: typeof s.rocketDay === 'string' ? s.rocketDay : '',
  }
}

/**
 * Decide the one effect to play, and what to remember afterwards.
 *
 * @param {object}  o
 * @param {number}  o.now             epoch ms
 * @param {number}  o.tzOffsetMin     minutes east of UTC
 * @param {number}  o.totalValue      portfolio total, display currency
 * @param {number}  o.changePct       portfolio change on the day, percent
 * @param {object}  o.leader          best-performing holding: { symbol, image, pct }
 * @param {object}  o.state           previous return's `nextState`
 * @returns {{ effect: string|null, payload: object|null, nextState: object }}
 */
export function decideEffect({
  now,
  tzOffsetMin = 0,
  totalValue = 0,
  changePct = 0,
  leader = null,
  state,
} = {}) {
  const prev = normalize(state)
  const today = dayKey(now, tzOffsetMin)
  const firstOpenToday = prev.day !== today

  // The day is marked seen whichever effect wins, or none does. Leaving it
  // unmarked when a rarer effect took precedence would fire the explode later
  // the same day, which reads as the app celebrating twice for one occasion.
  const next = { ...prev, day: today }

  // A portfolio with no value cannot have a good day or a record high. This
  // also covers the moments before prices load, when totalValue is briefly 0
  // and every comparison below would be nonsense.
  if (!(totalValue > 0)) {
    return { effect: null, payload: null, nextState: next }
  }

  // The first open of the day belongs to the explode, outright.
  //
  // It used to be last of the three, on the reasoning that the rarest occasion
  // should win. In practice that reasoning inverted itself: a portfolio that
  // grows sets a new high on most mornings, so the ATH took nearly every first
  // open — and because the day is marked whichever effect wins, the explode
  // was not merely postponed, it was consumed. The "once a day, every day"
  // effect became the one that almost never played.
  //
  // Ordering it first costs the ATH nothing, because the high is deliberately
  // NOT advanced on this path. The record is still a record on the next price
  // poll a few seconds later, and fires then — so a morning that breaks a high
  // now shows the welcome and then the record, rather than the record and
  // nothing else ever.
  if (firstOpenToday) {
    // A device that has never stored a high is ARMED here rather than left at
    // zero. There is no celebration to lose — the first number a fresh install
    // sees is never celebrated (see the ATH branch below) — and without this a
    // user who opens the app and closes it again before the next poll would
    // never record a high at all, so the ATH could never arm.
    //
    // An existing high is deliberately left alone, so a genuine record still
    // fires seconds later instead of being swallowed by the welcome.
    if (prev.ath <= 0 && totalValue > 0) next.ath = totalValue
    return {
      effect: EXPLODE,
      payload: { leader: leader || null },
      nextState: next,
    }
  }

  const isRecord = totalValue > prev.ath
  if (isRecord) next.ath = totalValue

  // A device that has never stored a high has not broken one — it has only
  // just started looking. Celebrating the first number a new user ever sees
  // would make the effect meaningless, and it is the one occasion here that
  // is supposed to be rare.
  if (isRecord && prev.ath > 0) {
    return {
      effect: ATH,
      payload: { totalValue, previous: prev.ath },
      nextState: next,
    }
  }

  // Once a day. Without the guard this fires on every price poll for as long
  // as the day stays green, which is most of a good day.
  if (changePct >= ROCKET_THRESHOLD_PCT && prev.rocketDay !== today) {
    next.rocketDay = today
    return {
      effect: ROCKET,
      payload: { changePct, leader: leader || null },
      nextState: next,
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
