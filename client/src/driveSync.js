// Decides what to do with a Drive backup once someone signs in.
//
// The dangerous move here is restoring over a device that already has data, so
// the decision is a pure function with its own tests rather than something
// improvised inside a click handler. Auto-restore fires in exactly one case:
// the device has no portfolio at all. Anything else asks first.

import { generateBackupCode, applyBackupCode } from './backupCore'
import { encryptBackup, decryptBackup, isEncryptedBackup } from './backupEncryption'
import { findBackup, uploadBackup, downloadBackup, getAccessToken, isDriveConfigured } from './googleDrive'

const LAST_BACKUP_AT = 'wl_drive_backup_at'
const FILE_ID = 'wl_drive_file_id'

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
 * Distinct from "is there a valid access token right now". The token is
 * deliberately memory-only, so it is always absent after a reload — but the
 * file id and last-backup time persist, and they are what tell us the user has
 * already answered the Connect question. Treating a missing token as "never
 * connected" collapsed the panel on every refresh and asked again.
 */
export function previouslyConnected(state = driveState()) {
  return Boolean(state.fileId || state.lastBackupAt)
}

export function driveState() {
  const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
  return {
    configured: isDriveConfigured(),
    lastBackupAt: Number(read(LAST_BACKUP_AT) || 0),
    fileId: read(FILE_ID),
  }
}

/**
 * Sign in and report what we found, without changing anything yet.
 * The caller decides whether to act on it.
 */
export async function connect() {
  await getAccessToken({ interactive: true })
  const remote = await findBackup()
  if (remote?.id) { try { localStorage.setItem(FILE_ID, remote.id) } catch { /* ignore */ } }
  const action = decideAction({
    hasLocal: hasLocalPortfolio(),
    remote,
    lastBackupAt: driveState().lastBackupAt,
  })
  return { remote, action }
}

/** Encrypt the current profile and push it to Drive. */
export async function backupNow(passphrase) {
  if (!passphrase) throw new Error('A passphrase is required')
  const { code, txCount } = await generateBackupCode()
  const payload = await encryptBackup(code, passphrase)
  const existing = driveState().fileId || (await findBackup())?.id || null
  const id = await uploadBackup(payload, existing)
  try {
    localStorage.setItem(FILE_ID, id)
    localStorage.setItem(LAST_BACKUP_AT, String(Date.now()))
  } catch { /* private mode */ }
  return { txCount, fileId: id }
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
  const code = await decryptBackup(payload, passphrase)
  const result = await applyBackupCode(code)
  try { localStorage.setItem(LAST_BACKUP_AT, String(Date.now())) } catch { /* ignore */ }
  return result
}

// Deliberately no auto-backup.
//
// There was a scheduleAutoBackup() here and a toggle in the UI, and neither
// could ever have worked: an unattended upload needs the passphrase, and the
// passphrase is never stored — that is the whole basis of the encryption. The
// toggle wrote a preference nothing read, promising a guarantee the design
// cannot make.
//
// Making it real means holding the passphrase somewhere. In memory it only
// covers the current tab, which is not what "automatic" implies to anyone. On
// disk it puts the key beside the ciphertext and the encryption stops meaning
// anything. Neither is worth a switch, so backups are explicit.
