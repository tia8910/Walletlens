import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Icon from './Icon'
import { track } from '../analytics'
import { useTheme, THEMES } from '../ThemeContext'
import { useBiometricLock } from './BiometricLock'
import sfx from '../sfx'

const ONBOARD_KEY = 'wl_welcomed_v2'

const SLIDES = [
  {
    id: 'welcome',
    gradient: 'linear-gradient(165deg, #010a04 0%, #031008 35%, #041a0b 65%, #021008 100%)',
    accent: '#00c853', glow: 'rgba(0,200,83,0.28)',
    eyebrow: 'WELCOME TO', title: 'WalletLens',
    titleGrad: 'linear-gradient(135deg, #00c853 0%, #4ade80 55%, #86efac 100%)',
    desc: 'Your private net-worth tracker. Crypto, stocks, gold, cash — all in one place.',
    features: ['Private', 'Live P&L', 'AI Insights', 'Free'],
  },
  {
    id: 'theme',
    gradient: 'linear-gradient(165deg, #080b10 0%, #0f1520 55%, #080b10 100%)',
    accent: '#00e676', glow: 'rgba(0,230,118,0.22)',
    eyebrow: 'PERSONALISE', title: 'Make it yours',
    desc: 'Pick your look. Change anytime in Settings.', isTheme: true,
  },
  {
    id: 'security',
    gradient: 'linear-gradient(165deg, #04140d 0%, #06241a 55%, #03120c 100%)',
    accent: '#00e676', glow: 'rgba(0,230,118,0.3)',
    eyebrow: 'SECURITY', title: 'Lock with fingerprint',
    desc: 'Keep your portfolio for your eyes only.', isSecurity: true,
  },
  {
    id: 'go',
    gradient: 'linear-gradient(165deg, #041a0c 0%, #083818 55%, #041a0c 100%)',
    accent: '#22c55e', glow: 'rgba(34,197,94,0.35)',
    eyebrow: 'ALL SET', title: 'Ready to grow',
    desc: 'Your dashboard awaits.', final: true,
  },
]

const LOGO_SVGS = {
  gold: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='4' y='10' width='16' height='12' rx='1' fill='%23e8b825' opacity='0.3'/%3E%3Crect x='7' y='6' width='10' height='8' rx='1' fill='%23e8b825'/%3E%3C/svg%3E",
  silver: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='4' y='10' width='16' height='12' rx='1' fill='%23c0c8d8' opacity='0.3'/%3E%3Crect x='7' y='6' width='10' height='8' rx='1' fill='%23c0c8d8'/%3E%3C/svg%3E",
  ethereum: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2L12 9.5L18 12L12 2Z' fill='%23627eea'/%3E%3Cpath d='M12 9.5L12 17L18 12L12 9.5Z' fill='%23627eea' opacity='0.6'/%3E%3C/svg%3E",
  solana: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 9L10 5H17L13 9H6Z' fill='%239945ff'/%3E%3Cpath d='M6 15L10 11H17L13 15H6Z' fill='%239945ff'/%3E%3C/svg%3E",
}

export default function NativeOnboarding({ onDone }) {
  const [step, setStep] = useState(0)
  const [bioBusy, setBioBusy] = useState(false)
  const [bioError, setBioError] = useState('')
  const { theme, setTheme, mode } = useTheme()
  const { enabled: bioEnabled, available: bioAvailable, enable: enableBio } = useBiometricLock()
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const [swiping, setSwiping] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)

  const s = SLIDES[step]
  const total = SLIDES.length

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
      else setBioError("Couldn't set up fingerprint. Make sure it's enrolled in device settings.")
    } catch (e) { setBioError('Biometric setup failed. You can enable it later in Settings.') }
    finally { setBioBusy(false) }
  }

  function finish() {
    try { localStorage.setItem(ONBOARD_KEY, '1') } catch {}
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
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

      <div className="no-slide" key={step}
        style={swiping ? { transform: `translateX(${swipeOffset}px)`, transition: 'none' } : {}}>

        <div className="no-eyebrow" style={{ color: s.accent }}>{s.eyebrow}</div>

        {s.titleGrad ? (
          <h1 className="no-title" style={{ backgroundImage: s.titleGrad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{s.title}</h1>
        ) : (
          <h1 className="no-title">{s.title}</h1>
        )}

        <p className="no-desc">{s.desc}</p>

        {s.features && (
          <div className="no-features">
            {s.features.map((f, i) => <div key={i} className="no-feature">{f}</div>)}
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
            {!bioAvailable ? (
              <div className="no-bio-unavailable">Fingerprint not available on this device</div>
            ) : bioEnabled ? (
              <div className="no-bio-enabled">Fingerprint enabled</div>
            ) : (
              <button className="no-bio-btn" onClick={enableBiometric} disabled={bioBusy}>
                {bioBusy ? 'Setting up…' : 'Enable fingerprint lock'}
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
          {SLIDES.map((_, i) => (
            <button key={i} className="no-trend-seg" onClick={() => goTo(i)}
              aria-label={`Slide ${i + 1}`} />
          ))}
        </div>
      </div>

      {/* Final slide: pulsing circle */}
      {s.final && (
        <div className="no-launch-area">
          <button className="no-launch-circle" onClick={() => { try { sfx.playTriumph() } catch {}; finish() }}
            style={{ '--accent': s.accent, '--glow': s.glow }}>
            <div className="no-launch-ring" style={{ borderColor: s.accent }} />
            <div className="no-launch-core" style={{ background: `linear-gradient(135deg, ${s.accent}, #4ade80)` }} />
          </button>
          <div className="no-launch-hint" style={{ color: s.accent }}>Tap to start</div>
        </div>
      )}
    </div>
  )
}
