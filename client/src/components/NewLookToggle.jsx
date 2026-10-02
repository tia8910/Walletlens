import { useNewLook, setNewLook } from '../newLook'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'

// Settings → Appearance: switch the light card redesign on or off.
export default function NewLookToggle() {
  const { t } = useLanguage()
  const on = useNewLook()
  return (
    <div className="settings-row settings-row-toggle">
      <div className="settings-label">
        <span>{t('lookTry')}</span>
        <span className="settings-hint">{t('lookTryHint')}</span>
      </div>
      <button className={`settings-toggle ${on ? 'on' : ''}`} aria-pressed={on} aria-label={t('lookTry')}
        onClick={() => { setNewLook(!on); track(on ? 'new_look_off' : 'new_look_on', { source: 'settings' }) }}>
        <span className="settings-toggle-thumb" />
      </button>
    </div>
  )
}
