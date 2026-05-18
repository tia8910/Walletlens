import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'

const KEY = 'wl_welcomed_v1'

const STEPS = [
  {
    icon: '👋',
    title: 'Welcome to WalletLens',
    desc: 'Your smart portfolio tracker. Track crypto, stocks, metals and more — with AI insights, price alerts and risk analysis. Free, no sign-up needed.',
    cta: 'Show me around',
    accent: '#a78bfa',
  },
  {
    icon: '📈',
    title: 'Add Your First Trade',
    desc: 'Tap the Trades button to log a buy or sell. WalletLens calculates your P&L, average cost, and performance automatically.',
    cta: 'Got it',
    accent: 'var(--g)',
  },
  {
    icon: '🤖',
    title: 'AI-Powered Insights',
    desc: 'Get personalised buy/sell signals, risk scores, and price alerts — all without entering any API keys.',
    cta: "Let's start →",
    accent: '#60a5fa',
    final: true,
  },
]

export default function WelcomeModal() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (localStorage.getItem(KEY)) return
    const t = setTimeout(() => setVisible(true), 600)
    return () => clearTimeout(t)
  }, [])

  function finish() {
    localStorage.setItem(KEY, '1')
    setVisible(false)
    track('welcome_modal_finished', { steps_seen: step + 1 })
    navigate('/dashboard')
  }

  function next() {
    if (step >= STEPS.length - 1) { finish(); return }
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

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
      animation: 'fadeIn 0.25s ease',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #0d2018 0%, #071410 100%)',
        border: '1px solid rgba(var(--g-rgb),0.25)',
        borderRadius: '20px', padding: '2rem 1.75rem',
        maxWidth: '360px', width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        textAlign: 'center',
        position: 'relative',
      }}>
        {!s.final && (
          <button onClick={skip} style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
            fontSize: '0.75rem', cursor: 'pointer',
          }}>Skip</button>
        )}

        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '1.5rem' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? '20px' : '6px', height: '6px',
              borderRadius: '3px',
              background: i <= step ? s.accent : 'rgba(255,255,255,0.15)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        <div style={{
          fontSize: '3rem',
          background: s.accent + '18', border: `1px solid ${s.accent}30`,
          width: '72px', height: '72px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.25rem',
        }}>{s.icon}</div>

        <div style={{ fontWeight: 700, fontSize: '1.15rem', color: 'white', marginBottom: '0.6rem' }}>
          {s.title}
        </div>
        <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: '1.75rem' }}>
          {s.desc}
        </div>

        <button onClick={next} style={{
          width: '100%', padding: '0.8rem',
          background: s.accent, color: '#000',
          border: 'none', borderRadius: '12px',
          fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
          transition: 'opacity 0.15s',
        }}>{s.cta}</button>
      </div>
    </div>
  )
}
