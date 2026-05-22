import { useState, useEffect } from 'react'
import { track } from '../analytics'

const KEY = 'wl_welcomed_v2'

const WalletLensLogo = () => (
  <svg viewBox="0 0 64 64" width="46" height="46" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="24" stroke="rgba(0,200,83,0.2)" strokeWidth="1"/>
    <circle cx="32" cy="32" r="17" stroke="#00c853" strokeWidth="3" fill="none" strokeOpacity="0.9"/>
    <circle cx="32" cy="32" r="8.5" fill="#00c853"/>
    <circle cx="32" cy="32" r="3.5" fill="rgba(0,0,0,0.45)"/>
    <line x1="32" y1="8" x2="32" y2="14" stroke="rgba(0,200,83,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="32" y1="50" x2="32" y2="56" stroke="rgba(0,200,83,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="8" y1="32" x2="14" y2="32" stroke="rgba(0,200,83,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="50" y1="32" x2="56" y2="32" stroke="rgba(0,200,83,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

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
