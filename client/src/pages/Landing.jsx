import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import LandingBackground from '../components/LandingBackground'

// ── Animated counter ──────────────────────────────────────────────────────
function Counter({ to, prefix = '', suffix = '', duration = 1800 }) {
  const [val, setVal] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      let start = null
      const step = ts => {
        if (!start) start = ts
        const p = Math.min((ts - start) / duration, 1)
        setVal(Math.round(p * p * to))
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [to, duration])
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>
}

// ── Feature card ──────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay = 0 }) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { threshold: 0.15 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={`lp-feat-card ${vis ? 'lp-feat-vis' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="lp-feat-icon">{icon}</div>
      <h3 className="lp-feat-title">{title}</h3>
      <p className="lp-feat-desc">{desc}</p>
    </div>
  )
}

// ── Step card ─────────────────────────────────────────────────────────────
function StepCard({ n, title, desc, delay = 0 }) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { threshold: 0.15 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={`lp-step ${vis ? 'lp-step-vis' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="lp-step-num">{n}</div>
      <div className="lp-step-body">
        <h4 className="lp-step-title">{title}</h4>
        <p className="lp-step-desc">{desc}</p>
      </div>
    </div>
  )
}

// ── Mini ticker simulation ────────────────────────────────────────────────
const TICKERS = [
  { sym: 'BTC', price: 67_240, chg: +2.14 },
  { sym: 'ETH', price: 3_410,  chg: +1.87 },
  { sym: 'SOL', price: 188.5,  chg: -0.43 },
  { sym: 'XAU', price: 2_340,  chg: +0.62 },
  { sym: 'AAPL',price: 189.4,  chg: +0.31 },
  { sym: 'XRP', price: 1.39,   chg: +4.12 },
]

function MockTicker() {
  const [idx, setIdx] = useState(0)
  const [flip, setFlip] = useState(false)
  useEffect(() => {
    const t = setInterval(() => { setFlip(true); setTimeout(() => { setIdx(i => (i + 1) % TICKERS.length); setFlip(false) }, 250) }, 1800)
    return () => clearInterval(t)
  }, [])
  const tk = TICKERS[idx]
  return (
    <div className="lp-mock-ticker">
      {TICKERS.map((t, i) => (
        <div key={t.sym} className={`lp-tick-item ${i === idx ? 'lp-tick-active' : ''}`}>
          <span className="lp-tick-sym">{t.sym}</span>
          <span className="lp-tick-price">${t.price.toLocaleString()}</span>
          <span className={`lp-tick-chg ${t.chg >= 0 ? 'up' : 'dn'}`}>{t.chg >= 0 ? '▲' : '▼'} {Math.abs(t.chg)}%</span>
        </div>
      ))}
    </div>
  )
}

// ── Floating chart bars (decorative) ─────────────────────────────────────
function ChartBars() {
  const bars = [40, 65, 50, 80, 55, 90, 70, 95, 60, 85, 75, 100]
  return (
    <div className="lp-chart-bars">
      {bars.map((h, i) => (
        <div key={i} className="lp-chart-bar" style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate()
  const [logoAnim, setLogoAnim] = useState(false)
  const heroRef = useRef(null)

  function handleLogoPulse() {
    setLogoAnim(true)
    setTimeout(() => setLogoAnim(false), 600)
  }

  return (
    <div className="lp">
      <LandingBackground />

      {/* ══ HERO ══════════════════════════════════════════════════════ */}
      <section className="lp-hero" ref={heroRef}>
        <div className="lp-hero-inner">
          {/* Pulsing logo orb */}
          <button
            className={`lp-logo-orb ${logoAnim ? 'lp-logo-pop' : ''}`}
            onClick={handleLogoPulse}
            aria-label="WalletLens"
          >
            <span className="lp-logo-ring lp-logo-ring-1" />
            <span className="lp-logo-ring lp-logo-ring-2" />
            <span className="lp-logo-ring lp-logo-ring-3" />
            <Logo size={88} />
          </button>

          <div className="lp-brand-name">WalletLens</div>
          <div className="lp-brand-tag">ZOOM IN YOUR WEALTH</div>

          <h1 className="lp-hero-h1">
            Your Portfolio.<br />
            <span className="lp-h1-accent">Crystal Clear.</span>
          </h1>

          <p className="lp-hero-sub">
            Track crypto, gold, silver &amp; stocks in one place.
            Live prices. Smart analytics. Zero account needed.
          </p>

          <div className="lp-cta-row">
            <button className="lp-cta-primary" onClick={() => navigate('/dashboard')}>
              Open Dashboard
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button className="lp-cta-ghost" onClick={() => navigate('/market')}>
              Explore Market
            </button>
          </div>

          <div className="lp-badges">
            <span className="lp-badge">✦ 100% Free</span>
            <span className="lp-badge">✦ No Account</span>
            <span className="lp-badge">✦ Privacy First</span>
            <span className="lp-badge">✦ Open Source</span>
          </div>
        </div>

        {/* Floating mock UI */}
        <div className="lp-hero-mockup">
          <div className="lp-mockup-card">
            <div className="lp-mockup-label">Portfolio Value</div>
            <div className="lp-mockup-value">$248,750<span className="lp-mockup-cents">.42</span></div>
            <div className="lp-mockup-change up">↑ +$12,450 (5.27%) all time</div>
            <ChartBars />
          </div>
          <MockTicker />
        </div>
      </section>

      {/* ══ STATS ══════════════════════════════════════════════════════ */}
      <section className="lp-stats">
        <div className="lp-stat-item">
          <div className="lp-stat-val"><Counter to={10000} suffix="+" /></div>
          <div className="lp-stat-lbl">Assets tracked</div>
        </div>
        <div className="lp-stat-sep" />
        <div className="lp-stat-item">
          <div className="lp-stat-val"><Counter to={0} prefix="" suffix="%" /></div>
          <div className="lp-stat-lbl">Fees forever</div>
        </div>
        <div className="lp-stat-sep" />
        <div className="lp-stat-item">
          <div className="lp-stat-val"><Counter to={60} suffix="s" /></div>
          <div className="lp-stat-lbl">Price refresh</div>
        </div>
        <div className="lp-stat-sep" />
        <div className="lp-stat-item">
          <div className="lp-stat-val"><Counter to={4} /></div>
          <div className="lp-stat-lbl">Asset classes</div>
        </div>
      </section>

      {/* ══ FEATURES ═══════════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-section-label">WHAT YOU GET</div>
        <h2 className="lp-section-h2">Everything a serious investor needs</h2>
        <div className="lp-feat-grid">
          <FeatureCard delay={0}   icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} title="Live Prices" desc="Prices update every 60 seconds via CoinGecko. Never make a decision on stale data again." />
          <FeatureCard delay={80}  icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>} title="Portfolio Dashboard" desc="Full P&amp;L breakdown, allocation pie, performance chart, and holdings list — all on one screen." />
          <FeatureCard delay={160} icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg>} title="Multi-Asset" desc="Crypto, gold, silver, stocks and bonds — tracked side by side under one unified lens." />
          <FeatureCard delay={0}   icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>} title="Smart Trade Entry" desc="Buy/sell bottom sheet with coin search, auto price-fill, 'Buy With' and 'Sell For' counter-legs — balances stay consistent." />
          <FeatureCard delay={80}  icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>} title="Sell Targets" desc="Set price targets per asset. Track progress, projected proceeds, and know exactly when to pull the trigger." />
          <FeatureCard delay={160} icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14c2-2 5-3 8-3 4 0 7 2 9 5 1-1 2-2 3-2-1 3-4 5-7 5-3 0-5-1-7-3-1 1-3 1-4 0z"/></svg>} title="Whale Tracker" desc="Monitor large on-chain movements. Volume pulse, accumulation/distribution score, and smart momentum signals." />
          <FeatureCard delay={0}   icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20z"/><circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg>} title="Multiple Wallets" desc="Organise trades by wallet or exchange. Keep your Ledger, Binance, and self-custody bags separate." />
          <FeatureCard delay={80}  icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>} title="Backup Codes" desc="Export your entire portfolio as a short WLZ code. Import it on any device in seconds — no cloud required." />
          <FeatureCard delay={160} icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>} title="Local-First Privacy" desc="All data stays on your device. No servers, no accounts, no analytics — your wealth is nobody else's business." />
          <FeatureCard delay={0}   icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a5 5 0 0 1 5 5c0 3.5-5 9-5 9S7 10.5 7 7a5 5 0 0 1 5-5z"/><circle cx="12" cy="7" r="2" fill="currentColor" stroke="none"/><path d="M5 20h14"/></svg>} title="AI Portfolio Analysis" desc="On-device intelligence scores your wallet health, flags risk, and surfaces rebalance opportunities — no data leaves your device." />
        </div>
      </section>

      {/* ══ AI SHOWCASE ═════════════════════════════════════════════════ */}
      <section className="lp-section lp-ai-showcase">
        <div className="lp-section-label">AI INTELLIGENCE</div>
        <h2 className="lp-section-h2">Your portfolio, x-rayed by AI</h2>
        <p className="lp-section-sub">Seven analytical engines run entirely on your device — no API keys, no cloud, no fees. Just maths on your data.</p>
        <div className="lp-ai-grid">
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(0,230,118,0.12)',color:'#00e676'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Wallet Health Score</div>
              <div className="lp-ai-feat-desc">A 0–100 composite score measuring diversification, concentration risk, and unrealised gain/loss balance — your portfolio's vital sign at a glance.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(255,215,0,0.12)',color:'#ffd700'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Fear & Greed Gauge</div>
              <div className="lp-ai-feat-desc">Composite market sentiment derived from price momentum, P&L ratio, trade frequency, and portfolio concentration — presented as a live arc gauge from Extreme Fear to Extreme Greed.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(59,130,246,0.12)',color:'#60a5fa'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Market Cap Breakdown</div>
              <div className="lp-ai-feat-desc">Classifies every holding into Mega, Large, Mid, Small, or Micro cap tiers. A radar chart shows your risk exposure profile so you can see instantly if you are over-weighted in speculative assets.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(239,68,68,0.12)',color:'#f87171'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Stress Test</div>
              <div className="lp-ai-feat-desc">Simulates your portfolio value under five market scenarios: -10% correction, -30% bear, -60% crash, +50% bull, and +200% supercycle. Know your worst case before the market does.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(168,85,247,0.12)',color:'#c084fc'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Entry Quality Score</div>
              <div className="lp-ai-feat-desc">Compares your average buy price against the current market price for every holding. Green means you're in profit; red means you're underwater — with exact percentage shown per asset.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(20,184,166,0.12)',color:'#2dd4bf'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Rebalance Planner</div>
              <div className="lp-ai-feat-desc">Calculates the exact dollar amount to buy or sell per asset to reach equal-weight allocation. Shows current vs target weight bars and a clear buy/sell action for each position.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(251,146,60,0.12)',color:'#fb923c'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Today's Performance</div>
              <div className="lp-ai-feat-desc">Shows the 24-hour dollar P&L per asset as a colour-coded bar row. Green bars for gainers, red bars for losers — instantly see which positions are driving today's move.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ════════════════════════════════════════════════ */}
      <section className="lp-section lp-section-alt">
        <div className="lp-section-label">HOW IT WORKS</div>
        <h2 className="lp-section-h2">From zero to full picture in minutes</h2>
        <div className="lp-steps">
          <StepCard n="01" delay={0}   title="Open the app" desc="No sign-up. No download. Just open walletlens.cc in your browser and you're in." />
          <StepCard n="02" delay={100} title="Create a wallet" desc="Add a wallet name (e.g. 'Ledger', 'Binance') to group your trades." />
          <StepCard n="03" delay={200} title="Record trades" desc="Tap Buy or Sell. Search the asset, enter amount and price. Balances update instantly." />
          <StepCard n="04" delay={300} title="Set sell targets" desc="Add price targets per coin. WalletLens shows progress and projected proceeds automatically." />
          <StepCard n="05" delay={400} title="Watch it grow" desc="Live portfolio value, P&amp;L charts, whale signals and market data — all in one dashboard." />
        </div>
      </section>

      {/* ══ ASSET CLASSES ═══════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-section-label">ASSET CLASSES</div>
        <h2 className="lp-section-h2">One lens, every market</h2>
        <div className="lp-asset-grid">
          <div className="lp-asset-card">
            <div className="lp-asset-icon" style={{ background: 'rgba(247,147,26,0.12)', color: '#f7931a' }}>₿</div>
            <div className="lp-asset-name">Crypto</div>
            <div className="lp-asset-desc">10,000+ coins via CoinGecko</div>
          </div>
          <div className="lp-asset-card">
            <div className="lp-asset-icon" style={{ background: 'rgba(255,215,0,0.12)', color: '#ffd700' }}>Au</div>
            <div className="lp-asset-name">Gold</div>
            <div className="lp-asset-desc">Live XAU/USD spot price</div>
          </div>
          <div className="lp-asset-card">
            <div className="lp-asset-icon" style={{ background: 'rgba(192,192,192,0.12)', color: '#c0c0c0' }}>Ag</div>
            <div className="lp-asset-name">Silver</div>
            <div className="lp-asset-desc">Live XAG/USD spot price</div>
          </div>
          <div className="lp-asset-card">
            <div className="lp-asset-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>$</div>
            <div className="lp-asset-name">Stocks</div>
            <div className="lp-asset-desc">US & global equities</div>
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══════════════════════════════════════════════════ */}
      <section className="lp-final">
        <div className="lp-final-glow" />
        <Logo size={64} animated />
        <h2 className="lp-final-h2">Ready to see clearly?</h2>
        <p className="lp-final-sub">Free forever. No account. No tracking. Just your portfolio, sharp.</p>
        <button className="lp-cta-primary lp-final-btn" onClick={() => navigate('/dashboard')}>
          Launch WalletLens
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <div className="lp-final-links">
          <button className="lp-link" onClick={() => navigate('/market')}>Market</button>
          <span>·</span>
          <button className="lp-link" onClick={() => navigate('/whales')}>Whale Tracker</button>
          <span>·</span>
          <button className="lp-link" onClick={() => navigate('/transactions')}>Transactions</button>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Logo size={24} />
          <span>WalletLens © {new Date().getFullYear()}</span>
        </div>
        <nav className="lp-footer-links">
          <Link to="/about">About</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <a href="https://github.com/tia8910/walletlens" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </footer>
    </div>
  )
}
