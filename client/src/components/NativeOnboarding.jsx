import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { track } from '../analytics'
import { api } from '../api'
import Logo from './Logo'
import { useTheme, THEMES } from '../ThemeContext'
import { useBiometricLock } from './BiometricLock'
import { POPULAR_FIAT } from '../data/assets'
import sfx from '../sfx'

const ONBOARD_KEY = 'wl_welcomed_v2'

const THEME_ICONS = {
  sparkles: '✨', award: '🏆', star: '⭐', zap: '⚡',
  sun: '☀️', moon: '🌙', heart: '💚', diamond: '💎',
  fire: '🔥', crown: '👑', gem: '💠', bolt: '⚡',
}

const SLIDES = [
  {
    id: 'welcome', gradient: 'linear-gradient(165deg, #010a04 0%, #031008 35%, #041a0b 65%, #021008 100%)',
    accent: '#00c853', glow: 'rgba(0,200,83,0.28)',
    particles: ['₿', 'Ξ', '◎', '📈', '💎', '🚀'], icon: 'logo',
    eyebrow: 'WELCOME TO', title: 'WalletLens',
    titleGrad: 'linear-gradient(135deg, #00c853 0%, #4ade80 55%, #86efac 100%)',
    desc: 'Your private net-worth tracker. Crypto, stocks, gold, cash — all in one place.',
    features: ['🔒 Private', '📊 Live P&L', '🤖 AI Insights', '🆓 Free'], cta: 'Get Started',
  },
  {
    id: 'theme', gradient: 'linear-gradient(165deg, #080b10 0%, #0f1520 55%, #080b10 100%)',
    accent: '#00e676', glow: 'rgba(0,230,118,0.22)',
    particles: ['🎨', '✨', '🌙', '☀️', '💎', '🖌️'], icon: '🎨',
    eyebrow: 'PERSONALISE', title: 'Make it yours',
    desc: 'Pick your look. Change anytime in Settings.', cta: 'Continue', isTheme: true,
  },
  {
    id: 'security', gradient: 'linear-gradient(165deg, #04140d 0%, #06241a 55%, #03120c 100%)',
    accent: '#00e676', glow: 'rgba(0,230,118,0.3)',
    particles: ['🔒', '👆', '🛡️', '🔐', '✨', '💚'], icon: '🔐',
    eyebrow: 'SECURITY', title: 'Lock with fingerprint',
    desc: 'Keep your portfolio for your eyes only.', cta: 'Continue', isSecurity: true,
  },
  {
    id: 'go', gradient: 'linear-gradient(165deg, #041a0c 0%, #083818 55%, #041a0c 100%)',
    accent: '#22c55e', glow: 'rgba(34,197,94,0.35)',
    particles: ['🚀', '✨', '🏆', '💚', '⭐', '🎉'], icon: '🚀',
    eyebrow: 'ALL SET', title: 'Ready to grow',
    desc: 'Your dashboard awaits.', cta: "Let's go →", final: true,
  },
]

function Particles({ step }) {
  const emojis = SLIDES[step].particles
  const items = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    emoji: emojis[(i * 3 + step) % emojis.length],
    left: 5 + ((i * 91 + step * 23) % 85),
    delay: ((i * 0.4 + step * 0.15) % 3).toFixed(2),
    dur: (3 + ((i * 0.6 + step * 0.2) % 2)).toFixed(2),
    size: 16 + ((i * 3) % 14),
  })), [step, emojis])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      {items.map((p, i) => (
        <span key={i} style={{
          position: 'absolute', bottom: '-30px', left: `${p.left}%`,
          fontSize: `${p.size}px`, opacity: 0,
          animation: `no-float ${p.dur}s ${p.delay}s linear infinite`,
        }}>{p.emoji}</span>
      ))}
    </div>
  )
}

export default function NativeOnboarding({ onDone }) {
  const [step, setStep] = useState(0)
  const [bioBusy, setBioBusy] = useState(false)
  const [bioError, setBioError] = useState('')
  const { theme, setTheme } = useTheme()
  const { enabled: bioEnabled, available: bioAvailable, enable: enableBio } = useBiometricLock()
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const s = SLIDES[step]
  const total = SLIDES.length
  const progress = ((step + 1) / total) * 100

  const goNext = useCallback(() => {
    if (step < total - 1) { setStep(x => x + 1); sfx.playWhoosh() }
  }, [step, total])

  const goPrev = useCallback(() => {
    if (step > 0) { setStep(x => x - 1); sfx.playWhoosh() }
  }, [step])

  const onTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const onTouchEnd = useCallback((e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dy) > Math.abs(dx)) return
    if (dx < -60) goNext()
    else if (dx > 60) goPrev()
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
    sfx.startAmbient()
    return () => sfx.stopAmbient()
  }, [])

  async function enableBiometric() {
    if (bioBusy) return
    setBioBusy(true); setBioError('')
    try {
      const ok = await enableBio()
      if (ok) { track('biometric_enabled_onboarding'); goNext() }
      else setBioError("Couldn't set up fingerprint. Make sure it's enrolled in device settings.")
    } finally { setBioBusy(false) }
  }

  function finish() {
    try { localStorage.setItem(ONBOARD_KEY, '1') } catch {}
    // Dispatch event so Dashboard knows to show InterestPicker
    window.dispatchEvent(new Event('wl-welcome-done'))
    onDone?.()
  }

  function getThemeIcon(th) {
    if (th.logo) return <img src={th.logo} alt={th.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
    if (th.icon && THEME_ICONS[th.icon]) return THEME_ICONS[th.icon]
    if (th.icon && th.icon.length <= 2) return th.icon
    return '🎨'
  }

  return (
    <div className="no-container" style={{ background: s.gradient }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <Particles step={step} />

      <div className="no-slide" key={step}>
        <div className="no-icon-wrap" style={{ '--accent': s.accent, '--glow': s.glow }}>
          {s.icon === 'logo' ? <Logo size={72} animated /> : <span className="no-icon-emoji">{s.icon}</span>}
        </div>
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
            {THEMES.map(th => (
              <button key={th.id} className={`no-theme-btn${theme === th.id ? ' active' : ''}`}
                style={{ borderColor: theme === th.id ? th.swatch : 'rgba(255,255,255,0.1)' }}
                onClick={() => { setTheme(th.id); track('theme_changed', { theme: th.id }) }}>
                <span className="no-theme-swatch" style={{
                  background: `radial-gradient(circle at 35% 35%, ${th.light}, ${th.swatch})`,
                  boxShadow: theme === th.id ? `0 0 10px ${th.swatch}88` : 'none',
                }}>{getThemeIcon(th)}</span>
                <span className="no-theme-label" style={{ color: theme === th.id ? th.swatch : undefined }}>{th.name}</span>
              </button>
            ))}
          </div>
        )}

        {s.isSecurity && (
          <div className="no-security">
            {!bioAvailable ? (
              <div className="no-bio-unavailable">Fingerprint not available on this device</div>
            ) : bioEnabled ? (
              <div className="no-bio-enabled">✓ Fingerprint enabled</div>
            ) : (
              <button className="no-bio-btn" onClick={enableBiometric} disabled={bioBusy}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {bioBusy ? 'Setting up…' : 'Enable fingerprint lock'}
              </button>
            )}
            {bioError && <div className="no-bio-error">{bioError}</div>}
          </div>
        )}
      </div>

      <div className="no-progress-track">
        <div className="no-progress-fill" style={{ width: `${progress}%`, background: s.accent }} />
      </div>
      <div className="no-dots">
        {SLIDES.map((_, i) => (
          <div key={i} className={`no-dot${i === step ? ' active' : i < step ? ' done' : ''}`}
            style={i <= step ? { background: s.accent } : {}} />
        ))}
      </div>

      <button className="no-cta"
        style={{
          background: s.id === 'welcome' ? 'linear-gradient(135deg, #00c853 0%, #00a040 100%)' : s.accent,
          boxShadow: s.id === 'welcome' ? '0 4px 24px rgba(0,200,83,0.45)' : `0 4px 24px ${s.glow}`,
        }}
        onClick={() => {
          sfx.playChime()
          if (s.isSecurity && !bioEnabled && bioAvailable) { enableBiometric(); return }
          if (s.final) { sfx.playTriumph(); finish(); return }
          goNext()
        }}
        disabled={false}
      >
        {s.isSecurity && bioEnabled ? "Continue →" : s.cta}
      </button>
    </div>
  )
}
