// Keeps this device and the Drive backup in step, in both directions, without
// anyone pressing anything.
//
// UP is autoBackup(): this device changed, so write it. DOWN is autoRestore():
// another device wrote something newer and this one has nothing of its own to
// lose, so read it. Together they are what makes a trade added on a phone show
// up on a laptop.
//
// The work is all in driveSync.autoBackup(); this file only decides when to
// call it. That split matters because the interesting rules — is there a data
// key, has anything actually changed, is the token still good — belong with
// the sync logic and have tests. Scheduling is just plumbing.
//
// Three triggers, for three different ways a backup goes stale:
//
//   a change event   someone added a trade; back it up shortly after they
//                    stop editing rather than on every keystroke
//   a slow interval  catches edits made through paths that do not announce
//                    themselves, which is most of them — only TradeSheet and
//                    one dashboard action dispatch wl:portfolio-updated
//   app open         the session that matters most is the one after a device
//                    has been off for a week
//
// All three funnel through the same fingerprint check inside autoBackup(), so
// firing more often than necessary costs a hash, not an upload.

import { autoBackup, autoRestore, canAutoBackup } from './driveSync'

// Long enough that a burst of edits settles into one upload, short enough to
// fit inside the end-to-end budget below.
const AFTER_CHANGE_MS = 1500

// The catch-all. Deliberately slow: it exists for changes nothing told us
// about, not as the main path.
const SWEEP_MS = 10 * 60 * 1000

// Let the app finish opening first. A backup competing with the dashboard's
// first paint costs the user something visible to save something invisible.
const AFTER_OPEN_MS = 45 * 1000

// But look for another device's changes almost at once: it is one metadata
// call, and opening the app to a portfolio missing the trade made on the
// other device is the thing this exists to prevent.
const PULL_AFTER_OPEN_MS = 3 * 1000

// How often to ask Drive whether another device has written something newer.
//
// THE BUDGET IS ONE MINUTE, END TO END. A trade uploads 5s after it is made
// and the other device notices within 30s, so the worst case a user can hit is
// about 35 seconds, and the typical case is half that.
//
// Affordable because of what a poll actually costs: one Drive metadata call,
// and most of them stop at comparing two timestamps without hashing the
// portfolio or downloading anything.
//
// Only while the tab is visible, though. A backgrounded phone polling every
// 30 seconds all night would spend battery to learn something it will be told
// the instant it comes back to the foreground anyway.
const PULL_MS = 15 * 1000

let started = false
let changeTimer = null
let sweepTimer = null
let openTimer = null
let pullOpenTimer = null
let pullTimer = null
let running = false
// A change that lands while an upload is in flight is not dropped; it runs
// again as soon as that upload is done.
let again = false
let pulling = false

/** One at a time, and never louder than a console warning. */
async function run(why) {
  if (!canAutoBackup()) return
  if (running) { again = true; return }
  running = true
  try {
    const res = await autoBackup()
    if (res.ok) console.debug('[drive] auto-backup after', why)
  } catch (e) {
    // autoBackup is written not to throw. If it does anyway, an automatic
    // background task is the last thing that should surface an error to
    // someone who did not ask for it.
    console.warn('[drive] auto-backup failed:', e?.message || e)
  } finally {
    running = false
    if (again) { again = false; setTimeout(() => run('queued'), 0) }
  }
}

/**
 * Bring down another device's changes, if there are any and it is safe.
 *
 * Kept on its own latch rather than sharing `running` with the backup: a slow
 * upload should not swallow the poll that would have noticed the phone's new
 * trade, and the two never touch the portfolio at the same moment because
 * autoRestore only acts when this device has nothing of its own to lose.
 */
async function pull(why) {
  if (pulling || !canAutoBackup()) return
  // A hidden tab has nothing to show and gets a foreground check the moment it
  // comes back. Polling it is battery spent for no one.
  if (why === 'poll' && typeof document !== 'undefined' && document.hidden) return
  pulling = true
  try {
    const res = await autoRestore()
    if (res.ok) console.debug('[drive] pulled a newer backup after', why)
  } catch (e) {
    console.warn('[drive] auto-restore failed:', e?.message || e)
  } finally {
    pulling = false
  }
}

function onPortfolioUpdated() {
  clearTimeout(changeTimer)
  changeTimer = setTimeout(() => run('change'), AFTER_CHANGE_MS)
}

function onOnline() { run('online'); pull('online') }
let lastFocusPull = 0
function onFocus() {
  // focus and visibilitychange often fire together; one check is enough.
  if (Date.now() - lastFocusPull < 5000) return
  lastFocusPull = Date.now()
  pull('focus')
}

function onVisible() {
  // Coming back to a tab is a cheap moment to check, and it is when a phone
  // that has been asleep for days first gets the chance.
  if (document.visibilityState !== 'visible') return
  run('foreground')
  // The moment that makes this feel like sync: you put the phone down, pick
  // up the laptop, and the trade is already there. Checked before the
  // interval gets a chance.
  pull('foreground')
}

/**
 * Begin watching. Idempotent — calling twice does not double up the timers.
 *
 * @returns {() => void} teardown, for tests and for a caller that unmounts
 */
export function startAutoBackup() {
  if (started || typeof window === 'undefined') return () => {}
  started = true

  window.addEventListener('wl:portfolio-updated', onPortfolioUpdated)
  // Every save of the portfolio, from any screen (data/storage.js).
  window.addEventListener('wl:data-saved', onPortfolioUpdated)
  document.addEventListener('visibilitychange', onVisible)
  // Back online, or back to the window: check both ways at once.
  window.addEventListener('online', onOnline)
  window.addEventListener('focus', onFocus)
  openTimer = setTimeout(() => run('open'), AFTER_OPEN_MS)
  pullOpenTimer = setTimeout(() => pull('open'), PULL_AFTER_OPEN_MS)
  sweepTimer = setInterval(() => run('sweep'), SWEEP_MS)
  pullTimer = setInterval(() => pull('poll'), PULL_MS)

  return () => {
    started = false
    window.removeEventListener('wl:portfolio-updated', onPortfolioUpdated)
    window.removeEventListener('wl:data-saved', onPortfolioUpdated)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('focus', onFocus)
    clearTimeout(changeTimer)
    clearTimeout(openTimer)
    clearTimeout(pullOpenTimer)
    clearInterval(sweepTimer)
    clearInterval(pullTimer)
  }
}
