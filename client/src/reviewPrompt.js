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
// Of those two, reach was chosen once — every visitor qualified, from the very
// first launch, on a fifteen-second dwell. That was wrong, and it was reported
// as a bug twice before the reason was understood: the card arrived while
// someone was still working out what the app WAS. There is nothing to rate
// fifteen seconds into a first launch, so the card is dismissed, and Play
// counts that against a per-user quota nobody gets back. Maximising who is
// asked is worth nothing if the ask lands before there is an opinion to give.
//
// So the gates below ask for evidence that the app is actually being used:
// several launches, on more than one day, by someone who has put a portfolio
// in. A moment is still a bonus that shortens the dwell and labels the source,
// not a requirement.
//
// Friction below means the APP failed — an exception, a failed import, a sync
// error. It deliberately does not include the market going down. A drawdown is
// not our fault and suppressing on it would be filtering by predicted mood,
// which is the thing the guidelines are about.
//
// No-op outside the installed Android app.

import { isAndroidTWA, fireNativeIntent } from './nativeBridge'

// v3: the rules changed from "3 days and 3 sessions" to "ask from the first
// visit", which makes every stored counter meaningless. Worse, the old manual
// button recorded an ask, so anyone who ever tapped "Rate WalletLens" carries a
// 60-day cooldown they never earned. Bumping the key drops all of it rather
// than migrating state whose meaning no longer exists.
const STATE_KEY = 'wl_review_state_v3'
const SESSION_FLAG = 'wl_review_session_counted'

// ── Base eligibility ───────────────────────────────────────────────────────
//
// Every gate here answers one question: has this person used WalletLens enough
// to have an opinion about it?
//
//   opens      — three launches. One is someone looking around; three is
//                someone who came back on purpose.
//   days       — and on a later day than the first. A single long session is
//                still a first impression.
//   holdings   — a portfolio. The app does one thing, and a user with nothing
//                in it has not seen the app do it.
//   dwell      — a full minute into the session, so the card is never part of
//                arriving. This was fifteen seconds, which on a phone that
//                takes a moment to load meant the card could land while the
//                dashboard was still settling.
//   `busy`     — never on someone mid-entry, with a trade sheet or import
//                chooser open.
//   onboarding — never while the welcome flow is unfinished. Asking someone to
//                rate an app they are still being introduced to is the clearest
//                possible version of this whole mistake.
const MIN_OPENS = 3
const MIN_DAYS = 2
const MIN_HOLDINGS = 1
const MIN_DWELL_MS = 60 * 1000

// A moment shortens the dwell: someone who just watched a price target hit is
// already looking at good news, and making them wait another minute only risks
// them navigating away. It shortens it — it does not remove it, and it does not
// excuse any of the gates above.
const MOMENT_DWELL_MS = 20 * 1000

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

// After this many asks the cadence slows down. It does NOT stop.
//
// This used to be MAX_ASKS = 4, a hard lifetime cap, and the reasoning behind
// it does not survive contact with how the Play API actually behaves:
// launchReviewFlow completes identically whether the card was shown, was
// dismissed, or was silently suppressed because the user was over Google's
// quota. The outcome is deliberately hidden from us. An "ask" is therefore an
// ATTEMPT and nothing more — never evidence that anybody saw anything.
//
// So a user could spend all four attempts inside a single quota window, be
// shown nothing at all, and then be retired for life by
// `askCount >= MAX_ASKS`. The people most likely to hit that are exactly the
// ones who have never rated: someone who rates on their first card stops being
// asked anyway, because Play stops serving it.
//
// Nothing is lost by continuing. An attempt that lands outside the quota costs
// nothing and shows nothing; Google, not this file, is the authority on how
// often a card may appear. Our job is to keep offering on a cadence that is
// not rude — which is what the longer gap below is for.
const SETTLED_ASKS = 4
const SETTLED_REASK_DAYS = 180

const DAY_MS = 24 * 60 * 60 * 1000

// When the app last became usable, for the dwell check.
//
// NOT module-load time, which is what this was. With App Lock on, this module
// evaluates behind the lock screen while the user is still at the fingerprint
// prompt — so the dwell had already elapsed by the time they got in, and the
// rating card fired the instant they unlocked, on top of the biometric prompt.
// The clock starts when the app is actually in front of the user.
let startedAt = Date.now()

// Whether the user can currently see and use the app.
//
// False while the App Lock screen is up. Asking for a rating over a
// fingerprint prompt is the worst possible moment: the user is not looking at
// anything the app did well, they are being challenged for a credential.
let interactive = true

/**
 * Tell the review prompt whether the app is in front of the user.
 *
 * Called from App.jsx as the lock state changes. Becoming interactive restarts
 * the dwell clock, so the wait is measured from when they got in rather than
 * from when the bundle happened to load.
 */
export function setAppInteractive(value) {
  const next = !!value
  if (next && !interactive) startedAt = Date.now()
  interactive = next
}

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

/**
 * Ask the app to raise the review card.
 *
 * @returns {boolean} whether the app was reached — false in a TWA install or a
 *   browser, where the caller falls back to the intent.
 */
function requestNativeReview(source, fallbackStore) {
  try {
    const b = typeof window !== 'undefined' ? window.AndroidBridge : null
    if (!b || typeof b.requestReview !== 'function') return false
    b.requestReview(String(source || 'unknown'), !!fallbackStore)
    return true
  } catch { return false }
}

/**
 * What the native side saw the last time it asked Play, and who installed us.
 *
 * Returns null off Android or on a build without the bridge method, so the
 * Settings line simply omits it rather than claiming anything.
 */
export function nativeReviewStatus() {
  try {
    const b = typeof window !== 'undefined' ? window.AndroidBridge : null
    if (!b || typeof b.reviewStatus !== 'function') return null
    const raw = b.reviewStatus()
    const s = raw ? JSON.parse(raw) : null
    return s && s.installer ? s : null
  } catch { return null }
}

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
/**
 * Whether the first-run welcome flow has been finished.
 *
 * Read rather than imported: NativeOnboarding owns these keys, and this file
 * has no business importing a component to ask a question about localStorage.
 * An unreadable store counts as "still onboarding" — the safe answer, since
 * the cost of not asking is one deferred card and the cost of asking is the
 * card landing on a welcome screen.
 */
function onboardingFinished() {
  try {
    if (localStorage.getItem('wl_welcome_step_v2')) return false   // mid-flow
    return !!localStorage.getItem('wl_welcomed_v2')
  } catch { return false }
}

function storedGates(s, now) {
  if (!onboardingFinished()) return 'onboarding'
  if (s.friction && now - s.friction < FRICTION_QUIET_MS) return 'friction'
  if (s.opens < MIN_OPENS) return 'few-opens'
  if (!s.first || now - s.first < MIN_DAYS * DAY_MS) return 'too-new'
  // Slows after SETTLED_ASKS; never stops. See the constant for why a count of
  // attempts cannot be treated as a count of cards seen.
  const gapDays = s.askCount >= SETTLED_ASKS ? SETTLED_REASK_DAYS : REASK_AFTER_DAYS
  if (s.asked && now - s.asked < gapDays * DAY_MS) return 'recent-ask'
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
  // Behind the App Lock screen. Nothing else is worth checking: there is no
  // app on screen to have an opinion about.
  if (!interactive) return { ok: false, blocked: 'locked' }

  if (snap.busy) return { ok: false, blocked: 'busy' }

  // Live again. This sat inert behind `MIN_HOLDINGS > 0` while the rule was
  // "ask everybody"; an empty portfolio is now a reason to wait, because the
  // one thing this app does has not happened yet for that user.
  if (snap.holdingsCount < MIN_HOLDINGS) {
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
  // keepSession, and it matters more here than anywhere else this is used.
  //
  // The default path navigates the top frame to intent://, which takes the
  // Custom Tab off its own origin and ends the TWA session — the app closes and
  // comes back as a fresh task. Doing that at the exact moment you ask somebody
  // to rate you is the worst possible trade: they get a jarring relaunch, lose
  // their scroll position, and are then shown a review card.
  //
  // ReviewActivity is already built for the opposite of that. It is translucent
  // and excludeFromRecents, so it is meant to appear OVER a running app — which
  // only works if the app is still running. The hidden-iframe path hands
  // Android the same URL without moving the top frame, so the review card lands
  // on top of the dashboard the user was already looking at.
  //
  // Nothing needs to come back: unlike the biometric unlock, which keeps the
  // top-frame navigation because the relaunch IS how its result arrives, this
  // is fire-and-forget by design — the state above is written before firing,
  // and a dropped intent deliberately costs one ask rather than retrying.
  // The bridge where there is one. fireNativeIntent goes out through a hidden
  // iframe and refuses without a live user activation, and both fail silently
  // — which on this path is indistinguishable from Play simply declining to
  // show a card, so the ask could have been vanishing for ever with nothing
  // to see. Inside the app it is a method call.
  if (requestNativeReview(source, false)) return true

  return fireNativeIntent(
    'walletlens://review?source=' + encodeURIComponent(source),
    { keepSession: true },
  )
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

  // Deliberately does NOT record an ask.
  //
  // It used to, and that quietly spent the 60-day cooldown: one tap on
  // "Rate WalletLens" and the automatic prompt was dead on that device for two
  // months. Nothing surfaced it, because the automatic path failing silently is
  // indistinguishable from it not being due yet.
  //
  // The cooldown exists to stop *us* interrupting the same person repeatedly.
  // Someone who went looking for the button has not been interrupted by
  // anything, so there is nothing to cool down from. If they did go on to
  // leave a rating, Play's own per-user quota is what stops a second card —
  // and on the native side ReviewGate checks review_flow_completed_at, which
  // is only written when a flow actually ran.
  if (requestNativeReview(source, true)) return true

  return fireNativeIntent(
    'walletlens://review?fallback=store&source=' + encodeURIComponent(source)
  )
}

/**
 * The rating card's state in words, for the Diagnostics page.
 *
 * Three questions decide whether a card can appear, and until this readout
 * none could be answered from the phone: who installed the app (only a Play
 * install can show one), what Play said the last time it was asked (it never
 * says whether it drew anything, but a very short round trip means it did
 * not), and which of this file's rules is holding the next ask back.
 *
 * Pure: pass reviewDiagnostics(), nativeReviewStatus() and the time.
 * @returns {{ state: 'ok'|'warn'|'fail', detail: string }}
 */
export function describeReviewState(diag, native, now = Date.now()) {
  if (!diag?.twa) return { state: 'warn', detail: 'not the installed Android app · the card only appears there' }

  const parts = []
  let state = 'ok'

  if (native) {
    const inst = native.installer
    if (inst === 'com.android.vending') parts.push('installed from Play')
    else {
      state = 'fail'
      parts.push(inst === 'sideload' ? 'sideloaded · Play never shows the card to a sideloaded app' : `installed by ${inst} · the card needs a Play install`)
    }
    if (native.outcome) {
      const days = native.at ? Math.floor((now - native.at) / DAY_MS) : null
      const when = days == null ? '' : days === 0 ? ' today' : ` ${days}d ago`
      const o = native.outcome
      const said = o.startsWith('shown_') ? 'Play showed the card'
        : o.startsWith('no_card_') ? 'Play answered without a card (quota or already rated)'
        : o === 'request_failed' ? 'Play refused the request'
        : o === 'no_answer_from_play' ? 'Play did not answer'
        : o === 'launch_threw' ? 'the review flow crashed'
        : o
      parts.push(`last ask${when}: ${said}`)
    } else {
      parts.push('never asked Play yet')
    }
  } else {
    parts.push('app build without the review readout')
  }

  const b = diag.blockedBy
  const why = !b ? 'next ask: ready (needs a portfolio and a minute in the app)'
    : b === 'onboarding' ? 'waiting: setup not finished'
    : b === 'friction' ? 'waiting: quiet after an app error'
    : b === 'few-opens' ? `waiting: ${diag.opensLeft} more open${diag.opensLeft === 1 ? '' : 's'}`
    : b === 'too-new' ? `waiting: ${diag.daysLeft} more day${diag.daysLeft === 1 ? '' : 's'} of use`
    : b === 'recent-ask' ? `waiting: asked ${diag.asked ? Math.floor((now - diag.asked) / DAY_MS) : 0}d ago, asks again after ${diag.askCount >= SETTLED_ASKS ? SETTLED_REASK_DAYS : REASK_AFTER_DAYS}d`
    : `waiting: ${b}`
  parts.push(why)
  if (b && state === 'ok') state = 'warn'

  return { state, detail: parts.join(' · ') }
}
