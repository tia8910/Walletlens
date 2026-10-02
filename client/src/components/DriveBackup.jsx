import { useState, useEffect, useRef } from 'react'
import { useLanguage } from '../LanguageContext'
import { useLocation } from 'react-router-dom'
import Icon from './Icon'
import { track } from '../analytics'
import { noteFriction } from '../reviewPrompt'
import { noteSupportFriction } from '../supportNudge'
import {
  connect, backupNow, backupWithStoredKey, restoreNow, driveState, previouslyConnected,
  disconnectDrive, autoBackupEnabled, forgetAutoBackup,
  latestBackupAt, knownBackup, hasLocalPortfolio,
  syncPaused, rejoinSync, mergeFromDrive, KEY_MISMATCH, PASS_MISMATCH,
} from '../driveSync'
import { NEEDS_SIGNIN, NET_DRIVE, NET_DRIVE_REFUSED, NET_AUTH } from '../googleDrive'

// Google Drive backup panel.
//
// Two rules shape the layout:
//
// 1. Connection status is stated outright, at the top, in words. It was
//    previously only inferable from whether the button read Connect or
//    Recheck, which is not a status.
//
// 2. The passphrase field appears only when something is about to use it.
//    Leaving it on screen permanently asked for a secret with no pending
//    action, which is both confusing and a bad habit to teach.
//
// The passphrase is never stored. Typed to back up, typed again to restore on
// a new device. Keeping it would put the key on the same disk as the data it
// protects.

function fmt(ts) {
  if (!ts) return null
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`
  return new Date(ts).toLocaleDateString()
}

function Dot({ on }) {
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
      background: on ? 'var(--g, #10b981)' : 'rgba(128,128,128,0.5)',
      boxShadow: on ? '0 0 0 3px rgba(16,185,129,0.18)' : 'none',
    }} />
  )
}

function Msg({ msg }) {
  if (!msg) return null
  const ok = msg.kind === 'ok'
  return (
    <p style={{
      margin: '0.5rem 0 0', fontSize: '0.85rem', fontWeight: 600,
      color: ok ? 'var(--g, #10b981)' : 'var(--r, #ef4444)',
    }}>
      {ok ? '✓ ' : ''}{msg.text}
    </p>
  )
}

// `embedded` drops the section's own card chrome so the panel can sit inside a
// card that already exists — the Dashboard's Backup & Restore card. Same panel,
// same behaviour; only the wrapper and the heading style change.
export default function DriveBackup({ embedded = false }) {
  const { t } = useLanguage()
  const location = useLocation()
  const [state, setState] = useState(() => driveState())
  const [connected, setConnected] = useState(() => previouslyConnected())
  const [found, setFound] = useState(() => knownBackup())
  const [action, setAction] = useState(null)   // what the last check concluded
  const [prompt, setPrompt] = useState(null)   // 'backup' | 'restore' | null
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [empty] = useState(() => !hasLocalPortfolio())
  // Default on: someone who just set up a backup almost always wants it to
  // stay current. The point is that it is now a visible choice, not that it
  // starts off.
  const [auto, setAuto] = useState(true)
  const [autoOn, setAutoOn] = useState(() => autoBackupEnabled())
  // Restore with the key this device holds: a confirm, no passphrase.
  const [keyRestore, setKeyRestore] = useState(false)
  // Another device re-keyed the backup; nothing syncs until the passphrase.
  const [paused, setPaused] = useState(() => syncPaused())
  // The passphrase typed does not open the backup already in Drive.
  const [mismatch, setMismatch] = useState(false)

  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || !location.state?.driveConnected) return
    resumed.current = true
    onConnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  if (!state.configured) return null

  const refresh = () => setState(driveState())
  const say = (kind, text) => setMsg({ kind, text })
  // Every failure gets a sentence written here. The fallback used to be
  // e.message, which is how "Failed to fetch" ended up on screen under a card
  // that said Connected: the browser's wording for a request that never
  // completed, naming no service and no remedy. A person reading it cannot
  // tell whether their portfolio is safe, and it is not even a sentence.
  const explain = (e, fallback) => {
    const m = e?.message || ''
    if (m === KEY_MISMATCH) {
      setPaused(true)
      return 'Your backup was re-encrypted on another device. Enter your passphrase to keep this device in sync.'
    }
    if (m === PASS_MISMATCH) {
      setMismatch(true)
      return 'That passphrase does not open the backup already in your Drive. Use the one you set on your other device, so both stay in sync.'
    }
    if (m === NEEDS_SIGNIN) return 'Your Google session expired. Tap Reconnect to sign in again.'
    // Two hops, two problems. Drive unreachable is usually the connection;
    // the token service unreachable has been a blocked hostname, and saying
    // which one failed is the difference between a report and a guess.
    if (m === NET_DRIVE) {
      return 'Could not reach Google Drive. Your data is safe on this device — check your connection and try again.'
    }
    // Reachable, and refused. Not the person's connection, so do not send them
    // off to check it — say whose fault it is and stop there.
    if (m === NET_DRIVE_REFUSED) {
      return 'Google Drive answered but would not accept the request. Your data is safe on this device — this is a fault on our side, not your connection.'
    }
    if (m === NET_AUTH) {
      return 'Could not reach the Google sign-in service. Your data is safe on this device — try again in a moment.'
    }
    // A raw TypeError from somewhere that is not tagged. Every fetch in the
    // Drive path is, so this should be unreachable — and it must not name a
    // hop it cannot know, or the message becomes a false lead in exactly the
    // situation where the message is the only evidence there is.
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) {
      return 'The request did not complete. Your data is safe on this device — check your connection and try again.'
    }
    // A Drive error carries a status and Google's own English. Worth logging,
    // not worth showing.
    if (/^Drive error /.test(m)) {
      console.warn('drive:', m.slice(0, 200))
      return fallback
    }
    return m || fallback
  }

  function ask(which) {
    setMismatch(false)
    setKeyRestore(which === 'restore' && autoBackupEnabled())
    setPrompt(which)
    setPass('')
    setMsg(null)
  }
  function cancel() {
    setPrompt(null)
    setPass('')
  }

  async function onDisconnect() {
    if (busy) return
    // No confirm dialog: nothing is destroyed. The file stays in the user's
    // Drive and Restore finds it again on reconnect, so the cost of a mistaken
    // tap is one more tap.
    setBusy(true)
    try {
      disconnectDrive()
      track('drive_disconnect')
      setConnected(false); setFound(null); setAction(null); setAutoOn(false)
      cancel(); refresh()
      say('ok', 'Disconnected. Your backup is still in your Drive — reconnect any time to restore it.')
    } finally { setBusy(false) }
  }

  function onToggleAuto() {
    // Only ever turns it off. Turning it back on needs the passphrase, which
    // is the whole reason it can run unattended in the first place.
    forgetAutoBackup()
    setAutoOn(false)
    track('drive_auto_off')
    say('ok', 'Automatic backups off. Use Back up now when you want to save.')
  }

  // After a restore or merge, straight to the portfolio it produced.
  const toDashboard = (text) => {
    say('ok', text)
    setTimeout(() => { window.location.href = '/dashboard' }, 700)
  }

  async function onConnect() {
    setBusy(true); setMsg(null)
    try {
      track('drive_connect')
      const { remote, action: next } = await connect()
      setFound(remote); setAction(next); setConnected(true); refresh()
      if (next === 'auto-restore') {
        // Nothing here to lose and a backup waiting. With this device's key
        // (it has synced before), load it now and open the dashboard; no
        // tap, no passphrase. Otherwise the passphrase is the one thing
        // missing, so ask for it straight away.
        if (autoBackupEnabled() && !syncPaused()) {
          try {
            const { restored } = await restoreNow()
            track('drive_restore', { auto: true })
            toDashboard(`Restored ${restored} items from Drive. Opening your portfolio…`)
            return
          } catch (e) { if (e?.message !== KEY_MISMATCH) throw e; setPaused(true) }
        }
        ask('restore')
        say('ok', 'Backup found. Enter your passphrase to load your portfolio.')
      }
      else if (next === 'first-backup') {
        if (empty) {
          say('ok', 'Connected. Add some holdings and they’ll be backed up here.')
        } else {
          // The same move as auto-restore above, for the same reason. Ending
          // at "no backup yet" left people believing connecting was the whole
          // setup — but automatic backups cannot start until one exists,
          // because they reuse the data key and wrap block that only the first
          // passphrase-protected backup creates. So go straight to the one
          // thing missing rather than leaving it to be found.
          ask('backup')
          say('ok', 'Connected. Set a passphrase to make your first backup — after that it updates itself.')
        }
      }
      else if (next === 'ask') {
        // A portfolio here AND a backup in Drive. Merge, never replace: both
        // sides' trades are kept, then the dashboard opens on the result.
        if (autoBackupEnabled() && !syncPaused()) {
          try {
            const { added } = await mergeFromDrive()
            track('drive_merge', { auto: true, added })
            toDashboard(added
              ? `Synced with Drive: ${added} transaction${added === 1 ? '' : 's'} added from your backup. Opening your portfolio…`
              : 'Synced with Drive. Opening your portfolio…')
            return
          } catch (e) { if (e?.message !== KEY_MISMATCH) throw e; setPaused(true) }
        }
        ask('merge')
        say('ok', 'Backup found. Enter your passphrase to add it to this device. Nothing here is replaced.')
      }
      else say('ok', 'Connected. Your backup is up to date.')
    } catch (e) {
      say('err', explain(e, 'Could not connect to Google Drive. Try again in a moment.'))
    } finally { setBusy(false) }
  }

  // With the key on this device, Back up now needs nothing typed: one tap,
  // straight to Drive. The passphrase is only for a device without the key.
  async function onQuickBackup() {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const { txCount } = await backupWithStoredKey()
      track('drive_backup', { txCount, automatic: true, quick: true })
      refresh(); setFound(f => f || { id: driveState().fileId })
      say('ok', `Backed up ${txCount} transactions.`)
    } catch (e) {
      noteFriction('sync_failed'); noteSupportFriction('sync_failed')
      say('err', explain(e, 'Backup failed. Nothing on this device was changed.'))
    } finally { setBusy(false) }
  }

  async function onSubmit({ replace = false } = {}) {
    setBusy(true); setMsg(null)
    const which = prompt
    try {
      if (which === 'merge') {
        const { added } = await mergeFromDrive(pass)
        track('drive_merge', { auto: false, added })
        setPaused(false); setAutoOn(autoBackupEnabled()); refresh(); cancel()
        toDashboard(`Synced with Drive: ${added} transaction${added === 1 ? '' : 's'} added from your backup. Opening your portfolio…`)
      } else if (which === 'rejoin') {
        const { txCount } = await rejoinSync(pass)
        track('drive_rejoin', { txCount })
        setPaused(false); setAutoOn(autoBackupEnabled()); refresh()
        say('ok', `Back in sync. ${txCount} transactions from all your devices are here and in Drive.`)
        cancel()
      } else if (which === 'backup') {
        const { txCount } = await backupNow(pass, { automatic: auto, replace })
        track('drive_backup', { txCount, automatic: auto })
        refresh(); setConnected(true); setAutoOn(autoBackupEnabled()); setPaused(false); setMismatch(false)
        setFound(f => f || { id: driveState().fileId })
        say('ok', auto
          ? `Backed up ${txCount} transactions. This now updates itself automatically.`
          : `Backed up ${txCount} transactions. You'll be asked for your passphrase each time.`)
        cancel()
      } else {
        let restored
        try {
          ({ restored } = await restoreNow(keyRestore ? undefined : pass))
        } catch (e) {
          // The key on this device no longer opens the file (another device
          // re-keyed it). Ask for the passphrase rather than failing.
          if (!keyRestore) throw e
          setKeyRestore(false)
          say('err', 'Enter your passphrase to restore this backup.')
          return
        }
        track('drive_restore', { quick: keyRestore })
        say('ok', `Restored ${restored} items. Opening your portfolio…`)
        setTimeout(() => { window.location.href = "/dashboard" }, 400)
      }
    } catch (e) {
      // Both frictions were declared in reviewPrompt and reported by nobody,
      // so a user whose restore had just failed stayed fully eligible for a
      // "rate us" card. That is a one-star generator — and, because Play meters
      // the review flow per user, it also spends an ask that cannot be got
      // back. Losing a backup is the single worst moment to be asked.
      noteFriction(which === 'backup' ? 'sync_failed' : 'restore_failed')
      noteSupportFriction(which === 'backup' ? 'sync_failed' : 'restore_failed')
      say('err', explain(e, which === 'backup'
        ? 'Backup failed. Nothing on this device was changed.'
        : 'Restore failed. Nothing on this device was changed.'))
    } finally { setBusy(false) }
  }

  // "no backup yet" must mean Drive is empty, not merely that this device has
  // never uploaded. Getting that wrong told someone signing in on a second
  // browser that their portfolio wasn't there, next to the button that would
  // have brought it back.
  const backupAge = fmt(latestBackupAt(state))
  const statusText = !connected
    ? 'Not connected'
    : found
      ? (backupAge ? `Connected · backup from ${backupAge}` : 'Connected · backup found')
      : 'Connected · no backup yet'
  const replaces = prompt === 'restore' && (action === 'ask' || (keyRestore && !empty))
  // A device with nothing on it and a backup waiting is the case this feature
  // exists for. Say so plainly rather than leaving Restore to be guessed at.
  const waiting = connected && found && empty

  const body = (
    <>
      {/* Status, stated rather than implied by a button label. */}
      <div className="settings-row">
        <div className="settings-label">
          <span style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem' }}>
            <Dot on={connected} />{statusText}
          </span>
          <span className="settings-hint">
            {connected
              ? 'Encrypted in your own Drive. WalletLens cannot read it.'
              : 'Sign in to keep an encrypted copy in your own Google Drive.'}
          </span>
        </div>
        <button className="settings-chip" onClick={onDisconnect} disabled={busy}
          style={{ display: connected ? 'inline-flex' : 'none', alignItems:'center', gap:'0.35rem' }}>
          <Icon name="x" size={14} /> Disconnect
        </button>
        <button className="settings-chip" onClick={onConnect} disabled={busy}
          style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem' }}>
          <Icon name="link" size={14} /> {connected ? 'Reconnect' : 'Connect'}
        </button>
      </div>

      {/* A new device with a backup waiting: lead with the restore, since
          that is the only reason to have signed in here. */}
      {waiting && !prompt && (
        <div className="settings-row" style={{ display:'block' }}>
          <p style={{ margin:'0 0 0.6rem', fontSize:'0.9rem' }}>
            There's a backup in your Drive and nothing on this device yet.
            Restore it to load your portfolio here.
          </p>
          <button className="settings-chip" onClick={() => ask('restore')} disabled={busy}
            style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem' }}>
            <Icon name="download" size={14} /> Restore my portfolio
          </button>
        </div>
      )}

      {/* Sync stopped rather than overwrite a copy this device cannot read. */}
      {connected && paused && !prompt && (
        <div className="settings-row" style={{ display:'block' }}>
          <p style={{ margin:'0 0 0.6rem', fontSize:'0.9rem', color:'var(--r, #ef4444)', fontWeight: 600 }}>
            Sync paused on this device. Your backup was re-encrypted on another
            device, so this one can't read it yet.
          </p>
          <button className="settings-chip" onClick={() => ask('rejoin')} disabled={busy}
            style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem' }}>
            <Icon name="link" size={14} /> Resume sync
          </button>
        </div>
      )}

      {/* Actions, only once there is a connection to act on. */}
      {connected && !prompt && !waiting && !paused && (
        <div className="settings-row" style={{ gap:'0.5rem', justifyContent:'flex-start' }}>
          <button className="settings-chip" onClick={() => (autoOn ? onQuickBackup() : ask('backup'))} disabled={busy}>
            {busy && autoOn ? 'Backing up…' : 'Back up now'}
          </button>
          {found && (
            <button className="settings-chip" onClick={() => ask('restore')} disabled={busy}>
              Restore
            </button>
          )}
        </div>
      )}

      {/* The passphrase is asked for at the moment it is needed, for a named
          purpose, rather than sitting on screen waiting. */}
      {connected && !prompt && (
        <div className="settings-row" style={{ paddingTop:'0.2rem' }}>
          <div className="settings-label">
            <span>Automatic backups {autoOn ? <span style={{ color:'var(--g-ink)' }}>· on</span> : '· off'}</span>
            <span className="settings-hint">
              {autoOn
                ? 'Saved changes are backed up in the background, without asking.'
                : 'Use Back up now and enter your passphrase to save.'}
            </span>
          </div>
          {autoOn
            ? <button className="settings-chip" onClick={onToggleAuto} disabled={busy}>Turn off</button>
            : <button className="settings-chip" onClick={() => ask('backup')} disabled={busy}>Turn on</button>}
        </div>
      )}

      {prompt && (
        <div className="settings-row" style={{ display:'block' }}>
          {keyRestore ? (
            <p style={{ margin:'0 0 0.2rem', fontSize:'0.9rem' }}>
              Load the backup from your Drive onto this device? No passphrase needed here.
            </p>
          ) : (<>
          <div className="settings-label" style={{ marginBottom:'0.5rem' }}>
            <span>{prompt === 'backup' ? 'Passphrase to encrypt this backup' : 'Passphrase for this backup'}</span>
            <span className="settings-hint">
              {prompt === 'merge'
                ? 'The passphrase you chose when you made this backup. Your Drive backup is added to what is on this device; nothing here is replaced.'
                : prompt === 'rejoin'
                ? 'The passphrase now protecting your Drive backup. This device learns its key and merges both sides.'
                : prompt === 'backup'
                ? 'At least 8 characters. Never stored or sent anywhere, so if you lose it nobody can recover the backup, including us.'
                : 'The passphrase you chose when you made this backup.'}
            </span>
          </div>
          <input
            type="password"
            className="bs-input"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && pass.length >= 8 && !busy) onSubmit() }}
            placeholder={t('phPassphrase')}
            autoComplete="off"
            autoFocus
            style={{ width:'100%' }}
          />
          </>)}

          {prompt === 'backup' && (
            <label style={{ display:'flex', gap:'0.6rem', alignItems:'flex-start', marginTop:'0.7rem', cursor:'pointer' }}>
              <input
                type="checkbox"
                checked={auto}
                onChange={e => setAuto(e.target.checked)}
                style={{ marginTop:'0.2rem', width:18, height:18, accentColor:'var(--g)' }}
              />
              <span className="settings-label" style={{ gap:'0.15rem' }}>
                <span>Keep this backup up to date automatically</span>
                <span className="settings-hint">
                  Saves the key that unlocks this backup on this device, so it can
                  update itself without asking again. Your passphrase is still never
                  stored. Leave it off to be asked every time.
                </span>
              </span>
            </label>
          )}

          {replaces && (
            <p className="settings-hint" style={{ margin:'0.5rem 0 0', color:'var(--r, #ef4444)' }}>
              This device already has a portfolio. Restoring replaces it, and that
              cannot be undone.
            </p>
          )}

          <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.6rem' }}>
            <button className="settings-chip" onClick={() => onSubmit()} disabled={(!keyRestore && pass.length < 8) || busy}>
              {busy ? 'Working…' : prompt === 'merge' ? 'Add to this device' : prompt === 'rejoin' ? 'Resume sync' : prompt === 'backup' ? 'Back up' : replaces ? 'Replace this device' : 'Restore'}
            </button>
            {prompt === 'backup' && mismatch && (
              // The deliberate way out for someone who no longer knows the old
              // passphrase. Other devices will then ask for the new one.
              <button className="settings-chip" onClick={() => onSubmit({ replace: true })} disabled={pass.length < 8 || busy}>
                Replace Drive backup
              </button>
            )}
            <button className="settings-chip" onClick={cancel} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      <Msg msg={msg} />
    </>
  )

  if (embedded) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.5rem 0.15rem' }}>
          Google Drive
        </div>
        {body}
      </div>
    )
  }

  return (
    <div className="settings-section glass-card">
      <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}>
        <Icon name="upload" size={16} />Google Drive backup
      </h3>
      {body}
    </div>
  )
}
