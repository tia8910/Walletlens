import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
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

function Particles({ step }) {
  const items = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    char: ['◆', '●', '○', '△', '◇', '▽'][(i + step) % 6],
    left: 5 + ((i * 91 + step * 23) % 85),
    delay: ((i * 0.5 + step * 0.2) % 3).toFixed(2),
    dur: (3 + ((i * 0.6 + step * 0.2) % 2)).toFixed(2),
    size: 8 + ((i * 3) % 8),
  })), [step])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      {items.map((p, i) => (
        <span key={i} style={{
          position: 'absolute', bottom: '-30px', left: `${p.left}%`,
          fontSize: `${p.size}px`, opacity: 0,
          animation: `no-float ${p.dur}s ${p.delay}s linear infinite`,
        }}>{p.char}</span>
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
  const [swiping, setSwiping] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)

  const s = SLIDES[step]
  const total = SLIDES.length

  const goNext = useCallback(() => {
    if (step < total - 1) { setStep(x => x + 1); sfx.playWhoosh() }
  }, [step, total])

  const goPrev = useCallback(() => {
    if (step > 0) { setStep(x => x - 1); sfx.playWhoosh() }
  }, [step])

  const goTo = useCallback((i) => {
    if (i >= 0 && i < total && i !== step) {
      setStep(i)
      sfx.playWhoosh()
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
    window.dispatchEvent(new Event('wl-welcome-done'))
    onDone?.()
  }

  return (
    <div className="no-container" style={{ background: s.gradient }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <Particles step={step} />

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
            {THEMES.map(th => (
              <button key={th.id} className={`no-theme-btn${theme === th.id ? ' active' : ''}`}
                style={{ borderColor: theme === th.id ? th.swatch : 'rgba(255,255,255,0.1)' }}
                onClick={() => { setTheme(th.id); track('theme_changed', { theme: th.id }) }}>
                <span className="no-theme-swatch" style={{
                  background: `radial-gradient(circle at 35% 35%, ${th.light}, ${th.swatch})`,
                  boxShadow: theme === th.id ? `0 0 10px ${th.swatch}88` : 'none',
                }} />
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

      {/* Interactive dot slider — tappable, no text */}
      <div className="no-dots">
        {SLIDES.map((_, i) => (
          <button key={i} className={`no-dot${i === step ? ' active' : i < step ? ' done' : ''}`}
            style={i === step ? { background: s.accent, boxShadow: `0 0 8px ${s.accent}88` } : i < step ? { background: s.accent } : {}}
            onClick={() => goTo(i)}
            aria-label={`Slide ${i + 1}`} />
        ))}
      </div>

      {/* Final slide: pulsing circle to launch — no icon */}
      {s.final && (
        <div className="no-launch-area">
          <button className="no-launch-circle" onClick={() => { sfx.playTriumph(); finish() }}
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
