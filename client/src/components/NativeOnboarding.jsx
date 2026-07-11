import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { track, trackProfileCreated } from '../analytics'
import { api } from '../api'
import Logo from './Logo'
import sfx from '../sfx'
import { useTheme, THEMES } from '../ThemeContext'
import { useBiometricLock } from './BiometricLock'
import { POPULAR_FIAT, GOLD_ID } from '../data/assets'

const ONBOARD_KEY = 'wl_welcomed_v2'
const STARTED_KEY = 'wl_started'

function readCurrency() {
  try { return (JSON.parse(localStorage.getItem('wl_settings') || '{}').currency || 'USD').toUpperCase() }
  catch { return 'USD' }
}

const USDT_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%2326a17b'/%3E%3Crect x='9' y='11' width='22' height='4.2' rx='1' fill='white'/%3E%3Crect x='17.4' y='11' width='5.2' height='20' rx='1.2' fill='white'/%3E%3Crect x='12.5' y='16.4' width='15' height='3.4' rx='1' fill='white'/%3E%3C/svg%3E"
const GOLD_LOGO = THEMES.find(t => t.id === 'gold')?.logo || ''

// Map theme icon strings to emojis for display
const THEME_ICONS = {
  sparkles: '✨', award: '🏆', star: '⭐', zap: '⚡',
  sun: '☀️', moon: '🌙', heart: '💚', diamond: '💎',
  fire: '🔥', crown: '👑', gem: '💠', bolt: '⚡',
}

const SLIDES = [
  {
    id: 'welcome',
    gradient: 'linear-gradient(165deg, #010a04 0%, #031008 35%, #041a0b 65%, #021008 100%)',
    accent: '#00c853',
    glow: 'rgba(0,200,83,0.28)',
    particles: ['₿', 'Ξ', '◎', '📈', '💎', '🚀'],
    icon: 'logo',
    eyebrow: 'WELCOME TO',
    title: 'WalletLens',
    titleGrad: 'linear-gradient(135deg, #00c853 0%, #4ade80 55%, #86efac 100%)',
    desc: 'Your private net-worth tracker. Crypto, stocks, gold, cash — all in one place. No account needed.',
    features: ['🔒 Private', '📊 Live P&L', '🤖 AI Insights', '🆓 Free'],
    cta: 'Get Started',
  },
  {
    id: 'theme',
    gradient: 'linear-gradient(165deg, #080b10 0%, #0f1520 55%, #080b10 100%)',
    accent: '#00e676',
    glow: 'rgba(0,230,118,0.22)',
    particles: ['🎨', '✨', '🌙', '☀️', '💎', '🖌️'],
    icon: '🎨',
    eyebrow: 'PERSONALISE',
    title: 'Make it yours',
    desc: 'Pick your look. Change anytime in Settings.',
    cta: 'Continue',
    isTheme: true,
  },
  {
    id: 'portfolio',
    gradient: 'linear-gradient(165deg, #041a10 0%, #073a1e 55%, #051a10 100%)',
    accent: '#34d399',
    glow: 'rgba(52,211,153,0.32)',
    particles: ['📈', '💰', '💎', '🚀', '📊', '💹'],
    icon: '💼',
    eyebrow: 'PORTFOLIO',
    title: 'Add Your Balances',
    desc: 'Start with what you hold. See your net worth instantly.',
    cta: 'Continue',
    isPortfolio: true,
  },
  {
    id: 'security',
    gradient: 'linear-gradient(165deg, #04140d 0%, #06241a 55%, #03120c 100%)',
    accent: '#00e676',
    glow: 'rgba(0,230,118,0.3)',
    particles: ['🔒', '👆', '🛡️', '🔐', '✨', '💚'],
    icon: '🔐',
    eyebrow: 'SECURITY',
    title: 'Lock with fingerprint',
    desc: 'Keep your portfolio for your eyes only.',
    cta: 'Continue',
    isSecurity: true,
  },
  {
    id: 'go',
    gradient: 'linear-gradient(165deg, #041a0c 0%, #083818 55%, #041a0c 100%)',
    accent: '#22c55e',
    glow: 'rgba(34,197,94,0.35)',
    particles: ['🚀', '✨', '🏆', '💚', '⭐', '🎉'],
    icon: '🚀',
    eyebrow: 'ALL SET',
    title: 'Ready to grow',
    desc: 'Your dashboard awaits. Track, analyse, and grow your wealth.',
    cta: "Let's go →",
    final: true,
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
          position: 'absolute', bottom: '-30px',
          left: `${p.left}%`,
          fontSize: `${p.size}px`,
          opacity: 0,
          animation: `no-float ${p.dur}s ${p.delay}s linear infinite`,
        }}>{p.emoji}</span>
      ))}
    </div>
  )
}

export default function NativeOnboarding({ onDone }) {
  const [step, setStep] = useState(0)
  const [animDir, setAnimDir] = useState(1)
  const [bioBusy, setBioBusy] = useState(false)
  const [bioError, setBioError] = useState('')
  const { theme, setTheme } = useTheme()
  const { enabled: bioEnabled, available: bioAvailable, enable: enableBio } = useBiometricLock()
  useEffect(() => {
    sfx.startAmbient()
    return () => sfx.stopAmbient()
  }, [])

  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  // Portfolio state
  const [currency, setCurrency] = useState(() => {
    const cur = readCurrency()
    return POPULAR_FIAT.some(f => f.code === cur) ? cur : 'USD'
  })
  const [cash, setCash] = useState('')
  const [btc, setBtc] = useState('')
  const [gold, setGold] = useState('')
  const [goldUnit, setGoldUnit] = useState('oz')
  const [usdt, setUsdt] = useState('')
  const [busy, setBusy] = useState(false)

  const s = SLIDES[step]
  const total = SLIDES.length
  const progress = ((step + 1) / total) * 100

  const goNext = useCallback(() => {
    if (step < total - 1) { setAnimDir(1); setStep(x => x + 1); sfx.playWhoosh() }
  }, [step, total])

  const goPrev = useCallback(() => {
    if (step > 0) { setAnimDir(-1); setStep(x => x - 1) }
  }, [step])

  // Touch swipe
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

  // Keyboard
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [goNext, goPrev])

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
    onDone?.()
  }

  async function handlePortfolio() {
    const n = v => Math.max(0, parseFloat(v) || 0)
    const cashN = n(cash), usdtN = n(usdt), goldN = n(gold), btcN = n(btc)
    if (cashN === 0 && usdtN === 0 && goldN === 0 && btcN === 0) { goNext(); return }
    setBusy(true)
    try {
      const wallet = await api.ensureWallet()
      const date = new Date().toISOString().split('T')[0]
      const ids = []
      if (cashN > 0) ids.push(`fiat:${currency.toLowerCase()}`)
      if (usdtN > 0) ids.push('tether')
      if (goldN > 0) ids.push(GOLD_ID)
      if (btcN > 0) ids.push('bitcoin')
      let prices = {}
      try { prices = ids.length ? await api.getPrices(ids.join(',')) : {} } catch {}
      const px = (id, fb) => (prices[id]?.usd ?? prices[id]?.price ?? fb)
      if (cashN > 0) await api.addTransaction({ wallet_id: wallet.id, type: 'buy', category: 'fiat', coin_id: `fiat:${currency.toLowerCase()}`, coin_symbol: currency, coin_name: `${currency} Cash`, amount: cashN, price_per_unit: px(`fiat:${currency.toLowerCase()}`, 1), date })
      if (usdtN > 0) await api.addTransaction({ wallet_id: wallet.id, type: 'buy', category: 'crypto', coin_id: 'tether', coin_symbol: 'USDT', coin_name: 'Tether', amount: usdtN, price_per_unit: px('tether', 1), date })
      if (goldN > 0) {
        const goldOz = goldUnit === 'g' ? goldN / 31.1034768 : goldN
        await api.addTransaction({ wallet_id: wallet.id, type: 'buy', category: 'gold', coin_id: GOLD_ID, coin_symbol: 'XAU', coin_name: 'Gold (1 oz)', amount: goldOz, price_per_unit: px(GOLD_ID, 0), date })
      }
      if (btcN > 0) await api.addTransaction({ wallet_id: wallet.id, type: 'buy', category: 'crypto', coin_id: 'bitcoin', coin_symbol: 'BTC', coin_name: 'Bitcoin', amount: btcN, price_per_unit: px('bitcoin', 0), date })
      track('native_onboarding_seed', { cash: cashN > 0, usdt: usdtN > 0, gold: goldN > 0, btc: btcN > 0 })
      trackProfileCreated({ cash: cashN, usdt: usdtN, gold_oz: goldN, btc: btcN, currency })
      try { localStorage.setItem(STARTED_KEY, '1') } catch {}
      goNext()
    } catch { goNext() }
    finally { setBusy(false) }
  }

  const sym = POPULAR_FIAT.find(f => f.code === currency)?.symbol || currency

  function getThemeIcon(th) {
    if (th.logo) return <img src={th.logo} alt={th.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
    if (th.icon && THEME_ICONS[th.icon]) return THEME_ICONS[th.icon]
    if (th.icon && th.icon.length <= 2) return th.icon
    return '🎨'
  }

  return (
    <div
      className="no-container"
      style={{ background: s.gradient }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <Particles step={step} />

      <div className="no-slide" key={step}>
        {/* Icon */}
        <div className="no-icon-wrap" style={{ '--accent': s.accent, '--glow': s.glow }}>
          {s.icon === 'logo' ? (
            <Logo size={72} animated />
          ) : (
            <span className="no-icon-emoji">{s.icon}</span>
          )}
        </div>

        {/* Eyebrow */}
        <div className="no-eyebrow" style={{ color: s.accent }}>{s.eyebrow}</div>

        {/* Title */}
        {s.titleGrad ? (
          <h1 className="no-title" style={{ backgroundImage: s.titleGrad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{s.title}</h1>
        ) : (
          <h1 className="no-title">{s.title}</h1>
        )}

        {/* Description */}
        <p className="no-desc">{s.desc}</p>

        {/* Features */}
        {s.features && (
          <div className="no-features">
            {s.features.map((f, i) => (
              <div key={i} className="no-feature">{f}</div>
            ))}
          </div>
        )}

        {/* Theme picker */}
        {s.isTheme && (
          <div className="no-theme-grid">
            {THEMES.map(th => (
              <button
                key={th.id}
                className={`no-theme-btn${theme === th.id ? ' active' : ''}`}
                style={{ borderColor: theme === th.id ? th.swatch : 'rgba(255,255,255,0.1)' }}
                onClick={() => { setTheme(th.id); track('theme_changed', { theme: th.id }) }}
              >
                <span className="no-theme-swatch" style={{
                  background: `radial-gradient(circle at 35% 35%, ${th.light}, ${th.swatch})`,
                  boxShadow: theme === th.id ? `0 0 10px ${th.swatch}88` : 'none',
                }}>
                  {getThemeIcon(th)}
                </span>
                <span className="no-theme-label" style={{ color: theme === th.id ? th.swatch : undefined }}>{th.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Portfolio inputs — matching web WelcomeStart style */}
        {s.isPortfolio && (
          <div className="no-portfolio">
            <div className="no-field">
              <label className="no-label">💵 Cash balance</label>
              <div className="no-input-wrap">
                <span className="no-prefix">{sym}</span>
                <input className="no-input" type="number" inputMode="decimal" min="0" placeholder="0.00" value={cash} onChange={e => setCash(e.target.value)} autoFocus />
                <select className="no-select" value={currency} onChange={e => setCurrency(e.target.value)}>
                  {POPULAR_FIAT.map(f => <option key={f.code} value={f.code}>{f.code}</option>)}
                </select>
              </div>
            </div>
            <div className="no-field">
              <label className="no-label">₿ Bitcoin</label>
              <div className="no-input-wrap">
                <span className="no-prefix no-prefix-btc">₿</span>
                <input className="no-input" type="number" inputMode="decimal" min="0" placeholder="0.00" value={btc} onChange={e => setBtc(e.target.value)} />
                <span className="no-suffix">BTC</span>
              </div>
            </div>
            <div className="no-field">
              <label className="no-label">{GOLD_LOGO ? <img src={GOLD_LOGO} alt="" style={{ width: 14, height: 14, verticalAlign: 'middle', marginRight: 4 }} /> : '🥇'} Gold</label>
              <div className="no-input-wrap">
                <span className="no-prefix">{GOLD_LOGO ? <img src={GOLD_LOGO} alt="" style={{ width: 14, height: 14 }} /> : '🥇'}</span>
                <input className="no-input" type="number" inputMode="decimal" min="0" placeholder="0.00" value={gold} onChange={e => setGold(e.target.value)} />
                <select className="no-select" value={goldUnit} onChange={e => setGoldUnit(e.target.value)}>
                  <option value="oz">oz</option>
                  <option value="g">gram</option>
                </select>
              </div>
            </div>
            <div className="no-field">
              <label className="no-label"><img src={USDT_LOGO} alt="" style={{ width: 14, height: 14, verticalAlign: 'middle', marginRight: 4 }} /> USDT</label>
              <div className="no-input-wrap">
                <span className="no-prefix"><img src={USDT_LOGO} alt="" style={{ width: 14, height: 14 }} /></span>
                <input className="no-input" type="number" inputMode="decimal" min="0" placeholder="0.00" value={usdt} onChange={e => setUsdt(e.target.value)} />
                <span className="no-suffix">USDT</span>
              </div>
            </div>
            <p className="no-privacy">🔒 100% private — stays on your device</p>
          </div>
        )}

        {/* Security */}
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

      {/* Progress */}
      <div className="no-progress-track">
        <div className="no-progress-fill" style={{ width: `${progress}%`, background: s.accent }} />
      </div>
      <div className="no-dots">
        {SLIDES.map((_, i) => (
          <div key={i} className={`no-dot${i === step ? ' active' : i < step ? ' done' : ''}`}
            style={i <= step ? { background: s.accent } : {}} />
        ))}
      </div>

      {/* CTA */}
      <button
        className="no-cta"
        style={{
          background: s.id === 'welcome' ? 'linear-gradient(135deg, #00c853 0%, #00a040 100%)' : s.accent,
          boxShadow: s.id === 'welcome' ? '0 4px 20px rgba(0,200,83,0.45)' : undefined,
        }}
        onClick={() => {
          sfx.playChime(); if (s.isPortfolio) { handlePortfolio(); return }
          if (s.isSecurity && !bioEnabled && bioAvailable) { enableBiometric(); return }
          if (s.final) { sfx.playTriumph(); finish(); return }
          goNext()
        }}
        disabled={busy}
      >
        {busy ? 'Setting up…' : s.isSecurity && bioEnabled ? 'Continue →' : s.cta}
      </button>
    </div>
  )
}
