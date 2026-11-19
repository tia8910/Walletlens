import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import { subscribeAlarms, clearAlarm, deliverAlarm, dismissNative, playAlarmFile, stopAlarmFile, vibrateAlarm, stopVibration } from '../alarm'
import './AlarmOverlay.css'

// The alarm, full screen: when an alert fires while the app is open, this
// takes the screen with the alert's own sound, colour and vibration, and
// rings again every few seconds until it is snoozed or dismissed (for at
// most a minute and a half, so a phone left on a desk does not ring all
// night). Snooze brings it back in ten minutes.

export const RING_EVERY_MS = 4000
export const RING_FOR_MS = 90_000
export const SNOOZE_MS = 10 * 60_000

const KIND_LABEL = { price: 'alKindPrice', buy: 'alKindBuy', sell: 'alKindSell', cross: 'alKindCross', rsi: 'alKindRsi', goal: 'alKindGoal' }

// One glyph per kind, drawn in the ring.
const GLYPH = {
  price: <path d="M12 3v18M17 7.5C17 5.6 14.8 4.5 12 4.5S7 5.6 7 7.6s2 2.8 5 3.4 5 1.6 5 3.6-2.2 3.4-5 3.4-5-1.2-5-3.1" />,
  buy: <path d="M4 17l6-6 4 4 6-8M14 7h6v6" />,
  sell: <path d="M4 7l6 6 4-4 6 8M14 17h6v-6" />,
  cross: <><path d="M3 17c5 0 6-10 18-10" /><path d="M3 7c6 0 8 10 18 10" /><circle cx="12" cy="12" r="1.8" /></>,
  rsi: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  goal: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" /></>,
}

export default function AlarmOverlay() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [alarm, setAlarm] = useState(null)
  const ringer = useRef(null)
  const dismissRef = useRef(null)

  useEffect(() => subscribeAlarms(setAlarm), [])

  // Ring now, then every few seconds, until acted on or the time is up.
  useEffect(() => {
    if (!alarm) return undefined
    const kind = alarm.kind || 'price'
    dismissRef.current?.focus()
    // The Android app's native alarm is already ringing: the card stays quiet.
    if (alarm.native) return undefined
    const ring = () => { if (alarm.sound !== false) playAlarmFile(alarm.tone); vibrateAlarm(kind) }
    ring()
    ringer.current = setInterval(ring, RING_EVERY_MS)
    const stop = setTimeout(() => clearInterval(ringer.current), RING_FOR_MS)
    return () => { clearInterval(ringer.current); clearTimeout(stop); stopVibration(); stopAlarmFile() }
  }, [alarm])

  useEffect(() => {
    if (!alarm) return undefined
    const onKey = (e) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [alarm]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!alarm) return null
  const kind = GLYPH[alarm.kind] ? alarm.kind : 'price'

  function dismiss() { track('alarm_dismissed', { kind }); dismissNative(alarm); clearAlarm() }
  function snooze() {
    track('alarm_snoozed', { kind })
    const again = { ...alarm, snoozed: true }
    dismissNative(alarm)
    clearAlarm()
    setTimeout(() => deliverAlarm(again), SNOOZE_MS)
  }
  function open() {
    track('alarm_opened', { kind })
    const url = alarm.url
    dismissNative(alarm)
    clearAlarm()
    if (url) navigate(url)
  }

  return createPortal(
    <div className={`alm alm-${kind}`} role="alertdialog" aria-modal="true" aria-labelledby="alm-title" aria-describedby="alm-body">
      <div className="alm-card">
        <div className="alm-ring" aria-hidden="true">
          <span className="alm-wave" /><span className="alm-wave alm-wave2" /><span className="alm-wave alm-wave3" />
          <svg viewBox="0 0 24 24">{GLYPH[kind]}</svg>
        </div>
        <p className="alm-kind">{t(KIND_LABEL[kind])}{alarm.snoozed ? ` · ${t('alSnoozedAgain')}` : ''}</p>
        <h2 id="alm-title" className="alm-title">{alarm.title}</h2>
        {alarm.body && <p id="alm-body" className="alm-body">{alarm.body}</p>}
        {alarm.price && <p className="alm-price">{alarm.price}</p>}
        <div className="alm-actions">
          {alarm.url && <button type="button" className="alm-btn alm-open" onClick={open}>{t('alOpen')}</button>}
          <button type="button" className="alm-btn alm-snooze" onClick={snooze}>{t('alSnooze')}</button>
          <button type="button" ref={dismissRef} className="alm-btn alm-dismiss" onClick={dismiss}>{t('alDismiss')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
