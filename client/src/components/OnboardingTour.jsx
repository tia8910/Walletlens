import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'

const TOUR_KEY = 'wl_tour_done_v1'

const STEPS = [
  {
    icon: '👋',
    title: 'Welcome to WalletLens',
    desc: 'Your smart crypto portfolio companion. Let\'s take a quick tour so you can get started in under 2 minutes.',
    cta: 'Let\'s go →',
    accent: '#a78bfa',
  },
  {
    icon: '📈',
    title: 'Add Your First Trade',
    desc: 'Tap Trades in the bottom nav to log a buy or sell. WalletLens tracks your P&L, average cost, and performance automatically.',
    cta: 'Got it →',
    accent: '#34d399',
    nav: '/transactions',
    navLabel: 'Go to Trades',
  },
  {
    icon: '🏠',
    title: 'Your Dashboard',
    desc: 'See your total portfolio value, each holding\'s performance, AI analysis, price alerts, and risk scores — all in one place.',
    cta: 'Got it →',
    accent: '#60a5fa',
    nav: '/dashboard',
    navLabel: 'Go to Dashboard',
  },
  {
    icon: '📊',
    title: 'Live Market',
    desc: 'Track real-time prices, 24h changes, market caps, and trending coins. Tap any coin to see its full detail page.',
    cta: 'Got it →',
    accent: '#f59e0b',
    nav: '/market',
    navLabel: 'Go to Market',
  },
  {
    icon: '🐋',
    title: 'Whale Tracker',
    desc: 'See what the biggest wallets in crypto are buying and selling. Follow smart money before the crowd notices.',
    cta: 'Got it →',
    accent: '#38bdf8',
    nav: '/whales',
    navLabel: 'Go to Whales',
  },
  {
    icon: '⚡',
    title: 'Portfolio Alpha',
    desc: 'Get an AI-powered Alpha Score for your portfolio. Discover hidden gems, smart money signals, and top gainers.',
    cta: 'Got it →',
    accent: '#a78bfa',
    nav: '/alpha',
    navLabel: 'Go to Alpha',
  },
  {
    icon: '🛡️',
    title: 'Risk Scanner & Scam Catcher',
    desc: 'Scan every coin in your portfolio for honeypots, rug pulls, mint traps, and whale concentration risks. Paste any contract address to check it instantly.',
    cta: 'Got it →',
    accent: '#f87171',
  },
  {
    icon: '🎓',
    title: 'Academy',
    desc: 'Sharpen your investment knowledge with daily challenges, earn Investor IQ points, unlock badges, and play Crypto Guessr.',
    cta: 'Got it →',
    accent: '#fbbf24',
    nav: '/academy',
    navLabel: 'Go to Academy',
  },
  {
    icon: '🚀',
    title: 'You\'re all set!',
    desc: 'Start by adding your first trade, or explore the Market to discover new opportunities. WalletLens works best with your real portfolio.',
    cta: 'Start using WalletLens',
    accent: '#34d399',
    final: true,
  },
]

export default function OnboardingTour() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        // Small delay so the dashboard renders first
        const t = setTimeout(() => setVisible(true), 800)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])

  function dismiss() {
    setClosing(true)
    setTimeout(() => {
      setVisible(false)
      try { localStorage.setItem(TOUR_KEY, '1') } catch {}
      track('tour_dismissed', { at_step: step })
    }, 280)
  }

  function next() {
    if (step >= STEPS.length - 1) {
      dismiss()
      navigate('/dashboard')
      return
    }
    setStep(s => s + 1)
    track('tour_step', { step: step + 1 })
  }

  function goNav(path) {
    navigate(path)
    track('tour_nav', { to: path, step })
  }

  if (!visible) return null

  const s = STEPS[step]
  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className={`tour-overlay ${closing ? 'tour-closing' : 'tour-open'}`}>
      <div className="tour-card" style={{ '--tour-accent': s.accent }}>

        {/* Skip */}
        {!s.final && (
          <button className="tour-skip" onClick={dismiss}>Skip tour</button>
        )}

        {/* Progress dots */}
        <div className="tour-dots">
          {STEPS.map((_, i) => (
            <div key={i} className={`tour-dot ${i === step ? 'tour-dot-active' : i < step ? 'tour-dot-done' : ''}`}
              style={i === step ? { background: s.accent } : {}}
            />
          ))}
        </div>

        {/* Progress bar */}
        <div className="tour-progress-bar">
          <div className="tour-progress-fill" style={{ width: `${progress}%`, background: s.accent }} />
        </div>

        {/* Icon */}
        <div className="tour-icon" style={{ background: s.accent + '18', border: `1px solid ${s.accent}30` }}>
          {s.icon}
        </div>

        {/* Content */}
        <div className="tour-title">{s.title}</div>
        <div className="tour-desc">{s.desc}</div>

        {/* Optional nav shortcut */}
        {s.nav && (
          <button className="tour-nav-btn" style={{ color: s.accent, borderColor: s.accent + '40', background: s.accent + '10' }}
            onClick={() => goNav(s.nav)}>
            {s.navLabel} ↗
          </button>
        )}

        {/* Step counter */}
        <div className="tour-step-count">{step + 1} / {STEPS.length}</div>

        {/* CTA */}
        <button className="tour-cta" style={{ background: s.accent }} onClick={next}>
          {s.cta}
        </button>
      </div>
    </div>
  )
}
