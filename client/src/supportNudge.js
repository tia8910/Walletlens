// Decides when to show the "loved the app?" support card.
//
// The coffee disc in the header is always there and asks for nothing. This is
// the one time the app asks out loud, so the whole job of this file is to make
// sure that one ask lands on somebody who has actually got value out of
// WalletLens, and never lands twice on somebody who said no.
//
// It is deliberately NOT modelled on reviewPrompt.js, which is Android only and
// has to negotiate Play's own quota and the intent bridge. This runs
// everywhere the site runs, the card is ours, and there is no third party
// deciding whether it appears. What it does borrow is the reasoning: several
// opens, on more than one day, by someone with a portfolio, a dwell so it is
// never part of arriving, and silence after the app has just failed at
// something.
//
// Nothing here screens on sentiment. There is no "are you enjoying WalletLens?"
// gate that routes only the happy ones to the payment page, because that is
// the same dark pattern as a review funnel wearing a different hat, and because
// somebody who is annoyed today should simply not be asked at all rather than
// filtered out of a funnel.

const STATE_KEY = 'wl_support_nudge_v1'

// ── Gates ──────────────────────────────────────────────────────────────────
//
//   opens     five launches. Higher than the review prompt's three on purpose:
//             a rating costs a tap, money costs money, and the bar for asking
//             should sit further along.
//   days      and across at least three days, so a single enthusiastic evening
//             is not mistaken for a habit.
//   holdings  a portfolio. Asking someone to fund an app they have not put
//             anything into is asking a stranger.
//   dwell     ninety seconds into the session. The card is never part of
//             opening the app.
const MIN_OPENS = 5
const MIN_DAYS = 3
const MIN_HOLDINGS = 1
const MIN_DWELL_MS = 90 * 1000

// After the app fails at something, stay quiet for two days. Covers the rest
// of this session and the next launch, which is usually the retry.
const FRICTION_QUIET_MS = 48 * 60 * 60 * 1000

// Said no. Ask again in three months, and only twice more after that.
const SNOOZE_DAYS = 90
const MAX_DISMISSALS = 3

const DAY_MS = 24 * 60 * 60 * 1000

// When the app became usable this session, for the dwell check. Module load is
// the wrong clock when App Lock is on: the bundle evaluates behind the lock
// screen, so the dwell would already be spent by the time anyone got in.
let startedAt = Date.now()
let interactive = true

/**
 * Tell the nudge whether the app is in front of the user. Becoming interactive
 * restarts the dwell clock, so the wait is measured from when they got in.
 */
export function setSupportInteractive(value) {
  const next = !!value
  if (next && !interactive) startedAt = Date.now()
  interactive = next
}

/** App failures. Not market losses: a drawdown is not our fault. */
export const FRICTIONS = new Set([
  'exception',
  'import_failed',
  'sync_failed',
  'restore_failed',
])

function empty() {
  return { first: 0, opens: 0, dismissed: 0, dismissCount: 0, supported: 0, friction: 0 }
}

function readState() {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return empty()
    const s = JSON.parse(raw)
    return {
      first: Number(s.first) || 0,
      opens: Number(s.opens) || 0,
      dismissed: Number(s.dismissed) || 0,
      dismissCount: Number(s.dismissCount) || 0,
      supported: Number(s.supported) || 0,
      friction: Number(s.friction) || 0,
    }
  } catch {
    return empty()
  }
}

function writeState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

/**
 * Record that the app was opened. Safe to call on every mount: sessionStorage
 * keeps it to one increment per launch, so moving between pages or a component
 * remount does not inflate the count.
 */
export function noteSupportOpen() {
  try {
    if (sessionStorage.getItem(STATE_KEY)) return
    sessionStorage.setItem(STATE_KEY, '1')
    const s = readState()
    if (!s.first) s.first = Date.now()
    s.opens += 1
    writeState(s)
  } catch {
    // sessionStorage throws in some locked down webviews. Skip the count
    // rather than lose the session.
  }
}

/**
 * The app just failed at something. Suppresses the card for a cooling off
 * period, because asking for money right after wasting someone's time is the
 * single fastest way to make them never give any.
 */
export function noteSupportFriction(kind) {
  try {
    if (!FRICTIONS.has(kind)) return
    const s = readState()
    s.friction = Date.now()
    writeState(s)
  } catch { /* storage blocked */ }
}

/** They went to Buy Me a Coffee. Never ask again, whatever happened there. */
export function noteSupported() {
  try {
    const s = readState()
    s.supported = Date.now()
    writeState(s)
  } catch { /* storage blocked */ }
}

/** They said not now. Snooze, and count it towards the lifetime limit. */
export function noteSupportDismissed() {
  try {
    const s = readState()
    s.dismissed = Date.now()
    s.dismissCount += 1
    writeState(s)
  } catch { /* storage blocked */ }
}

/**
 * The gates that depend only on stored state. Returns '' when none of them
 * block, otherwise the name of the first one that does.
 *
 * Split out from shouldShowSupport so the reason is available to the tests and
 * to a diagnostics readout, rather than collapsing to a bare false.
 */
export function storedGates(s = readState(), now = Date.now()) {
  if (s.supported) return 'supported'
  if (s.dismissCount >= MAX_DISMISSALS) return 'done-asking'
  if (s.dismissed && now - s.dismissed < SNOOZE_DAYS * DAY_MS) return 'snoozed'
  if (s.friction && now - s.friction < FRICTION_QUIET_MS) return 'friction'
  if (s.opens < MIN_OPENS) return 'few-opens'
  if (!s.first || now - s.first < MIN_DAYS * DAY_MS) return 'too-new'
  if (!onboardingFinished()) return 'onboarding'
  return ''
}

/**
 * Whether the first run welcome flow has been finished.
 *
 * Read rather than imported: NativeOnboarding owns these keys, and this file
 * has no business importing a component to ask a question about localStorage.
 * An unreadable store counts as still onboarding, which is the safe answer.
 */
function onboardingFinished() {
  try {
    if (localStorage.getItem('wl_welcome_step_v2')) return false   // mid flow
    return !!localStorage.getItem('wl_welcomed_v2')
  } catch { return false }
}

/**
 * Should the support card be on screen right now?
 *
 * @param {object} snap
 *   `holdingsCount` positions held, `busy` true while a sheet or modal is open.
 * @returns {boolean}
 */
export function shouldShowSupport(snap = {}) {
  try {
    if (!interactive) return false
    if (snap.busy) return false
    if ((Number(snap.holdingsCount) || 0) < MIN_HOLDINGS) return false
    if (Date.now() - startedAt < MIN_DWELL_MS) return false
    return storedGates() === ''
  } catch {
    return false
  }
}

/** For the Settings diagnostics readout. */
export function supportDiagnostics() {
  const s = readState()
  const now = Date.now()
  return {
    ...s,
    blockedBy: storedGates(s, now),
    opensLeft: Math.max(0, MIN_OPENS - s.opens),
    daysLeft: s.first
      ? Math.max(0, MIN_DAYS - Math.floor((now - s.first) / DAY_MS))
      : MIN_DAYS,
  }
}

export const LIMITS = { MIN_OPENS, MIN_DAYS, MIN_HOLDINGS, MIN_DWELL_MS, SNOOZE_DAYS, MAX_DISMISSALS }
