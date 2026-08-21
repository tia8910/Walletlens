// Decides what to do with a Drive backup once someone signs in.
//
// The dangerous move here is restoring over a device that already has data, so
// the decision is a pure function with its own tests rather than something
// improvised inside a click handler. Auto-restore fires in exactly one case:
// the device has no portfolio at all. Anything else asks first.

import { generateBackupCode, applyBackupCode } from './backupCore'
import {
  decryptBackup, isEncryptedBackup, newDataKey, dataKeyToString, dataKeyFromString,
  encryptBackupEnvelope, encryptBackupWithWrap, wrapBlockOf,
  decryptBackupWithKey, unwrapDataKey,
} from './backupEncryption'
import { findBackup, uploadBackup, downloadBackup, getAccessToken, storedAccessToken, isDriveConfigured } from './googleDrive'

const LAST_BACKUP_AT = 'wl_drive_backup_at'
const FILE_ID = 'wl_drive_file_id'
// When the backup in Drive was last written, by any device. Distinct from
// LAST_BACKUP_AT, which only records uploads from this one — on a second
// device that is zero forever, so using it to describe the backup told people
// there wasn't one while the Restore button sat right next to the sentence.
const REMOTE_AT = 'wl_drive_remote_at'
// The data key that lets this device back up without asking for a passphrase.
// See backupEncryption.js for why keeping it here does not weaken anything:
// the ciphertext is in Drive, and the plaintext portfolio is already in
// localStorage next to this.
const DATA_KEY = 'wl_drive_data_key'
// Fingerprint of the snapshot we last uploaded, so an automatic run can tell
// "nothing changed" from "not backed up yet" without downloading the file.
const LAST_HASH = 'wl_drive_last_hash'
// The passphrase-wrapped copy of the data key, carried unchanged into every
// automatic upload so the backup stays recoverable by passphrase elsewhere.
const WRAP = 'wl_drive_wrap'

function readKey(k) { try { return localStorage.getItem(k) } catch { return null } }
function writeKey(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

/** The stored data key as raw bytes, or null if this device has none yet. */
export function storedDataKey() {
  const s = readKey(DATA_KEY)
  if (!s) return null
  try {
    const raw = dataKeyFromString(s)
    return raw.length === 32 ? raw : null
  } catch { return null }
}

/**
 * Can this device back up on its own?
 *
 * Needs the data key — without it there is nothing to encrypt with and the
 * only way forward is asking for the passphrase, which an automatic run must
 * never do.
 */
export function canAutoBackup() {
  return Boolean(
    isDriveConfigured() && storedDataKey() && readKey(WRAP) && previouslyConnected())
}

/** Cheap content fingerprint, only ever compared against itself. */
async function fingerprint(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf).slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Does this device hold a portfolio worth protecting? */
export function hasLocalPortfolio() {
  try {
    const raw = localStorage.getItem('crypto_tracker_transactions')
    if (!raw) return false
    const txs = JSON.parse(raw)
    return Array.isArray(txs) && txs.length > 0
  } catch {
    // Unreadable local data is not the same as no local data. Treat it as
    // present so we never silently overwrite something we merely failed to
    // parse.
    return true
  }
}

/**
 * What should happen after sign-in.
 *
 * Pure so the rule is testable: the difference between "restore silently" and
 * "overwrite someone's portfolio without asking" is one boolean, and it is not
 * a decision to make inline.
 *
 * @returns {'auto-restore'|'ask'|'first-backup'|'up-to-date'}
 */
export function decideAction({ hasLocal, remote, lastBackupAt = 0 }) {
  if (!remote) return 'first-backup'
  // Fresh install, backup waiting: this is the case the whole feature exists
  // for. Nothing local can be lost, so bring the profile down.
  if (!hasLocal) return 'auto-restore'
  const remoteTime = remote.modifiedTime ? Date.parse(remote.modifiedTime) : 0
  // This device wrote the newest copy, so there is nothing to bring back.
  if (lastBackupAt && remoteTime && remoteTime <= lastBackupAt) return 'up-to-date'
  // Both sides have data and we cannot tell which the user wants. Ask.
  return 'ask'
}

/**
 * Has this device connected to Drive before?
 *
 * Distinct from "is there a valid access token right now". A token lasts about
 * an hour and this question is about whether the user ever answered Connect,
 * which they did once and for good. The file id and last-backup time persist
 * and are the honest record of that. Treating a missing token as "never
 * connected" collapsed the panel on every refresh and asked again.
 */
export function previouslyConnected(state = driveState()) {
  return Boolean(state.fileId || state.lastBackupAt || state.remoteAt)
}

/** Is there a backup in Drive we already know about, without asking again? */
export function knownBackup(state = driveState()) {
  return state.fileId ? { id: state.fileId, at: latestBackupAt(state) } : null
}

export function driveState() {
  const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
  return {
    configured: isDriveConfigured(),
    lastBackupAt: Number(read(LAST_BACKUP_AT) || 0),
    remoteAt: Number(read(REMOTE_AT) || 0),
    fileId: read(FILE_ID),
  }
}

/**
 * When the backup in Drive was written — the one number the UI should show.
 *
 * remoteAt is what Drive reported and is therefore the truth about the file.
 * lastBackupAt is only a fallback for devices that uploaded before remoteAt
 * existed. It cannot be preferred: restoreNow() also stamps it, so on a device
 * that just restored a week-old backup it would read "backup just now".
 */
export function latestBackupAt(state = driveState()) {
  return state.remoteAt || state.lastBackupAt || 0
}

/** Remember what Drive told us about the backup, so a reload still knows. */
function rememberRemote(remote) {
  if (!remote?.id) return
  try {
    localStorage.setItem(FILE_ID, remote.id)
    const at = remote.modifiedTime ? Date.parse(remote.modifiedTime) : 0
    if (at) localStorage.setItem(REMOTE_AT, String(at))
  } catch { /* private mode */ }
}

/**
 * Sign in and report what we found, without changing anything yet.
 * The caller decides whether to act on it.
 */
export async function connect() {
  await getAccessToken({ interactive: true })
  const remote = await findBackup()
  rememberRemote(remote)
  const action = decideAction({
    hasLocal: hasLocalPortfolio(),
    remote,
    lastBackupAt: driveState().lastBackupAt,
  })
  return { remote, action }
}

/**
 * Encrypt the current profile and push it to Drive.
 *
 * Writes the envelope format and keeps the data key, which is what turns
 * automatic backups on for this device from here onwards. Reuses the existing
 * key when there is one, so every device that has restored from this backup
 * stays able to read it.
 */
export async function backupNow(passphrase) {
  if (!passphrase) throw new Error('A passphrase is required')
  const { code, txCount } = await generateBackupCode()
  const key = storedDataKey() || newDataKey()
  const payload = await encryptBackupEnvelope(code, key, passphrase)
  const existing = driveState().fileId || (await findBackup())?.id || null
  const id = await uploadBackup(payload, existing)

  // Only after the upload succeeded. Storing the key for a backup that never
  // landed would leave the device claiming it can auto-back-up to a file that
  // does not exist.
  writeKey(DATA_KEY, dataKeyToString(key))
  writeKey(WRAP, wrapBlockOf(payload) || '')
  writeKey(LAST_HASH, await fingerprint(code))
  writeKey(FILE_ID, id)
  writeKey(LAST_BACKUP_AT, String(Date.now()))
  writeKey(REMOTE_AT, String(Date.now()))
  return { txCount, fileId: id }
}

/**
 * Back up without asking the user anything.
 *
 * Returns a reason rather than throwing, because every caller is a timer and
 * none of them has a user to show an error to.
 *
 * @returns {Promise<{ok: boolean, reason: string}>}
 *   reason: 'no-key' | 'unchanged' | 'signed-out' | 'failed' | 'backed-up'
 */
export async function autoBackup() {
  if (!canAutoBackup()) return { ok: false, reason: 'no-key' }
  const key = storedDataKey()

  let code
  try {
    ({ code } = await generateBackupCode())
  } catch {
    return { ok: false, reason: 'failed' }
  }

  // Nothing new to say. Skipping here is what keeps this from rewriting the
  // same file every few minutes for someone who is only reading their
  // dashboard.
  const hash = await fingerprint(code)
  if (hash === readKey(LAST_HASH)) return { ok: false, reason: 'unchanged' }

  // A token we already hold, or nothing. This never contacts Google.
  //
  // It used to call getAccessToken({interactive:false}), on the understanding
  // that prompt:'none' is silent. In the Android app it is not — GIS has no
  // opener to answer, so it surfaces a visible accounts.google.com tab that
  // spins forever. Closing that tab fired visibilitychange, which started
  // another backup, which opened it again: a loop about once a minute that
  // never backed anything up and made the app unusable.
  //
  // An automatic backup is not allowed to ask for anything. If there is no
  // usable token it gives up until the user next does something that
  // legitimately involves Google — Connect, Back up now, Restore.
  if (!storedAccessToken()) return { ok: false, reason: 'signed-out' }

  try {
    const payload = await encryptBackupWithWrap(code, key, readKey(WRAP))
    const existing = driveState().fileId || (await findBackup())?.id || null
    const id = await uploadBackup(payload, existing)
    writeKey(LAST_HASH, hash)
    writeKey(FILE_ID, id)
    writeKey(LAST_BACKUP_AT, String(Date.now()))
    writeKey(REMOTE_AT, String(Date.now()))
    return { ok: true, reason: 'backed-up' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Pull the backup down and apply it. Replaces local data — callers must have
 * confirmed that with the user unless decideAction said 'auto-restore'.
 */
export async function restoreNow(passphrase) {
  const remote = (driveState().fileId && { id: driveState().fileId }) || await findBackup()
  if (!remote) throw new Error('No backup found in your Drive')
  const payload = await downloadBackup(remote.id)
  if (!isEncryptedBackup(payload)) {
    // An unencrypted blob under our filename is not something we wrote.
    throw new Error('That backup file is not in the expected format')
  }
  // Prefer this device's own key when it has one: same-device restores then
  // need no passphrase at all. Fall back to the passphrase, which is the only
  // thing a new device has.
  const key = storedDataKey()
  let code
  if (key && !passphrase) {
    code = await decryptBackupWithKey(payload, key)
  } else {
    code = await decryptBackup(payload, passphrase)
    // Restoring on a new device teaches it the data key, so automatic backups
    // continue from here rather than stopping until the next manual one.
    try {
      const raw = await unwrapDataKey(payload, passphrase)
      writeKey(DATA_KEY, dataKeyToString(raw))
      writeKey(WRAP, wrapBlockOf(payload) || '')
    } catch { /* a WLE1 backup has no wrapped key; nothing to learn */ }
  }
  const result = await applyBackupCode(code)
  try { localStorage.setItem(LAST_BACKUP_AT, String(Date.now())) } catch { /* ignore */ }
  return result
}

// Auto-backup, and why it works now when it could not before.
//
// The previous note here said an unattended upload needs the passphrase, that
// the passphrase is never stored, and that storing it "puts the key beside the
// ciphertext". The first two are still true. The third was wrong, and it is
// what kept this feature impossible for no reason: the ciphertext is in Drive,
// not on the device. What sits beside a stored key locally is the plaintext
// portfolio, which anyone able to read the key could read directly instead.
//
// So the passphrase is still never stored. A random data key is, and the
// passphrase-wrapped copy of that key rides along inside every file, which is
// what keeps a backup openable on a device that has never seen this one.
//
// What that buys, precisely:
//   • Automatic uploads need no passphrase and no user gesture.
//   • Google still cannot read the file.
//   • A new device still restores with the passphrase alone.
//   • Losing this device loses nothing the passphrase cannot recover.
