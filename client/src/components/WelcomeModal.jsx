import { useState, useEffect } from 'react'
import { track } from '../analytics'
import sfx from '../sfx'
import Logo from './Logo'
import { useTheme, THEMES } from '../ThemeContext'
import { useBiometricLock } from './BiometricLock'

const KEY = 'wl_welcomed_v2'

// Use the real brand logo on the welcome card.
const WalletLensLogo = () => <Logo size={48} animated />

const STEPS = [
  {
    id: 'welcome',
    grad: 'linear-gradient(165deg, #010a04 0%, #031008 35%, #041a0b 65%, #021008 100%)',
    accent: '#00c853',
    glow: 'rgba(0,200,83,0.28)',
    ring: 'rgba(0,200,83,0.55)',
    particles: ['₿', 'Ξ', '◎', '₳', '📈', '💎'],
    icon: <WalletLensLogo />,
    scanLine: true,
    eyebrow: 'WELCOME TO',
    title: 'WalletLens',
    gradTitle: true,
    titleGrad: 'linear-gradient(135deg, #00c853 0%, #4ade80 55%, #86efac 100%)',
    desc: 'Your private net-worth tracker & investment manager — crypto, stocks, gold, cash & more, all in one place. No account, no server; your data stays on your device forever.',
    features: [
      { icon: '🔒', label: '100% Private' },
      { icon: '📊', label: 'Live P&L' },
      { icon: '🤖', label: 'AI Insights' },
      { icon: '🆓', label: 'Free Forever' },
    ],
    cta: 'Show me around',
  },
  {
    id: 'theme',
    grad: 'linear-gradient(165deg, #080b10 0%, #0f1520 55%, #080b10 100%)',
    accent: '#00e676',
    glow: 'rgba(0,230,118,0.22)',
    ring: 'rgba(0,230,118,0.45)',
    particles: ['🎨', '✨', '🌙', '☀️', '💎', '🖌️'],
    icon: '🎨',
    eyebrow: 'PERSONALISE',
    title: 'Make it yours',
    desc: 'Pick your look. You can always change this in Settings.',
    cta: 'Looks great →',
    isThemeStep: true,
  },
  {
    id: 'portfolio',
    grad: 'linear-gradient(165deg, #041a10 0%, #073a1e 55%, #051a10 100%)',
    accent: '#34d399',
    glow: 'rgba(52,211,153,0.32)',
    ring: 'rgba(52,211,153,0.5)',
    particles: ['📈', '💰', '💎', '🚀', '📊', '💹'],
    icon: '💼',
    eyebrow: 'PORTFOLIO',
    title: 'Track Every Trade',
    desc: 'Log buys & sells. WalletLens auto-calculates your P&L, average cost, and total performance in real-time.',
    cta: 'Got it →',
  },
  {
    id: 'ai',
    grad: 'linear-gradient(165deg, #04101a 0%, #081a35 55%, #0a1428 100%)',
    accent: '#60a5fa',
    glow: 'rgba(96,165,250,0.32)',
    ring: 'rgba(96,165,250,0.5)',
    particles: ['🤖', '⚡', '🎯', '📡', '🔮', '🧠'],
    icon: '⚡',
    eyebrow: 'AI POWERED',
    title: 'Trade Smarter',
    desc: 'Buy/sell signals, whale tracking, risk scanner, and AI portfolio advice — all built in, free.',
    cta: 'Love it →',
  },
  {
    id: 'security',
    grad: 'linear-gradient(165deg, #04140d 0%, #06241a 55%, #03120c 100%)',
    accent: '#00e676',
    glow: 'rgba(0,230,118,0.3)',
    ring: 'rgba(0,230,118,0.55)',
    particles: ['🔒', '👆', '🛡️', '🔐', '✨', '💚'],
    icon: '🔐',
    eyebrow: 'PRIVATE & SECURE',
    title: 'Lock with your fingerprint',
    desc: 'Require your fingerprint or face each time WalletLens opens. Your data already stays on your device — this keeps it for your eyes only.',
    cta: 'Maybe later',
    isSecurityStep: true,
  },
  {
    id: 'go',
    grad: 'linear-gradient(165deg, #041a0c 0%, #083818 55%, #041a0c 100%)',
    accent: '#22c55e',
    glow: 'rgba(34,197,94,0.35)',
    ring: 'rgba(34,197,94,0.55)',
    particles: ['🚀', '✨', '🏆', '💚', '⭐', '🎉'],
    icon: '🚀',
    eyebrow: 'LAST STEP',
    title: 'Set up your portfolio',
    desc: "Now pick what you track and pop in your balances — your net worth fills in instantly. Takes just seconds.",
    cta: "Let's set it up →",
    final: true,
  },
]

function buildParticles(stepIdx) {
  const emojis = STEPS[stepIdx].particles
  return Array.from({ length: 10 }, (_, i) => ({
    emoji: emojis[(i * 3 + stepIdx) % emojis.length],
    left: 4 + ((i * 91 + stepIdx * 23) % 88),
    delay: ((i * 0.38 + stepIdx * 0.12) % 2.6).toFixed(2),
    dur:   (2.6 + ((i * 0.58 + stepIdx * 0.17) % 2.0)).toFixed(2),
  }))
}

export default function WelcomeModal() {
  const [step, setStep]       = useState(0)
  const [visible, setVisible] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const [bioBusy, setBioBusy] = useState(false)
  const [bioError, setBioError] = useState('')
  const { theme, mode, setTheme, setMode } = useTheme()
  const { enabled: bioEnabled, available: bioAvailable, enable: enableBio } = useBiometricLock()

  async function enableBiometric() {
    if (bioBusy) return
    setBioBusy(true)
    setBioError('')
    try {
      const ok = await enableBio()
      if (ok) { track('biometric_enabled_onboarding'); next() }
      else setBioError('Couldn’t set up fingerprint lock. Make sure a fingerprint or face is enrolled in your device settings, then try again.')
    } finally {
      setBioBusy(false)
    }
  }

  useEffect(() => {
    if (localStorage.getItem(KEY)) return
    const t = setTimeout(() => setVisible(true), 700)
    return () => clearTimeout(t)
  }, [])

  function finish() {
    localStorage.setItem(KEY, '1')
    setVisible(false)
    sfx.play('complete'); sfx.haptic([12, 40, 18])
    track('welcome_modal_finished', { steps_seen: step + 1 })
    try { window.dispatchEvent(new Event('wl-welcome-done')) } catch {}
  }

  function next() {
    if (step >= STEPS.length - 1) { finish(); return }
    sfx.play(step === 0 ? 'welcome' : 'step'); sfx.haptic(9)
    setAnimKey(k => k + 1)
    setStep(s => s + 1)
    track('welcome_modal_step', { step: step + 1 })
  }

  function skip() {
    localStorage.setItem(KEY, '1')
    setVisible(false)
    track('welcome_modal_skipped', { at_step: step })
    try { window.dispatchEvent(new Event('wl-welcome-done')) } catch {}
  }

  if (!visible) return null

  const s = STEPS[step]
  const particles = buildParticles(step)
  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="wm-overlay" onClick={e => e.target === e.currentTarget && skip()}>
      <div className="wm-sheet">

        {/* ── Header: gradient bg + particles + icon ── */}
        <div className="wm-header" style={{ background: s.grad }}>
          <div className="wm-handle" />

          {/* Scan-line effect — welcome step only */}
          {s.scanLine && <div className="wm-scanline" />}

          {/* Subtle grid texture — welcome step only */}
          {s.scanLine && <div className="wm-grid" aria-hidden="true" />}

          {/* Ambient glow blob */}
          <div className="wm-blob" style={{ background: s.glow }} />

          {/* Floating particles */}
          <div className="wm-particles" aria-hidden="true">
            {particles.map((p, i) => (
              <span key={`${step}-${i}`} className="wm-particle" style={{
                left: `${p.left}%`,
                animationDuration: `${p.dur}s`,
                animationDelay: `${p.delay}s`,
              }}>{p.emoji}</span>
            ))}
          </div>

          {/* Glowing icon */}
          <div
            className={`wm-icon-ring${s.scanLine ? ' wm-icon-ring-logo' : ''}`}
            style={{ boxShadow: `0 0 0 2px ${s.ring}, 0 0 40px ${s.glow}, 0 0 80px ${s.glow}44` }}
          >
            <div className="wm-icon" key={`icon-${step}`}>{s.icon}</div>
          </div>

          {/* Eyebrow + Title */}
          <div className="wm-eyebrow" style={{ color: s.accent }}>{s.eyebrow}</div>
          {s.gradTitle
            ? <div className="wm-title wm-title-grad" style={{ backgroundImage: s.titleGrad }}>{s.title}</div>
            : <div className="wm-title" style={{ color: '#fff' }}>{s.title}</div>
          }
        </div>

        {/* ── Body ── */}
        <div className="wm-body" key={animKey}>
          <p className="wm-desc">{s.desc}</p>

          {s.features && (
            <div className="wm-features">
              {s.features.map((f, i) => (
                <div key={i} className="wm-pill" style={{ animationDelay: `${i * 0.06}s`, borderColor: `${s.accent}33` }}>
                  <span>{f.icon}</span>{f.label}
                </div>
              ))}
            </div>
          )}

          {s.isThemeStep && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', margin: '0.2rem 0 0.5rem' }}>
              {/* Dark / Light toggle */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {['dark', 'light'].map(m => (
                  <button
                    key={m}
                    onClick={() => { sfx.play('select'); sfx.haptic(6); setMode(m) }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem',
                      padding: '0.7rem 0.5rem',
                      background: mode === m ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1.5px solid ${mode === m ? 'rgba(0,230,118,0.55)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '12px', cursor: 'pointer', transition: 'all 0.18s ease',
                    }}
                  >
                    <span style={{ fontSize: '1.35rem' }}>{m === 'dark' ? '🌙' : '☀️'}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: mode === m ? '#00e676' : 'rgba(255,255,255,0.7)', textTransform: 'capitalize' }}>{m}</span>
                  </button>
                ))}
              </div>
              {/* Color theme cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem' }}>
                {THEMES.map(th => (
                  <button
                    key={th.id}
                    onClick={() => { sfx.play('select'); sfx.haptic(6); setTheme(th.id) }}
                    aria-label={th.name}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                      padding: '0.55rem 0.4rem 0.5rem',
                      background: theme === th.id ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                      border: `1.5px solid ${theme === th.id ? th.swatch : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '12px', cursor: 'pointer',
                      transition: 'all 0.16s ease',
                      transform: theme === th.id ? 'scale(1.04)' : 'scale(1)',
                      boxShadow: theme === th.id ? `0 0 12px ${th.swatch}44` : 'none',
                    }}
                  >
                    <span style={{
                      width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                      background: `radial-gradient(circle at 35% 35%, ${th.light}, ${th.swatch})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.05rem', overflow: 'hidden',
                      boxShadow: theme === th.id ? `0 0 8px ${th.swatch}88` : 'none',
                    }}>
                      {th.logo
                        ? <img src={th.logo} alt={th.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                        : th.icon}
                    </span>
                    <span style={{ fontSize: '0.67rem', fontWeight: 700, color: theme === th.id ? th.swatch : 'rgba(255,255,255,0.65)', lineHeight: 1 }}>{th.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {s.isSecurityStep && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', margin: '0.1rem 0 0.3rem' }}>
              {!bioAvailable ? (
                <div style={{
                  fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', textAlign: 'center',
                  padding: '0.7rem', background: 'rgba(255,255,255,0.04)', borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  Fingerprint lock isn’t available on this device — you can still continue.
                </div>
              ) : bioEnabled ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  fontSize: '0.92rem', fontWeight: 700, color: '#00e676',
                  padding: '0.85rem', background: 'rgba(0,230,118,0.1)', borderRadius: '14px',
                  border: '1.5px solid rgba(0,230,118,0.45)',
                }}>
                  ✓ Fingerprint lock enabled
                </div>
              ) : (
                <button
                  onClick={enableBiometric}
                  disabled={bioBusy}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem',
                    width: '100%', padding: '0.95rem', borderRadius: '14px', border: 'none',
                    background: 'linear-gradient(135deg, #00e676 0%, #00c853 50%, #00a040 100%)',
                    color: '#012', fontWeight: 800, fontSize: '0.98rem', cursor: bioBusy ? 'default' : 'pointer',
                    boxShadow: '0 5px 20px rgba(0,200,83,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
                    opacity: bioBusy ? 0.7 : 1, transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  {bioBusy ? 'Setting up…' : 'Enable fingerprint lock'}
                </button>
              )}
              {bioError && (
                <div style={{
                  fontSize: '0.78rem', color: 'rgba(255,180,180,0.9)', textAlign: 'center',
                  lineHeight: 1.5, padding: '0.1rem 0.3rem',
                }}>
                  {bioError}
                </div>
              )}
            </div>
          )}

          <div className="wm-progress-track">
            <div className="wm-progress-fill" style={{ width: `${progress}%`, background: s.accent }} />
          </div>
          <div className="wm-dots">
            {STEPS.map((_, i) => (
              <div key={i} className={`wm-dot${i === step ? ' wm-dot-active' : i < step ? ' wm-dot-done' : ''}`}
                style={i <= step ? { background: s.accent } : {}} />
            ))}
          </div>

          <button
            className="wm-cta"
            style={{
              background: s.id === 'welcome'
                ? 'linear-gradient(135deg, #00c853 0%, #00a040 100%)'
                : s.accent,
              boxShadow: s.id === 'welcome' ? `0 4px 20px rgba(0,200,83,0.45)` : undefined,
            }}
            onClick={next}
          >
            {s.isSecurityStep && bioEnabled ? 'Continue →' : s.cta}
          </button>
        </div>
      </div>
    </div>
  )
}
