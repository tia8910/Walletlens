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
// Of those two, reach was chosen: every returning user qualifies, with no
// waiting period. A moment is a bonus that shortens the dwell and labels the
// source, not a requirement. What remains is only the stuff that would make an
// ask actively counterproductive — an open sheet, an empty portfolio, or a
// recent failure in the app.
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

// ── Base eligibility ───────────────────────────────────────────────────────
//
// There is no waiting period and no session minimum: the card is eligible from
// the very first visit. This deliberately matches how apps like Product Hunt
// do it, and the trade is understood — some of those users are rating an app
// they have barely used, which costs a little on the average. What it buys is
// that everybody gets asked instead of the fraction still around days later.
//
// Two rules survive, because both prevent an ask that would actively backfire:
//
//   `busy`     — never land the card on someone mid-entry, with a trade sheet
//                or import chooser open.
//   dwell      — give the session a few seconds first, so the card is not the
//                first thing that happens when the dashboard paints.
//
// Note what is NOT required: a portfolio. Requiring one would push the ask past
// the first visit for every new user, which is exactly what this is not.
//
// Moments still exist, but only as a bonus — they shorten the dwell and label
// the source. They are not a gate.
const MIN_OPENS = 1              // the first launch counts
const MIN_DAYS = 0               // no waiting period
const MIN_HOLDINGS = 0           // no portfolio needed
const MIN_DWELL_MS = 15 * 1000   // don't interrupt the first seconds of a session

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

// Play applies its own undisclosed per-user quota and simply shows nothing once
// it is spent, so repeated attempts over a short window achieve nothing. This
// is our own cooldown on top of that: two months before the same person is
// considered again.
const REASK_AFTER_DAYS = 60
const MAX_ASKS = 4

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
 *
 * `blockedBy` only considers the gates this file can judge from stored state.
 * Whether there is a portfolio on screen depends on a snapshot the caller
 * passes, which Settings does not have, so those gates are left out rather
 * than reported wrongly.
 */
export function reviewDiagnostics() {
  const s = readState()
  const now = Date.now()
  const g = storedGates(s, now)
  return {
    ...s,
    twa: isAndroidTWA(),
    momentFresh: !!s.moment && now - s.moment < MOMENT_TTL_MS,
    inQuietPeriod: !!s.friction && now - s.friction < FRICTION_QUIET_MS,
    daysSinceFirst: s.first ? Math.floor((now - s.first) / DAY_MS) : 0,
    opensLeft: Math.max(0, MIN_OPENS - s.opens),
    daysLeft: s.first
      ? Math.max(0, MIN_DAYS - Math.floor((now - s.first) / DAY_MS))
      : MIN_DAYS,
    pendingAsk: !!pending,
    blockedBy: g,
  }
}

/**
 * The gates that depend only on what we have stored. '' means none of them.
 *
 * A moment is no longer required to pass. It still decides the *source* label
 * and shortens the dwell, but a returning user qualifies on their own.
 */
function storedGates(s, now) {
  if (s.friction && now - s.friction < FRICTION_QUIET_MS) return 'friction'
  if (s.askCount >= MAX_ASKS) return 'max-asks'
  if (s.opens < MIN_OPENS) return 'few-opens'
  if (!s.first || now - s.first < MIN_DAYS * DAY_MS) return 'too-new'
  if (s.asked && now - s.asked < REASK_AFTER_DAYS * DAY_MS) return 'recent-ask'
  return ''
}

// ── Delivery ───────────────────────────────────────────────────────────────
//
// Deciding to ask and being able to ask are two different problems.
//
// Sending the intent means navigating the top frame, and fireNativeIntent
// refuses to do that without a user activation — rightly, because inside a
// Custom Tab an unhandled navigation ends the session and the app vanishes.
// But every automatic ask is made from a timer, where there is no activation
// and never can be. So the intent was recorded as 'skipped-no-activation' and
// dropped every single time: the card could not appear for anyone, however
// eligible, and the web side reported nothing wrong because nothing threw.
//
// The fix is to let the decision and the gesture happen at different moments.
// When the rules say yes with no activation in hand, the ask is armed, and the
// next deliberate tap carries it.
//
// It has to be a completed `click` on a control. `pointerdown` fires at the
// start of a scroll too, and firing an intent under a scrolling finger is the
// exact bug that used to read as "the app closes when I scroll".

let pending = null          // { source } once armed, null otherwise
let snapshotSource = null   // last thing passed to maybeAskForReview

const CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, summary, label, [role="button"], [role="tab"], [role="link"]'

function hasActivation() {
  const a = typeof navigator !== 'undefined' ? navigator.userActivation : null
  // Missing in older Chrome; assume allowed and let the navigation be the test.
  return !a || a.isActive
}

/**
 * The caller may pass a plain snapshot or a getter. A getter is what the
 * dashboard uses, because an armed ask fires later than the call that armed it
 * and a snapshot captured back then would be stale about the one thing that
 * matters most — whether a sheet is now open.
 */
function readSnapshot() {
  try {
    const v = typeof snapshotSource === 'function' ? snapshotSource() : snapshotSource
    const o = v || {}
    return {
      holdingsCount: Number(o.holdingsCount) || 0,
      totalValue: Number(o.totalValue) || 0,
      busy: !!o.busy,
    }
  } catch {
    return { holdingsCount: 0, totalValue: 0, busy: false }
  }
}

function evaluate(snap) {
  if (snap.busy) return { ok: false, blocked: 'busy' }

  // Only checked when MIN_HOLDINGS is above zero. It is deliberately not, so
  // this is inert — kept as the single line to change if the ask should ever
  // wait for a portfolio again, rather than having to reconstruct the rule.
  if (MIN_HOLDINGS > 0 && snap.holdingsCount < MIN_HOLDINGS) {
    return { ok: false, blocked: 'no-portfolio' }
  }

  const s = readState()
  const now = Date.now()

  // The app let them down recently. Nothing else matters until that passes.
  const gate = storedGates(s, now)
  if (gate) return { ok: false, blocked: gate }

  // Still settling into the session — a dialog now reads as an ambush. A
  // fresh moment earns a shorter wait, since the good news is on screen.
  const momentFresh = !!s.moment && now - s.moment < MOMENT_TTL_MS
  const dwellNeeded = momentFresh ? MOMENT_DWELL_MS : MIN_DWELL_MS
  if (now - startedAt < dwellNeeded) return { ok: false, blocked: 'dwell' }

  // 'returning' is the plain "came back and has a portfolio" path. It is a
  // distinct label from the moment kinds so the Play console still shows which
  // trigger actually earns ratings.
  return { ok: true, source: momentFresh ? s.momentKind : 'returning' }
}

function fireAsk(source) {
  // Record the ask before firing. If the intent is dropped — an older build of
  // the shell with no ReviewActivity, say — the alternative is retrying on
  // every render, which is far worse than losing one ask.
  const s = readState()
  s.asked = Date.now()
  s.askCount += 1
  s.moment = 0
  s.momentKind = ''
  writeState(s)
  return fireNativeIntent('walletlens://review?source=' + encodeURIComponent(source))
}

function onClick(e) {
  if (!pending) return disarm()
  const el = e.target
  if (!el || typeof el.closest !== 'function' || !el.closest(CONTROL_SELECTOR)) return

  const source = pending.source
  disarm()

  // Let the tap's own work commit before deciding. Transient activation lasts
  // about five seconds, so a zero-delay hop still counts as the same gesture,
  // and by then React has opened whatever the tap was for — which is how we
  // avoid dropping a rating card on top of a sheet the user just opened.
  setTimeout(() => {
    try {
      const snap = readSnapshot()
      const again = evaluate(snap)
      if (!again.ok) return   // the interval will re-arm if it becomes true again
      fireAsk(source)
    } catch { /* nothing safe left to do */ }
  }, 0)
}

function arm(source) {
  if (typeof document === 'undefined') return
  if (!pending) document.addEventListener('click', onClick, false)
  pending = { source }
}

function disarm() {
  if (typeof document === 'undefined') return
  if (pending) document.removeEventListener('click', onClick, false)
  pending = null
}

/**
 * Ask Play to show the review card, if now is a good moment.
 *
 * Safe to call on a timer. When the rules pass but there is no user gesture to
 * ride on, the ask is armed rather than lost, and fires on the next tap.
 *
 * @param {object|function} input  snapshot, or a getter returning one:
 *   `holdingsCount` positions held, `totalValue` net worth (a "has data"
 *   signal only), `busy` true while a sheet/modal is open.
 * @returns {boolean} whether the card was requested right now
 */
export function maybeAskForReview(input = {}) {
  try {
    snapshotSource = input
    if (!isAndroidTWA()) return false

    const e = evaluate(readSnapshot())
    if (!e.ok) {
      disarm()
      return false
    }

    if (hasActivation()) {
      disarm()
      return fireAsk(e.source)
    }

    arm(e.source)
    return false
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
