import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'
import Icon from '../components/Icon'
import { BiometricToggle } from '../components/BiometricLock'
import { applySettings as _applySettings } from '../settingsUtils'
import { useTheme, THEMES as COLOR_THEMES } from '../ThemeContext'
import { useLanguage, LANGUAGES } from '../LanguageContext'
import InstallExtension from '../components/InstallExtension'
import InterestPicker from '../components/InterestPicker'
import WeeklyEmailSignup from '../components/WeeklyEmailSignup'
import DriveBackup from '../components/DriveBackup'
import { isAndroidTWA } from '../nativeBridge'
import { requestReviewNow, reviewDiagnostics } from '../reviewPrompt'
import { pulseSettings, setPulseSettings } from '../marketPulseRuntime'
import { widgetSyncDiagnostics, forceSyncWidgets } from '../nativeWidgets'

const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '')

/** Plain-English version of the last sync attempt, for the Settings row. */
function widgetStatusText({ diag, hasPayload, lastSync }, t) {
  if (lastSync) {
    const mins = Math.round((Date.now() - lastSync) / 60000)
    return mins < 1 ? t('wgJustNow') : t('wgMinsAgo')(mins)
  }
  if (!diag) return t(hasPayload ? 'wgReady' : 'wgOpenDash')
  switch (diag.result) {
    case 'no-holdings': return t('wgNoHoldings')
    case 'not-twa':     return t('wgNotApp')
    case 'no-payload':  return t('wgOpenDash')
    case 'throttled':   return t('wgWaiting')
    case 'threw':       return t('wgFailed')
    default:            return t('wgNotSent')
  }
}

// Same job as widgetStatusText: the automatic rating card is invisible when it
// doesn't fire, and Play deliberately never says whether it showed one. This
// line is the only place a user — or we — can see which rule is still open.
function reviewStatusText(d, t) {
  if (!d) return ''
  if (d.pendingAsk) return t('rvPending')
  switch (d.blockedBy) {
    case 'friction':   return t('rvQuiet')
    case 'max-asks':   return t('rvDone')
    case 'recent-ask': return t('rvAsked')
    case 'few-opens':  return t('rvOpens')(d.opensLeft)
    case 'too-new':    return t('rvDays')(d.daysLeft)
    default:           return t('rvReady')
  }
}

const SETTINGS_KEY = 'wl_settings'

const FONT_SIZES = [
  { id: 'sm',  labelKey: 'setSizeSmall',  size: '14px' },
  { id: 'md',  labelKey: 'setSizeMedium', size: '16px' },
  { id: 'lg',  labelKey: 'setSizeLarge',  size: '18px' },
]

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } catch { return {} }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

export { applySettings } from '../settingsUtils'

export default function Settings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(loadSettings)
  const { theme: colorTheme, mode: colorMode, setTheme: setColorTheme, setMode: setColorMode } = useTheme()
  const { lang, setLang, t } = useLanguage()
  useEffect(() => { track('settings_view') }, [])

  function update(key, val) {
    const next = { ...settings, [key]: val }
    setSettings(next)
    saveSettings(next)
    _applySettings()
    track('settings_change', { key, val })
  }

  const fontSize = settings.fontSize || 'md'
  const hideValues  = settings.hideValues  ?? false
  const [editInterests, setEditInterests] = useState(false)
  const [wdiag, setWdiag] = useState(() => widgetSyncDiagnostics())
  const [pulse, setPulse] = useState(() => pulseSettings())
  const [rdiag] = useState(() => reviewDiagnostics())

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          {t('back')}
        </button>
        <h2 style={{ margin:0, fontSize:'1.2rem', display:'inline-flex', alignItems:'center', gap:'0.45rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          {t('settingsNav')}
        </h2>
      </div>

      {/* ── Browser extension ── */}
      <InstallExtension variant="banner" source="settings" style={{ marginBottom: '1rem' }} />

      {/* ── Appearance ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="sliders" size={16} />{t('setAppearance')}</h3>

        {/* Color Theme */}
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.6rem' }}>
          <div className="settings-label">
            <span>{t('setColorTheme')}</span>
            <span className="settings-hint">{t('setColorThemeHint')}</span>
          </div>
          <div className="settings-chips" style={{ flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-start' }}>
            {COLOR_THEMES.map(th => (
              <button key={th.id}
                className={`settings-chip ${colorTheme === th.id ? 'active' : ''}`}
                onClick={() => { setColorTheme(th.id); track('theme_changed', { theme: th.id, source: 'settings' }) }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="settings-chip-swatch" style={{
                  background: `radial-gradient(circle at 35% 35%, ${th.light}, ${th.swatch})`,
                  border: colorTheme === th.id ? '2px solid white' : '2px solid transparent',
                  fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', padding: 0,
                }}>
                  {th.logo
                    ? <img src={th.logo} alt={th.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : null}
                </span>
                {th.name}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider"/>

        {/* Light / Dark mode */}
        <div className="settings-row">
          <div className="settings-label">
            <span>{t('setMode')}</span>
            <span className="settings-hint">{t('setModeHint')}</span>
          </div>
          <div className="settings-chips">
            {[{ id: 'dark', labelKey: 'modeDark', icon: 'moon' }, { id: 'light', labelKey: 'modeLight', icon: 'sun' }].map(m => (
              <button key={m.id}
                className={`settings-chip ${colorMode === m.id ? 'active' : ''}`}
                onClick={() => { setColorMode(m.id); track('mode_changed', { mode: m.id, source: 'settings' }) }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Icon name={m.icon} size={15} />
                {t(m.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider"/>

        {/* Language. Onboarding also asks, but it only ever runs once — and on
            Android the "already welcomed" flag lives in Chrome's storage for
            walletlens.live, so reinstalling the app does not replay it. Without
            this row an existing user has no way to reach the other languages. */}
        <div className="settings-row">
          <div className="settings-label">
            <span>{t('setLanguage')}</span>
            <span className="settings-hint">{t('setLanguageHint')}</span>
          </div>
          <div className="settings-chips">
            {LANGUAGES.map(l => (
              <button key={l.code}
                lang={l.code}
                dir={l.rtl ? 'rtl' : 'ltr'}
                aria-label={l.label}
                className={`settings-chip ${lang === l.code ? 'active' : ''}`}
                onClick={() => { setLang(l.code); track('language_changed', { lang: l.code, source: 'settings' }) }}>
                <span aria-hidden="true" style={{ marginInlineEnd: '0.35rem' }}>{l.flag}</span>
                {l.native}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider"/>

        <div className="settings-row">
          <div className="settings-label">
            <span>{t('setFontSize')}</span>
            <span className="settings-hint">{t('setFontSizeHint')}</span>
          </div>
          <div className="settings-chips">
            {FONT_SIZES.map(f => (
              <button key={f.id}
                className={`settings-chip ${fontSize === f.id ? 'active' : ''}`}
                onClick={() => update('fontSize', f.id)}>
                {t(f.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider"/>

        <div className="settings-row settings-row-toggle">
          <div className="settings-label">
            <span>{t('setHideValues')}</span>
            <span className="settings-hint">{t('setHideValuesHint')}</span>
          </div>
          <button className={`settings-toggle ${hideValues ? 'on' : ''}`} onClick={() => update('hideValues', !hideValues)}>
            <span className="settings-toggle-thumb"/>
          </button>
        </div>

        <div className="settings-divider"/>

        <div className="settings-row">
          <div className="settings-label">
            <span>{t('setInterests')}</span>
            <span className="settings-hint">{t('setInterestsHint')}</span>
          </div>
          <button className="settings-chip" onClick={() => { setEditInterests(true); track('interests_edit_open', { source: 'settings' }) }}
            style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem' }}>
            <Icon name="edit" size={14} /> {t('setEdit')}
          </button>
        </div>
      </div>

      {/* ── Weekly Report ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="mail" size={16} />{t('setWeeklyReport')}</h3>
        <WeeklyEmailSignup source="settings" />
      </div>

      {/* ── Security ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="lock" size={16} />{t('setSecurity')}</h3>
        <BiometricToggle />
      </div>

      {/* ── Market Pulse ── Off by default. A finance app that makes noise
           nobody asked for only gets to do it once. */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="bell" size={16} />{t('setPulse')}</h3>
        <div className="settings-row">
          <div className="settings-label">
            <span>{t('setPulseSound')}</span>
            <span className="settings-hint">{t('setPulseHint')}</span>
          </div>
          <button className={`settings-chip ${pulse.enabled ? 'active' : ''}`}
            onClick={() => {
              const next = setPulseSettings({ enabled: !pulse.enabled })
              setPulse(next)
              track('market_pulse_toggle', { on: next.enabled })
            }}
            style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem' }}>
            {pulse.enabled ? t('setPulseOn') : t('setPulseOff')}
          </button>
        </div>

        {pulse.enabled && (
          <>
            <div className="settings-divider"/>
            <div className="settings-row">
              <div className="settings-label">
                <span>{t('setPulseHaptics')}</span>
                <span className="settings-hint">{t('setPulseHapticsHint')}</span>
              </div>
              <button className={`settings-chip ${pulse.haptics ? 'active' : ''}`}
                onClick={() => setPulse(setPulseSettings({ haptics: !pulse.haptics }))}>
                {pulse.haptics ? t('setPulseOn') : t('setPulseOff')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Rate the app ── Android only: this opens Play's own review card,
           which does not exist on the web. */}
      {isAndroidTWA() && (
        <div className="settings-section glass-card">
          <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="star" size={16} />{t('setRate')}</h3>
          <div className="settings-row">
            <div className="settings-label">
              <span>{t('setReview')}</span>
              <span className="settings-hint">{t('setReviewHint')}</span>
              <span className="settings-hint">{reviewStatusText(rdiag, t)}</span>
            </div>
            <button className="settings-chip"
              onClick={() => { track('rate_app_click', { source: 'settings' }); requestReviewNow('settings') }}
              style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem' }}>
              <Icon name="star" size={14} /> {t('setRate')}
            </button>
          </div>
        </div>
      )}

      <DriveBackup />

      {/* ── Home screen widgets ── Android only, and deliberately NOT gated on
           isAndroidTWA(): if detection is what's broken, hiding the panel
           behind it would hide the one readout that says so. There is no
           logcat on a user's phone and the sync intent fails silently by
           design, so this is how a stuck widget gets explained. */}
      {isAndroid && (
        <div className="settings-section glass-card">
          <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="grid" size={16} />{t('setWidgets')}</h3>

          <div className="settings-row">
            <div className="settings-label">
              <span>{t('setStatus')}</span>
              <span className="settings-hint">{widgetStatusText(wdiag, t)}</span>
            </div>
            <button className="settings-chip"
              onClick={() => {
                track('widget_sync_manual', { source: 'settings' })
                forceSyncWidgets()
                setWdiag(widgetSyncDiagnostics())
              }}
              style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem' }}>
              <Icon name="refresh" size={14} /> {t('setSyncNow')}
            </button>
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <span>{t('setRunningAsApp')}</span>
              <span className="settings-hint">
                {wdiag.twa ? t('setYes') : t('setNotApp')}
              </span>
            </div>
          </div>
        </div>
      )}

      {editInterests && (
        <InterestPicker
          editMode
          onDone={() => setEditInterests(false)}
          onClose={() => setEditInterests(false)}
        />
      )}
    </div>
  )
}
