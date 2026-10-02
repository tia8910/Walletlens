import { useZakatOn, setZakatOn } from '../zakatSwitch'
import { setPushPrefs } from '../push'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import ZakatNotifyToggle from './ZakatNotifyToggle'

// Settings → Zakat. The master switch for the whole feature; the reminder
// switch lives under it and only makes sense while zakat is on.
export function ZakatSettings() {
  const { t } = useLanguage()
  const on = useZakatOn()
  function flip() {
    const next = !on
    setZakatOn(next)
    track(next ? 'zakat_on' : 'zakat_off', { source: 'settings' })
    // Off means off: no reminder for a feature that is no longer shown.
    if (!next) setPushPrefs({ zakat: false }).catch(() => {})
  }
  return (
    <div>
      <div className="settings-row settings-row-toggle">
        <div className="settings-label">
          <span>{t('zkShow')}</span>
          <span className="settings-hint">{t('zkShowHint')}</span>
        </div>
        <button className={`settings-toggle ${on ? 'on' : ''}`} onClick={flip} aria-pressed={on} aria-label={t('zkShow')}>
          <span className="settings-toggle-thumb" />
        </button>
      </div>
      {on && <ZakatNotifyToggle />}
    </div>
  )
}

// The dashboard's zakat tab, for a link that arrives while the feature is
// off: say so and offer the switch, rather than a calculator nobody asked for.
export function ZakatGate({ children }) {
  const { t } = useLanguage()
  const on = useZakatOn()
  if (on) return children
  return (
    <div className="glass-card" style={{ padding: '1.4rem 1.25rem', textAlign: 'center' }}>
      <h3 style={{ margin: '0 0 0.4rem' }}>{t('zkTitle')}</h3>
      <p className="settings-hint" style={{ margin: '0 0 1rem' }}>{t('zkOffHint')}</p>
      <button className="dvx-btn-primary" onClick={() => { setZakatOn(true); track('zakat_on', { source: 'dashboard' }) }}>{t('zkTurnOn')}</button>
    </div>
  )
}
