// A copy of the portfolio kept in the Android app's own storage.
//
// WHY
// The app is a Trusted Web Activity, so it IS Chrome: this page renders in a
// Custom Tab and everything it writes to localStorage lands in Chrome's
// sandbox for the walletlens.live origin. Two things follow, and users
// experience both as the app losing their data:
//
//   • Chrome's "Clear browsing data" deletes the whole portfolio. Nothing
//     warns that a browser setting empties an app that does not look like one.
//   • Android's own Settings → Apps → WalletLens → Clear storage does the
//     reverse — it wipes the app and leaves the portfolio alone, because the
//     portfolio was never in the app.
//
// And Android's app backup only ever sees the app's own directory, so it has
// never included any of this.
//
// So we mirror. DataVaultActivity writes the copy into the app's files
// directory, where Clear storage and app backup both reach it and where
// clearing Chrome cannot.
//
// WHAT IT IS NOT
// A move. Making the app the primary store means rendering in a WebView
// instead of a TWA, and that costs Web Push (a WebView has no service worker
// push), Google Drive sign-in (Google refuses OAuth in WebViews) and every
// existing user's data — a WebView cannot read what Chrome has stored. This is
// a second copy that costs none of that.

import { isAndroidTWA, fireNativeIntent } from './nativeBridge'
import { generateBackupCode, applyBackupCode } from './backupCore'

const LAST_SAVE_KEY = 'wl_vault_last_save'

/** Fragment key DataVaultActivity hands the payload back on. */
const FRAGMENT_KEY = 'wlvault'

/** What the native side sends when it had nothing stored. */
const EMPTY_MARKER = 'empty'

/**
 * Mirror the portfolio into the app.
 *
 * Fire-and-forget by necessity: the intent goes out through a hidden iframe so
 * the TWA session survives (see fireNativeIntent), and an iframe cannot report
 * back. That suits a mirror — the next save overwrites whatever the last one
 * managed, and the copy is only ever read when everything else is already
 * gone.
 *
 * Chrome requires a user activation for an external protocol launch, so this
 * has to be called from inside a real gesture. Every caller is one: adding,
 * editing or deleting a holding is a tap. There is also a deliberate button in
 * Settings for anyone who wants to force it.
 *
 * @returns {Promise<{ok: boolean, reason?: string, bytes?: number}>}
 */
export async function saveVault() {
  if (!isAndroidTWA()) return { ok: false, reason: 'not-in-app' }

  let code
  try {
    ({ code } = await generateBackupCode())
  } catch {
    return { ok: false, reason: 'encode-failed' }
  }
  if (!code) return { ok: false, reason: 'encode-failed' }

  // The native side refuses anything larger, because handing it back means
  // putting it on a URL inside an Intent and that crosses a Binder
  // transaction with a hard ceiling. Checked here too so the reason can be
  // shown rather than the save just vanishing.
  if (code.length > 512 * 1024) return { ok: false, reason: 'too-large', bytes: code.length }

  const fired = fireNativeIntent(
    `walletlens://vault-save?data=${encodeURIComponent(code)}`,
    { keepSession: true },
  )
  if (!fired) return { ok: false, reason: 'no-activation', bytes: code.length }

  try { localStorage.setItem(LAST_SAVE_KEY, String(Date.now())) } catch { /* private mode */ }
  return { ok: true, bytes: code.length }
}

/** When the mirror was last sent, or null. Display only. */
export function lastVaultSave() {
  try {
    const raw = Number(localStorage.getItem(LAST_SAVE_KEY))
    return Number.isFinite(raw) && raw > 0 ? raw : null
  } catch { return null }
}

/**
 * Ask the app to hand its copy back.
 *
 * Top-frame navigation rather than an iframe, and that is not a slip: the
 * native side answers by RELAUNCHING the app with the payload attached, so
 * there is no session to preserve — it is about to be replaced either way.
 */
export function requestVaultRestore() {
  if (!isAndroidTWA()) return false
  return fireNativeIntent('walletlens://vault-restore')
}

/**
 * The payload the app relaunched us with, if any.
 *
 * Read from the URL FRAGMENT, which is where DataVaultActivity puts it because
 * fragments are never sent to the server. A portfolio must not appear in a
 * request log, least of all this app's.
 *
 * @returns {string|null} the backup code, the empty marker, or null
 */
export function pendingVaultPayload() {
  try {
    const hash = (typeof location !== 'undefined' && location.hash) || ''
    if (!hash.startsWith('#')) return null
    const params = new URLSearchParams(hash.slice(1))
    const value = params.get(FRAGMENT_KEY)
    return value || null
  } catch { return null }
}

/** Take the payload off the URL without adding a history entry. */
function stripFragment() {
  try {
    if (typeof history === 'undefined' || !history.replaceState) return
    history.replaceState(null, '', location.pathname + location.search)
  } catch { /* nothing worth failing a restore over */ }
}

/**
 * Restore from the payload the app handed back, and clear it off the URL.
 *
 * The fragment is stripped whatever the outcome. Leaving it there would mean a
 * refresh replaying the restore over data the user has since changed, and a
 * failed payload retrying forever.
 *
 * @returns {Promise<{status: string, restored?: number, when?: Date}>}
 */
export async function consumeVaultPayload() {
  const payload = pendingVaultPayload()
  if (!payload) return { status: 'none' }

  stripFragment()

  if (payload === EMPTY_MARKER) return { status: 'empty' }

  try {
    const { restored, when } = await applyBackupCode(decodeURIComponent(payload))
    return { status: 'restored', restored, when }
  } catch {
    return { status: 'corrupt' }
  }
}

/**
 * Whether this device looks like it has lost its portfolio.
 *
 * Deliberately narrow: no transactions AND no wallets. Anything looser would
 * offer to overwrite a portfolio someone is halfway through building, and an
 * offer to restore is the one prompt that must never appear to a user who has
 * lost nothing.
 */
export function looksEmpty() {
  try {
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]')
    const ws = JSON.parse(localStorage.getItem('crypto_tracker_wallets') || '[]')
    return (!Array.isArray(txs) || txs.length === 0) && (!Array.isArray(ws) || ws.length === 0)
  } catch {
    // An unreadable store is not evidence of an empty one, and guessing wrong
    // here means offering to overwrite data that is merely unreadable right
    // now. Say no.
    return false
  }
}

// ── Mirroring on change ─────────────────────────────────────────────────────

let pending = null

/**
 * Take a copy after a change, coalescing a burst into one.
 *
 * The delay is short on purpose, and 800ms is not a round number picked for
 * feel. Chrome only permits an external protocol launch while a user
 * activation is live, and that window is a few seconds wide from the last
 * interaction — so a mirror that waited the several seconds a debounce would
 * normally use would find the activation expired and be dropped silently.
 * Long enough to coalesce an import writing a hundred rows, short enough to
 * still be inside the gesture that caused it.
 */
export function scheduleVaultSave() {
  if (!isAndroidTWA()) return
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    saveVault().catch(() => { /* a mirror that fails is not worth an error */ })
  }, 800)
}

/** Test seam — drops a pending mirror without firing it. */
export function cancelScheduledVaultSave() {
  if (pending) clearTimeout(pending)
  pending = null
}
