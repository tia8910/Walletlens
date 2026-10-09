// The weekly backup-code email has been discontinued.
//
// It used to email the user's backup code every week from
// noreply@walletlens.live. Backups now go to the user's own Google Drive,
// encrypted and kept up to date, so nothing is emailed any more. On app open,
// anyone still subscribed on this device is quietly unsubscribed; no email is
// sent from here, and the voice worker refuses the old `backup_email` request
// from builds that still carry the feature.

const SUB_KEY = 'wl_backup_sub'

export function loadBackupSub() {
  try { return JSON.parse(localStorage.getItem(SUB_KEY) || 'null') } catch { return null }
}

export function clearBackupSub() {
  try { localStorage.removeItem(SUB_KEY) } catch {}
}

/** Called on app open. Ends any old subscription; never sends anything. */
export async function maybeSendWeeklyBackup() {
  if (loadBackupSub()) clearBackupSub()
}
