import { useState } from 'react'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { getAlarmPrefs, setAlarmPrefs } from '../alarm'
import './ProAlerts.css'

// The WalletLens alarm's two settings, full-screen and sound, as one card.
// Every alert rings through the same alarm (price alerts, chart signals,
// portfolio goals), so the same card sits on the Price Alerts tab and on
// Signals & goals. Both read and write the one saved setting.
export default function AlarmSettings({ onTest, onChange }) {
  const { t } = useLanguage()
  const [prefs, setPrefs] = useState(getAlarmPrefs)
  const setPref = (k, v) => { const p = setAlarmPrefs({ [k]: v }); setPrefs(p); onChange?.(p); track('alarm_pref', { [k]: v }) }

  const toggle = (k, label, sub, disabled) => (
    <div className={`pra-set${disabled ? ' off' : ''}`}>
      <div className="pra-set-t"><b>{label}</b><small>{sub}</small></div>
      <button type="button" role="switch" aria-checked={!!prefs[k]} aria-label={label} disabled={disabled}
        className={`pra-switch${prefs[k] ? ' on' : ''}`} onClick={() => setPref(k, !prefs[k])}><span /></button>
    </div>
  )

  return (
    <section className="pra-form pra-settings" aria-label={t('alSettings')}>
      <h4 className="pra-h">{t('alSettings')}</h4>
      {toggle('fullscreen', t('alFullscreen'), t('alFullscreenSub'))}
      {toggle('sound', t('alSound'), t('alSoundSub'), !prefs.fullscreen)}
      {onTest && (
        <div className="pra-actions">
          <button type="button" className="pra-test" onClick={onTest} disabled={!prefs.fullscreen}>{t('alTest')}</button>
        </div>
      )}
    </section>
  )
}
