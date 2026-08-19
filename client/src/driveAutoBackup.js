// Keeps the Drive backup current without anyone pressing anything.
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

import { autoBackup, canAutoBackup } from './driveSync'

// Long enough that a burst of edits settles into one upload, short enough that
// closing the app straight after adding a trade still catches it.
const AFTER_CHANGE_MS = 20 * 1000

// The catch-all. Deliberately slow: it exists for changes nothing told us
// about, not as the main path.
const SWEEP_MS = 10 * 60 * 1000

// Let the app finish opening first. A backup competing with the dashboard's
// first paint costs the user something visible to save something invisible.
const AFTER_OPEN_MS = 45 * 1000

let started = false
let changeTimer = null
let sweepTimer = null
let openTimer = null
let running = false

/** One at a time, and never louder than a console warning. */
async function run(why) {
  if (running || !canAutoBackup()) return
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
  }
}

function onPortfolioUpdated() {
  clearTimeout(changeTimer)
  changeTimer = setTimeout(() => run('change'), AFTER_CHANGE_MS)
}

function onVisible() {
  // Coming back to a tab is a cheap moment to check, and it is when a phone
  // that has been asleep for days first gets the chance.
  if (document.visibilityState === 'visible') run('foreground')
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
  document.addEventListener('visibilitychange', onVisible)
  openTimer = setTimeout(() => run('open'), AFTER_OPEN_MS)
  sweepTimer = setInterval(() => run('sweep'), SWEEP_MS)

  return () => {
    started = false
    window.removeEventListener('wl:portfolio-updated', onPortfolioUpdated)
    document.removeEventListener('visibilitychange', onVisible)
    clearTimeout(changeTimer)
    clearTimeout(openTimer)
    clearInterval(sweepTimer)
  }
}
