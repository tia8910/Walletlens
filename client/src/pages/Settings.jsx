import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { track } from '../analytics'
import { BiometricToggle } from '../components/BiometricLock'
import { applySettings as _applySettings } from '../settingsUtils'
import { useTheme, THEMES as COLOR_THEMES } from '../ThemeContext'
import { useLanguage, LANGUAGES } from '../LanguageContext'
import { EXTENSION_URL } from '../components/InstallExtension'
import InterestPicker from '../components/InterestPicker'
import PushToggle from '../components/PushToggle'
import { ZakatSettings } from '../components/ZakatSwitch'
import LandingLink from '../components/LandingLink'
import WeeklyEmailSignup from '../components/WeeklyEmailSignup'
import BackupView from './BackupView'
import { PlayMark, PLAY_STORE_URL } from '../components/StoreBadges'
import { isMsStore } from '../msStore'
import DeviceVault from '../components/DeviceVault'
import { isAndroidTWA } from '../nativeBridge'
import { requestReviewNow, reviewStatusLine } from '../reviewPrompt'
import { effectSettings, setEffectSettings, primeEffectAudio } from '../screenEffectsRuntime'
import { looksEmpty } from '../nativeVault'
import { driveState, previouslyConnected, latestBackupAt } from '../driveSync'
import './Settings.css'

// Settings, grouped like a phone's own: a status card, then Appearance,
// Portfolio, Notifications, Privacy & security, Zakat and More. Every row is
// one label and one control. Theme, mode and text size open their own page
// (?view=appearance) so the main list stays short. A search box filters every
// row by what it says.

// Android by user-agent, OR the app told us so. Gating Android-only panels on
// the UA alone hid them on a UA with no Android token, which is also what
// makes isAndroidTWA() give up.
const MS_STORE_URL = 'https://apps.microsoft.com/detail/9pkvkn0p9dx2'
const isAndroid = (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || ''))
  || isAndroidTWA()

// The automatic rating card is invisible when it doesn't fire, and Play never
// says whether it showed one. The Rate row's hint is the only place a user, or
// we, can see which rule is still open.
const RATE_STATUS_KEY = {
  ready: 'rsReady', onboarding: 'rsOnboarding', friction: 'rsFriction',
  'few-opens': 'rsFewOpens', 'too-new': 'rsTooNew', 'recent-ask': 'rsRecent',
}

const SETTINGS_KEY = 'wl_settings'
const FONT_SIZES = [
  { id: 'sm', labelKey: 'setSizeSmall', short: 'S' },
  { id: 'md', labelKey: 'setSizeMedium', short: 'M' },
  { id: 'lg', labelKey: 'setSizeLarge', short: 'L' },
]

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } catch { return {} }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

export { applySettings } from '../settingsUtils'

// ── icons ──────────────────────────────────────────────────────────────────
const P = { fill: 'none', stroke: '#fff', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }
const ICONS = {
  text: <svg viewBox="0 0 24 24" {...P}><path d="M4 18L9 6l5 12M5.6 14h6.8M15 18l3-7.5 3 7.5M16 16h4"/></svg>,
  globe: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>,
  list: <svg viewBox="0 0 24 24" {...P}><path d="M4 7h16M4 12h16M4 17h10"/></svg>,
  eyeOff: <svg viewBox="0 0 24 24" {...P}><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.3 7.7C3.9 9.3 2.5 12 2.5 12s3.5 6 9.5 6a9.6 9.6 0 0 0 4-.9"/></svg>,
  cloud: <svg viewBox="0 0 24 24" {...P}><path d="M20 12a8 8 0 1 1-8-8"/><path d="M20 4v6h-6"/></svg>,
  bell: <svg viewBox="0 0 24 24" {...P}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>,
  mail: <svg viewBox="0 0 24 24" {...P}><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 8l9 6 9-6"/></svg>,
  spark: <svg viewBox="0 0 24 24" {...P}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></svg>,
  sound: <svg viewBox="0 0 24 24" {...P}><path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7"/></svg>,
  shield: <svg viewBox="0 0 24 24" {...P}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  windows: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 2h9.5v9.5H2z" fill="#f25022"/><path d="M12.5 2H22v9.5h-9.5z" fill="#7fba00"/><path d="M2 12.5h9.5V22H2z" fill="#00a4ef"/><path d="M12.5 12.5H22V22h-9.5z" fill="#ffb900"/></svg>,
  chrome: <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 24 4.95 13A22 22 0 0 1 43.05 13z" fill="#db4437"/><path d="M24 24 43.05 13A22 22 0 0 1 24 46z" fill="#ffcd40"/><path d="M24 24 24 46A22 22 0 0 1 4.95 13z" fill="#0f9d58"/><circle cx="24" cy="24" r="10" fill="#fff"/><circle cx="24" cy="24" r="8" fill="#4285f4"/></svg>,
  puzzle: <svg viewBox="0 0 24 24" {...P}><path d="M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4H4a2 2 0 1 1 0-4h2V6h4z"/></svg>,
  star: <svg viewBox="0 0 24 24" fill="#fff"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>,
  help: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg>,
}
const Chev = () => <svg className="sx-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
const LOGO = <svg viewBox="0 0 64 64" fill="none"><circle cx="27" cy="25" r="19" stroke="#4ade80" strokeWidth="5.5"/><rect x="14.5" y="26.5" width="5" height="7.5" rx="1.2" fill="#4ade80"/><rect x="21.5" y="21" width="5" height="13" rx="1.2" fill="#4ade80"/><rect x="28.5" y="15.5" width="5" height="18.5" rx="1.2" fill="#4ade80"/><line x1="13.5" y1="39" x2="4" y2="55" stroke="#4ade80" strokeWidth="5.5" strokeLinecap="round"/><circle cx="40.5" cy="11.5" r="3.8" fill="#4ade80"/></svg>

// A theme's own mark: its logo, or a cut gem for Emerald, which has none.
function ThemeMark({ th, className }) {
  return (
    <span className={className} style={{ background: `radial-gradient(circle at 35% 30%, ${th.light}, ${th.swatch})` }} aria-hidden="true">
      {th.logo
        ? <img src={th.logo} alt="" loading="lazy" decoding="async" />
        : <svg viewBox="0 0 40 40"><path d="M20 7l11 9-11 18L9 16z" fill="#047857" opacity=".85"/><path d="M9 16h22M15 16l5-9 5 9-5 18z" fill="none" stroke="#d1fae5" strokeWidth="1.6" strokeLinejoin="round"/></svg>}
    </span>
  )
}

// ── building blocks ─────────────────────────────────────────────────────────
const SearchCtx = createContext('')
const matches = (q, ...texts) => !q || texts.some(s => typeof s === 'string' && s.toLowerCase().includes(q))

function Toggle({ on, onClick, label }) {
  return (
    <button className={`sx-toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onClick}>
      <span />
    </button>
  )
}

function Row({ icon, color, title, hint, right, onClick, chevron }) {
  const body = (
    <>
      <span className="sx-ic" style={{ background: color }} aria-hidden="true">{icon}</span>
      <span className="sx-lb"><b>{title}</b>{hint && <small>{hint}</small>}</span>
      {right}
      {chevron && <Chev />}
    </>
  )
  return onClick
    ? <button className="sx-row sx-tap" onClick={onClick}>{body}</button>
    : <div className="sx-row">{body}</div>
}

/** A titled card of rows. Each item says what it is about, so search can keep or hide it. */
function Group({ title, items }) {
  const q = useContext(SearchCtx)
  const shown = items.filter(it => it && (matches(q, title, ...(it.terms || []))))
  if (!shown.length) return null
  return (
    <section className="sx-section">
      <h3 className="sx-gt">{title}</h3>
      <div className="sx-grp">{shown.map(it => <div key={it.key} className={it.embed ? 'sx-embed' : 'sx-item'}>{it.node}</div>)}</div>
    </section>
  )
}

function relTime(ts, lang) {
  if (!ts) return ''
  const s = (Date.now() - ts) / 1000
  try {
    const rtf = new Intl.RelativeTimeFormat(lang || 'en', { numeric: 'auto', style: 'short' })
    if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute')
    if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour')
    return rtf.format(-Math.round(s / 86400), 'day')
  } catch { return new Date(ts).toLocaleDateString() }
}

// ── the Appearance page ─────────────────────────────────────────────────────
function Appearance({ fontSize, setFontSize, onBack }) {
  const { theme, modePref, setTheme, setMode } = useTheme()
  const { t } = useLanguage()
  const modes = [
    { id: 'light', label: t('modeLight') },
    { id: 'dark', label: t('modeDark') },
    { id: 'auto', label: t('modeAuto') },
  ]
  const at = FONT_SIZES.findIndex(f => f.id === fontSize)
  return (
    <div className="page sx">
      <div className="sx-top">
        <button className="sx-back" onClick={onBack} aria-label={t('back')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h2 className="sx-subtitle">{t('setAppearance')}</h2>
      </div>

      <div className="sx-preview">
        <div className="sx-mini">
          <div className="sx-mini-h"><small>{t('sxNetWorth')}</small><b>$41,280.55</b></div>
          <div className="sx-mini-r"><img src={COLOR_THEMES.find(x => x.id === 'bitcoin').logo} alt="" />Bitcoin<span>+2.1%</span></div>
          <div className="sx-mini-r"><img src={COLOR_THEMES.find(x => x.id === 'gold').logo} alt="" />{t('catGold')}<span>+0.4%</span></div>
        </div>
        <p>{t('sxPreview')}</p>
      </div>

      <section className="sx-section">
        <h3 className="sx-gt">{t('setColorTheme')}</h3>
        <div className="sx-grp sx-tiles">
          {COLOR_THEMES.map(th => (
            <button key={th.id} className={`sx-tile${theme === th.id ? ' on' : ''}`} aria-pressed={theme === th.id}
              onClick={() => { setTheme(th.id); track('theme_changed', { theme: th.id, source: 'settings' }) }}>
              <ThemeMark th={th} className="sx-dot" />
              {t('themeNames')?.[th.id] || th.name}
            </button>
          ))}
        </div>
      </section>

      <section className="sx-section">
        <h3 className="sx-gt">{t('setMode')}</h3>
        <div className="sx-grp sx-tiles">
          {modes.map(m => (
            <button key={m.id} className={`sx-tile sx-mode${modePref === m.id ? ' on' : ''}`} aria-pressed={modePref === m.id}
              onClick={() => { setMode(m.id); track('mode_changed', { mode: m.id, source: 'settings' }) }}>
              <span className={`sx-scr sx-scr-${m.id}`} aria-hidden="true"><i /><i /><i /></span>
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="sx-section">
        <h3 className="sx-gt">{t('setFontSize')}</h3>
        <div className="sx-grp sx-size">
          <div className="sx-slider">
            <span style={{ fontSize: 12 }}>A</span>
            <div className="sx-track" role="radiogroup" aria-label={t('setFontSize')}>
              <i style={{ width: `${at * 50}%` }} />
              {FONT_SIZES.map((f, k) => (
                <button key={f.id} role="radio" aria-checked={fontSize === f.id} aria-label={t(f.labelKey)}
                  className={`sx-stop${fontSize === f.id ? ' on' : ''}`} style={{ insetInlineStart: `${k * 50}%` }}
                  onClick={() => setFontSize(f.id)} />
              ))}
            </div>
            <span style={{ fontSize: 19 }}>A</span>
          </div>
          <div className="sx-ticks">{FONT_SIZES.map(f => <span key={f.id} className={fontSize === f.id ? 'on' : ''}>{t(f.labelKey)}</span>)}</div>
          <p className="sx-sample">{t('sxSample')}</p>
        </div>
      </section>
    </div>
  )
}

// ── the page ────────────────────────────────────────────────────────────────
export default function Settings() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const msStore = isMsStore()
  const [settings, setSettings] = useState(loadSettings)
  const { theme: colorTheme, modePref } = useTheme()
  const { lang, setLang, t } = useLanguage()
  useEffect(() => { track('settings_view') }, [])

  function update(key, val) {
    const next = { ...settings, [key]: val }
    setSettings(next)
    saveSettings(next)
    _applySettings()
    track('settings_change', { key, val })
  }

  const fontSize = settings.fontSize || 'sm'
  const hideValues = settings.hideValues ?? false
  const [editInterests, setEditInterests] = useState(false)
  const [fx, setFx] = useState(() => effectSettings())
  const [q, setQ] = useState('')
  const [langOpen, setLangOpen] = useState(false)
  const [open, setOpen] = useState({ weekly: false })
  const flip = (k) => setOpen(o => ({ ...o, [k]: !o[k] }))

  const drive = useMemo(() => driveState(), [])
  const backedAt = previouslyConnected(drive) ? latestBackupAt(drive) : 0
  const guardianOn = (() => { try { return !!JSON.parse(localStorage.getItem('wl_guardian') || 'null')?.email } catch { return false } })()
  const rate = isAndroid ? reviewStatusLine() : { code: 'off' }
  const curLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0]
  const themeName = t('themeNames')?.[colorTheme] || COLOR_THEMES.find(x => x.id === colorTheme)?.name || ''
  const modeName = t({ light: 'modeLight', dark: 'modeDark', auto: 'modeAuto' }[modePref] || 'modeLight')
  const curTheme = COLOR_THEMES.find(x => x.id === colorTheme) || COLOR_THEMES[0]

  // Google sign-in returns to /settings with { driveConnected }: land on the
  // backup page, where DriveBackup finishes the connect.
  if (params.get('view') === 'backup' || location.state?.driveConnected) {
    return <BackupView relTime={relTime} onBack={() => (params.get('view') ? navigate(-1) : navigate('/settings', { replace: true }))} />
  }

  if (params.get('view') === 'appearance') {
    return <Appearance fontSize={fontSize} setFontSize={(v) => update('fontSize', v)} onBack={() => navigate(-1)} />
  }

  const needle = q.trim().toLowerCase()
  const groups = [
    {
      title: t('setAppearance'),
      items: [
        { key: 'theme', terms: [t('sxTheme'), t('setColorTheme'), t('setMode'), themeName], node:
          <Row icon={<ThemeMark th={curTheme} className="sx-thm" />} color="transparent" title={t('sxTheme')} chevron
            onClick={() => { setParams({ view: 'appearance' }); track('settings_open_appearance') }}
            right={<span className="sx-val">{themeName} · {modeName}</span>} /> },
        { key: 'size', terms: [t('setFontSize'), t('setFontSizeHint')], node:
          <Row icon={ICONS.text} color="#6366f1" title={t('setFontSize')}
            right={<div className="sx-seg" role="radiogroup" aria-label={t('setFontSize')}>{FONT_SIZES.map(f => (
              <button key={f.id} role="radio" aria-checked={fontSize === f.id} aria-label={t(f.labelKey)} className={fontSize === f.id ? 'on' : ''} onClick={() => update('fontSize', f.id)}>{f.short}</button>
            ))}</div>} /> },
        { key: 'lang', terms: [t('setLanguage'), t('setLanguageHint'), ...LANGUAGES.map(l => l.native)], node:
          <Row icon={ICONS.globe} color="#0ea5e9" title={t('setLanguage')} chevron onClick={() => setLangOpen(true)}
            right={<span className="sx-val"><span aria-hidden="true">{curLang.flag}</span> {curLang.native}</span>} /> },
      ],
    },
    {
      title: t('sxPortfolio'),
      items: [
        { key: 'interests', terms: [t('setInterests'), t('setInterestsHint')], node:
          <Row icon={ICONS.list} color="#f59e0b" title={t('setInterests')} hint={t('setInterestsHint')} chevron
            onClick={() => { setEditInterests(true); track('interests_edit_open', { source: 'settings' }) }}
            right={<span className="sx-val">{t('setEdit')}</span>} /> },
        { key: 'hide', terms: [t('setHideValues'), t('setHideValuesHint')], node:
          <Row icon={ICONS.eyeOff} color="#64748b" title={t('setHideValues')} hint={t('setHideValuesHint')}
            right={<Toggle on={hideValues} label={t('setHideValues')} onClick={() => update('hideValues', !hideValues)} />} /> },
        { key: 'backup', terms: [t('sxBackup'), t('sxBackupHint'), t('bkCodeT'), t('bkQrT'), 'Google Drive', 'QR'], node:
          <Row icon={ICONS.cloud} color="#16a34a" title={t('sxBackup')} chevron
            onClick={() => { setParams({ view: 'backup' }); track('settings_open_backup') }}
            hint={backedAt ? t('sxBackedUp')(relTime(backedAt, lang)) : (drive.configured ? t('sxBackupHint') : t('bkCodeHint'))}
            right={backedAt ? <span className="sx-badge">{t('commonOn')}</span> : null} /> },
      ],
    },
    {
      title: t('setNotifs'),
      items: [
        { key: 'push', embed: true, terms: [t('setNotifs'), 'push'], node: <PushToggle /> },
        { key: 'weekly', terms: [t('setWeeklyReport'), t('sxWeeklyHint'), 'email'], node: <>
          <Row icon={ICONS.mail} color="#8b5cf6" title={t('setWeeklyReport')} hint={t('sxWeeklyHint')} chevron onClick={() => flip('weekly')} />
          {open.weekly && <div className="sx-panel"><WeeklyEmailSignup source="settings" /></div>}
        </> },
        // Screen effects are on by default; the sound is the part that gets its own switch.
        { key: 'fx', terms: [t('setFx'), t('setFxHint')], node:
          <Row icon={ICONS.spark} color="#ec4899" title={t('setFx')} hint={t('setFxHint')}
            right={<Toggle on={fx.enabled} label={t('setFx')} onClick={() => {
              const next = setEffectSettings({ enabled: !fx.enabled }); setFx(next); track('screen_effects_toggle', { on: next.enabled })
            }} />} /> },
        fx.enabled && { key: 'sound', terms: [t('setFxSound'), t('setFxSoundHint')], node:
          <Row icon={ICONS.sound} color="#f97316" title={t('setFxSound')} hint={t('setFxSoundHint')}
            right={<Toggle on={fx.sound} label={t('setFxSound')} onClick={() => {
              const next = setEffectSettings({ sound: !fx.sound }); setFx(next)
              // Turning sound ON is a tap, the only moment a browser lets the
              // audio context start, so the next effect is heard, not held.
              if (next.sound) { try { primeEffectAudio() } catch {} }
              track('screen_effects_sound', { on: next.sound })
            }} />} /> },
      ],
    },
    {
      title: t('sxPrivacy'),
      items: [
        isAndroidTWA() && { key: 'lock', embed: true, terms: [t('setSecurity'), 'lock', 'fingerprint'], node: <BiometricToggle /> },
        { key: 'guardian', terms: [t('setGuardian'), t('setGuardianDesc')], node: <>
          <Row icon={ICONS.shield} color="#0d9488" title={t('setGuardian')} hint={t('setGuardianDesc')} chevron
            onClick={() => { track('guardian_toggle_click', { source: 'settings' }); navigate('/guardian') }}
            right={<span className="sx-val">{guardianOn ? t('commonOn') : t('sxSetUp')}</span>} />
          <div className="sx-link"><LandingLink page="guardian" source="settings" /></div>
        </> },
      ],
    },
    {
      title: t('setZakat'),
      items: [
        { key: 'zakat', embed: true, terms: [t('setZakat'), t('zkShow'), t('zkShowHint')], node: <>
          <ZakatSettings />
          <div className="sx-link"><LandingLink page="zakat" source="settings" /></div>
        </> },
      ],
    },
    {
      title: t('sxMore'),
      items: [
        !msStore && !isAndroidTWA() && { key: 'play', terms: ['Google Play', 'android', t('sxPlayHint')], node:
          <Row icon={<span className="sx-chrome"><PlayMark size={22} /></span>} color="#fff" title="Google Play" hint={t('sxPlayHint')} chevron
            onClick={() => { track('store_click', { store: 'play', source: 'settings' }); window.open(PLAY_STORE_URL, '_blank', 'noopener') }} /> },
        !msStore && !isAndroidTWA() && { key: 'msstore', terms: ['Microsoft Store', 'windows', t('sxMsHint')], node:
          <Row icon={<span className="sx-chrome">{ICONS.windows}</span>} color="#fff" title="Microsoft Store" hint={t('sxMsHint')} chevron
            onClick={() => { track('store_click', { store: 'msstore', source: 'settings' }); window.open(MS_STORE_URL, '_blank', 'noopener') }} /> },
        !msStore && { key: 'ext', terms: [t('sxExt'), t('sxExtHint'), 'chrome'], node:
          <Row icon={<span className="sx-chrome">{ICONS.chrome}</span>} color="#fff" title={t('sxExt')} hint={t('sxExtHint')} chevron
            onClick={() => { track('extension_click', { source: 'settings' }); window.open(EXTENSION_URL, '_blank', 'noopener') }} /> },
        rate.code !== 'off' && { key: 'rate', terms: [t('setRate'), t('setRateDesc')], node:
          <Row icon={ICONS.star} color="#eab308" title={t('setRate')} chevron
            hint={RATE_STATUS_KEY[rate.code] ? t(RATE_STATUS_KEY[rate.code]).replace('{n}', rate.n) : t('setRateDesc')}
            onClick={() => { track('rate_tap', { source: 'settings', status: rate.code }); requestReviewNow('settings') }} /> },
        { key: 'help', terms: [t('sxHelp'), 'faq', 'privacy'], node:
          <Row icon={ICONS.help} color="#94a3b8" title={t('sxHelp')} chevron onClick={() => { window.location.href = '/faq/' }} /> },
      ],
    },
  ]
  const anyMatch = !needle || groups.some(g => g.items.some(it => it && matches(needle, g.title, ...(it.terms || []))))

  return (
    <SearchCtx.Provider value={needle}>
      <div className="page sx">
        <div className="sx-top">
          <button className="sx-back" onClick={() => navigate(-1)} aria-label={t('back')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        </div>
        <h1 className="sx-title">{t('settingsNav')}</h1>
        <label className="sx-search">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('sxSearch')} aria-label={t('sxSearch')} autoComplete="off" spellCheck={false} />
        </label>

        {!needle && (
          <div className="sx-hero">
            <div className="sx-hero-row">
              <span className="sx-hero-logo">{LOGO}</span>
              <span><b>{t('sxYours')}</b><small>{t('sxFree')}</small></span>
            </div>
            <div className="sx-pills">
              <span className="sx-pill"><i className={backedAt ? '' : 'off'} />{backedAt ? t('sxBackedUp')(relTime(backedAt, lang)) : t('sxNoBackup')}</span>
              <span className="sx-pill">🔒 {t('sxOnDevice')}</span>
            </div>
          </div>
        )}

        {groups.map(g => <Group key={g.title} title={g.title} items={g.items} />)}
        {!anyMatch && <p className="sx-empty">{t('sxNoMatch')}</p>}

        {/* The app's own copy of the portfolio: only worth a place when this
            device has lost everything and the copy is the way back. */}
        {isAndroid && looksEmpty() && <DeviceVault />}
        {!needle && <p className="sx-foot">WalletLens · {t('sxFree')}</p>}

        {langOpen && (
          <>
            <div className="sx-scrim" onClick={() => setLangOpen(false)} />
            <div className="sx-sheet" role="dialog" aria-modal="true" aria-label={t('setLanguage')}>
              <div className="sx-grab" />
              <h3 className="sx-sheet-t">{t('setLanguage')}</h3>
              {LANGUAGES.map(l => (
                <button key={l.code} lang={l.code} className={`sx-langopt${lang === l.code ? ' on' : ''}`}
                  onClick={() => { setLang(l.code); track('language_changed', { lang: l.code, source: 'settings' }); setLangOpen(false) }}>
                  <span aria-hidden="true">{l.flag}</span><b dir={l.rtl ? 'rtl' : 'ltr'}>{l.native}</b>
                  {lang === l.code && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10"/></svg>}
                </button>
              ))}
            </div>
          </>
        )}

        {editInterests && (
          <InterestPicker editMode onDone={() => setEditInterests(false)} onClose={() => setEditInterests(false)} />
        )}
      </div>
    </SearchCtx.Provider>
  )
}
