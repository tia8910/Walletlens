import { useState, useEffect } from 'react'
import {
  isPushSupported, isPushEnabled, enablePush, watchPermission,
  getPushPrefs, setPushPrefs,
} from '../push'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { loadDueDate } from '../zakat'
import { formatHijri, hijriSupported } from '../hijri'

// Settings → Zakat. One switch for the zakat reminder channel.
//
// The per-channel rows inside Notifications are hidden behind
// SHOW_CHANNEL_DETAIL, so a zakat toggle living there would exist and be
// unreachable. This is its own section for the same reason it has its own
// icon: someone looking for it is looking for zakat, not for a notifications
// preference three levels down.
//
// Turning it on ENABLES NOTIFICATIONS if they are off. A switch labelled
// "activate zakat reminders" that quietly sets a flag which cannot fire is a
// trap — the user would come back in a year having been told nothing.

export default function ZakatNotifyToggle() {
  const { t, lang } = useLanguage()
  const [supported] = useState(() => isPushSupported())
  const [enabled, setEnabled] = useState(false)
  const [prefs, setPrefs] = useState(() => getPushPrefs())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [due, setDue] = useState(() => loadDueDate())

  useEffect(() => {
    let alive = true
    isPushEnabled().then(v => { if (alive) setEnabled(v) }).catch(() => {})
    // The permission can change from outside the app — site settings, a long
    // press on a notification — so mirror it rather than trusting our copy.
    const stop = watchPermission(() => {
      isPushEnabled().then(v => { if (alive) setEnabled(v) }).catch(() => {})
    })
    return () => { alive = false; if (typeof stop === 'function') stop() }
  }, [])

  // The date is written by the calculator, so it can change while Settings is
  // open in another tab. Cheap to re-read on focus.
  useEffect(() => {
    const onFocus = () => setDue(loadDueDate())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  if (!supported) {
    return <div className="settings-hint" style={{ padding: '0.4rem 0' }}>{t('npUnsupported')}</div>
  }

  const on = enabled && prefs.zakat

  async function toggle() {
    if (busy) return
    setBusy(true); setError(null)
    try {
      if (on) {
        // Only ever switches this channel off. The master notification switch
        // is not this row's to flip — someone silencing zakat reminders has
        // not asked to stop hearing about their price targets.
        setPrefs(p => ({ ...p, zakat: false }))
        await setPushPrefs({ zakat: false }).catch(() => {})
        track('zakat_notify_off')
      } else {
        if (!enabled) {
          await enablePush()
          setEnabled(true)
          track('push_enabled', { source: 'zakat' })
        }
        setPrefs(p => ({ ...p, zakat: true }))
        await setPushPrefs({ zakat: true }).catch(() => {})
        track('zakat_notify_on')
      }
    } catch (e) {
      setError(e?.message || t('errGeneric'))
    } finally {
      setBusy(false)
    }
  }

  const dueDate = due ? new Date(`${due}T00:00:00Z`) : null
  const dateLine = dueDate && !Number.isNaN(dueDate.getTime())
    ? t('setZakatNext')(
      dueDate.toLocaleDateString(),
      hijriSupported() ? formatHijri(dueDate, { locale: lang }) : null,
    )
    : t('setZakatNoDate')

  return (
    <div>
      <div className="settings-row settings-row-toggle">
        <div className="settings-label">
          <span>{t('npZakat')}</span>
          <span className="settings-hint">{t('npZakatHint')}</span>
        </div>
        <button className={`settings-toggle ${on ? 'on' : ''}`} onClick={toggle}
          disabled={busy} aria-pressed={on} aria-label={t('npZakat')}>
          <span className="settings-toggle-thumb" />
        </button>
      </div>

      {/* What the reminder is actually pinned to. Without this the switch is a
          promise with no date behind it, and the date comes from the
          calculator rather than from here. */}
      <div className="settings-hint" style={{ marginTop: '0.45rem' }}>{dateLine}</div>

      {error && <div className="settings-hint" style={{ color: '#f87171', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
