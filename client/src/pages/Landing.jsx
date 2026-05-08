import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()
  const [pulses, setPulses] = useState(0)

  // Trigger a fresh ripple when user taps the lens orb
  useEffect(() => {
    if (!pulses) return
    const t = setTimeout(() => setPulses(0), 700)
    return () => clearTimeout(t)
  }, [pulses])

  return (
    <div className="landing">
      <section className="landing-hero">
        <span className="landing-tag">100% FREE · NO ACCOUNT</span>

        <button
          type="button"
          className={`lens-orb landing-orb ${pulses ? 'lens-orb-burst' : ''}`}
          onClick={() => setPulses(p => p + 1)}
          aria-label="Pulse the lens"
        >
          🔎
        </button>

        <h1 className="landing-title">
          ZOOM IN.<br />
          <span className="landing-title-accent">YOUR WEALTH.</span>
        </h1>

        <p className="landing-subtitle">
          One sharp lens for crypto, gold, silver, and stocks.
          <br />Live prices. Holographic holdings. Zero fluff.
        </p>

        <div className="landing-cta-row">
          <button className="landing-cta" onClick={() => navigate('/dashboard')}>
            Open Dashboard <span aria-hidden="true">→</span>
          </button>
          <button className="landing-cta-ghost" onClick={() => navigate('/market')}>
            Explore Market
          </button>
        </div>

        <div className="landing-stats">
          <div className="landing-stat">
            <strong>0%</strong>
            <span>fees</span>
          </div>
          <div className="landing-stat">
            <strong>50+</strong>
            <span>assets</span>
          </div>
          <div className="landing-stat">
            <strong>1s</strong>
            <span>refresh</span>
          </div>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-feature glass-premium holo-card">
          <div className="landing-feature-icon">⚡</div>
          <h3>Live everything</h3>
          <p>Portfolio value, prices, and transactions update in real time — no refresh needed.</p>
        </div>
        <div className="landing-feature glass-premium holo-card">
          <div className="landing-feature-icon">🛡️</div>
          <h3>Local-first</h3>
          <p>Your wallets and trades stay on your device. No accounts, no tracking.</p>
        </div>
        <div className="landing-feature glass-premium holo-card">
          <div className="landing-feature-icon">📈</div>
          <h3>Multi-asset</h3>
          <p>Crypto, gold, silver, and stocks side-by-side under one lens.</p>
        </div>
      </section>
    </div>
  )
}
