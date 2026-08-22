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
/**
 * The whole portfolio having a good day.
 *
 * The three original events all turned out to be close to unobservable in
 * practice: a rocket needs one asset to cross its class threshold between two
 * consecutive refreshes, and an ATH or a milestone happens a handful of times
 * in the life of an account. Someone can use the app for weeks, with the
 * feature working perfectly, and never see it do anything — which is
 * indistinguishable from it being broken.
 *
 * This is the event that fires on an ordinary good day: the portfolio as a
 * whole up by this much since yesterday. Capped at once per calendar day, so
 * a rally that keeps going is celebrated once rather than on every refresh.
 */
export const PORTFOLIO_SURGE_PCT = 3

/** A day good enough for more than fireworks. */
export const PORTFOLIO_RAIN_PCT = 8

// Down thresholds are deliberately WIDER than the matching up ones. Losses
// feel larger than equivalent gains, so mirroring +3/+8 exactly would make the
// app chime about bad news more readily than good — and the one thing worse
// than a silent finance app is one that seems to enjoy your bad days.
export const PORTFOLIO_DIP_PCT = -5
export const PORTFOLIO_STORM_PCT = -10

// The day's best holding, shown once on the first open of the day.
//
// This was gated hard at first — a 12% move, five points clear of second place,
// in a field of at least three — on the reasoning that a top gainer exists
// every day and crowning one daily is routine. That reasoning made the moment
// almost unreachable: three holdings up 25% together clears the 12% floor and
// still fails the lead test, so the feature sat silent through exactly the days
// it was built for. Rarity was not making it feel earned, it was making it feel
// broken.
//
// It is a daily moment now. One asset, once a day, on the first open.
/**
 * The leader still has to be UP. "Top gainer" means a gain, and a celebration
 * over the least-bad holding on a red day reads as mockery — the storm and
 * down-day effects own that morning. Just above zero rather than zero, so a
 * rounding artefact is not crowned.
 */
export const CHAMPION_MIN_PCT = 0.1

/**
 * No lead requirement. Being ahead is the whole qualification, and demanding
 * daylight over second place is what silenced the feature on broad rally days.
 */
export const CHAMPION_LEAD_PCT = 0

/** One real mover is a top gainer. A one-asset portfolio still has a best day. */
export const CHAMPION_MIN_ASSETS = 1

/** Share of the holdings that has to be green before it counts as weather. */
export const AURORA_BREADTH = 0.68

/**
 * Below this many priced assets, "nearly everything is up" is one coin's
 * opinion dressed up as a trend, so there is no breadth figure to report.
 */
export const AURORA_MIN_ASSETS = 5

/**
 * Share of a list of 24-hour changes that is positive.
 *
 * @param {Array<number|undefined>} changePcts one per asset; non-numbers drop
 * @returns {number|null} 0..1, or null when the sample is too small to mean
 *   anything. Null rather than 0 on purpose: no data must never be read as
 *   "nothing is up".
 */
export function breadthOf(changePcts) {
  const finite = (changePcts || []).filter(p => Number.isFinite(p))
  if (finite.length < AURORA_MIN_ASSETS) return null
  return finite.filter(p => p > 0).length / finite.length
}

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
// Down events sit between the portfolio highs and the per-asset ones. A bad
// day outranks one coin having a good one — telling someone a single holding
// is up while the portfolio is down 8% reads as the app not paying attention.
// champion outranks rocket because it is the better sentence about the same
// kind of fact: "this crossed a line" versus "this beat everything you own".
export const PRIORITY = {
  milestone: 0, fireworks: 1, rain: 1, ath: 2,
  storm: 2, dip: 3, lock: 3, champion: 4, rocket: 5, aurora: 6, shockwave: 7,
}

/** Net-worth ladder, in the user's display currency. */
export const MILESTONES = [10e3, 25e3, 50e3, 100e3, 250e3, 500e3, 1e6]

export function emptyState() {
  return {
    fired: {}, ath: 0, milestonesHit: [], surgeDay: '',
    rainDay: '', dipDay: '', stormDay: '', auroraDay: '', locksHit: [],
    championDay: '',
  }
}

function firedKey(assetId, periodKey) {
  return `${assetId}|${periodKey}`
}

/**
 * Everything worth reacting to between two market snapshots.
 *
 * @param {object} o
 * @param {object} o.prev   assetId → { changePct, source?, fresh? }, last seen
 * @param {object} o.next   assetId → { changePct, source?, fresh?, cls, symbol?, image? }
 * @param {object} o.state  from emptyState(), carrying fired flags and records
 * @param {number} [o.totalValue]  portfolio value now, for ATH and milestones
 * @param {number} [o.now]
 * @returns {Array} events, unsorted — selectOne picks the one that plays
 */
export function detectEvents({
  prev = {}, next = {}, state = emptyState(), totalValue = 0,
  portfolioChangePct = 0, breadth = null, targetsHit = [], now = Date.now(),
} = {}) {
  const events = []
  let crossings = 0

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

    // First crossing of the pass gets the rocket; any others get the quieter
    // shockwave. On a broad green day several assets cross at once, and firing
    // four identical launches would turn the signature moment into noise —
    // but silently dropping the rest pretends they did not happen.
    const kind = crossings++ === 0 ? 'rocket' : 'shockwave'
    events.push({
      type: kind,
      priority: PRIORITY[kind],
      assetId,
      symbol: sample.symbol || assetId,
      cls,
      threshold,
      changePct: sample.changePct,
      periodKey,
      at: now,
    })
  }

  // The portfolio flying. Unlike the three below it, this does not need a
  // crossing between two samples — it is a statement about today, so it is
  // true from the first observation of the session onward. That is the point:
  // it fires when you open the app on a good day, which is when you actually
  // want to be told.
  //
  // The once-per-day cap is what keeps it from being noise. Without it every
  // price refresh during a rally would fire again.
  const surgeDay = marketPeriodKey('crypto-major', now)
  if (
    Number.isFinite(portfolioChangePct) &&
    portfolioChangePct >= PORTFOLIO_SURGE_PCT &&
    totalValue > 0 &&
    state.surgeDay !== surgeDay
  ) {
    events.push({
      type: 'fireworks',
      priority: PRIORITY.fireworks,
      changePct: portfolioChangePct,
      value: totalValue,
      surgeDay,
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

  // ── The rest of the day's weather ────────────────────────────────────────
  // All of these are statements about today rather than crossings between two
  // samples, so each is capped to once per day by its own key. Without that,
  // every price refresh during a move would fire again.
  const day = marketPeriodKey('crypto-major', now)
  const pct = Number.isFinite(portfolioChangePct) ? portfolioChangePct : null
  const hasPortfolio = totalValue > 0

  // A day well past fireworks territory.
  if (pct !== null && hasPortfolio && pct >= PORTFOLIO_RAIN_PCT && state.rainDay !== day) {
    events.push({ type: 'rain', priority: PRIORITY.rain, changePct: pct, value: totalValue, day, at: now })
  }

  // Down days. These exist because a portfolio app that only speaks when
  // things go well is a cheerleader, not a tracker — and people notice.
  // The copy and the visuals stay calm; see PulseOverlay.
  if (pct !== null && hasPortfolio && pct <= PORTFOLIO_STORM_PCT && state.stormDay !== day) {
    events.push({ type: 'storm', priority: PRIORITY.storm, changePct: pct, value: totalValue, day, at: now })
  } else if (pct !== null && hasPortfolio && pct <= PORTFOLIO_DIP_PCT && state.dipDay !== day) {
    // `else if`: a storm day is also a dip day, and firing both would mean
    // acknowledging the same fact twice.
    events.push({ type: 'dip', priority: PRIORITY.dip, changePct: pct, value: totalValue, day, at: now })
  }

  // Broad green. Not about what the portfolio is worth — it is the weather
  // over it, and it reads as such: no numbers, no celebration. A portfolio can
  // be almost entirely up on the day and still be down in money, if the one
  // red holding is the large one; that is exactly the case this is for.
  if (Number.isFinite(breadth) && breadth >= AURORA_BREADTH && state.auroraDay !== day) {
    events.push({ type: 'aurora', priority: PRIORITY.aurora, breadth, day, at: now })
  }

  // The day's champion — the best holding, crowned once on the first open.
  // `championDay` is what makes it once-a-day: the first pass that finds a
  // gainer sets it, and every later pass that day is a no-op.
  if (state.championDay !== day) {
    const movers = Object.entries(next)
      .filter(([, v]) => v?.cls && v.cls !== SILENT && Number.isFinite(v.changePct))
      .sort((a, b) => b[1].changePct - a[1].changePct)

    if (movers.length >= CHAMPION_MIN_ASSETS) {
      const [leadId, lead] = movers[0]
      // Second place may not exist — a single holding is still that day's best.
      const runnerUp = movers[1] ? movers[1][1].changePct : lead.changePct
      if (lead.changePct >= CHAMPION_MIN_PCT && lead.changePct - runnerUp >= CHAMPION_LEAD_PCT) {
        events.push({
          type: 'champion', priority: PRIORITY.champion,
          assetId: leadId,
          symbol: lead.symbol || leadId,
          image: lead.image || '',
          changePct: lead.changePct,
          runnerUpPct: runnerUp,
          day, at: now,
        })
      }
    }
  }

  // A price target the user set themselves. Keyed by target id, so each one
  // announces itself exactly once, ever.
  for (const t of (targetsHit || [])) {
    const id = String(t?.id ?? '')
    if (!id || state.locksHit.includes(id)) continue
    events.push({
      type: 'lock', priority: PRIORITY.lock,
      targetId: id, symbol: t.symbol || id, price: t.price, at: now,
    })
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
    surgeDay: state.surgeDay || '',
    rainDay: state.rainDay || '',
    dipDay: state.dipDay || '',
    stormDay: state.stormDay || '',
    auroraDay: state.auroraDay || '',
    championDay: state.championDay || '',
    locksHit: [...(state.locksHit || [])],
  }

  // A shockwave is a crossing like any other and must be recorded the same
  // way, or the asset that produced one keeps producing them all period.
  if (event && (event.type === 'rocket' || event.type === 'shockwave')) {
    const k = firedKey(event.assetId, event.periodKey)
    nextState.fired[k] = [...(state.fired[k] || []), event.threshold]
  }
  if (event?.type === 'fireworks') nextState.surgeDay = event.surgeDay
  if (event?.type === 'ath') nextState.ath = Math.max(state.ath, event.value)
  if (event?.type === 'milestone' && !nextState.milestonesHit.includes(event.value)) {
    nextState.milestonesHit.push(event.value)
  }
  if (event?.type === 'rain') nextState.rainDay = event.day
  if (event?.type === 'dip') nextState.dipDay = event.day
  // A storm day closes the dip too. They describe the same day, and leaving
  // dip open would let the milder one fire a few minutes later.
  if (event?.type === 'storm') { nextState.stormDay = event.day; nextState.dipDay = event.day }
  if (event?.type === 'aurora') nextState.auroraDay = event.day
  if (event?.type === 'champion') nextState.championDay = event.day
  if (event?.type === 'lock' && !nextState.locksHit.includes(event.targetId)) {
    nextState.locksHit.push(event.targetId)
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
 *
 * Sell targets already met get the same treatment, for the same reason and
 * with a sharper edge: a target crossed months ago is a record, not news, and
 * because each target announces itself exactly once they would otherwise
 * arrive one per price refresh until the backlog drained.
 */
export function seedRecords(state = emptyState(), totalValue = 0, targetsHit = []) {
  if (!(totalValue > 0)) return state
  return {
    ...state,
    ath: Math.max(state.ath, totalValue),
    milestonesHit: Array.from(new Set([
      ...state.milestonesHit,
      ...MILESTONES.filter(m => totalValue >= m),
    ])),
    locksHit: Array.from(new Set([
      ...(state.locksHit || []),
      ...(targetsHit || []).map(t => String(t?.id ?? '')).filter(Boolean),
    ])),
  }
}
