import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'
import { loadData, saveData } from '../data/storage'

const KEY = 'wl_welcomed_v1'
const DEMO_KEY = 'wl_demo_loaded_v1'

// Seed a realistic demo portfolio so new users see value immediately.
// Uses transactions (not raw holdings) so the portfolio engine works correctly.
function seedDemoPortfolio() {
  if (localStorage.getItem(DEMO_KEY)) return
  const txs = loadData('transactions')
  if (txs.length > 0) return // real user — don't overwrite

  // Ensure a default wallet exists
  let wallets = loadData('wallets')
  if (!wallets.length) {
    wallets = [{ id: 1, name: 'My Wallet', created_at: new Date().toISOString() }]
    saveData('wallets', wallets)
  }
  const walletId = wallets[0].id

  const now = new Date()
  const daysAgo = (d) => new Date(now - d * 86400000).toISOString().split('T')[0]

  const demoTxs = [
    {
      id: 9001, wallet_id: walletId, type: 'buy', category: 'crypto',
      coin_id: 'bitcoin', coin_symbol: 'BTC', coin_name: 'Bitcoin',
      coin_image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
      amount: 0.05, price_per_unit: 62000, total_cost: 3100,
      exchange: 'Binance', notes: '', date: daysAgo(30), created_at: new Date().toISOString(),
    },
    {
      id: 9002, wallet_id: walletId, type: 'buy', category: 'crypto',
      coin_id: 'ethereum', coin_symbol: 'ETH', coin_name: 'Ethereum',
      coin_image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
      amount: 0.8, price_per_unit: 3200, total_cost: 2560,
      exchange: 'Coinbase', notes: '', date: daysAgo(21), created_at: new Date().toISOString(),
    },
    {
      id: 9003, wallet_id: walletId, type: 'buy', category: 'crypto',
      coin_id: 'solana', coin_symbol: 'SOL', coin_name: 'Solana',
      coin_image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
      amount: 10, price_per_unit: 148, total_cost: 1480,
      exchange: 'Kraken', notes: '', date: daysAgo(14), created_at: new Date().toISOString(),
    },
    {
      id: 9004, wallet_id: walletId, type: 'buy', category: 'crypto',
      coin_id: 'tether', coin_symbol: 'USDT', coin_name: 'Tether',
      coin_image: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
      amount: 500, price_per_unit: 1, total_cost: 500,
      exchange: '', notes: 'Cash reserve', date: daysAgo(7), created_at: new Date().toISOString(),
    },
  ]

  saveData('transactions', [...txs, ...demoTxs])
  localStorage.setItem(DEMO_KEY, '1')
  track('demo_portfolio_loaded')
}

const STEPS = [
  {
    icon: '👋',
    title: 'Welcome to WalletLens',
    desc: "We've loaded a sample portfolio so you can see everything in action. Replace it with your own trades anytime.",
    cta: 'Show me around',
    accent: '#a78bfa',
  },
  {
    icon: '📈',
    title: 'Track Every Trade',
    desc: 'Log buys and sells in the Trades tab. WalletLens calculates your P&L, average cost, and portfolio performance automatically.',
    cta: 'Got it',
    accent: '#34d399',
  },
  {
    icon: '🤖',
    title: 'AI-Powered Insights',
    desc: 'Get personalized buy/sell signals, risk scores, and price alerts — all in one dashboard. No API keys needed.',
    cta: "Let's go →",
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
    seedDemoPortfolio()
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
        border: '1px solid rgba(52,211,153,0.25)',
        borderRadius: '20px', padding: '2rem 1.75rem',
        maxWidth: '360px', width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Skip */}
        {!s.final && (
          <button onClick={skip} style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
            fontSize: '0.75rem', cursor: 'pointer',
          }}>Skip</button>
        )}

        {/* Progress dots */}
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

        {/* Icon */}
        <div style={{
          fontSize: '3rem', marginBottom: '1rem',
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
