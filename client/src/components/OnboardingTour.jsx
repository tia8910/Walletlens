import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'

const TOUR_KEY = 'wl_tour_done_v2'

// card = full bottom-sheet card; spotlight = highlights a nav element
const STEPS = [
  {
    id: 'welcome', mode: 'card',
    icon: '👋',
    title: 'Welcome to WalletLens',
    subtitle: 'Smart crypto portfolio tracking',
    desc: 'No account. No server. Your data stays privately on your device. Let\'s take a 60-second tour.',
    cta: "Let's go →",
    accent: '#a78bfa',
    grad: 'linear-gradient(135deg,#1e0a4a 0%,#2d1b69 100%)',
  },
  {
    id: 'trades', mode: 'spotlight',
    target: '.wl-nav-item:nth-child(2)',
    icon: '📈',
    title: 'Log Every Trade',
    desc: 'Record buys & sells. WalletLens auto-tracks your P&L, average cost, and total performance.',
    cta: 'Got it →',
    accent: '#22c55e',
  },
  {
    id: 'dashboard', mode: 'spotlight',
    target: '.wl-nav-item:nth-child(1)',
    icon: '🏠',
    title: 'Portfolio Hub',
    desc: 'Total value, AI analysis, price alerts, and risk scores — all in one glance.',
    cta: 'Got it →',
    accent: '#60a5fa',
  },
  {
    id: 'market', mode: 'spotlight',
    target: '.wl-nav-item:nth-child(3)',
    icon: '📊',
    title: 'Live Market Data',
    desc: 'Real-time prices, 24h changes, and market caps. Tap any coin for full analysis.',
    cta: 'Got it →',
    accent: '#f59e0b',
  },
  {
    id: 'whales', mode: 'spotlight',
    target: '.wl-nav-item:nth-child(4)',
    icon: '🐋',
    title: 'Follow Smart Money',
    desc: 'Track the biggest crypto wallets. See what whales are buying before the crowd reacts.',
    cta: 'Got it →',
    accent: '#38bdf8',
  },
  {
    id: 'alpha', mode: 'spotlight',
    target: '.wl-nav-item:nth-child(5)',
    icon: '⚡',
    title: 'Portfolio Alpha',
    desc: 'AI-powered Alpha Score, hidden gems, and smart money signals — all for your portfolio.',
    cta: 'Got it →',
    accent: '#a78bfa',
  },
  {
    id: 'ai', mode: 'card',
    icon: '🤖',
    title: 'AI & Safety Tools',
    desc: 'Risk Scanner catches scams & rug pulls. AI Advisor gives personalised portfolio recommendations. Academy sharpens your crypto IQ.',
    cta: 'Got it →',
    accent: '#f87171',
    grad: 'linear-gradient(135deg,#2d0808 0%,#3d1515 100%)',
  },
  {
    id: 'done', mode: 'card',
    icon: '🚀',
    title: "You're All Set!",
    subtitle: 'Time to grow your portfolio',
    desc: 'Log your first trade or explore the Market. WalletLens works best with your real holdings.',
    cta: 'Start using WalletLens',
    accent: '#22c55e',
    grad: 'linear-gradient(135deg,#041a08 0%,#0a2a10 100%)',
    final: true,
  },
]

const PAD = 10

function useSpotlightRect(selector) {
  const [rect, setRect] = useState(null)
  useEffect(() => {
    function measure() {
      const el = selector ? document.querySelector(selector) : null
      setRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [selector])
  return rect
}

function SpotlightStep({ step, onNext, onSkip, stepNum, total }) {
  const raw = useSpotlightRect(step.target)

  const spot = raw ? {
    top:    raw.top    - PAD,
    left:   raw.left   - PAD,
    width:  raw.width  + PAD * 2,
    height: raw.height + PAD * 2,
  } : null

  // tooltip: centered on spotlight, above if in bottom half of screen
  const vw = window.innerWidth
  const vh = window.innerHeight
  const TW = Math.min(vw - 32, 320)
  const spotCx  = spot ? spot.left + spot.width  / 2 : vw / 2
  const spotMidY = spot ? spot.top  + spot.height / 2 : vh / 2
  const above  = spotMidY > vh / 2
  const tx = Math.max(16, Math.min(vw - TW - 16, spotCx - TW / 2))
  const ty = above
    ? (spot ? spot.top - 16 : vh / 2 - 100)   // will translate up
    : (spot ? spot.top + spot.height + 16 : vh / 2 + 60)

  return (
    <div className="tour-sp-root" onClick={onSkip}>
      {/* Dark overlay via box-shadow on spotlight box */}
      {spot && (
        <div
          className="tour-sp-hole"
          style={{
            top: spot.top, left: spot.left,
            width: spot.width, height: spot.height,
            boxShadow: `0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 2.5px ${step.accent}, 0 0 18px 4px ${step.accent}55`,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className={`tour-tt ${above ? 'tour-tt-above' : 'tour-tt-below'}`}
        style={{ top: ty, left: tx, width: TW, '--tt-accent': step.accent }}
        onClick={e => e.stopPropagation()}
      >
        {/* Arrow pointing to spotlight */}
        <div className={`tour-tt-arrow ${above ? 'tour-tt-arrow-down' : 'tour-tt-arrow-up'}`}
          style={{ left: Math.min(TW - 28, Math.max(12, spotCx - tx - 8)), borderColor: step.accent + '55' }}
        />

        <div className="tour-tt-top">
          <span className="tour-tt-icon">{step.icon}</span>
          <button className="tour-tt-skip" onClick={onSkip}>Skip tour</button>
        </div>
        <div className="tour-tt-title">{step.title}</div>
        <div className="tour-tt-desc">{step.desc}</div>
        <div className="tour-tt-footer">
          <span className="tour-tt-count">{stepNum} / {total}</span>
          <button className="tour-tt-cta" style={{ background: step.accent }} onClick={e => { e.stopPropagation(); onNext() }}>
            {step.cta}
          </button>
        </div>
      </div>
    </div>
  )
}

function CardStep({ step, onNext, onSkip, stepNum, total, closing }) {
  const progress = (stepNum / total) * 100
  return (
    <div className={`tour-overlay ${closing ? 'tour-closing' : 'tour-open'}`}>
      <div className="tour-card2" style={{ '--tc-accent': step.accent }}>

        {/* Gradient header */}
        <div className="tour-card2-header" style={{ background: step.grad || `linear-gradient(135deg,${step.accent}22,${step.accent}08)` }}>
          {!step.final && (
            <button className="tour-card2-skip" onClick={onSkip}>Skip tour</button>
          )}
          <div className="tour-card2-icon-wrap" style={{ background: step.accent + '22', border: `1.5px solid ${step.accent}44` }}>
            <span className="tour-card2-icon">{step.icon}</span>
          </div>
          {step.subtitle && <div className="tour-card2-subtitle" style={{ color: step.accent }}>{step.subtitle}</div>}
        </div>

        {/* Body */}
        <div className="tour-card2-body">
          <div className="tour-card2-title">{step.title}</div>
          <div className="tour-card2-desc">{step.desc}</div>

          {/* Step indicators */}
          <div className="tour-card2-dots">
            {STEPS.map((_, i) => (
              <div key={i} className={`tour-card2-dot${i === stepNum - 1 ? ' active' : i < stepNum - 1 ? ' done' : ''}`}
                style={i === stepNum - 1 ? { background: step.accent } : {}} />
            ))}
          </div>

          <div className="tour-card2-progress">
            <div className="tour-card2-progress-fill" style={{ width: `${progress}%`, background: step.accent }} />
          </div>

          <button className="tour-card2-cta" style={{ background: step.accent }} onClick={onNext}>
            {step.cta}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingTour() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        const t = setTimeout(() => setVisible(true), 900)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])

  const dismiss = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setVisible(false)
      try { localStorage.setItem(TOUR_KEY, '1') } catch {}
      track('tour_dismissed', { at_step: step })
    }, 280)
  }, [step])

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) { dismiss(); navigate('/dashboard'); return }
    track('tour_step', { step: step + 1, id: STEPS[step + 1]?.id })
    setStep(s => s + 1)
  }, [step, dismiss, navigate])

  if (!visible) return null

  const s = STEPS[step]

  if (s.mode === 'spotlight') {
    return <SpotlightStep step={s} onNext={next} onSkip={dismiss} stepNum={step + 1} total={STEPS.length} />
  }

  return <CardStep step={s} onNext={next} onSkip={dismiss} stepNum={step + 1} total={STEPS.length} closing={closing} />
}
