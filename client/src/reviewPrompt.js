// Decides when to show Google Play's in-app review card.
//
// The card itself is native (Play In-App Review API, see ReviewActivity.java),
// but everything that makes the timing sensible — how long someone has been
// using WalletLens, how many sessions, whether they actually have a portfolio
// — lives in this page's localStorage. So the decision is made here and the
// card is requested over the walletlens://review bridge.
//
// Play's own guidance shapes the rules below: ask only after the user has had
// enough of the app to have an opinion, never in the middle of a task, and
// never twice in quick succession. Play additionally enforces its own quota
// and will silently show nothing if we ask too often — that is a backstop, not
// a substitute for asking at a reasonable moment.
//
// No-op outside the installed Android app.

import { isAndroidTWA, fireNativeIntent } from './nativeBridge'

const STATE_KEY = 'wl_review_state_v1'
const SESSION_FLAG = 'wl_review_session_counted'

// "A certain period of usage" — all of these have to be true.
const MIN_OPENS = 5              // separate app launches
const MIN_DAYS = 3               // days since the very first launch
const MIN_HOLDINGS = 3           // a portfolio worth having an opinion about
const MIN_DWELL_MS = 45 * 1000   // don't interrupt the first seconds of a session

// If they dismiss the card, Play won't show it again for a while anyway. These
// stop us from firing the intent pointlessly, and cap the lifetime ask count.
const REASK_AFTER_DAYS = 120
const MAX_ASKS = 2

const DAY_MS = 24 * 60 * 60 * 1000

// When this page instance started, for the dwell check.
const startedAt = Date.now()

function readState() {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return { first: 0, opens: 0, asked: 0, askCount: 0 }
    const s = JSON.parse(raw)
    return {
      first: Number(s.first) || 0,
      opens: Number(s.opens) || 0,
      asked: Number(s.asked) || 0,
      askCount: Number(s.askCount) || 0,
    }
  } catch {
    return { first: 0, opens: 0, asked: 0, askCount: 0 }
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
 * Ask Play to show the review card, if now is a good moment.
 *
 * @param {object} o
 * @param {number} [o.holdingsCount]  positions currently held
 * @param {number} [o.totalValue]     net worth, used only as a "has data" signal
 * @returns {boolean} whether the card was requested
 */
export function maybeAskForReview({ holdingsCount = 0, totalValue = 0 } = {}) {
  try {
    if (!isAndroidTWA()) return false

    // Still settling into the session — a dialog now reads as an ambush.
    if (Date.now() - startedAt < MIN_DWELL_MS) return false

    // Nothing to have an opinion about yet.
    if (holdingsCount < MIN_HOLDINGS || totalValue <= 0) return false

    const s = readState()
    if (s.askCount >= MAX_ASKS) return false
    if (s.opens < MIN_OPENS) return false
    if (!s.first || Date.now() - s.first < MIN_DAYS * DAY_MS) return false
    if (s.asked && Date.now() - s.asked < REASK_AFTER_DAYS * DAY_MS) return false

    // Record the ask before firing. If the intent is dropped — an older build
    // of the shell with no ReviewActivity, say — the alternative is retrying on
    // every render, which is far worse than losing one ask.
    s.asked = Date.now()
    s.askCount += 1
    writeState(s)

    return fireNativeIntent('walletlens://review?source=dashboard')
  } catch {
    return false
  }
}

/**
 * Open the review card because the user asked for it (a "Rate WalletLens"
 * tap), rather than because the usage rules fired. This one falls back to the
 * store listing if Play declines to show the card, since the user is expecting
 * something to happen.
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
