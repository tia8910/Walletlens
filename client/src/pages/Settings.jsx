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
import PushToggle from '../components/PushToggle'
import ZakatNotifyToggle from '../components/ZakatNotifyToggle'
import WeeklyEmailSignup from '../components/WeeklyEmailSignup'
import DriveBackup from '../components/DriveBackup'
import DeviceVault from '../components/DeviceVault'
import { isAndroidTWA } from '../nativeBridge'
import { effectSettings, setEffectSettings, primeEffectAudio } from '../screenEffectsRuntime'
import { widgetSyncDiagnostics, forceSyncWidgets } from '../nativeWidgets'

// Android by user-agent, OR the app told us so. The widgets panel is the one
// readout that explains a stuck widget, and gating it on the UA alone meant it
// disappeared in exactly the case it exists to diagnose — a UA with no Android
// token, which is also what makes isAndroidTWA() give up.
const isAndroid = (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || ''))
  || isAndroidTWA()

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
  const { theme: colorTheme, mode: colorMode, intensity: colorIntensity,
          setTheme: setColorTheme, setMode: setColorMode, setIntensity: setColorIntensity } = useTheme()
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
  const [fx, setFx] = useState(() => effectSettings())

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

        {/* Colorful mode. Off is the default and leaves the app exactly as it
            is; on, every surface is repainted from the theme chosen above, so
            this row belongs directly under the theme it takes its colour from. */}
        <div className="settings-row">
          <div className="settings-label">
            <span>{t('setColorful')}</span>
            <span className="settings-hint">{t('setColorfulHint')}</span>
          </div>
          <div className="settings-chips">
            {[{ id: 'refined', labelKey: 'colorfulOff', icon: 'circle' },
              { id: 'colorful', labelKey: 'colorfulOn', icon: 'palette' }].map(x => (
              <button key={x.id}
                className={`settings-chip ${colorIntensity === x.id ? 'active' : ''}`}
                onClick={() => { setColorIntensity(x.id); track('intensity_changed', { intensity: x.id, source: 'settings' }) }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Icon name={x.icon} size={15} />
                {t(x.labelKey)}
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
        <div className="settings-row settings-row-stack">
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

      {/* ── Notifications ── The push section was written but never rendered,
           so the whole server-push feature was unreachable from the UI. */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="bell" size={16} />{t('setNotifs')}</h3>
        <PushToggle />
      </div>

      {/* ── Zakat ── Its own section rather than a row inside Notifications,
           because the per-channel rows there are hidden behind
           SHOW_CHANNEL_DETAIL: a zakat toggle living among them would exist
           and be unreachable. ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="crescent" size={16} />{t('setZakat')}</h3>
        <ZakatNotifyToggle />
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

      {/* ── Portfolio Guardian ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          {t('setGuardian')}
        </h3>
        <div className="settings-row">
          <div className="settings-label">
            <span>{t('setGuardian')}</span>
            <span className="settings-hint">{t('setGuardianDesc')}</span>
          </div>
          <button
            className={`settings-toggle ${(() => { try { return !!JSON.parse(localStorage.getItem('wl_guardian') || 'null')?.email } catch { return false } })() ? 'on' : ''}`}
            onClick={() => {
              track('guardian_toggle_click', { source: 'settings' })
              navigate('/guardian')
            }}>
            <span className="settings-toggle-thumb"/>
          </button>
        </div>
      </div>

      {/* ── Screen effects ── On by default, unlike the sound-only feature
           this replaced. Three occasions a day at most, and the picture is the
           point; the sound is the part that gets its own switch. */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="bell" size={16} />{t('setFx')}</h3>
        <div className="settings-row">
          <div className="settings-label">
            <span>{t('setFx')}</span>
            <span className="settings-hint">{t('setFxHint')}</span>
          </div>
          <button className={`settings-chip ${fx.enabled ? 'active' : ''}`}
            onClick={() => {
              const next = setEffectSettings({ enabled: !fx.enabled })
              setFx(next)
              track('screen_effects_toggle', { on: next.enabled })
            }}
            style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem' }}>
            {fx.enabled ? t('commonOn') : t('commonOff')}
          </button>
        </div>

        {fx.enabled && (
          <>
            <div className="settings-divider"/>
            <div className="settings-row">
              <div className="settings-label">
                <span>{t('setFxSound')}</span>
                <span className="settings-hint">{t('setFxSoundHint')}</span>
              </div>
              <button className={`settings-chip ${fx.sound ? 'active' : ''}`}
                onClick={() => {
                  const next = setEffectSettings({ sound: !fx.sound })
                  setFx(next)
                  // Turning sound ON is a tap, which is the only moment a
                  // browser will let the audio context start. Doing it here
                  // means the next effect is audible instead of held.
                  if (next.sound) { try { primeEffectAudio() } catch {} }
                  track('screen_effects_sound', { on: next.sound })
                }}>
                {fx.sound ? t('commonOn') : t('commonOff')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* The Rate section that stood here is gone, by product decision.
           Play's card now arrives on its own or not at all.

           maybeAskForReview still runs from the dashboard — 18s after load and
           every 90s after — so the automatic path is untouched; only the manual
           entry point is. Someone who wants to rate without being asked uses
           the Play listing, which is where a rating is left anyway.

           Worth knowing what left with it: this section carried the only
           readout of Play's own answer (installer package, last outcome).
           ReviewGate still RECORDS both, so they survive in logcat and can be
           resurfaced anywhere — but nothing in the UI shows them now, so
           "the card did not appear" is once again a question without a
           visible answer. That is the accepted cost of the removal. */}

      <DriveBackup />

      {/* ── The app's own copy of the portfolio ──
           Android only. Same reasoning as the widgets panel below: NOT gated
           on isAndroidTWA(), because if detection is what is broken this is
           the readout that says so. */}
      {isAndroid && <DeviceVault />}

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
