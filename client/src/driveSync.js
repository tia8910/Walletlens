// Decides what to do with a Drive backup once someone signs in.
//
// The dangerous move here is restoring over a device that already has data, so
// the decision is a pure function with its own tests rather than something
// improvised inside a click handler. Auto-restore fires in exactly one case:
// the device has no portfolio at all. Anything else asks first.

import { generateBackupCode, snapshotSignature, applyBackupCode, mergeBackupCode } from './backupCore'
import {
  decryptBackup, isEncryptedBackup, newDataKey, dataKeyToString, dataKeyFromString,
  encryptBackupEnvelope, encryptBackupWithWrap, wrapBlockOf,
  decryptBackupWithKey, unwrapDataKey,
} from './backupEncryption'
import {
  findBackup, uploadBackup, downloadBackup,
  getAccessToken, storedAccessToken, signOut, isDriveConfigured,
} from './googleDrive'

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

/** Drop only what lets this device back up unattended; stay connected. */
export function forgetAutoBackup() {
  for (const k of [DATA_KEY, WRAP]) {
    try { localStorage.removeItem(k) } catch { /* private mode */ }
  }
}

/**
 * Forget Drive entirely on this device.
 *
 * Revokes the token and clears every local trace, so the panel returns to Not
 * connected. Deliberately does NOT delete the file in Drive: it is the user's
 * own file in their own account, it is the thing protecting their portfolio,
 * and an app removing it because someone tapped Disconnect would be the worst
 * possible reading of that word. They can delete it themselves, and Restore
 * still finds it if they reconnect.
 */
export function disconnectDrive() {
  signOut()
  for (const k of [DATA_KEY, WRAP, FILE_ID, LAST_HASH, LAST_BACKUP_AT, REMOTE_AT, SYNC_VER, NEEDS_PASS]) {
    try { localStorage.removeItem(k) } catch { /* private mode */ }
  }
}

/** Is this device set up to back up on its own? */
export function autoBackupEnabled() {
  return Boolean(storedDataKey() && readKey(WRAP))
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

// The version of the Drive file this device last wrote or applied, exactly as
// Drive stamped it (modifiedTime). "Is Drive ahead of me?" used to compare
// Drive's clock with this device's own Date.now(). A phone whose clock ran a
// few minutes fast then read the other device's newer upload as older and
// never pulled it: the trade made on the laptop simply never arrived. Both
// sides of the comparison are now Google's clock.
const SYNC_VER = 'wl_drive_ver'
// Set when the file in Drive was written with a data key this device does not
// hold (another device made its own first backup). Until the passphrase is
// entered again this device can neither read nor safely overwrite that file.
const NEEDS_PASS = 'wl_drive_needs_pass'

/** The Drive file was encrypted with a key this device does not hold. */
export const KEY_MISMATCH = 'KEY_MISMATCH'
/** The passphrase typed does not open the backup already in Drive. */
export const PASS_MISMATCH = 'PASS_MISMATCH'

/** Is syncing on hold until the passphrase is entered again? */
export function syncPaused() { return readKey(NEEDS_PASS) === '1' }
function pauseSync() { writeKey(NEEDS_PASS, '1') }
function resumeSync() { try { localStorage.removeItem(NEEDS_PASS) } catch { /* private mode */ } }

/** When the copy this device is in step with was written, by Drive's clock. */
function syncedAt() {
  const v = Date.parse(readKey(SYNC_VER) || '')
  // Devices from before SYNC_VER existed fall back to their own clock until
  // their next write or restore stamps the real version.
  return Number.isFinite(v) ? v : (Number(readKey(LAST_BACKUP_AT)) || 0)
}

/** Has another device written something newer than what this one has? */
function remoteAhead(remote) {
  const at = Date.parse(remote?.modifiedTime || '')
  return Boolean(remote) && Number.isFinite(at) && at > syncedAt()
}

/** Record that this device now holds exactly the copy Drive has. */
function stampSynced({ id, modifiedTime } = {}) {
  if (id) writeKey(FILE_ID, id)
  if (modifiedTime) writeKey(SYNC_VER, modifiedTime)
  else { try { localStorage.removeItem(SYNC_VER) } catch { /* private mode */ } }
  writeKey(LAST_BACKUP_AT, String(Date.now()))
  writeKey(REMOTE_AT, String(Date.parse(modifiedTime || '') || Date.now()))
}

/** uploadBackup returns { id, modifiedTime }; older callers and mocks a bare id. */
const asUpload = (r) => (typeof r === 'string' ? { id: r, modifiedTime: null } : (r || {}))

const announce = () => { try { window.dispatchEvent(new Event('wl:portfolio-updated')) } catch { /* no window */ } }

/**
 * Encrypt the current profile and push it to Drive.
 *
 * Writes the envelope format and keeps the data key, which is what turns
 * automatic backups on for this device from here onwards.
 *
 * When Drive already holds a backup, its data key is recovered with this
 * passphrase and reused, and its trades are folded in first. This used to
 * generate a fresh key on any device that had none, so a second phone's first
 * backup silently re-keyed the file: from then on each device could open only
 * its own uploads, failed to merge the other's without a word, and the two
 * took turns overwriting each other. `replace` is the deliberate escape for
 * someone who no longer knows the old passphrase.
 */
export async function backupNow(passphrase, { automatic = true, replace = false } = {}) {
  if (!passphrase) throw new Error('A passphrase is required')
  const remote = await findBackup()
  let key = null
  if (remote && !replace) {
    const existing = await downloadBackup(remote.id)
    if (isEncryptedBackup(existing) && wrapBlockOf(existing)) {
      try { key = await unwrapDataKey(existing, passphrase) } catch { throw new Error(PASS_MISMATCH) }
      // Never write over another device's trades: bring them in first.
      try { if (await mergeBackupCode(await decryptBackupWithKey(existing, key))) announce() } catch { /* unreadable body: keep local */ }
    }
  }
  if (!key) key = replace ? newDataKey() : (storedDataKey() || newDataKey())

  const { code, txCount } = await generateBackupCode()
  const payload = await encryptBackupEnvelope(code, key, passphrase)
  const up = asUpload(await uploadBackup(payload, remote?.id || null))

  // Only after the upload succeeded. Storing the key for a backup that never
  // landed would leave the device claiming it can auto-back-up to a file that
  // does not exist.
  //
  // `automatic` is the user's choice, made at the first backup. What gets kept
  // is the derived data key, NOT the passphrase — the passphrase is never
  // written anywhere, and this key only opens the backup, so someone with the
  // device gains nothing they did not already have by holding the portfolio
  // itself. Declining means every backup asks again, and nothing is left on
  // disk that could open the Drive file.
  if (automatic) {
    writeKey(DATA_KEY, dataKeyToString(key))
    writeKey(WRAP, wrapBlockOf(payload) || '')
  } else {
    forgetAutoBackup()
  }
  resumeSync()
  // The content, not the code: code carries ts: Date.now(), so stamping its
  // hash left the device reading as changed the instant after a manual backup.
  writeKey(LAST_HASH, await fingerprint(await snapshotSignature()))
  stampSynced(up)
  return { txCount, fileId: up.id }
}

/**
 * Bring the Drive backup into this device by MERGING, never replacing.
 *
 * Used on connect when this device already holds a portfolio: both sides'
 * trades end up here, then the union is uploaded so Drive has them too. Uses
 * the key this device holds, or learns it from the passphrase. A backup from
 * before data keys existed (WLE1) is opened with the passphrase directly.
 */
export async function mergeFromDrive(passphrase) {
  const remote = await findBackup()
  if (!remote) throw new Error('No backup found in your Drive')
  const payload = await downloadBackup(remote.id)
  if (!isEncryptedBackup(payload)) throw new Error('That backup file is not in the expected format')
  let code
  if (passphrase && !wrapBlockOf(payload)) {
    code = await decryptBackup(payload, passphrase)
  } else {
    let key = storedDataKey()
    if (passphrase) {
      key = await unwrapDataKey(payload, passphrase)
      writeKey(DATA_KEY, dataKeyToString(key))
      writeKey(WRAP, wrapBlockOf(payload) || '')
    }
    if (!key) throw new Error('A passphrase is required')
    try {
      code = await decryptBackupWithKey(payload, key)
    } catch {
      pauseSync()
      throw new Error(KEY_MISMATCH)
    }
  }
  const res = await mergeBackupCode(code)
  announce()
  resumeSync()
  // In step with that version now; the upload below adds this device's side.
  writeKey(SYNC_VER, remote.modifiedTime || '')
  writeKey(FILE_ID, remote.id)
  let txCount = res?.added || 0
  if (storedDataKey() && readKey(WRAP)) ({ txCount } = await backupWithStoredKey())
  return { added: res?.added || 0, txCount }
}

/** Sync again after another device re-keyed the backup: learn its key, merge both sides. */
export async function rejoinSync(passphrase) {
  return mergeFromDrive(passphrase)
}

/**
 * "Back up now" on a device that already holds the data key: no passphrase.
 *
 * The same upload autoBackup() makes, but run because someone tapped, so it
 * goes even when nothing changed and it throws instead of returning a reason:
 * there is a person waiting for the result. A newer copy from another device
 * is folded in first, exactly as autoBackup does, so a tap here cannot
 * overwrite a trade made on the phone.
 */
export async function backupWithStoredKey() {
  const key = storedDataKey()
  const wrap = readKey(WRAP)
  if (!key || !wrap) throw new Error('A passphrase is required')
  if (syncPaused()) throw new Error(KEY_MISMATCH)

  const remote = await findBackup()
  if (remoteAhead(remote) && await mergeFrom(remote.id, key)) announce()
  const { code, txCount } = await generateBackupCode()
  const payload = await encryptBackupWithWrap(code, key, wrap)
  const up = asUpload(await uploadBackup(payload, remote?.id || null))
  writeKey(LAST_HASH, await fingerprint(await snapshotSignature()))
  stampSynced(up)
  return { txCount, fileId: up.id }
}

/**
 * Back up without asking the user anything.
 *
 * Returns a reason rather than throwing, because every caller is a timer and
 * none of them has a user to show an error to.
 *
 * @returns {Promise<{ok: boolean, reason: string}>}
 *   reason: 'no-key' | 'key-mismatch' | 'unchanged' | 'signed-out' | 'failed' | 'backed-up'
 */
export async function autoBackup() {
  if (!canAutoBackup()) return { ok: false, reason: 'no-key' }
  // Another device re-keyed the file. Uploading now would replace its trades
  // with a copy it cannot even read, so wait for the passphrase instead.
  if (syncPaused()) return { ok: false, reason: 'key-mismatch' }
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
  // The CONTENT, not `code`. code carries ts: Date.now(), so hashing it made
  // this comparison fail every single time and the skip never happened.
  const hash = await fingerprint(await snapshotSignature())
  if (hash === readKey(LAST_HASH)) return { ok: false, reason: 'unchanged' }

  // The token, refreshed silently through the worker when it is near expiry.
  // An automatic backup is never allowed to raise a sign-in UI: if the refresh
  // genuinely fails (revoked token, offline) it gives up quietly and waits for
  // the user to reconnect.
  const token = await (async () => {
    try {
      return await getAccessToken({ interactive: false })
    } catch {
      return null
    }
  })()
  if (!token) return { ok: false, reason: 'signed-out' }

  // Has another device written since this one last did? Then uploading now
  // would overwrite its trades. Fold its copy in first and upload the union.
  // If that copy cannot be read, stop: an upload would destroy it.
  let remote = null
  try { remote = await findBackup() } catch { return { ok: false, reason: 'failed' } }
  if (remoteAhead(remote)) {
    try {
      if (await mergeFrom(remote.id, key)) announce()
      ;({ code } = await generateBackupCode())
    } catch (e) {
      return { ok: false, reason: e?.message === KEY_MISMATCH ? 'key-mismatch' : 'failed' }
    }
  }
  const hashNow = await fingerprint(await snapshotSignature())

  try {
    const payload = await encryptBackupWithWrap(code, key, readKey(WRAP))
    // The newest file Drive has, not this device's remembered id: if two
    // devices ever each created a file, every device must converge on one.
    const up = asUpload(await uploadBackup(payload, remote?.id || null))
    writeKey(LAST_HASH, hashNow || hash)
    stampSynced(up)
    return { ok: true, reason: 'backed-up' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Download another device's backup and fold it into this one.
 *
 * Throws KEY_MISMATCH (and pauses syncing) when this device's key cannot open
 * it. This used to return null for that, and the caller went on to upload —
 * replacing the other device's trades with a file it could not read.
 */
async function mergeFrom(fileId, key) {
  const payload = await downloadBackup(fileId)
  if (!isEncryptedBackup(payload)) return null
  let code
  try {
    code = await decryptBackupWithKey(payload, key)
  } catch {
    pauseSync()
    throw new Error(KEY_MISMATCH)
  }
  return mergeBackupCode(code)
}

/**
 * Should this device pull the backup down on its own?
 *
 * Pure, and separate from doing it, because the difference between "bring a
 * trade over from the phone" and "delete a trade the laptop just made" is
 * these three values, and that is not a decision to make inline.
 *
 * @returns {'pull'|'conflict'|'none'}
 */
export function decideAutoPull({ localDirty, remoteAt = 0, lastBackupAt = 0 }) {
  if (!remoteAt) return 'none'
  // This device wrote the newest copy, or Drive is behind. Nothing to fetch.
  if (remoteAt <= lastBackupAt) return 'none'
  // Drive is ahead AND this device has edits of its own. The two have
  // diverged, and silently picking either one throws the other away. Never
  // automatic: last-writer-wins is already what an unattended upload does, and
  // adding a download that does the same in reverse would make it worse.
  if (localDirty) return 'conflict'
  return 'pull'
}

/**
 * Has anything changed here since this device's own last upload?
 *
 * Compares a fresh snapshot against the fingerprint autoBackup() stamped. A
 * device that has never uploaded counts as changed, which is the safe answer
 * in both directions: it stops a pull rather than starting one.
 */
export async function localChangedSinceBackup() {
  const stamped = readKey(LAST_HASH)
  if (!stamped) return true
  try {
    return (await fingerprint(await snapshotSignature())) !== stamped
  } catch {
    return true
  }
}

/**
 * Bring another device's changes down, when it is safe to do so without asking.
 *
 * Safe means one specific thing: this device's data is byte-identical to what
 * it last uploaded. In that state the local copy IS the backup, so replacing
 * it with a newer one cannot lose anything. Every other case returns without
 * touching the portfolio.
 *
 * Cheap on the common path. The metadata lookup is one Drive call and most
 * polls stop at the timestamp comparison without hashing the portfolio or
 * downloading the file.
 */
export async function autoRestore() {
  if (!canAutoBackup()) return { ok: false, reason: 'no-key' }
  if (syncPaused()) return { ok: false, reason: 'key-mismatch' }

  // Never raises a sign-in. Same rule as autoBackup: a background task that
  // pops a Google prompt is worse than one that waits.
  const token = await (async () => {
    try { return await getAccessToken({ interactive: false }) } catch { return null }
  })()
  if (!token) return { ok: false, reason: 'signed-out' }

  let remote
  try { remote = await findBackup() } catch { return { ok: false, reason: 'failed' } }
  if (!remote) return { ok: false, reason: 'no-backup' }

  const remoteAt = remote.modifiedTime ? Date.parse(remote.modifiedTime) : 0
  // Drive's clock against Drive's clock: see SYNC_VER.
  const lastBackupAt = syncedAt()
  writeKey(REMOTE_AT, String(remoteAt || Date.now()))

  // Timestamps first: this settles most polls without reading the portfolio.
  if (decideAutoPull({ localDirty: false, remoteAt, lastBackupAt }) === 'none') {
    return { ok: false, reason: 'up-to-date' }
  }

  const action = decideAutoPull({
    localDirty: await localChangedSinceBackup(), remoteAt, lastBackupAt,
  })
  // Both devices changed something. Rather than stop syncing (as this used
  // to) or let one overwrite the other, back up: autoBackup merges the other
  // device's copy in first, so both sides' trades end up on both.
  if (action === 'conflict') {
    const res = await autoBackup()
    return res.ok ? { ok: true, reason: 'merged' } : { ok: false, reason: 'conflict' }
  }
  if (action !== 'pull') return { ok: false, reason: action }

  try {
    // The file just looked at, not this device's remembered id, which can be
    // a stale duplicate another device never writes to.
    await restoreNow(undefined, remote)
  } catch (e) {
    return { ok: false, reason: e?.message === KEY_MISMATCH ? 'key-mismatch' : 'failed' }
  }

  // The dashboard re-reads on this. driveAutoBackup hears it too and schedules
  // a run, which finds the fingerprint unchanged and does nothing — that is
  // why restoreNow stamps LAST_HASH, and why this does not ping-pong.
  try { window.dispatchEvent(new Event('wl:portfolio-updated')) } catch { /* no window */ }
  return { ok: true, reason: 'pulled' }
}

/**
 * Pull the backup down and apply it. Replaces local data — callers must have
 * confirmed that with the user unless decideAction said 'auto-restore'.
 */
export async function restoreNow(passphrase, found = null) {
  // The newest backup in Drive. Reading this device's remembered file id first
  // restored a stale duplicate whenever two devices had each created a file.
  const remote = found || await findBackup()
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
    try {
      code = await decryptBackupWithKey(payload, key)
    } catch {
      pauseSync()
      throw new Error(KEY_MISMATCH)
    }
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
  // STAMP WHAT WAS APPLIED, NOT JUST WHEN.
  //
  // This used to record only the time. That left a restored device looking
  // permanently changed: LAST_HASH still described whatever it held before,
  // so autoBackup would immediately re-upload the copy it had just downloaded,
  // and autoRestore would read the device as dirty and never pull again. With
  // the fingerprint stamped, a restored device is in step with Drive, which is
  // the truth.
  try {
    writeKey(LAST_HASH, await fingerprint(await snapshotSignature()))
    stampSynced(remote)
  } catch { /* private mode */ }
  resumeSync()
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
