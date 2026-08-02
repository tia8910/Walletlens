import { useState } from 'react'
import Icon from './Icon'
import { track } from '../analytics'
import { connect, backupNow, restoreNow, driveState, setAutoBackup } from '../driveSync'

// Google Drive backup panel.
//
// The passphrase is deliberately never stored. It is typed to back up and typed
// again to restore on a new device. Keeping it would mean a key to the backup
// sitting on the same disk as the data it protects, which defeats encrypting
// it in the first place.

function fmt(ts) {
  if (!ts) return 'never'
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  return new Date(ts).toLocaleString()
}

export default function DriveBackup() {
  const [state, setState] = useState(() => driveState())
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState(null)   // remote file, once we've looked
  const [action, setAction] = useState(null) // what decideAction concluded
  const [msg, setMsg] = useState(null)       // { kind: 'ok'|'err', text }

  if (!state.configured) return null

  const refresh = () => setState(driveState())
  const say = (kind, text) => setMsg({ kind, text })

  async function onConnect() {
    setBusy(true); setMsg(null)
    try {
      track('drive_connect')
      const { remote, action: next } = await connect()
      setFound(remote); setAction(next); refresh()
      if (next === 'auto-restore') {
        say('ok', 'Backup found. Enter your passphrase to load your profile.')
      } else if (next === 'first-backup') {
        say('ok', 'Connected. No backup yet — choose a passphrase and back up.')
      } else if (next === 'up-to-date') {
        say('ok', 'Connected. Your Drive backup is already current.')
      } else {
        say('ok', 'Backup found, and this device already has a portfolio. Choose which to keep.')
      }
    } catch (e) {
      say('err', e.message || 'Could not connect to Google Drive')
    } finally { setBusy(false) }
  }

  async function onBackup() {
    setBusy(true); setMsg(null)
    try {
      const { txCount } = await backupNow(pass)
      track('drive_backup', { txCount })
      refresh(); say('ok', `Backed up ${txCount} transactions to your Drive.`)
    } catch (e) {
      say('err', e.message || 'Backup failed')
    } finally { setBusy(false) }
  }

  async function onRestore() {
    setBusy(true); setMsg(null)
    try {
      const { restored } = await restoreNow(pass)
      track('drive_restore')
      say('ok', `Restored ${restored} items. Reloading…`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      say('err', e.message || 'Restore failed')
    } finally { setBusy(false) }
  }

  const canAct = pass.length >= 8 && !busy

  return (
    <div className="settings-section glass-card">
      <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}>
        <Icon name="upload" size={16} />Google Drive backup
      </h3>

      <div className="settings-row">
        <div className="settings-label">
          <span>Encrypted backup in your own Drive</span>
          <span className="settings-hint">
            {action ? `Last backup: ${fmt(state.lastBackupAt)}`
                    : 'WalletLens can only see the file it creates, and cannot read it'}
          </span>
        </div>
        <button className="settings-chip" onClick={onConnect} disabled={busy}
          style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem' }}>
          <Icon name="link" size={14} /> {action ? 'Recheck' : 'Connect'}
        </button>
      </div>

      {action && (
        <>
          <div className="settings-row" style={{ display:'block' }}>
            <div className="settings-label" style={{ marginBottom:'0.5rem' }}>
              <span>Passphrase</span>
              <span className="settings-hint">
                At least 8 characters. It is never stored or sent anywhere, so if
                you lose it the backup cannot be recovered by anyone, including us.
              </span>
            </div>
            <input
              type="password"
              className="bs-input"
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Your backup passphrase"
              autoComplete="off"
              style={{ width:'100%' }}
            />
          </div>

          <div className="settings-row" style={{ gap:'0.5rem' }}>
            <button className="settings-chip" onClick={onBackup} disabled={!canAct}>
              {busy ? 'Working…' : 'Back up now'}
            </button>
            {found && (
              <button className="settings-chip" onClick={onRestore} disabled={!canAct}>
                {action === 'ask' ? 'Replace this device' : 'Restore'}
              </button>
            )}
          </div>

          {action === 'ask' && (
            <p className="settings-hint" style={{ marginTop:'0.25rem' }}>
              This device already has a portfolio. Restoring replaces it with the
              Drive copy, and that cannot be undone.
            </p>
          )}

          <div className="settings-row">
            <div className="settings-label">
              <span>Back up automatically</span>
              <span className="settings-hint">After changes, while you stay signed in</span>
            </div>
            <button
              className={`settings-toggle ${state.autoBackup ? 'on' : ''}`}
              onClick={() => { setAutoBackup(!state.autoBackup); refresh() }}
            />
          </div>
        </>
      )}

      {msg && (
        <p className="settings-hint" style={{ color: msg.kind === 'err' ? 'var(--r, #ef4444)' : undefined }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
