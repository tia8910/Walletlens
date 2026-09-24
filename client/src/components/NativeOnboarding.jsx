import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Icon from './Icon'
import { track } from '../analytics'
import { useTheme, THEMES } from '../ThemeContext'
import { useLanguage, LANGUAGES } from '../LanguageContext'
import { useBiometricLock } from './BiometricLock'
import sfx from '../sfx'
import { primeEffectAudio } from '../screenEffectsRuntime'

const ONBOARD_KEY = 'wl_welcomed_v2'

// How far through the flow the user got. Completion is only recorded on the
// last slide, so anything that reloads the page mid-flow used to drop them
// back on slide 1 with their theme and language choices apparently undone.
//
// Enabling the biometric lock did exactly that on Android: the native side
// relaunched the TWA, which is fixed there too, but the onboarding should not
// depend on nothing ever reloading it. An OS memory kill, a pull-to-refresh or
// a crash produce the same restart, and none of those are avoidable from here.
const ONBOARD_STEP_KEY = 'wl_welcome_step_v2'

const SLIDES = [
  {
    id: 'welcome',
    gradient: 'linear-gradient(165deg, #010a04 0%, #031008 35%, #041a0b 65%, #021008 100%)',
    accent: '#00c853', glow: 'rgba(0,200,83,0.28)',
    eyebrowKey: 'obWelcomeEyebrow', title: 'WalletLens',
    titleGrad: 'linear-gradient(135deg, #00c853 0%, #4ade80 55%, #86efac 100%)',
    descKey: 'obWelcomeDesc',
    featureKeys: ['obFeatPrivate', 'obFeatLivePnl', 'obFeatInsights', 'obFeatFree'],
  },
  {
    id: 'theme',
    gradient: 'linear-gradient(165deg, #080b10 0%, #0f1520 55%, #080b10 100%)',
    accent: '#00e676', glow: 'rgba(0,230,118,0.22)',
    eyebrowKey: 'obThemeEyebrow', titleKey: 'obThemeTitle',
    descKey: 'obThemeDesc', isTheme: true,
  },
  {
    id: 'security',
    gradient: 'linear-gradient(165deg, #04140d 0%, #06241a 55%, #03120c 100%)',
    accent: '#00e676', glow: 'rgba(0,230,118,0.3)',
    eyebrowKey: 'obSecurityEyebrow', titleKey: 'obSecurityTitle',
    descKey: 'obSecurityDesc', isSecurity: true,
  },
  {
    id: 'go',
    gradient: 'linear-gradient(165deg, #041a0c 0%, #083818 55%, #041a0c 100%)',
    accent: '#22c55e', glow: 'rgba(34,197,94,0.35)',
    eyebrowKey: 'obGoEyebrow', titleKey: 'obGoTitle',
    descKey: 'obGoDesc', final: true,
  },
]

const LOGO_SVGS = {
  gold: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='4' y='10' width='16' height='12' rx='1' fill='%23e8b825' opacity='0.3'/%3E%3Crect x='7' y='6' width='10' height='8' rx='1' fill='%23e8b825'/%3E%3C/svg%3E",
  silver: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='4' y='10' width='16' height='12' rx='1' fill='%23c0c8d8' opacity='0.3'/%3E%3Crect x='7' y='6' width='10' height='8' rx='1' fill='%23c0c8d8'/%3E%3C/svg%3E",
  ethereum: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2L12 9.5L18 12L12 2Z' fill='%23627eea'/%3E%3Cpath d='M12 9.5L12 17L18 12L12 9.5Z' fill='%23627eea' opacity='0.6'/%3E%3C/svg%3E",
  solana: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 9L10 5H17L13 9H6Z' fill='%239945ff'/%3E%3Cpath d='M6 15L10 11H17L13 15H6Z' fill='%239945ff'/%3E%3C/svg%3E",
}

/**
 * The slides this context can actually deliver.
 *
 * App Lock is a feature of the Android app and only of the Android app — the
 * lock is a native BiometricPrompt, and outside the app there is nothing to
 * prompt with. On the web the security slide was therefore a step whose only
 * content was a greyed-out box reading "Fingerprint not available on this
 * device", which is both a dead end and a lie: the device is usually perfectly
 * capable, it is the browser that cannot reach it.
 *
 * BiometricToggle already decided this for Settings, and for the same reason:
 *
 *   "Hidden rather than disabled. A greyed-out row invites 'why can't I turn
 *    this on?', and the honest answer — install the Android app — is not
 *    something a Settings row should be arguing for."
 *
 * Onboarding is a worse place to make that argument than Settings, so the
 * slide is dropped rather than shown broken.
 */
function slidesFor(canLock) {
  return canLock ? SLIDES : SLIDES.filter(sl => !sl.isSecurity)
}

export default function NativeOnboarding({ onDone }) {
  const { enabled: bioEnabled, available: bioAvailable, enable: enableBio } = useBiometricLock()
  const slides = useMemo(() => slidesFor(bioAvailable), [bioAvailable])

  const [step, setStep] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem(ONBOARD_STEP_KEY) || '0', 10)
      // Clamp rather than trust: a stored index past the end would render
      // slides[undefined] and blank the first screen the user ever sees. The
      // ceiling is the VISIBLE list, which is one shorter on the web.
      const max = slidesFor(bioAvailable).length - 1
      return Number.isFinite(saved) ? Math.min(Math.max(saved, 0), max) : 0
    } catch { return 0 }
  })
  const [bioBusy, setBioBusy] = useState(false)
  const [bioError, setBioError] = useState('')
  const { theme, setTheme, mode, setMode } = useTheme()
  const { lang, setLang, t } = useLanguage()
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const [swiping, setSwiping] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)

  const s = slides[Math.min(step, slides.length - 1)]
  const total = slides.length

  useEffect(() => {
    try { localStorage.setItem(ONBOARD_STEP_KEY, String(step)) } catch {}
  }, [step])

  const goNext = useCallback(() => {
    if (step < total - 1) { setStep(x => x + 1); try { sfx.playWhoosh() } catch {} }
  }, [step, total])

  const goPrev = useCallback(() => {
    if (step > 0) { setStep(x => x - 1); try { sfx.playWhoosh() } catch {} }
  }, [step])

  const goTo = useCallback((i) => {
    if (i >= 0 && i < total && i !== step) {
      setStep(i)
      try { sfx.playWhoosh() } catch {}
    }
  }, [step, total])

  const onTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    setSwiping(true)
    setSwipeOffset(0)
  }, [])

  const onTouchMove = useCallback((e) => {
    if (!swiping) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    if (Math.abs(dy) > Math.abs(dx) * 1.2) { setSwiping(false); return }
    setSwipeOffset(dx * 0.4)
  }, [swiping])

  const onTouchEnd = useCallback((e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    setSwiping(false)
    setSwipeOffset(0)
    if (Math.abs(dx) > 60) {
      if (dx < 0) goNext()
      else goPrev()
    }
  }, [goNext, goPrev])

  // Mouse-drag mirrors the touch-swipe above. Desktop and Windows-packaged
  // users have no touchscreen: without this (and the buttons below) the
  // first slides offered nothing clickable and the app read as frozen.
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    touchStartX.current = e.clientX
    setSwiping(true)
    setSwipeOffset(0)
  }, [])

  const onMouseMove = useCallback((e) => {
    if (!swiping || e.buttons !== 1) return
    setSwipeOffset((e.clientX - touchStartX.current) * 0.4)
  }, [swiping])

  const onMouseUp = useCallback((e) => {
    if (!swiping) return
    const dx = e.clientX - touchStartX.current
    setSwiping(false)
    setSwipeOffset(0)
    if (Math.abs(dx) > 60) {
      if (dx < 0) goNext()
      else goPrev()
    }
  }, [swiping, goNext, goPrev])

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [goNext, goPrev])

  useEffect(() => {
    try { sfx.startAmbient() } catch {}
    return () => { try { sfx.stopAmbient() } catch {} }
  }, [])

  async function enableBiometric() {
    if (bioBusy) return
    setBioBusy(true); setBioError('')
    try {
      const ok = await enableBio()
      if (ok) { try { track('biometric_enabled_onboarding') } catch {}; goNext() }
      else setBioError(t('obBioSetupFailed'))
    } catch (e) { setBioError(t('obBioSetupError')) }
    finally { setBioBusy(false) }
  }

  function skip() {
    try { track('onboarding_skipped', { at_step: step }) } catch {}
    finish()
  }

  function finish() {
    // Unlock the screen-effects AudioContext while we are still inside the tap.
    //
    // sfx.playTriumph() above unlocks a DIFFERENT context — sfx.js has its
    // own — so without this the one guaranteed gesture of the whole first-run
    // flow leaves the effects context asleep, and the first-open burst the
    // dashboard is about to fire arrives silent on a phone at full volume.
    //
    // Synchronous on purpose: a held cue is released by the NEXT gesture, and
    // a listener added during a click never fires for that click.
    try { primeEffectAudio() } catch {}
    try { localStorage.setItem(ONBOARD_KEY, '1') } catch {}
    try { localStorage.removeItem(ONBOARD_STEP_KEY) } catch {}
    try { window.dispatchEvent(new Event('wl-welcome-done')) } catch {}
    try { onDone?.() } catch {}
  }

  function getThemeIcon(th) {
    // Logo SVG for themes that have one (gold/silver bars, coin logos)…
    if (th.logo) return <img src={th.logo} alt={th.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
    // …a short currency glyph (₿, Ξ, ◎) rendered as-is…
    if (th.icon && th.icon.length <= 2) return th.icon
    // …otherwise a premium line icon (e.g. emerald → sparkles), dark on the light swatch.
    return <Icon name={th.icon} size={18} style={{ color: '#064e3b' }} />
  }

  return (
    <div className="no-container" style={{ background: s.gradient }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}>

      <div className="no-slide" key={step}
        style={swiping ? { transform: `translateX(${swipeOffset}px)`, transition: 'none' } : {}}>

        <div className="no-eyebrow" style={{ color: s.accent }}>{s.eyebrowKey ? t(s.eyebrowKey) : s.eyebrow}</div>

        {s.titleGrad ? (
          <h1 className="no-title" style={{ backgroundImage: s.titleGrad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{s.titleKey ? t(s.titleKey) : s.title}</h1>
        ) : (
          <h1 className="no-title">{s.titleKey ? t(s.titleKey) : s.title}</h1>
        )}

        <p className="no-desc">{t(s.descKey)}</p>

        {s.featureKeys && (
          <div className="no-features">
            {s.featureKeys.map(k => <div key={k} className="no-feature">{t(k)}</div>)}
          </div>
        )}

        {s.isTheme && (
          <div className="no-lang-grid">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                className={`no-lang-btn${lang === l.code ? ' active' : ''}`}
                onClick={() => { try { setLang(l.code) } catch {}; try { track('language_changed', { lang: l.code, source: 'onboarding' }) } catch {} }}
                lang={l.code}
                dir={l.rtl ? 'rtl' : 'ltr'}
              >
                <span className="no-lang-flag" aria-hidden="true">{l.flag}</span>
                <span className="no-lang-native">{l.native}</span>
                <span className="no-lang-en">{l.label}</span>
              </button>
            ))}
          </div>
        )}

        {s.isTheme && (
          <div className="no-mode-row">
            {[
              { id: 'dark',  labelKey: 'modeDark',  icon: 'moon' },
              { id: 'light', labelKey: 'modeLight', icon: 'sun' },
            ].map(m => (
              <button
                key={m.id}
                className={`no-mode-btn${mode === m.id ? ' active' : ''}`}
                onClick={() => { try { setMode(m.id) } catch {}; try { track('mode_changed', { mode: m.id, source: 'onboarding' }) } catch {} }}
              >
                <Icon name={m.icon} size={16} />
                <span>{t(m.labelKey)}</span>
              </button>
            ))}
          </div>
        )}

        {s.isTheme && (
          <div className="no-theme-grid">
            {THEMES.map(th => {
              const isLight = mode === 'light'
              const isActive = theme === th.id
              return (
              <button key={th.id} className={`no-theme-btn${isActive ? ' active' : ''}`}
                style={isActive ? {
                  borderColor: isLight ? '#fff' : th.swatch,
                  boxShadow: isLight ? '0 0 16px rgba(255,255,255,0.35)' : `0 0 16px ${th.swatch}55`,
                } : undefined}
                onClick={() => { try { setTheme(th.id) } catch {}; try { track('theme_changed', { theme: th.id }) } catch {} }}>
                <span className="no-theme-swatch" style={{
                  background: `radial-gradient(circle at 35% 35%, ${th.light}, ${th.swatch})`,
                  boxShadow: isActive ? (isLight ? '0 0 10px rgba(255,255,255,0.5)' : `0 0 10px ${th.swatch}88`) : 'none',
                  border: isActive ? `2px solid ${isLight ? '#fff' : th.swatch}` : '2px solid transparent',
                }}>{getThemeIcon(th)}</span>
                <span className="no-theme-label" style={isActive ? { color: isLight ? '#fff' : th.swatch } : undefined}>{th.name}</span>
              </button>
              )
            })}
          </div>
        )}

        {s.isSecurity && (
          <div className="no-security">
            {/* No "unavailable" branch: slidesFor() drops this slide entirely
                when App Lock cannot work here, so reaching this point already
                means it can. */}
            {bioEnabled ? (
              <div className="no-bio-enabled">{t('obBioEnabled')}</div>
            ) : (
              <button className="no-bio-btn" onClick={enableBiometric} disabled={bioBusy}>
                {bioBusy ? t('obSettingUp') : t('obBioEnable')}
              </button>
            )}
            {bioError && <div className="no-bio-error">{bioError}</div>}
          </div>
        )}
      </div>

      {/* Progress track */}
      <div className="no-progress-track">
        <div className="no-progress-fill" style={{ width: `${((step + 1) / total) * 100}%`, background: s.accent }} />
      </div>

      {/* Single dynamic trend line */}
      <div className="no-trend-wrap">
        <svg className="no-trend-svg" viewBox="0 0 320 40" fill="none">
          <defs>
            <linearGradient id="tg" x1="0" y1="0" x2="320" y2="0">
              <stop offset="0%" stopColor={s.accent} stopOpacity="0.2" />
              <stop offset="100%" stopColor={s.accent} stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            d={`M 0 30 Q 40 30 60 ${28 - step * 6} Q 80 ${26 - step * 6} 110 ${24 - step * 4} Q 140 ${22 - step * 4} 160 ${18 - step * 2} Q 190 ${16 - step * 2} 210 ${14 - step * 2} Q 240 ${12 - step * 2} 260 ${10 - step} Q 290 ${8 - step} 310 ${6}`}
            stroke="url(#tg)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx={60 + step * 65} cy={28 - step * 7} r="4" fill={s.accent} />
        </svg>
        <div className="no-trend-segs">
          {slides.map((_, i) => (
            <button key={i} className="no-trend-seg" onClick={() => goTo(i)}
              aria-label={t('obSlide')(i + 1)} />
          ))}
        </div>
      </div>

      {/* Explicit mouse/keyboard navigation. The slides used to advance
          only on touch-swipe, arrow keys/Enter or the invisible trend dots,
          so a desktop mouse user had nothing to click and the app was
          reported as frozen on the welcome slide. */}
      <div className="no-nav">
        {step > 0
          ? <button className="no-nav-btn" onClick={goPrev}>{t('obBack')}</button>
          : <span />}
        {!s.final ? (
          <div className="no-nav-right">
            <button className="no-nav-skip" onClick={skip}>{t('obSkip')}</button>
            <button className="no-nav-next" style={{ background: s.accent }} onClick={goNext}>{t('obNext')}</button>
          </div>
        ) : (
          <button className="no-nav-next" style={{ background: s.accent }}
            onClick={() => { try { sfx.playTriumph() } catch {}; finish() }}>{t('obStart')}</button>
        )}
      </div>

      {/* Final slide: pulsing circle */}
      {s.final && (
        <div className="no-launch-area">
          <button className="no-launch-circle" onClick={() => { try { sfx.playTriumph() } catch {}; finish() }}
            style={{ '--accent': s.accent, '--glow': s.glow }}>
            <div className="no-launch-ring" style={{ borderColor: s.accent }} />
            <div className="no-launch-core" style={{ background: `linear-gradient(135deg, ${s.accent}, #4ade80)` }} />
          </button>
          <div className="no-launch-hint" style={{ color: s.accent }}>{t('obTapToStart')}</div>
        </div>
      )}
    </div>
  )
}
