import { useState, useEffect } from 'react'
import {
  isPushSupported, isPushEnabled, enablePush, disablePush, watchPermission, pushStatus,
  ensureRegistered, sendTestPush, vapidKeyMatches,
  getPushPrefs, setPushPrefs,
} from '../push'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'

// Settings → Notifications. The master switch plus one row per channel, since
// "notifications" is not one thing: someone who wants to know their holding
// dropped 8% may still not want a daily brief, and burying both behind a
// single toggle is how an app loses the permission entirely.
//
// The channel rows only appear once push is on — they are meaningless
// otherwise, and showing dead toggles invites people to flip them and wonder
// why nothing happens.

const MOVE_STEPS = [3, 5, 10, 20]

function Row({ label, hint, on, onToggle }) {
  return (
    <div className="settings-row settings-row-toggle">
      <div className="settings-label">
        <span>{label}</span>
        <span className="settings-hint">{hint}</span>
      </div>
      <button className={`settings-toggle ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on}>
        <span className="settings-toggle-thumb" />
      </button>
    </div>
  )
}

const BAD = '#f87171'
const WARN = '#f59e0b'

// What to say when the device is not registered. `repair` is the outcome of
// ensureRegistered(): null while it is still running, otherwise its result.
//
// These used to share one line reading "reconnecting…", which was correct for
// about a second and a lie after that — a repair that had already been refused
// looked exactly like one still in flight, so the honest answer ("this cannot
// succeed, here is why") was never reachable from the screen.
function repairMessage(repair) {
  if (!repair) return { text: 'Not registered on the server yet — reconnecting…', tone: WARN }
  switch (repair.reason) {
    case 'opted-out':
      return { text: 'Notifications are switched off for this device. Turn the switch above off and on again.', tone: BAD }
    case 'not-granted':
      return { text: 'Your browser has not allowed notifications for WalletLens. Allow them in site settings, then reopen this screen.', tone: BAD }
    case 'no-subscription':
      return { text: 'This device has no push subscription. Turn the switch above off and on again.', tone: BAD }
    case 'key-rotated':
      return { text: 'This device’s notification key is out of date. Turn the switch above off and on again to renew it.', tone: BAD }
    case 'no-key':
      return { text: 'Push is not configured in this build. It will work after the next update.', tone: BAD }
    case 'status-unreachable':
      return { text: 'Could not reach the notification server. It will try again next time you open this screen.', tone: WARN }
    case 'status-http':
      return { text: `The notification server answered ${repair.httpStatus} when asked about this device. It will try again next time you open this screen.`, tone: WARN }
    case 'subscribe-unreachable':
      // The read worked and the write did not, which is the shape of a server
      // error rather than a phone with no signal — worth saying differently.
      return { text: 'The notification server could be read but not written to. This is a fault on our side, not on your phone.', tone: BAD }
    case 'error':
      return { text: 'Registering this device failed unexpectedly.', tone: BAD }
    case 'endpoint-rejected':
      return {
        text: `The server does not accept push from ${repair.host || 'this browser'}. Open WalletLens in Chrome and turn notifications on there.`,
        tone: BAD,
      }
    case 'rejected':
      if (repair.code === 'invalid_endpoint') {
        return {
          text: `The server does not accept push from ${repair.host || 'this browser'}. Open WalletLens in Chrome and turn notifications on there.`,
          tone: BAD,
        }
      }
      return {
        text: `The server refused to register this device${repair.httpStatus ? ` (${repair.httpStatus}${repair.code ? ` ${repair.code}` : ''})` : ''}. Turn the switch above off and on again.`,
        tone: BAD,
      }
    default:
      return { text: 'Not registered on the server yet — retrying.', tone: WARN }
  }
}

/**
 * One line saying whether this device is actually wired up, and what would
 * stop a notification arriving right now.
 *
 * Deliberately not a "send test notification" button — that was removed on
 * purpose, and a test send proves the pipe works at one instant without
 * saying anything about why the real channels are quiet. This reports state.
 */
function PushStatusLine({ status, repair }) {
  if (status.reachable === false) {
    return <div className="settings-hint" style={{ marginTop: '0.5rem', color: WARN }}>
      Can’t reach the notification server right now.
    </div>
  }
  if (status.found === false) {
    const { text, tone } = repairMessage(repair)
    return (
      <div className="settings-hint" style={{ marginTop: '0.5rem', color: tone }}>
        <div>{text}</div>
        {repair?.detail && (
          <div style={{ opacity: 0.75, fontSize: '0.85em', marginTop: '0.15rem', wordBreak: 'break-word' }}>
            {repair.detail}
          </div>
        )}
      </div>
    )
  }
  if (!status.found) return null

  // The states that produce total silence while everything looks correct.
  const noWatch = status.watch === 0
  const spent = status.budgetLeft === 0
  const keyOk = vapidKeyMatches(status.vapidKey)

  return (
    <div className="settings-hint" style={{ marginTop: '0.5rem', lineHeight: 1.6 }}>
      <div>
        Watching <strong>{status.watch}</strong> {status.watch === 1 ? 'asset' : 'assets'}
        {status.alerts > 0 && <> · <strong>{status.alerts}</strong> price {status.alerts === 1 ? 'target' : 'targets'}</>}
        {' · '}<strong>{status.budgetLeft}</strong> of {status.budget} left today
      </div>
      {status.vapid === false && (
        <div style={{ color: BAD }}>
          The notification server has no signing key, so nothing can be delivered
          to any device. This is a server configuration problem, not a fault on
          your phone.
        </div>
      )}
      {keyOk === false && (
        <div style={{ color: BAD }}>
          This device subscribed with a different signing key than the server
          uses, so every notification is rejected on arrival. Turn the switch
          above off and on again to re-subscribe with the current key.
        </div>
      )}
      {noWatch && (
        <div style={{ color: BAD }}>
          No assets are being watched, so move and news alerts can’t fire.
          Open the Dashboard once to sync your holdings.
        </div>
      )}
      {spent && (
        <div style={{ color: WARN }}>
          Today’s notification budget is used up. Price targets you set still come through.
        </div>
      )}
    </div>
  )
}

/**
 * Send one notification to this device, now.
 *
 * This was removed once before, on the reasoning that a test send proves the
 * pipe works at one instant without explaining why the real channels are
 * quiet. That reasoning held while it was the ONLY signal. Now that the line
 * above reports what the server holds, the two answer different questions,
 * and this one answers the question the status line cannot: a device can be
 * registered, watched, in budget and every switch on, while the push service
 * rejects everything the server signs. No channel firing on its own schedule
 * reveals that inside an hour.
 */
function TestSend() {
  const [state, setState] = useState({ status: 'idle' })

  async function run() {
    if (state.status === 'sending') return
    setState({ status: 'sending' })
    try {
      await sendTestPush()
      setState({ status: 'sent' })
    } catch (e) {
      setState({ status: 'failed', message: e?.message || 'It did not go through.' })
    }
  }

  return (
    <div style={{ marginTop: '0.6rem' }}>
      <button className="settings-chip" onClick={run} disabled={state.status === 'sending'}>
        {state.status === 'sending' ? 'Sending…' : 'Send a test notification'}
      </button>
      {state.status === 'sent' && (
        <div className="settings-hint" style={{ marginTop: '0.35rem' }}>
          Sent. If it does not appear within a few seconds, notifications are
          blocked for WalletLens in your phone’s system settings.
        </div>
      )}
      {state.status === 'failed' && (
        <div className="settings-hint" style={{ marginTop: '0.35rem', color: BAD, wordBreak: 'break-word' }}>
          {state.message}
        </div>
      )}
    </div>
  )
}

export default function PushToggle() {
  const { t } = useLanguage()
  const [supported] = useState(() => isPushSupported())
  const [enabled, setEnabled] = useState(false)
  const [prefs, setPrefs] = useState(getPushPrefs)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)
  // null = the repair has not finished yet; otherwise ensureRegistered()'s
  // verdict, which is what tells "still trying" apart from "gave up".
  const [repair, setRepair] = useState(null)

  useEffect(() => { isPushEnabled().then(setEnabled).catch(() => {}) }, [])

  // Repaint when permission is granted somewhere other than this switch — the
  // primer card, the browser prompt, or Android's app settings. Read once on
  // mount, this sat at off after the user had already allowed notifications,
  // which reads as the switch being broken.
  useEffect(() => watchPermission(setEnabled), [])

  // Ask the server what it holds, whenever the switch is on. Cheap, read-only,
  // and it is the only way to tell "nothing has happened worth sending" from
  // "this device is not actually wired up".
  useEffect(() => {
    if (!enabled) { setStatus(null); setRepair(null); return }
    let alive = true
    setRepair(null)
    pushStatus().then(async s => {
      if (!alive) return
      setStatus(s)
      // A local subscription the server has never heard of is the one failure
      // that looks completely healthy from here: the switch reads On because
      // the browser has a subscription, and nothing will ever be sent to it.
      // Repair it rather than asking the user to toggle something.
      if (s?.found === false) {
        const result = await ensureRegistered()
        if (!alive) return
        setRepair(result)
        if (result?.ok) setStatus(await pushStatus())
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [enabled])

  async function toggle() {
    if (busy) return
    setBusy(true); setError('')
    try {
      if (enabled) {
        await disablePush()
        setEnabled(false)
        track('push_disabled')
      } else {
        await enablePush()
        setEnabled(true)
        track('push_enabled')
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  // Optimistic: the write is local-first and the server sync is best-effort,
  // so a toggle should never sit there waiting on the network to animate.
  function updatePref(patch, event) {
    setPrefs(p => ({ ...p, ...patch }))
    setPushPrefs(patch).catch(() => {})
    track(event, patch)
  }

  if (!supported) {
    return <div className="settings-hint" style={{ padding: '0.4rem 0' }}>{t('npUnsupported')}</div>
  }

  return (
    <div>
      <div className="settings-row settings-row-toggle">
        <div className="settings-label">
          <span>{t('npTitle')} {enabled && <span style={{ color: 'var(--g-ink)' }}>· {t('setPulseOn')}</span>}</span>
          <span className="settings-hint">{t('npHint')}</span>
        </div>
        <button className={`settings-toggle ${enabled ? 'on' : ''}`} onClick={toggle} disabled={busy} aria-pressed={enabled}>
          <span className="settings-toggle-thumb" />
        </button>
      </div>

      {enabled && (
        <>
          <div className="settings-divider" />

          <Row
            label={t('npMoves')}
            hint={t('npMovesHint')(prefs.movePct)}
            on={prefs.moves}
            onToggle={() => updatePref({ moves: !prefs.moves }, 'push_pref_moves')}
          />

          {prefs.moves && (
            <div className="settings-row">
              <div className="settings-label"><span>{t('npThreshold')}</span></div>
              <div className="settings-chips">
                {MOVE_STEPS.map(pct => (
                  <button key={pct}
                    className={`settings-chip ${prefs.movePct === pct ? 'active' : ''}`}
                    onClick={() => updatePref({ movePct: pct }, 'push_pref_threshold')}>
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="settings-divider" />
          <Row
            label={t('npLevels')}
            hint={t('npLevelsHint')}
            on={prefs.levels}
            onToggle={() => updatePref({ levels: !prefs.levels }, 'push_pref_levels')}
          />

          <div className="settings-divider" />
          <Row
            label={t('npNews')}
            hint={t('npNewsHint')}
            on={prefs.news}
            onToggle={() => updatePref({ news: !prefs.news }, 'push_pref_news')}
          />

          <div className="settings-divider" />
          <Row
            label={t('npDigest')}
            hint={t('npDigestHint')}
            on={prefs.digest}
            onToggle={() => updatePref({ digest: !prefs.digest }, 'push_pref_digest')}
          />

          <div className="settings-divider" />
          <Row
            label={t('npRetention')}
            hint={t('npRetentionHint')}
            on={prefs.retention}
            onToggle={() => updatePref({ retention: !prefs.retention }, 'push_pref_retention')}
          />

          <div className="settings-divider" />
          <Row
            label={t('npFeatures')}
            hint={t('npFeaturesHint')}
            on={prefs.features}
            onToggle={() => updatePref({ features: !prefs.features }, 'push_pref_features')}
          />

          {status && <PushStatusLine status={status} repair={repair} />}
      {status?.found && <TestSend />}

          <div className="settings-hint" style={{ marginTop: '0.6rem' }}>{t('npPrivacy')}</div>
        </>
      )}

      {error && <div className="settings-hint" style={{ color: BAD, marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
