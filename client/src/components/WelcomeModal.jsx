import { useState, useEffect } from 'react'
import { track } from '../analytics'

const KEY = 'wl_welcomed_v2'

const STEPS = [
  {
    id: 'welcome',
    grad: 'linear-gradient(165deg, #1c0a48 0%, #0e2055 55%, #082818 100%)',
    accent: '#a78bfa',
    glow: 'rgba(167,139,250,0.32)',
    ring: 'rgba(167,139,250,0.5)',
    particles: ['₿', 'Ξ', '◎', '₳', '⟠', '🔮'],
    icon: '🌐',
    eyebrow: 'WELCOME TO',
    title: 'WalletLens',
    gradTitle: true,
    titleGrad: 'linear-gradient(135deg, #c4b5fd 0%, #a78bfa 40%, #60a5fa 100%)',
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

// Deterministic particle positions per step
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
          {/* Drag handle */}
          <div className="wm-handle" />

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
          <div className="wm-icon-ring" style={{ boxShadow: `0 0 0 2px ${s.ring}, 0 0 40px ${s.glow}, 0 0 80px ${s.glow}44` }}>
            <span className="wm-icon" key={`icon-${step}`}>{s.icon}</span>
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

          {/* Feature pills — welcome step only */}
          {s.features && (
            <div className="wm-features">
              {s.features.map((f, i) => (
                <div key={i} className="wm-pill" style={{ animationDelay: `${i * 0.06}s` }}>
                  <span>{f.icon}</span>{f.label}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar + dots */}
          <div className="wm-progress-track">
            <div className="wm-progress-fill" style={{ width: `${progress}%`, background: s.accent }} />
          </div>
          <div className="wm-dots">
            {STEPS.map((_, i) => (
              <div key={i} className={`wm-dot${i === step ? ' wm-dot-active' : i < step ? ' wm-dot-done' : ''}`}
                style={i <= step ? { background: s.accent } : {}} />
            ))}
          </div>

          {/* CTA */}
          <button className="wm-cta" style={{ background: s.accent }} onClick={next}>
            {s.cta}
          </button>

          {/* Skip */}
          {!s.final && <button className="wm-skip" onClick={skip}>Skip tour</button>}
        </div>
      </div>
    </div>
  )
}
