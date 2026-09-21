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

/**
 * Whether Settings shows the TEST SEND button.
 *
 * It was briefly exposed to verify delivery through the move from Deno Deploy
 * to Cloudflare Workers, where a stored, valid, completely undeliverable
 * subscription was a real possibility and nothing on screen could tell it from
 * a quiet market. That question is settled, and a button whose only job is
 * answering it does not need to sit in front of every user forever.
 *
 * What answers it now, without the button: the status line's warnings, and the
 * push worker's own GET /health, which reports whether VAPID is configured and
 * which public key it holds — enough to catch a key mismatch, the failure that
 * motivated exposing the button in the first place.
 */
const SHOW_TEST_SEND = false

/**
 * The per-channel controls used to be hidden behind the same flag, on the
 * reasoning that seven rows and a sensitivity picker is a lot of surface for a
 * decision most people make once, as "yes, notify me".
 *
 * That reasoning survives; hiding them outright does not. There are eleven
 * channels now, several of them about topics rather than prices, and a user
 * who wants the hacks but not the win-back nudges had no way to say so — nor
 * any way to see that the choice existed. Worse, the sensitivity picker is the
 * single most useful control on this screen and it was unreachable: someone
 * getting too few alerts could not turn the threshold down.
 *
 * So the rows are behind a disclosure, closed by default. Shut, this screen is
 * exactly what it was: one switch, with every channel running on its default —
 * moves at 1%, round levels, news, market news, the morning brief, the daily
 * portfolio read, the Academy challenge, investment hacks, win-back nudges,
 * feature tips and zakat reminders all ON. Open, every one of them is
 * switchable. The fiddling the flag was meant to prevent now costs one
 * deliberate tap, which is the right price for it.
 */

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

// What to say when this device is not set up yet. `repair` is the outcome of
// ensureRegistered(): null while it is still running, otherwise its result.
//
// Every reason resolves to one of three things a reader can actually do: wait,
// flip the switch, or change a browser permission. The distinctions below that
// are real, and they are logged, but they are not choices anyone is being
// asked to make, so the screen does not put them there.
const RECONNECT = 'This device needs to reconnect. Turn the switch off, then on again.'
const OFFLINE = 'Notifications are offline right now. WalletLens will try again shortly.'

function repairMessage(repair) {
  if (!repair) return { text: 'Finishing setup.', tone: WARN }
  switch (repair.reason) {
    case 'opted-out':
      return { text: 'Notifications are switched off for this device. Turn the switch on to restore them.', tone: BAD }
    case 'not-granted':
      return { text: 'Allow notifications for WalletLens in your browser settings, then reopen this screen.', tone: BAD }
    case 'no-key':
      return { text: 'Notifications will be available after the next update.', tone: BAD }
    case 'status-unreachable':
    case 'status-http':
    case 'subscribe-unreachable':
      return { text: OFFLINE, tone: WARN }
    case 'endpoint-rejected':
      return { text: 'This browser cannot receive notifications. Open WalletLens in Chrome to switch them on.', tone: BAD }
    case 'rejected':
      if (repair.code === 'invalid_endpoint') {
        return { text: 'This browser cannot receive notifications. Open WalletLens in Chrome to switch them on.', tone: BAD }
      }
      return { text: RECONNECT, tone: BAD }
    case 'no-subscription':
    case 'key-rotated':
    case 'error':
      return { text: RECONNECT, tone: BAD }
    default:
      return { text: 'Finishing setup.', tone: WARN }
  }
}

// Why this device's status could not be read. Two answers: something on our
// side, or a connection that is not there yet. A status code tells a reader
// nothing they can use, so it stays out of the copy and in the logs.
const SERVER_FAULTS = new Set(['store_unavailable', 'server_error', 'client_error'])

function faultMessage(fault) {
  if (SERVER_FAULTS.has(fault)) {
    return { text: 'Notifications are temporarily unavailable. Nothing to fix on your side.', tone: BAD }
  }
  return { text: OFFLINE, tone: WARN }
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
    const { text, tone } = faultMessage(status.serverFault)
    return <div className="settings-hint" style={{ marginTop: '0.5rem', color: tone }}>{text}</div>
  }
  if (status.found === false) {
    const { text, tone } = repairMessage(repair)
    return <div className="settings-hint" style={{ marginTop: '0.5rem', color: tone }}>{text}</div>
  }
  if (status.subscribed === false) {
    // The switch reads On and there is no address to send to. In the app that
    // means the OS granted the permission but no FCM token ever reached the
    // server; in a browser, that the subscription is gone. Either way the
    // server has nothing to deliver to, and this rendered NOTHING before —
    // the most misleading state the card has, shown as a blank.
    return (
      <div className="settings-hint" style={{ marginTop: '0.5rem', color: BAD }}>
        This device is not set up for notifications yet. Turn the switch off,
        then on again to finish.
      </div>
    )
  }
  if (!status.found) return null

  // The states that produce total silence while everything looks correct.
  const noWatch = status.watch === 0
  const keyOk = vapidKeyMatches(status.vapidKey)

  // The summary renders whether or not anything is wrong, and nothing gates it.
  //
  // Something used to. Behind the old channel-detail flag, the one line that
  // says what the server actually holds for this device — how many assets it
  // watches, how many targets, how many notifications it has sent today — was
  // never drawn for anyone. A user whose channels were silent had nothing to
  // read, and neither did we: diagnosing it meant asking them to check a line
  // that does not exist.
  //
  // The widgets panel in Settings already states the principle — "deliberately
  // NOT gated: if detection is what's broken, hiding the panel behind it would
  // hide the one readout that says so" — and it applies at least as strongly
  // here, where the failure mode is silence and there is nothing else to look
  // at. That is also why the channel rows are now a disclosure rather than a
  // build-time const: a control nobody can reach is a control that does not
  // exist.
  return (
    <div className="settings-hint" style={{ marginTop: '0.5rem', lineHeight: 1.6 }}>
      <div>
        Watching <strong>{status.watch}</strong> {status.watch === 1 ? 'asset' : 'assets'}
        {status.alerts > 0 && <> · <strong>{status.alerts}</strong> price {status.alerts === 1 ? 'target' : 'targets'}</>}
        {' · '}<strong>{status.sentToday}</strong> sent today
      </div>
      {status.vapid === false && (
        <div style={{ color: BAD }}>
          Notifications are temporarily unavailable. Nothing to fix on your side.
        </div>
      )}
      {keyOk === false && (
        <div style={{ color: BAD }}>{RECONNECT}</div>
      )}
      {noWatch && (
        <div style={{ color: BAD }}>
          No assets are being watched yet, so price and news alerts stay quiet.
          Open the Dashboard once to sync your holdings.
        </div>
      )}
      {/* A refused delivery is not shown.
          It read as "notifications are broken" to someone who had eleven
          arrive the same day: lastError is cleared by the next SUCCESSFUL
          send, so a quiet afternoon leaves the last failure on screen long
          after it stopped meaning anything. The server still records it, and
          /status still returns it in full for anyone diagnosing a device. It
          is simply not a sentence a user can act on. */}
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
 * registered, watched and every switch on, while the push service
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
  // Closed by default: the common case for this screen is "yes, notify me",
  // and eleven rows in front of that is the surface the old flag was hiding
  // from. Opening it is one tap, and it stays open for the visit.
  // The per-channel list is hidden.
  //
  // Eleven toggles, every one of them on by default, is a wall of switches
  // between the user and a feature they have just turned on — and each one is
  // an invitation to switch off a channel before ever seeing what it sends.
  // The single Push notifications toggle is the decision that matters; the
  // preferences behind it keep their defaults and still travel to the server
  // with every registration, so nothing about the delivery side changes.
  //
  // Kept rather than deleted: the rows, their copy in six languages and the
  // prefs they write are all still correct, and this is the one line to flip
  // if per-channel control is ever wanted back.
  const SHOW_CHANNELS = false
  const [channelsOpen, setChannelsOpen] = useState(false)

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
          <span>{t('npTitle')} {enabled && <span style={{ color: 'var(--g-ink)' }}>· {t('commonOn')}</span>}</span>
          <span className="settings-hint">{t('npHint')}</span>
        </div>
        <button className={`settings-toggle ${enabled ? 'on' : ''}`} onClick={toggle} disabled={busy} aria-pressed={enabled}>
          <span className="settings-toggle-thumb" />
        </button>
      </div>

      {enabled && SHOW_CHANNELS && (
        <>
          <div className="settings-divider" />
          <button
            type="button"
            className="settings-row settings-row-toggle np-channels-summary"
            aria-expanded={channelsOpen}
            onClick={() => setChannelsOpen(o => !o)}
          >
            <div className="settings-label">
              <span>{t('npChannels')}</span>
              <span className="settings-hint">{t('npChannelsHint')}</span>
            </div>
            <span className="np-channels-chevron" aria-hidden="true">{channelsOpen ? '▲' : '▼'}</span>
          </button>

          {channelsOpen && (
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
              label={t('npNewsMarket')}
              hint={t('npNewsMarketHint')}
              on={prefs.newsMarket}
              onToggle={() => updatePref({ newsMarket: !prefs.newsMarket }, 'push_pref_news_market')}
            />

            <div className="settings-divider" />
            <Row
              label={t('npPortfolio')}
              hint={t('npPortfolioHint')}
              on={prefs.portfolio}
              onToggle={() => updatePref({ portfolio: !prefs.portfolio }, 'push_pref_portfolio')}
            />

            <div className="settings-divider" />
            <Row
              label={t('npAcademy')}
              hint={t('npAcademyHint')}
              on={prefs.academy}
              onToggle={() => updatePref({ academy: !prefs.academy }, 'push_pref_academy')}
            />

            <div className="settings-divider" />
            <Row
              label={t('npHacks')}
              hint={t('npHacksHint')}
              on={prefs.hacks}
              onToggle={() => updatePref({ hacks: !prefs.hacks }, 'push_pref_hacks')}
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

            <div className="settings-divider" />
            <Row
              label={t('npZakat')}
              hint={t('npZakatHint')}
              on={prefs.zakat}
              onToggle={() => updatePref({ zakat: !prefs.zakat }, 'push_pref_zakat')}
            />
            </>
          )}
        </>
      )}

      {/*
        OUTSIDE the SHOW_CHANNELS gate, and that is the entire point.

        This block used to sit inside it. SHOW_CHANNELS has been false since
        the eleven per-channel switches were retired, so the one line that
        says what the server actually holds for this device — its watch
        count, its targets, how many notifications it has had today, and why
        the last one was refused — was never drawn on any device, ever.

        The line's own comment claimed "nothing gates it". Something did: the
        wrapper two hundred lines above it, whose name says channels and
        whose reach was the whole card. A diagnostic nobody can see is worth
        less than no diagnostic, because it is quietly counted as evidence.
      */}
      {enabled && status && <PushStatusLine status={status} repair={repair} />}
      {SHOW_TEST_SEND && status?.found && <TestSend />}

      {enabled && <div className="settings-hint" style={{ marginTop: '0.6rem' }}>{t('npPrivacy')}</div>}

      {error && <div className="settings-hint" style={{ color: BAD, marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
