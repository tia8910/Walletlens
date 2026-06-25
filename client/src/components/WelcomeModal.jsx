import { useState, useEffect } from 'react'
import { track } from '../analytics'
import Logo from './Logo'
import { useTheme, THEMES } from '../ThemeContext'

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
    desc: 'Smart crypto tracking — no account, no server. Your data stays on your device forever.',
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
    id: 'go',
    grad: 'linear-gradient(165deg, #041a0c 0%, #083818 55%, #041a0c 100%)',
    accent: '#22c55e',
    glow: 'rgba(34,197,94,0.35)',
    ring: 'rgba(34,197,94,0.55)',
    particles: ['🚀', '✨', '🏆', '💚', '⭐', '🎉'],
    icon: '🚀',
    eyebrow: "YOU'RE ALL SET",
    title: "Let's Go!",
    desc: "Add your first trade or explore live market prices. Building your portfolio takes just seconds.",
    cta: 'Start Now',
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
  const { theme, mode, setTheme, setMode } = useTheme()

  useEffect(() => {
    if (localStorage.getItem(KEY)) return
    const t = setTimeout(() => setVisible(true), 700)
    return () => clearTimeout(t)
  }, [])

  function finish() {
    localStorage.setItem(KEY, '1')
    setVisible(false)
    track('welcome_modal_finished', { steps_seen: step + 1 })
  }

  function next() {
    if (step >= STEPS.length - 1) { finish(); return }
    setAnimKey(k => k + 1)
    setStep(s => s + 1)
    track('welcome_modal_step', { step: step + 1 })
  }

  function skip() {
    localStorage.setItem(KEY, '1')
    setVisible(false)
    track('welcome_modal_skipped', { at_step: step })
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
                    onClick={() => setMode(m)}
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
              {/* Color theme swatches */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    title={t.name}
                    style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: t.swatch,
                      border: `2.5px solid ${theme === t.id ? '#fff' : 'transparent'}`,
                      outline: theme === t.id ? `2px solid ${t.swatch}` : 'none',
                      outlineOffset: '2px',
                      cursor: 'pointer', transition: 'all 0.16s ease',
                      transform: theme === t.id ? 'scale(1.18)' : 'scale(1)',
                      flexShrink: 0,
                    }}
                    aria-label={t.name}
                  />
                ))}
              </div>
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
            {s.cta}
          </button>

          {!s.final && <button className="wm-skip" onClick={skip}>Skip tour</button>}
        </div>
      </div>
    </div>
  )
}
