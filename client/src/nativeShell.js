// Running inside the app's own WebView, rather than inside Chrome.
//
// WHAT CHANGED
// The Android app used to be a Trusted Web Activity, which means it WAS
// Chrome: the page rendered in a Custom Tab and everything it stored went into
// Chrome's sandbox. The shell renders the same page in a WebView the app owns,
// so storage lands in the app's own directory — where Android's backup covers
// it, where the app's Clear storage clears it, and where clearing Chrome
// cannot touch it.
//
// WHAT THAT BUYS HERE
// A real bridge. Under the TWA the only way to reach native code was to
// navigate to a walletlens:// URL and have an exported Activity catch it: no
// return value, no call except during a user gesture, and a top-frame
// navigation that ended the session if you got it wrong. Inside the shell a
// call is a call. `window.AndroidBridge` either exists or it does not, which
// also replaces isAndroidTWA()'s user-agent sniffing — the guess that once
// silently disabled App Lock, the widgets, the biometric onboarding slide and
// the rating card all at once, because every one of them is supposed to be
// absent off Android and so nothing errored.

import { applyBackupCode } from './backupCore'

const SEEDED_KEY = 'wl_shell_seeded'

/** The bridge object, or null when we are not in the shell. */
function bridge() {
  try {
    const b = typeof window !== 'undefined' ? window.AndroidBridge : null
    return b && typeof b.shellVersion === 'function' ? b : null
  } catch { return null }
}

/**
 * Whether this page is running inside the app's own WebView.
 *
 * A capability check, not a sniff. The bridge is injected by the shell and by
 * nothing else, so this cannot be wrong the way a user-agent test can.
 */
export function inAppShell() {
  return bridge() !== null
}

/** Which generation of shell, or null. */
export function shellVersion() {
  const b = bridge()
  if (!b) return null
  try { return b.shellVersion() } catch { return null }
}

// ── The migration off Chrome ────────────────────────────────────────────────

/**
 * Bring the portfolio across from the app's vault, once.
 *
 * THE PROBLEM THIS SOLVES: a WebView cannot read what Chrome stored for the
 * same origin. Different process, different sandbox. So the first launch after
 * the app switches from a TWA to a shell would find localStorage completely
 * empty, and every existing user would open the app to a portfolio they had
 * spent months building and find nothing in it.
 *
 * What survives the switch is the vault — the app's own copy, in the app's own
 * files directory, which the TWA build has been writing since 6.1. The shell
 * can read that file, so the first run asks for it and restores from it.
 *
 * Guarded three ways, because a restore that runs when it should not is worse
 * than one that never runs:
 *
 *   - once ever per install, recorded before the attempt rather than after, so
 *     a restore that throws half way cannot loop;
 *   - only when this device has no holdings, so it can never overwrite a
 *     portfolio someone has already started;
 *   - only in the shell, where the bridge exists at all.
 *
 * @returns {Promise<{status: string, restored?: number}>}
 */
export async function seedFromVault() {
  const b = bridge()
  if (!b) return { status: 'not-in-shell' }

  try {
    if (localStorage.getItem(SEEDED_KEY)) return { status: 'already-seeded' }
  } catch {
    // No storage at all is not a device to start writing a portfolio into.
    return { status: 'no-storage' }
  }

  if (!hasNothing()) {
    // There is already data here. Mark it done so this never runs again on a
    // device that has moved on, and leave it alone.
    mark()
    return { status: 'not-empty' }
  }

  let payload = ''
  try { payload = b.readVault() || '' } catch { return { status: 'bridge-failed' } }

  // Marked BEFORE applying. If applyBackupCode throws on a corrupt vault, the
  // alternative is retrying it on every launch for ever, and a corrupt vault
  // does not become less corrupt on the fifth attempt.
  mark()

  if (!payload) return { status: 'empty-vault' }

  try {
    const { restored } = await applyBackupCode(payload)
    return { status: 'restored', restored }
  } catch {
    return { status: 'corrupt' }
  }
}

function mark() {
  try { localStorage.setItem(SEEDED_KEY, String(Date.now())) } catch { /* nothing to do */ }
}

/** No transactions and no wallets — see nativeVault.looksEmpty for the reasoning. */
function hasNothing() {
  try {
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]')
    const ws = JSON.parse(localStorage.getItem('crypto_tracker_wallets') || '[]')
    return (!Array.isArray(txs) || txs.length === 0) && (!Array.isArray(ws) || ws.length === 0)
  } catch {
    // Unreadable is not empty. Seeding over a store that merely failed to
    // parse this once would destroy the very data it is meant to protect.
    return false
  }
}

// ── Storage, through the bridge ─────────────────────────────────────────────

/**
 * Write the vault directly, with an answer.
 *
 * The intent version could not report anything — it went out through a hidden
 * iframe and Android swallowed the result — so "copied" on screen meant "we
 * asked", not "it worked". And it needed a user gesture, so the mirror could
 * only run while someone was touching the screen. Neither limit applies here.
 */
export function writeVault(payload) {
  const b = bridge()
  if (!b) return false
  try { return !!b.writeVault(payload) } catch { return false }
}

/** The stored copy, or null. */
export function readVault() {
  const b = bridge()
  if (!b) return null
  try { return b.readVault() || null } catch { return null }
}

// ── App lock ────────────────────────────────────────────────────────────────

export function appLockEnabled() {
  const b = bridge()
  if (!b) return false
  try { return !!b.appLockEnabled() } catch { return false }
}

export function setAppLock(on) {
  const b = bridge()
  if (!b) return false
  try { b.setAppLock(!!on); return true } catch { return false }
}
