import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Icon from './Icon'
import './NativeOnboarding.css'
import OnboardFx from './OnboardFx'
import { track } from '../analytics'
import { useTheme, THEMES } from '../ThemeContext'
import { useLanguage, LANGUAGES } from '../LanguageContext'
import { useBiometricLock } from './BiometricLock'
import sfx from '../sfx'
import { primeEffectAudio } from '../screenEffectsRuntime'

// First-run onboarding in the Android app, told as a short cinematic story
// rather than a set of forms: one living particle field runs behind every
// scene and changes behaviour with it, each scene has one thing to touch, and
// you move through it the way you move through stories (swipe up, or tap on).
//
//   intro     light streams into the lens; your assets orbit it
//   language  a 3D drum of greetings; spin it, the centre one is chosen
//   look      the screen splits into dark and light; colour orbs circle the
//             preview and tapping one floods the screen with it
//   security  a fingerprint draws itself under a scanning beam (app only)
//   launch    hold the ring until it fills; the field goes to warp speed

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
  { id: 'welcome', fx: 'gather', accent: '#22c55e', glow: 'rgba(34,197,94,0.35)', bg: 'radial-gradient(120% 80% at 50% 25%, #06301a 0%, #020c06 60%, #000 100%)' },
  { id: 'language', fx: 'drift', accent: '#38bdf8', glow: 'rgba(56,189,248,0.3)', bg: 'radial-gradient(120% 80% at 50% 40%, #0a2238 0%, #030a14 60%, #000 100%)', isLanguage: true },
  { id: 'theme', fx: 'swirl', accent: '#a78bfa', glow: 'rgba(167,139,250,0.3)', bg: 'radial-gradient(120% 80% at 50% 35%, #1a1033 0%, #07040f 60%, #000 100%)', isTheme: true },
  { id: 'security', fx: 'scan', accent: '#2dd4bf', glow: 'rgba(45,212,191,0.32)', bg: 'radial-gradient(120% 80% at 50% 35%, #06302b 0%, #020d0b 60%, #000 100%)', isSecurity: true },
  { id: 'go', fx: 'rise', accent: '#22c55e', glow: 'rgba(34,197,94,0.4)', bg: 'radial-gradient(120% 90% at 50% 70%, #0b3d1d 0%, #031208 55%, #000 100%)', final: true },
]

// "Hello" in each language's own words, for the language drum.
const HELLO = { en: 'Hello', ar: 'مرحبا', fr: 'Bonjour', es: 'Hola', de: 'Hallo', it: 'Ciao' }
const FEATURE_KEYS = ['obFeatPrivate', 'obFeatLivePnl', 'obFeatInsights', 'obFeatFree']
const HOLD_MS = 1100

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
  const [dir, setDir] = useState(1)
  const [bioBusy, setBioBusy] = useState(false)
  const [bioError, setBioError] = useState('')
  const [burst, setBurst] = useState(0)
  const [warp, setWarp] = useState(false)
  const [paint, setPaint] = useState(null)
  const [hold, setHold] = useState(0)
  const [featIdx, setFeatIdx] = useState(0)
  const [count, setCount] = useState(0)
  const { theme, setTheme, mode, setMode } = useTheme()
  const { lang, setLang, t } = useLanguage()
  const touch = useRef({ x: 0, y: 0, on: false })
  const [drag, setDrag] = useState(0)
  const holdRef = useRef(null)

  const s = slides[Math.min(step, slides.length - 1)]
  const total = slides.length
  const th = THEMES.find(x => x.id === theme) || THEMES[0]
  const light = mode === 'light'

  useEffect(() => {
    try { localStorage.setItem(ONBOARD_STEP_KEY, String(step)) } catch {}
  }, [step])

  // Intro: the figure counts up and the feature words take turns.
  useEffect(() => {
    if (s.id !== 'welcome') return
    let raf = 0
    const t0 = performance.now()
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 1600)
      setCount(128450 * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const iv = setInterval(() => setFeatIdx(i => (i + 1) % FEATURE_KEYS.length), 1700)
    return () => { cancelAnimationFrame(raf); clearInterval(iv) }
  }, [s.id])

  const goNext = useCallback(() => {
    if (step < total - 1) { setDir(1); setStep(x => x + 1); try { sfx.playWhoosh() } catch {} }
  }, [step, total])

  const goPrev = useCallback(() => {
    if (step > 0) { setDir(-1); setStep(x => x - 1); try { sfx.playWhoosh() } catch {} }
  }, [step])

  const goTo = useCallback((i) => {
    if (i >= 0 && i < total && i !== step) {
      setDir(i > step ? 1 : -1)
      setStep(i)
      try { sfx.playWhoosh() } catch {}
    }
  }, [step, total])

  // ── language drum ─────────────────────────────────────────────────────
  const langIdx = Math.max(0, LANGUAGES.findIndex(l => l.code === lang))
  function pickLang(code) {
    if (code === lang) return
    try { setLang(code) } catch {}
    try { track('language_changed', { lang: code, source: 'onboarding' }) } catch {}
    try { sfx.playWhoosh() } catch {}
  }
  function spinLang(d) {
    const n = LANGUAGES.length
    pickLang(LANGUAGES[(langIdx + d + n) % n].code)
  }

  // Swipe up (or left) for the next scene, down (or right) for the last one.
  // The language drum takes vertical swipes for itself.
  const onStart = (x, y) => { touch.current = { x, y, on: true } }
  const onMove = (x, y) => {
    if (!touch.current.on || s.isLanguage) return
    setDrag(Math.max(-90, Math.min(90, (y - touch.current.y) * 0.35)))
  }
  const onEnd = (x, y) => {
    if (!touch.current.on) return
    touch.current.on = false
    const dx = x - touch.current.x, dy = y - touch.current.y
    setDrag(0)
    if (s.isLanguage && Math.abs(dy) > Math.abs(dx)) {
      if (Math.abs(dy) > 30) spinLang(dy < 0 ? 1 : -1)
      return
    }
    const big = Math.abs(dy) > Math.abs(dx) ? dy : dx
    if (Math.abs(big) > 60) { if (big < 0) goNext(); else goPrev() }
  }

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Enter') goNext()
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [goNext, goPrev])

  useEffect(() => {
    try { sfx.startAmbient() } catch {}
    return () => { try { sfx.stopAmbient() } catch {} }
  }, [])

  // ── look ──────────────────────────────────────────────────────────────
  function pickMode(m) {
    try { setMode(m) } catch {}
    try { track('mode_changed', { mode: m, source: 'onboarding' }) } catch {}
  }
  function pickTheme(x, e) {
    // The chosen colour floods the screen from the orb that was tapped.
    const r = e.currentTarget.getBoundingClientRect()
    setPaint({ x: r.left + r.width / 2, y: r.top + r.height / 2, c: x.swatch, k: Date.now() })
    try { setTheme(x.id) } catch {}
    try { track('theme_changed', { theme: x.id }) } catch {}
  }

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

  // ── launch: hold to fill the ring, then warp ──────────────────────────
  function holdStart() {
    if (warp) return
    const t0 = performance.now()
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / HOLD_MS)
      setHold(k)
      if (k >= 1) { launch(); return }
      holdRef.current = requestAnimationFrame(tick)
    }
    holdRef.current = requestAnimationFrame(tick)
  }
  function holdEnd() {
    cancelAnimationFrame(holdRef.current)
    if (!warp) setHold(0)
  }
  useEffect(() => () => cancelAnimationFrame(holdRef.current), [])

  function launch() {
    if (warp) return
    try { sfx.playTriumph() } catch {}
    setWarp(true); setBurst(b => b + 1); setHold(1)
    setTimeout(finish, 1100)
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

  function getThemeIcon(x) {
    if (x.logo) return <img src={x.logo} alt="" loading="lazy" decoding="async" />
    if (x.icon && x.icon.length <= 2) return x.icon
    return <Icon name={x.icon} size={18} style={{ color: '#064e3b' }} />
  }

  const words = (text, base = 0.15) => String(text).split(' ').map((w, i) => (
    <span key={`${text}-${i}`} className="ocx-word" style={{ animationDelay: `${base + i * 0.08}s` }}>{w}{' '}</span>
  ))

  // ── scenes ────────────────────────────────────────────────────────────
  let scene = null
  if (s.id === 'welcome') {
    scene = (
      <>
        <div className="ocx-lens">
          <span className="ocx-ring r1" /><span className="ocx-ring r2" /><span className="ocx-ring r3" />
          {[['₿', '#f7931a'], ['Au', 'linear-gradient(135deg,#f5d36b,#c99a17)'], ['Ξ', '#627eea'], ['AAPL', '#0f172a']].map(([g, bg], i) => (
            <span key={g} className={`ocx-orbit o${i}`}><span className="ocx-coin" style={{ background: bg }}>{g}</span></span>
          ))}
          <div className="ocx-core">
            <small>{t('obPreviewLabel')}</small>
            <b>${Math.round(count).toLocaleString('en-US')}</b>
          </div>
        </div>
        <div className="ocx-copy">
          <div className="ocx-eyebrow">{t('obWelcomeEyebrow')}</div>
          <h1 className="ocx-title ocx-brand">{words('WalletLens')}</h1>
          <div className="ocx-flip" aria-live="polite">
            <span key={featIdx} className="ocx-flip-word">{t(FEATURE_KEYS[featIdx])}</span>
          </div>
          <p className="ocx-desc">{t('obWelcomeDesc')}</p>
        </div>
      </>
    )
  } else if (s.isLanguage) {
    const n = LANGUAGES.length
    scene = (
      <>
        <div className="ocx-copy ocx-top">
          <div className="ocx-eyebrow">{t('obSecLanguage')}</div>
        </div>
        <div className="ocx-drum" role="listbox" aria-label={t('obSecLanguage')}>
          <span className="ocx-drum-lens" />
          {LANGUAGES.map((l, i) => {
            let off = i - langIdx
            if (off > n / 2) off -= n
            if (off < -n / 2) off += n
            const on = off === 0
            return (
              <button key={l.code} role="option" aria-selected={on} lang={l.code} dir={l.rtl ? 'rtl' : 'ltr'}
                className={`ocx-drum-item${on ? ' on' : ''}`}
                style={{ transform: `translateY(${off * 74}px) rotateX(${-off * 28}deg) scale(${on ? 1 : 0.78})`, opacity: Math.max(0, 1 - Math.abs(off) * 0.36) }}
                onClick={() => pickLang(l.code)}>
                <span className="ocx-hello">{HELLO[l.code] || l.native}</span>
                <small>{l.flag} {l.native}</small>
              </button>
            )
          })}
        </div>
        <div className="ocx-drum-arrows">
          <button onClick={() => spinLang(-1)} aria-label={t('obLangPrev')}><Icon name="arrow-up" size={18} /></button>
          <button onClick={() => spinLang(1)} aria-label={t('obLangNext')}><Icon name="arrow-down" size={18} /></button>
        </div>
      </>
    )
  } else if (s.isTheme) {
    scene = (
      <>
        <div className="ocx-split">
          <button className={`ocx-half is-dark${!light ? ' on' : ''}`} onClick={() => pickMode('dark')}>
            <Icon name="moon" size={18} /><span>{t('modeDark')}</span>
          </button>
          <button className={`ocx-half is-light${light ? ' on' : ''}`} onClick={() => pickMode('light')}>
            <Icon name="sun" size={18} /><span>{t('modeLight')}</span>
          </button>
        </div>
        <div className="ocx-orbs" style={{ '--th': th.swatch }}>
          <div className={`ocx-preview${light ? ' is-light' : ''}`} key={`${theme}-${mode}`}>
            <small>{t('obPreviewLabel')}</small>
            <b>$128,450</b>
            <div className="ocx-preview-btns"><span className="is-buy">+ {t('buy')}</span><span className="is-sell">− {t('sell')}</span></div>
          </div>
          {THEMES.map((x, i) => {
            const a = (i / THEMES.length) * 360
            const on = theme === x.id
            return (
              <span key={x.id} className="ocx-orb-arm" style={{ transform: `rotate(${a}deg)` }}>
                <button className={`ocx-orb${on ? ' on' : ''}`} style={{ transform: `rotate(${-a}deg)`, '--sw': x.swatch, background: `radial-gradient(circle at 35% 30%, ${x.light}, ${x.swatch})` }}
                  onClick={(e) => pickTheme(x, e)} aria-label={x.name} aria-pressed={on}>
                  {getThemeIcon(x)}
                </button>
              </span>
            )
          })}
        </div>
        <div className="ocx-copy">
          <h1 className="ocx-title">{words(t('obThemeTitle'))}</h1>
          <p className="ocx-desc">{th.name} · {light ? t('modeLight') : t('modeDark')}</p>
        </div>
      </>
    )
  } else if (s.isSecurity) {
    scene = (
      <>
        <div className={`ocx-print${bioEnabled ? ' is-on' : ''}`}>
          <svg viewBox="0 0 120 140" aria-hidden="true">
            {['M60 18c-22 0-40 17-40 39v18', 'M100 75V57c0-22-18-39-40-39', 'M32 98V58c0-15 13-28 28-28s28 13 28 28v12', 'M44 112V58c0-9 7-16 16-16s16 7 16 16v30', 'M60 58v58', 'M88 86v20', 'M20 88c2 10 6 19 12 27', 'M76 100c-1 10-4 19-9 27'].map((d, i) => (
              <path key={i} d={d} style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </svg>
          <span className="ocx-beam" />
          {bioEnabled && <span className="ocx-ok"><Icon name="check" size={22} /></span>}
        </div>
        <div className="ocx-copy">
          <div className="ocx-eyebrow">{t('obSecurityEyebrow')}</div>
          <h1 className="ocx-title">{words(t('obSecurityTitle'))}</h1>
          <p className="ocx-desc">{t('obSecurityDesc')}</p>
          {/* No "unavailable" branch: slidesFor() drops this slide entirely
              when App Lock cannot work here, so reaching this point already
              means it can. */}
          {bioEnabled
            ? <div className="ocx-pill is-on"><Icon name="check" size={16} />{t('obBioEnabled')}</div>
            : <button className="ocx-pill" onClick={enableBiometric} disabled={bioBusy}><Icon name="lock" size={16} />{bioBusy ? t('obSettingUp') : t('obBioEnable')}</button>}
          {bioError && <div className="ocx-err">{bioError}</div>}
        </div>
      </>
    )
  } else {
    const R = 62, C = 2 * Math.PI * R
    scene = (
      <>
        <div className="ocx-copy ocx-top">
          <div className="ocx-eyebrow">{t('obGoEyebrow')}</div>
          <h1 className="ocx-title">{words(t('obGoTitle'))}</h1>
          <p className="ocx-desc">{t('obGoDesc')}</p>
        </div>
        <button className={`no-nav-next ocx-hold${warp ? ' is-go' : ''}`} aria-label={t('obStart')}
          onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}
          onClick={(e) => { if (e.detail === 0) launch() }}>
          <svg viewBox="0 0 150 150" aria-hidden="true">
            <circle cx="75" cy="75" r={R} className="ocx-hold-track" />
            <circle cx="75" cy="75" r={R} className="ocx-hold-fill" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - hold) }} />
          </svg>
          <span className="ocx-hold-core"><Icon name="trend-up" size={40} /></span>
        </button>
        <div className="ocx-hint">{t('obHoldLaunch')}</div>
      </>
    )
  }

  return (
    <div className={`no-container ocx${warp ? ' is-warp' : ''}`}
      style={{ background: s.bg, '--accent': s.accent, '--glow': s.glow }}
      onTouchStart={e => onStart(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={e => onMove(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={e => onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
      onMouseDown={e => { if (e.button === 0) onStart(e.clientX, e.clientY) }}
      onMouseMove={e => { if (e.buttons === 1) onMove(e.clientX, e.clientY) }}
      onMouseUp={e => onEnd(e.clientX, e.clientY)}>

      <OnboardFx mode={warp ? 'warp' : s.fx} color={s.isTheme ? th.swatch : s.accent} color2={s.isTheme ? th.light : '#e2e8f0'} burst={burst} shift={drag} />
      {paint && <span key={paint.k} className="ocx-paint" style={{ left: paint.x, top: paint.y, background: paint.c }} />}

      {/* Story bars: one per scene, the current one fills */}
      <div className="ocx-top-bar">
        <div className="ocx-bars" role="tablist" aria-label={t('obStepOf')(step + 1, total)}>
          {slides.map((_, i) => (
            <button key={i} role="tab" aria-selected={i === step} aria-label={t('obSlide')(i + 1)} onClick={() => goTo(i)}
              className={`ocx-bar${i < step ? ' done' : i === step ? ' now' : ''}`}><i /></button>
          ))}
        </div>
        <div className="ocx-top-row">
          {step > 0 ? <button className="ocx-ghost" onClick={goPrev} aria-label={t('obBack')}><Icon name="arrow-down" size={18} /></button> : <span className="ocx-ghost-ph" />}
          <span className="ocx-count">{t('obStepOf')(step + 1, total)}</span>
          {!s.final ? <button className="ocx-skip" onClick={skip}>{t('obSkip')}</button> : <span className="ocx-ghost-ph" />}
        </div>
      </div>

      <div className={`no-slide ocx-scene${dir < 0 ? ' from-top' : ''}`} key={step}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}>
        {scene}
      </div>

      {!s.final && (
        <div className="ocx-next-wrap">
          <button className="no-nav-next ocx-next" onClick={goNext} aria-label={t('obNext')}>
            <Icon name="arrow-up" size={22} />
          </button>
          <span className="ocx-swipe">{t('obSwipeHint')}</span>
        </div>
      )}
    </div>
  )
}
