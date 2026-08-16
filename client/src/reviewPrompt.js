// Decides when to show Google Play's in-app review card.
//
// The card itself is native (Play In-App Review API, see ReviewActivity.java),
// but everything that makes the timing sensible — how long someone has been
// using WalletLens, how many sessions, whether they actually have a portfolio
// — lives in this page's localStorage. So the decision is made here and the
// card is requested over the walletlens://review bridge.
//
// ── What this file may and may not do ──────────────────────────────────────
//
// Play's design guidelines forbid asking the user ANY question before or while
// presenting the card, including opinion questions like "Enjoying WalletLens?".
// The common "ask how they feel, send only the happy ones to the store" funnel
// is ratings manipulation and gets listings flagged. Nothing here screens on
// sentiment, and nothing here should ever grow a prompt of its own.
//
// What it does instead is pick the *moment*. Play caps how often the card can
// appear per user server-side, so asking more often achieves nothing — the
// levers that actually move review volume are how many users ever qualify, and
// whether the one ask they get lands somewhere they are not busy or annoyed.
//
// Friction below means the APP failed — an exception, a failed import, a sync
// error. It deliberately does not include the market going down. A drawdown is
// not our fault and suppressing on it would be filtering by predicted mood,
// which is the thing the guidelines are about.
//
// No-op outside the installed Android app.

import { isAndroidTWA, fireNativeIntent } from './nativeBridge'

const STATE_KEY = 'wl_review_state_v2'
const SESSION_FLAG = 'wl_review_session_counted'

// ── Base eligibility — all of these must hold ──────────────────────────────
const MIN_OPENS = 4              // separate app launches
const MIN_DAYS = 3               // days since the very first launch
const MIN_HOLDINGS = 1           // one tracked asset is enough to have a view
const MIN_DWELL_MS = 40 * 1000   // don't interrupt the first seconds of a session

// A moment shortens the dwell: someone who just watched a price target hit is
// already looking at good news, and making them wait another half minute only
// risks them navigating away.
const MOMENT_DWELL_MS = 8 * 1000

// How long a positive moment stays worth acting on. Long enough to survive a
// re-render or a tab switch, short enough that the card still feels connected
// to the thing that just happened.
const MOMENT_TTL_MS = 2 * 60 * 1000

// After the app fails at something, stay quiet. Covers the rest of the session
// plus a cooling-off period, because the next launch is often the retry.
const FRICTION_QUIET_MS = 36 * 60 * 60 * 1000

// Play's own quota is the real limiter, so these exist to stop us firing an
// intent that can only be ignored — not to ration a scarce resource.
const REASK_AFTER_DAYS = 45
const MAX_ASKS = 4

// Someone who keeps using the app without ever tripping a moment should still
// get asked. Set close to the base gates on purpose: the moment path exists to
// ask *well*, not to shrink who gets asked at all, and a steady user three
// weeks in is exactly who a rating should come from.
const TENURE_DAYS = 14
const TENURE_OPENS = 10

const DAY_MS = 24 * 60 * 60 * 1000

// When this page instance started, for the dwell check.
const startedAt = Date.now()

/**
 * Moments worth asking after. Each is a thing the user just saw work.
 *
 * Kept as a set rather than free strings so a typo at a call site fails the
 * test rather than silently registering a moment that never matches.
 */
export const MOMENTS = new Set([
  'target_reached',    // a sell target they set was hit
  'goal_reached',      // a savings/net-worth goal completed
  'import_success',    // screenshot / CSV / voice import landed
  'backup_saved',      // exported a backup code or QR
  'achievement',       // an Academy badge
  'streak',            // a multi-day usage streak milestone
  'guardian_active',   // finished setting up Portfolio Guardian
  'first_holding',     // added their very first asset
])

/** App failures. Not market losses — see the header. */
export const FRICTIONS = new Set([
  'exception',         // an uncaught error reached the boundary
  'import_failed',
  'sync_failed',
  'restore_failed',
])

function readState() {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return { first: 0, opens: 0, asked: 0, askCount: 0, moment: 0, momentKind: '', friction: 0 }
    const s = JSON.parse(raw)
    return {
      first: Number(s.first) || 0,
      opens: Number(s.opens) || 0,
      asked: Number(s.asked) || 0,
      askCount: Number(s.askCount) || 0,
      moment: Number(s.moment) || 0,
      momentKind: String(s.momentKind || ''),
      friction: Number(s.friction) || 0,
    }
  } catch {
    return { first: 0, opens: 0, asked: 0, askCount: 0, moment: 0, momentKind: '', friction: 0 }
  }
}

function writeState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

/**
 * Record that the app was opened. Safe to call on every mount — sessionStorage
 * keeps it to one increment per launch, so navigating between pages or a
 * component remount doesn't inflate the count.
 */
export function noteAppOpen() {
  try {
    if (!isAndroidTWA()) return
    if (sessionStorage.getItem(SESSION_FLAG)) return
    sessionStorage.setItem(SESSION_FLAG, '1')

    const s = readState()
    if (!s.first) s.first = Date.now()
    s.opens += 1
    writeState(s)
  } catch {
    // sessionStorage can throw in locked-down webviews; skip the count.
  }
}

/**
 * Something just went well. Records it so the next eligibility check can fire.
 *
 * Deliberately does NOT ask straight away: the caller is usually mid-render or
 * mid-animation, and the dashboard's own check runs moments later with the
 * full picture (holdings, dwell, friction) that this call site doesn't have.
 *
 * Safe to call outside the app and with an unknown kind — both no-op.
 */
export function noteMoment(kind) {
  try {
    if (!isAndroidTWA() || !MOMENTS.has(kind)) return
    const s = readState()
    s.moment = Date.now()
    s.momentKind = kind
    writeState(s)
  } catch { /* storage blocked */ }
}

/**
 * The app just failed at something. Suppresses the card for a cooling-off
 * period so we don't ask for a rating immediately after wasting someone's time.
 *
 * This is the single highest-value rule here. An ask right after a failed
 * import does not just waste the one chance Play gives us — it actively invites
 * the one-star it deserves.
 */
export function noteFriction(kind) {
  try {
    if (!isAndroidTWA() || !FRICTIONS.has(kind)) return
    const s = readState()
    s.friction = Date.now()
    writeState(s)
  } catch { /* storage blocked */ }
}

/**
 * Why an ask was or wasn't made. Exposed for the Settings diagnostics readout —
 * there is no other way to see this on a user's phone, and "the card never
 * shows" is otherwise indistinguishable from "Play declined to show it".
 */
export function reviewDiagnostics() {
  const s = readState()
  const now = Date.now()
  return {
    ...s,
    twa: isAndroidTWA(),
    momentFresh: !!s.moment && now - s.moment < MOMENT_TTL_MS,
    inQuietPeriod: !!s.friction && now - s.friction < FRICTION_QUIET_MS,
    daysSinceFirst: s.first ? Math.floor((now - s.first) / DAY_MS) : 0,
  }
}

/**
 * Ask Play to show the review card, if now is a good moment.
 *
 * @param {object} o
 * @param {number} [o.holdingsCount]  positions currently held
 * @param {number} [o.totalValue]     net worth, used only as a "has data" signal
 * @param {boolean} [o.busy]          a sheet/modal is open — never interrupt
 * @returns {boolean} whether the card was requested
 */
export function maybeAskForReview({ holdingsCount = 0, totalValue = 0, busy = false } = {}) {
  try {
    if (!isAndroidTWA()) return false
    if (busy) return false

    // Nothing to have an opinion about yet.
    if (holdingsCount < MIN_HOLDINGS || totalValue <= 0) return false

    const s = readState()
    const now = Date.now()

    // The app let them down recently. Nothing else matters until that passes.
    if (s.friction && now - s.friction < FRICTION_QUIET_MS) return false

    if (s.askCount >= MAX_ASKS) return false
    if (s.opens < MIN_OPENS) return false
    if (!s.first || now - s.first < MIN_DAYS * DAY_MS) return false
    if (s.asked && now - s.asked < REASK_AFTER_DAYS * DAY_MS) return false

    // Either something good just happened, or they have been here long enough
    // that waiting for a moment that may never come is the worse option.
    const momentFresh = !!s.moment && now - s.moment < MOMENT_TTL_MS
    const tenured = s.opens >= TENURE_OPENS && now - s.first >= TENURE_DAYS * DAY_MS
    if (!momentFresh && !tenured) return false

    // Still settling into the session — a dialog now reads as an ambush. A
    // fresh moment earns a shorter wait, since the good news is on screen.
    const dwellNeeded = momentFresh ? MOMENT_DWELL_MS : MIN_DWELL_MS
    if (now - startedAt < dwellNeeded) return false

    // Record the ask before firing. If the intent is dropped — an older build
    // of the shell with no ReviewActivity, say — the alternative is retrying on
    // every render, which is far worse than losing one ask.
    const source = momentFresh ? s.momentKind : 'tenure'
    s.asked = now
    s.askCount += 1
    s.moment = 0
    s.momentKind = ''
    writeState(s)

    return fireNativeIntent('walletlens://review?source=' + encodeURIComponent(source))
  } catch {
    return false
  }
}

/**
 * Open the review card because the user asked for it (a "Rate WalletLens"
 * tap), rather than because the usage rules fired. This one falls back to the
 * store listing if Play declines to show the card, since the user is expecting
 * something to happen.
 *
 * Bypasses every gate above on purpose, including the quiet period: they went
 * looking for this, which is a different thing from us interrupting them.
 */
export function requestReviewNow(source = 'manual') {
  if (!isAndroidTWA()) return false
  const s = readState()
  s.asked = Date.now()
  writeState(s)
  return fireNativeIntent(
    'walletlens://review?fallback=store&source=' + encodeURIComponent(source)
  )
}
