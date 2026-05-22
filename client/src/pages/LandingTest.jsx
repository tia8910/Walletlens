import { useEffect, useRef, useState } from 'react'
import './LandingTest.css'

/* ── Data ── */
const FEATURES = [
  { emoji: '📊', title: 'Real-Time Portfolio', desc: 'Live price updates every 60 seconds across all your assets in one clean view.', color: '#059669', bg: '#d1fae5' },
  { emoji: '🤖', title: 'AI-Powered Insights', desc: 'Smart analysis, personalized recommendations, and natural language Q&A.', color: '#7c3aed', bg: '#ede9fe' },
  { emoji: '🔔', title: 'Price Alerts', desc: 'Instant notifications when any asset hits your custom target price.', color: '#f59e0b', bg: '#fef3c7' },
  { emoji: '🐋', title: 'Whale Tracker', desc: 'Follow big-money movements in real time before they impact your portfolio.', color: '#0284c7', bg: '#dbeafe' },
  { emoji: '🎯', title: 'Smart Targets', desc: 'Set profit and stop-loss targets with visual progress indicators.', color: '#ec4899', bg: '#fce7f3' },
  { emoji: '📈', title: 'Performance Charts', desc: 'Beautiful, interactive charts for every timeframe — day to all-time.', color: '#10b981', bg: '#d1fae5' },
]

const STATS = [
  { val: '10', suffix: 'K+', label: 'Assets Supported', cls: 'c-green' },
  { val: '0',  suffix: '$',  label: 'Subscription Cost', cls: 'c-purple', prefix: '$' },
  { val: '60', suffix: 's',  label: 'Price Refresh Rate', cls: 'c-amber' },
  { val: '4',  suffix: '',   label: 'Asset Classes', cls: 'c-blue' },
]

const ASSETS = [
  { emoji: '₿', name: 'Crypto',  desc: 'Bitcoin, Ethereum & 10,000+ altcoins tracked live',   bg: '#fffbeb', color: '#b45309' },
  { emoji: '🥇', name: 'Gold',   desc: 'Spot gold price in USD/oz, updated every minute',       bg: '#fefce8', color: '#92400e' },
  { emoji: '🥈', name: 'Silver', desc: 'Silver price history and real-time spot rate',           bg: '#f8fafc', color: '#475569' },
  { emoji: '📊', name: 'Stocks', desc: 'Global equities, ETFs, and indices in one place',        bg: '#eff6ff', color: '#1d4ed8' },
]

const STEPS = [
  { num: '01', title: 'Add Your Assets',      desc: 'Import from exchanges or add manually — takes under a minute.' },
  { num: '02', title: 'Connect Exchanges',    desc: 'Binance, Coinbase & more via read-only API keys. No trading access.' },
  { num: '03', title: 'Track & Analyze',      desc: 'View performance, P&L, and AI insights updated in real time.' },
  { num: '04', title: 'Set Smart Alerts',     desc: 'Price targets, portfolio milestones, and whale movement alerts.' },
]

const AI_ITEMS = [
  { icon: '💡', title: 'Portfolio Analysis',   desc: 'Deep commentary on your holdings, allocation, and risk profile.' },
  { icon: '⚠️', title: 'Risk Scanner',         desc: 'Spot overexposure, concentration risk, and red flags instantly.' },
  { icon: '📰', title: 'News Digest',          desc: 'AI filters the noise and surfaces what actually matters to you.' },
  { icon: '🎯', title: 'Target Suggestions',   desc: 'Smart price targets based on your entry cost and history.' },
  { icon: '🐋', title: 'Whale Signals',        desc: 'Track institutional flows before they move your coins.' },
  { icon: '📚', title: 'Personalized Academy', desc: 'AI-curated lessons matched to your portfolio and skill level.' },
]

const PAIN = [
  {
    emoji: '😓',
    before: 'Before WalletLens',
    pain: '"I have 6 spreadsheets across 3 exchanges and still have no idea what I own."',
    after: 'After WalletLens',
    fix: 'Everything in one dashboard. Live prices, total value, P&L — refreshed every 60 seconds.',
  },
  {
    emoji: '😤',
    before: 'Before WalletLens',
    pain: '"I missed selling at the top because I wasn\'t watching my price alerts."',
    after: 'After WalletLens',
    fix: 'Set a target once. Get notified instantly — push, email, or in-app.',
  },
  {
    emoji: '😰',
    before: 'Before WalletLens',
    pain: '"I have no idea what my portfolio risk looks like across all my assets."',
    after: 'After WalletLens',
    fix: 'AI scans your holdings in seconds and gives you a clear risk breakdown.',
  },
]

const MOCK_ROWS = [
  { name: 'Bitcoin', ticker: 'BTC', price: '$63,420', chg: '+4.2%', up: true,  color: '#f59e0b' },
  { name: 'Ethereum', ticker: 'ETH', price: '$3,190',  chg: '+2.8%', up: true,  color: '#7c3aed' },
  { name: 'Gold',    ticker: 'XAU', price: '$2,340',  chg: '−0.3%', up: false, color: '#d97706' },
  { name: 'Apple',   ticker: 'AAPL',price: '$189.45', chg: '+1.1%', up: true,  color: '#64748b' },
]

/* ── Hooks ── */
function useVisible(threshold = 0.12) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVis(true); obs.disconnect() }
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, vis]
}

function Counter({ end, duration = 1600, suffix = '', prefix = '' }) {
  const [val, setVal] = useState(0)
  const [ref, vis] = useVisible(0.3)
  useEffect(() => {
    if (!vis) return
    const n = parseInt(end)
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(n * ease))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [vis, end, duration])
  return <span ref={ref}>{prefix}{val}{suffix}</span>
}

/* ── Component ── */
export default function LandingTest() {
  const [heroRef, heroVis] = useVisible(0.05)
  const [featRef, featVis] = useVisible(0.08)

  return (
    <div className="lt-root">

      {/* ──────── HERO ──────── */}
      <section className="lt-hero" ref={heroRef}>
        <div className="lt-hero-blob" aria-hidden />
        <div className="lt-hero-blob2" aria-hidden />

        <div className="lt-container lt-hero-inner">
          {/* Left: text */}
          <div className={`lt-hero-text ${heroVis ? 'lt-vis' : ''}`}>
            <div className="lt-pill">
              <span className="lt-pill-dot" />
              Free forever — no credit card needed
            </div>

            <h1 className="lt-hero-h1">
              Your wealth,<br />
              <span className="lt-grad">crystal clear.</span>
            </h1>

            <p className="lt-hero-sub">
              Track crypto, gold, silver, and stocks in one beautiful dashboard.
              AI insights, live prices, price alerts — and zero subscription fees.
            </p>

            <div className="lt-ctas">
              <a href="/dashboard" className="lt-btn-green">
                Start Tracking Free
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
              <a href="#features" className="lt-btn-outline">
                See Features
              </a>
            </div>

            <div className="lt-checks">
              {['No sign-up required', '100% private', 'Works offline'].map(t => (
                <div key={t} className="lt-check">
                  <div className="lt-check-icon">✓</div>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Right: mock dashboard */}
          <div className={`lt-hero-visual ${heroVis ? 'lt-vis' : ''}`}>
            <div className="lt-mock">
              {/* Window chrome */}
              <div className="lt-mock-topbar">
                <div className="lt-mock-dots">
                  <div className="lt-mock-dot" /><div className="lt-mock-dot" /><div className="lt-mock-dot" />
                </div>
                <div className="lt-mock-topbar-title">WalletLens — Portfolio</div>
                <div className="lt-live-dot">LIVE</div>
              </div>

              {/* Total */}
              <div className="lt-mock-total-label">Total Portfolio Value</div>
              <div className="lt-mock-total">$48,320.85</div>
              <div className="lt-mock-gain">▲ +$1,243.20 &nbsp;(2.64%)</div>

              {/* Chart */}
              <div className="lt-mock-chart-wrap">
                <svg viewBox="0 0 300 88" preserveAspectRatio="none" className="lt-mock-chart-svg">
                  <defs>
                    <linearGradient id="ltCG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity="0.22"/>
                      <stop offset="100%" stopColor="#059669" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <path
                    className="lt-chart-path"
                    d="M0,72 C18,68 36,62 56,52 C76,42 88,58 108,44 C128,30 142,36 162,22 C182,8 200,16 218,10 C236,4 260,14 300,6"
                    stroke="#059669"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,72 C18,68 36,62 56,52 C76,42 88,58 108,44 C128,30 142,36 162,22 C182,8 200,16 218,10 C236,4 260,14 300,6 L300,88 L0,88Z"
                    fill="url(#ltCG)"
                  />
                </svg>
              </div>

              {/* Asset rows */}
              <div className="lt-mock-assets">
                {MOCK_ROWS.map(r => (
                  <div key={r.ticker} className="lt-mock-row">
                    <div className="lt-mock-color" style={{ background: r.color }} />
                    <div className="lt-mock-name">{r.name}</div>
                    <div className="lt-mock-ticker">{r.ticker}</div>
                    <div className="lt-mock-price">{r.price}</div>
                    <div className={`lt-mock-chg ${r.up ? 'up' : 'dn'}`}>{r.chg}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating badges */}
            <div className="lt-fbadge lt-fbadge-1">🔔 BTC hit your target!</div>
            <div className="lt-fbadge lt-fbadge-2">🤖 AI tip ready</div>
            <div className="lt-fbadge lt-fbadge-3">⚡ Prices live</div>
          </div>
        </div>

        <div className="lt-scroll-hint">
          <span>SCROLL</span>
          <div className="lt-scroll-arrow">↓</div>
        </div>
      </section>

      {/* ──────── TICKER ──────── */}
      <div className="lt-ticker" aria-hidden>
        <div className="lt-ticker-track">
          {['Bitcoin • BTC', 'Ethereum • ETH', 'Gold • XAU', 'Silver • XAG', 'Apple • AAPL',
            'S&P 500 • SPX', 'Solana • SOL', 'Tether • USDT', 'BNB', 'XRP', 'Dogecoin • DOGE',
            'Cardano • ADA', 'Avalanche • AVAX', 'Chainlink • LINK'].concat(
            ['Bitcoin • BTC', 'Ethereum • ETH', 'Gold • XAU', 'Silver • XAG', 'Apple • AAPL',
              'S&P 500 • SPX', 'Solana • SOL', 'Tether • USDT', 'BNB', 'XRP', 'Dogecoin • DOGE',
              'Cardano • ADA', 'Avalanche • AVAX', 'Chainlink • LINK']
          ).map((t, i) => (
            <span key={i} className="lt-ticker-item">
              {t}<span className="lt-ticker-sep">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* ──────── STATS ──────── */}
      <section className="lt-stats">
        <div className="lt-container lt-stats-grid">
          {STATS.map(s => (
            <div key={s.label} className="lt-stat">
              <div className={`lt-stat-num ${s.cls}`}>
                <Counter end={s.val} suffix={s.suffix} prefix={s.prefix || ''} />
              </div>
              <div className="lt-stat-lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ──────── PAIN → FIX ──────── */}
      <section className="lt-pain-sec">
        <div className="lt-container">
          <div className="lt-sec-head">
            <div className="lt-tag">Sound familiar?</div>
            <h2 className="lt-sec-h2">From scattered chaos to total clarity</h2>
            <p className="lt-sec-sub">WalletLens solves the three biggest headaches every investor has.</p>
          </div>
          <div className="lt-pain-grid">
            {PAIN.map(p => (
              <div key={p.pain} className="lt-pain-card">
                <div className="lt-pain-emoji">{p.emoji}</div>
                <div className="lt-pain-before">{p.before}</div>
                <h3>{p.pain}</h3>
                <div className="lt-pain-after">{p.after}</div>
                <p>{p.fix}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────── FEATURES ──────── */}
      <section className="lt-feat-sec" id="features" ref={featRef}>
        <div className="lt-container">
          <div className="lt-sec-head">
            <div className="lt-tag">Features</div>
            <h2 className="lt-sec-h2">Everything you need to track wealth</h2>
            <p className="lt-sec-sub">No spreadsheets. No complexity. Just clear, live numbers that help you make smarter moves.</p>
          </div>
          <div className="lt-feat-grid">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`lt-feat-card ${featVis ? 'lt-vis' : ''}`}
                style={{ transitionDelay: `${i * 75}ms` }}
              >
                <div className="lt-feat-ico" style={{ background: f.bg, color: f.color }}>
                  {f.emoji}
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────── ASSET CLASSES ──────── */}
      <section className="lt-assets-sec">
        <div className="lt-container">
          <div className="lt-sec-head">
            <div className="lt-tag">Asset Classes</div>
            <h2 className="lt-sec-h2">One dashboard, every market</h2>
            <p className="lt-sec-sub">Crypto, precious metals, and equities — unified under one roof for the first time.</p>
          </div>
          <div className="lt-assets-grid">
            {ASSETS.map(a => (
              <div key={a.name} className="lt-asset-card" style={{ background: a.bg }}>
                <span className="lt-asset-emoji">{a.emoji}</span>
                <h3 style={{ color: a.color }}>{a.name}</h3>
                <p>{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────── HOW IT WORKS ──────── */}
      <section className="lt-how-sec">
        <div className="lt-container lt-how-inner">
          <div className="lt-how-left">
            <div className="lt-sec-head">
              <div className="lt-tag">How It Works</div>
              <h2 className="lt-sec-h2">Up and running in under 60 seconds</h2>
              <p className="lt-sec-sub">No configuration. No onboarding calls. Just open and start tracking your wealth.</p>
            </div>
            <a href="/dashboard" className="lt-btn-green" style={{ display: 'inline-flex' }}>
              Get Started Free
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>
          <div className="lt-how-right">
            {STEPS.map(s => (
              <div key={s.num} className="lt-step">
                <div className="lt-step-num">{s.num}</div>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────── AI SHOWCASE ──────── */}
      <section className="lt-ai-sec">
        <div className="lt-container lt-ai-inner">
          <div className="lt-ai-tag">✦ AI-Powered</div>
          <h2>Your personal finance AI</h2>
          <p>
            Ask any question in plain English. Get portfolio insights, risk breakdowns,
            and market context — all powered by the latest AI models.
          </p>
          <div className="lt-ai-grid">
            {AI_ITEMS.map(item => (
              <div key={item.title} className="lt-ai-card">
                <span className="lt-ai-icon">{item.icon}</span>
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────── FINAL CTA ──────── */}
      <section className="lt-cta-sec">
        <div className="lt-container lt-cta-inner">
          <div className="lt-cta-tag">Free. Private. Powerful.</div>
          <h2>Start tracking your wealth today</h2>
          <p>No account. No subscription. Works on every device. Always free.</p>
          <div>
            <a href="/dashboard" className="lt-btn-cta">
              Open WalletLens
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>
          <div className="lt-cta-perks">
            <span>🔒 Your data stays on your device</span>
            <span>✅ Zero ads, ever</span>
            <span>⚡ Works offline</span>
            <span>🌍 Arabic & English</span>
          </div>
        </div>
      </section>

      {/* ──────── FOOTER ──────── */}
      <footer className="lt-footer">
        <div className="lt-container lt-footer-inner">
          <div className="lt-footer-brand">
            <div className="lt-footer-logo">
              <div className="lt-footer-logo-mark">W</div>
              WalletLens
            </div>
            <p>Track every dollar. Everywhere.</p>
          </div>
          <div className="lt-footer-links">
            <a href="/about">About</a>
            <a href="/blog">Blog</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="https://x.com/walletlenss" target="_blank" rel="noopener noreferrer">Twitter / X</a>
          </div>
        </div>
        <div className="lt-footer-copy">© 2025 WalletLens — Always free</div>
      </footer>

    </div>
  )
}
