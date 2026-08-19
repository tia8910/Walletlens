// Decides when a market movement is worth reacting to.
//
// Everything here is a pure function over prices, stored flags and the clock.
// There is no audio, no DOM and no timer in this file — those live in
// pulseAudio.js, which the browser is allowed to refuse. The split is what
// makes the one rule that matters testable:
//
//   a sound fires when a threshold is CROSSED, never because a number is
//   currently above it
//
// Get that wrong and every price refresh replays the rocket. It is the whole
// reason this module exists separately from the thing that makes noise.
//
// ── V1 scope ───────────────────────────────────────────────────────────────
//
// Three events, all positive, all rare, all about the user rather than the
// market: an asset crossing its class threshold, a new portfolio all-time
// high, and a net-worth milestone.
//
// Downside events are deliberately absent. A bass impact when someone is down
// 8% is emotionally powerful in a direction that may not serve them, and there
// is no evidence yet that anyone wants it. If they ship later they must feed
// the same friction suppression the review prompt uses — a bad moment we
// manufacture ourselves is still a bad moment.

// ── Thresholds ─────────────────────────────────────────────────────────────
//
// One ladder cannot span four asset classes. A 3% day is unremarkable for
// Bitcoin and close to a once-a-year event for gold, so a single table would
// produce constant noise for one holder and total silence for another.
//
// These are STARTING VALUES, not final ones. The method is what matters: pick
// how often the signature event should fire for a typical holder — the target
// is roughly once a fortnight — and calibrate each class against real price
// history. Treat any number here as a hypothesis until that is done.
export const SIGNATURE_PCT = {
  'crypto-major': 8,   // BTC, ETH, SOL and other mega/large caps
  altcoin: 15,         // higher baseline volatility, so a higher bar
  equity: 5,
  metal: 3,
}

/** Classes that never react, however far they move. */
const SILENT = 'silent'

/**
 * Which threshold ladder an asset belongs to.
 *
 * Takes the classification the dashboard has already done rather than
 * recomputing it, so there is exactly one definition of what counts as a stock
 * and this module stays free of asset-data imports.
 *
 * @param {object} o
 * @param {string} o.category  'crypto' | 'stocks' | 'metals' | 'cash' | 'realestate'
 * @param {boolean} [o.isStable]  a stablecoin — routine peg drift is not news
 * @param {string} [o.mcTier]   'mega' | 'large' | 'mid' | 'small' | 'micro'
 */
export function pulseClass({ category, isStable = false, mcTier = '' } = {}) {
  if (isStable) return SILENT
  switch (category) {
    case 'cash':
    case 'realestate':
      // Real estate is valued by hand, so a "move" is the user editing a
      // number. Reacting to that would be reacting to typing.
      return SILENT
    case 'metals': return 'metal'
    case 'stocks': return 'equity'
    case 'crypto':
      return (mcTier === 'mega' || mcTier === 'large') ? 'crypto-major' : 'altcoin'
    default: return SILENT
  }
}

// ── Market periods ─────────────────────────────────────────────────────────
//
// "Reset at the market-day boundary" sounds like one rule and is four. Crypto
// runs continuously on UTC; equities close on their exchange's calendar;
// metals follow the London session. A single global reset fires late for some
// assets and suppresses others outright.
const PERIOD_TZ = {
  'crypto-major': 'UTC',
  altcoin: 'UTC',
  equity: 'America/New_York',
  metal: 'Europe/London',
}

/**
 * The key threshold flags are stored against, so they clear at the right
 * moment for this asset and not some other market's midnight.
 *
 * Returns null for silent classes, which is the caller's cue that there is
 * nothing to track.
 */
export function marketPeriodKey(cls, now = Date.now()) {
  const tz = PERIOD_TZ[cls]
  if (!tz) return null
  try {
    // en-CA gives YYYY-MM-DD, which sorts and compares as a plain string.
    return `${cls}:${new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(now))}`
  } catch {
    // A runtime without full ICU still has to bucket somehow. UTC date is a
    // worse boundary than the right one, but far better than no reset at all.
    return `${cls}:${new Date(now).toISOString().slice(0, 10)}`
  }
}

// ── Data integrity ─────────────────────────────────────────────────────────
//
// WalletLens polls several price sources with fallbacks and caches responses
// in the service worker. Three ordinary situations produce a delta that never
// happened in the market: a cached price followed by a fresh one, a failover
// between providers that disagree slightly, and a source returning something
// stale or malformed.
//
// Any of them fires a rocket for a move that did not occur, and a celebration
// for a fake move destroys trust in the feature the first time it happens.

/**
 * Largest single-tick change in the daily percentage we will believe.
 *
 * A real asset can be up 40% on the day; what it cannot do is go from +2% to
 * +42% between two polls a minute apart. That is a data fault wearing a
 * market's clothes.
 */
export const MAX_TICK_DELTA_PCT = 40

/** Whether a pair of samples can be compared at all. */
export function comparable(prev, next) {
  if (!prev || !next) return false
  if (!Number.isFinite(prev.changePct) || !Number.isFinite(next.changePct)) return false
  // Explicitly false means "served from cache"; undefined means the caller
  // does not track freshness, and we take its word for it.
  if (next.fresh === false) return false
  // Different providers disagree by small amounts that look like real moves.
  // Re-baseline silently instead: the caller stores next as the new prev.
  if (prev.source && next.source && prev.source !== next.source) return false
  if (Math.abs(next.changePct - prev.changePct) > MAX_TICK_DELTA_PCT) return false
  return true
}

// ── Events ─────────────────────────────────────────────────────────────────
//
// Lower number wins. Portfolio events outrank asset events because they are
// what the user actually came to look at, and a milestone outranks everything
// because it happens a handful of times in a lifetime of using the app.
export const PRIORITY = { milestone: 0, ath: 1, rocket: 2 }

/** Net-worth ladder, in the user's display currency. */
export const MILESTONES = [10e3, 25e3, 50e3, 100e3, 250e3, 500e3, 1e6]

export function emptyState() {
  return { fired: {}, ath: 0, milestonesHit: [] }
}

function firedKey(assetId, periodKey) {
  return `${assetId}|${periodKey}`
}

/**
 * Everything worth reacting to between two market snapshots.
 *
 * @param {object} o
 * @param {object} o.prev   assetId → { changePct, source?, fresh? }, last seen
 * @param {object} o.next   assetId → { changePct, source?, fresh?, cls, symbol? }
 * @param {object} o.state  from emptyState(), carrying fired flags and records
 * @param {number} [o.totalValue]  portfolio value now, for ATH and milestones
 * @param {number} [o.now]
 * @returns {Array} events, unsorted — selectOne picks the one that plays
 */
export function detectEvents({ prev = {}, next = {}, state = emptyState(), totalValue = 0, now = Date.now() } = {}) {
  const events = []

  for (const [assetId, sample] of Object.entries(next)) {
    const cls = sample?.cls
    if (!cls || cls === SILENT) continue

    const threshold = SIGNATURE_PCT[cls]
    if (!threshold) continue

    const before = prev[assetId]
    if (!comparable(before, sample)) continue

    // The crossing itself. Both halves matter: was below, is now at or above.
    if (!(before.changePct < threshold && sample.changePct >= threshold)) continue

    // And it must not already have fired this period.
    const periodKey = marketPeriodKey(cls, now)
    const already = state.fired[firedKey(assetId, periodKey)] || []
    if (already.includes(threshold)) continue

    events.push({
      type: 'rocket',
      priority: PRIORITY.rocket,
      assetId,
      symbol: sample.symbol || assetId,
      cls,
      threshold,
      changePct: sample.changePct,
      periodKey,
      at: now,
    })
  }

  // Portfolio all-time high. Only a genuine new maximum counts, so this can
  // never feel spammy — it is not possible for things to be better than ever
  // twice in a row without actually improving.
  if (totalValue > 0 && state.ath > 0 && totalValue > state.ath) {
    events.push({ type: 'ath', priority: PRIORITY.ath, value: totalValue, at: now })
  }

  // Net worth crossing a milestone. Highest of the newly crossed ones, since
  // a single big deposit can pass several at once and only the top one is the
  // story worth telling.
  if (totalValue > 0) {
    const crossed = MILESTONES
      .filter(m => totalValue >= m && !state.milestonesHit.includes(m))
      .sort((a, b) => b - a)
    if (crossed.length && state.ath > 0) {
      events.push({ type: 'milestone', priority: PRIORITY.milestone, value: crossed[0], at: now })
    }
  }

  return events
}

// ── Choosing one ───────────────────────────────────────────────────────────

/** Nothing at all may play within this window of the last sound. */
export const COOLDOWN_MS = 5000

/** A second major event needs more room than that. */
export const MAJOR_COOLDOWN_MS = 10000

/**
 * The single event that plays, or null.
 *
 * Losers are dropped rather than queued. Queueing is what produces the five
 * sequential rockets when the whole crypto market rallies together — the user
 * does not want a playlist, they want to know something happened.
 */
export function selectOne(events, cooldown = {}, now = Date.now()) {
  if (!events || !events.length) return null

  const last = Number(cooldown.lastAt) || 0
  if (last && now - last < COOLDOWN_MS) return null

  const sorted = [...events].sort((a, b) => (
    a.priority - b.priority ||
    Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0)
  ))
  const winner = sorted[0]

  const lastMajor = Number(cooldown.lastMajorAt) || 0
  const isMajor = winner.priority <= PRIORITY.ath
  if (isMajor && lastMajor && now - lastMajor < MAJOR_COOLDOWN_MS) return null

  return winner
}

// ── State ──────────────────────────────────────────────────────────────────

/**
 * Record that an event happened, so it cannot happen again.
 *
 * Returns a new object rather than mutating, so a caller that fails to
 * persist has not already corrupted the copy in memory.
 */
export function applyFired(state = emptyState(), event, totalValue = 0) {
  // No early return on a null event. This is called on every refresh, and the
  // overwhelming majority of those have nothing to report — but they still
  // carry a portfolio value, and the high-water mark below has to see it.
  // Returning early here meant `ath` only ever moved when an ATH event fired,
  // which it cannot do until `ath` is already non-zero. Nothing would have
  // ever fired.
  const nextState = {
    fired: { ...state.fired },
    ath: state.ath,
    milestonesHit: [...state.milestonesHit],
  }

  if (event && event.type === 'rocket') {
    const k = firedKey(event.assetId, event.periodKey)
    nextState.fired[k] = [...(state.fired[k] || []), event.threshold]
  }
  if (event?.type === 'ath') nextState.ath = Math.max(state.ath, event.value)
  if (event?.type === 'milestone' && !nextState.milestonesHit.includes(event.value)) {
    nextState.milestonesHit.push(event.value)
  }

  // The high-water mark tracks upward on every observation, not only when an
  // ATH event fires — otherwise a user whose sound is off would bank a false
  // "record" the moment they turn it on.
  if (totalValue > nextState.ath) nextState.ath = totalValue

  return nextState
}

/**
 * Drop flags for periods that have ended.
 *
 * Without this the fired map grows one entry per asset per day forever. ATH
 * and milestones are untouched: they are not period-scoped and are the only
 * two things here meant to last.
 */
export function pruneState(state = emptyState(), now = Date.now()) {
  const live = new Set(Object.keys(PERIOD_TZ).map(cls => marketPeriodKey(cls, now)))
  const fired = {}
  for (const [k, v] of Object.entries(state.fired)) {
    const periodKey = k.slice(k.indexOf('|') + 1)
    if (live.has(periodKey)) fired[k] = v
  }
  return { ...state, fired }
}

/**
 * Seed the records for a user who has never had Market Pulse on.
 *
 * Their current value becomes the high-water mark and every milestone below
 * it counts as already passed. Skipping this would greet someone with a
 * "new all-time high" and a $100K milestone the first time they enable a
 * sound setting, for a portfolio they have held for a year.
 */
export function seedRecords(state = emptyState(), totalValue = 0) {
  if (!(totalValue > 0)) return state
  return {
    ...state,
    ath: Math.max(state.ath, totalValue),
    milestonesHit: Array.from(new Set([
      ...state.milestonesHit,
      ...MILESTONES.filter(m => totalValue >= m),
    ])),
  }
}
