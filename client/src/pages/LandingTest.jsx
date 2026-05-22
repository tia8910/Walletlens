import { useEffect, useRef, useState } from 'react'
import Logo from '../components/Logo'
import './LandingTest.css'

/* ── Bullion-bar SVGs (gold / silver) ── */
const GoldBar = () => (
  <svg viewBox="0 0 64 64" width="48" height="48" aria-label="Gold bullion">
    <defs>
      <linearGradient id="lt-gold-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fde68a"/>
        <stop offset="50%" stopColor="#fbbf24"/>
        <stop offset="100%" stopColor="#b45309"/>
      </linearGradient>
      <linearGradient id="lt-gold-top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fef3c7"/>
        <stop offset="100%" stopColor="#fcd34d"/>
      </linearGradient>
    </defs>
    <path d="M8 26 L56 26 L52 50 L12 50 Z" fill="url(#lt-gold-grad)" stroke="#92400e" strokeWidth="0.8"/>
    <path d="M8 26 L56 26 L48 18 L16 18 Z" fill="url(#lt-gold-top)" stroke="#92400e" strokeWidth="0.8"/>
    <text x="32" y="42" fontSize="6.5" fill="#7c2d12" textAnchor="middle" fontWeight="900" fontFamily="serif">999.9</text>
  </svg>
)

const SilverBar = () => (
  <svg viewBox="0 0 64 64" width="48" height="48" aria-label="Silver bullion">
    <defs>
      <linearGradient id="lt-silver-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f8fafc"/>
        <stop offset="50%" stopColor="#cbd5e1"/>
        <stop offset="100%" stopColor="#64748b"/>
      </linearGradient>
      <linearGradient id="lt-silver-top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff"/>
        <stop offset="100%" stopColor="#e2e8f0"/>
      </linearGradient>
    </defs>
    <path d="M8 26 L56 26 L52 50 L12 50 Z" fill="url(#lt-silver-grad)" stroke="#475569" strokeWidth="0.8"/>
    <path d="M8 26 L56 26 L48 18 L16 18 Z" fill="url(#lt-silver-top)" stroke="#475569" strokeWidth="0.8"/>
    <text x="32" y="42" fontSize="6.5" fill="#1e293b" textAnchor="middle" fontWeight="900" fontFamily="serif">999</text>
  </svg>
)

const BitcoinSym = () => (
  <div style={{ fontSize: '2.6rem', fontWeight: 900, color: '#f7931a', lineHeight: 1, fontFamily: 'serif' }}>₿</div>
)
const StockSym = () => (
  <div style={{ fontSize: '2.6rem', fontWeight: 900, color: '#1d4ed8', lineHeight: 1, fontFamily: 'serif' }}>$</div>
)

/* ── Data ── */
const HERO_BADGES = [
  { icon: '🔒', text: '100% Private' },
  { icon: '⚡', text: 'Real-time Prices' },
  { icon: '🛡', text: 'Scam Scanner' },
  { icon: '🔔', text: 'Price Alerts' },
]

const PAIN = [
  {
    emoji: '😰',
    before: 'The pain',
    pain: '"I don\'t know if I\'m actually up or down. The numbers are everywhere."',
    after: 'WalletLens fix',
    fix: 'One dashboard. Every asset. Real P&L calculated from your actual cost basis.',
  },
  {
    emoji: '💸',
    before: 'The pain',
    pain: '"I held a token that rugged. I had no idea the contract was dangerous."',
    after: 'WalletLens fix',
    fix: 'Scam Catcher scores every token — honeypot detection, holder concentration, mint authority, contract verification.',
  },
  {
    emoji: '😴',
    before: 'The pain',
    pain: '"I missed my target price because I wasn\'t watching the screen."',
    after: 'WalletLens fix',
    fix: 'Smart Price Alerts fire an audio alarm + browser notification the moment your target is hit.',
  },
  {
    emoji: '🤯',
    before: 'The pain',
    pain: '"I know I\'m losing but I don\'t know exactly how much more I need to break even."',
    after: 'WalletLens fix',
    fix: 'Break-Even Calculator shows the exact price every holding needs to reach to recover your full investment.',
  },
]

const STATS = [
  { val: '10', suffix: 'K+',  label: 'Assets tracked',   cls: 'c-green' },
  { val: '0',  suffix: '%',   label: 'Fees forever',     cls: 'c-purple' },
  { val: '60', suffix: 's',   label: 'Price refresh',    cls: 'c-amber' },
  { val: '4',  suffix: '',    label: 'Asset classes',    cls: 'c-blue' },
]

/* All 29 features from current landing */
const FEATURES = [
  { emoji: '🛡️', title: 'Risk Scanner',          desc: 'Every token scored 0–100. Honeypot detection, contract verification, mint authority, holder concentration, buy/sell tax — before you lose everything.', color: '#059669', bg: '#d1fae5' },
  { emoji: '🔍', title: 'Scam Catcher',          desc: 'Paste any contract address or token name. Instantly check for honeypots, hidden sell taxes, freeze authority, mint traps, and whale concentration.', color: '#dc2626', bg: '#fee2e2' },
  { emoji: '🔔', title: 'Smart Price Alerts',    desc: 'Set a target, walk away. The moment price hits — audio alarm fires, your phone buzzes, a notification lands. No more sleeping on opportunities.', color: '#ea580c', bg: '#ffedd5' },
  { emoji: '💰', title: 'Break-Even Calculator', desc: 'Know exactly what price each holding needs to reach for you to be whole again. Your actual cost basis, per asset, right now.', color: '#0284c7', bg: '#dbeafe' },
  { emoji: '🧠', title: 'AI Decision Engine',    desc: '"What Should I Do Right Now?" — one click gives you a HOLD/TRIM/ADD/SELL verdict for every position, with reasoning from your real data.', color: '#7c3aed', bg: '#ede9fe' },
  { emoji: '📊', title: 'AI Portfolio Analysis', desc: 'Health grade, stress tests (Bear/Sideways/Bull), top risks, rebalancing plan — seven analytical engines running on your actual data.', color: '#059669', bg: '#d1fae5' },
  { emoji: '🎯', title: 'Sell Targets Planner',  desc: 'Map out every exit before emotions take over. Set multiple price targets, see how close you are, know exactly how much you will pocket.', color: '#10b981', bg: '#d1fae5' },
  { emoji: '🐋', title: 'Whale Signal Tracker',  desc: 'See what the big money is doing. Accumulation signals, unusual volume, momentum shifts — the intel that usually costs thousands per month.', color: '#db2777', bg: '#fce7f3' },
  { emoji: '👛', title: 'Multi-Wallet Support',  desc: 'Track every wallet you own across exchanges and self-custody. See the complete picture, not just one slice.', color: '#d97706', bg: '#fef3c7' },
  { emoji: '📥', title: 'Encrypted Backup',      desc: 'Export your entire portfolio as a compressed WLZ file. Import anywhere, anytime. Your data never touches our servers.', color: '#059669', bg: '#d1fae5' },
  { emoji: '🛡️', title: 'Portfolio Risk Overview', desc: 'Weighted risk score across your whole portfolio. Counts by grade (SAFE / MODERATE / HIGH RISK / DANGER) and your most dangerous holding at a glance.', color: '#0284c7', bg: '#dbeafe' },
  { emoji: '🔐', title: '100% Private by Design',desc: 'Zero account. Zero cloud sync. Every byte stays on your device. Not even we can see your portfolio.', color: '#0d9488', bg: '#ccfbf1' },
  { emoji: '📈', title: 'WalletLens Alpha',      desc: 'Deep-dive analytics for your crypto. Live price enrichment, P&L per coin, momentum signals, and AI HOLD/ADD/TRIM/SELL verdicts.', color: '#10b981', bg: '#d1fae5' },
  { emoji: '💡', title: 'Investment Hacks',      desc: '18 expert tips across Entry, Risk, Strategy, Portfolio, Profit, Psychology & Research — each shareable to X as a branded image.', color: '#d97706', bg: '#fef3c7' },
  { emoji: '🎮', title: 'Crypto Guessr Game',    desc: 'Test your crypto knowledge with a 5-round guessing game. Earn up to 50 points per round from clues. Builds real market intuition.', color: '#7c3aed', bg: '#ede9fe' },
  { emoji: '📈', title: 'Multi-Timeframe Chart', desc: 'Switch your performance chart between 4H, 1D, 7D, and 30D. Each timeframe shows a distinct volatile wave shape — like a real crypto chart.', color: '#0284c7', bg: '#dbeafe' },
  { emoji: '🌡️', title: 'Market Mood Dial',      desc: 'Live Fear/Greed gauge scoring dozens of crypto headlines in real-time — no API key, pure sentiment analysis. Know the crowd before you trade.', color: '#ea580c', bg: '#ffedd5' },
  { emoji: '📊', title: 'Correlation Matrix',    desc: '30-day heatmap showing how your holdings move together. Spot hidden concentration risk — if BTC and ETH are 0.97 correlated, you are not diversified.', color: '#0284c7', bg: '#dbeafe' },
  { emoji: '🔓', title: 'Token Unlock Alarms',   desc: '20 major tokens tracked for upcoming unlock cliffs. See severity, monthly unlock %, and exact date — no nasty surprises on unlock day.', color: '#dc2626', bg: '#fee2e2' },
  { emoji: '🏷️', title: 'Asset Category Badges', desc: 'Every holding tagged at a glance — L1, L2, DeFi, AI, RWA, Meme, GameFi, Oracle, plus stock sectors. Diversification visible instantly.', color: '#7c3aed', bg: '#ede9fe' },
  { emoji: '📤', title: 'Portfolio Share Card',  desc: 'Generate a beautiful snapshot of your portfolio and share it to X with one tap. Hide dollar amounts and show only percentages for privacy.', color: '#10b981', bg: '#d1fae5' },
  { emoji: '📅', title: 'Weekly Report',         desc: 'Auto-generated weekly summary of your portfolio performance — top movers, P&L breakdown, and what changed this week. Always ready.', color: '#d97706', bg: '#fef3c7' },
  { emoji: '🏆', title: 'Milestone Celebrations',desc: 'Confetti pops when your portfolio hits $1K, $10K, $100K, your first profit, or a big green day. The wins deserve to be celebrated.', color: '#db2777', bg: '#fce7f3' },
  { emoji: '🎨', title: 'Theme Your App',        desc: 'Pick the theme of your favourite asset — Bitcoin Orange, Ethereum Blue, Solana Purple, Gold, Silver, Emerald, and more.', color: '#ea580c', bg: '#ffedd5' },
  { emoji: '⏱️', title: 'Buy / Sell Timing Signal', desc: 'Checks 24h & 7d momentum, price vs 30-day average, distance from ATH, and your cost basis — verdict: Strong Entry, FOMO Risk, Great Exit, or Wait.', color: '#16a34a', bg: '#dcfce7' },
  { emoji: '🎯', title: 'Goal-Based Tracker',    desc: 'Set a target — e.g. "$50K by Dec 2026" — and track with a live SVG ring, monthly DCA calculator, days remaining, probability badge.', color: '#16a34a', bg: '#dcfce7' },
  { emoji: '🗺️', title: 'Sector Rotation Heatmap', desc: 'See which crypto sectors are hot or cold this week. L1, L2, DeFi, AI/Data, Gaming, Meme & Exchange — colour-coded by 7-day performance.', color: '#ea580c', bg: '#ffedd5' },
  { emoji: '💧', title: 'Liquidity Risk Score',  desc: 'Know before you sell. Compares your holding size against 24h volume to flag exits that could move the market — 🟢 High / 🟡 Med / 🔴 Low.', color: '#dc2626', bg: '#fee2e2' },
  { emoji: '📡', title: 'On-Chain Wallet Import',desc: 'Paste any ETH, BTC, or SOL wallet address — WalletLens auto-detects the chain, fetches live token balances and imports them as holdings.', color: '#8b5cf6', bg: '#ede9fe' },
]

const ASSETS = [
  { name: 'Crypto', desc: '10,000+ coins via CoinGecko',  bg: '#fffbeb', color: '#b45309', icon: <BitcoinSym /> },
  { name: 'Gold',   desc: 'Live XAU/USD spot price',       bg: '#fefce8', color: '#a16207', icon: <GoldBar /> },
  { name: 'Silver', desc: 'Live XAG/USD spot price',       bg: '#f8fafc', color: '#475569', icon: <SilverBar /> },
  { name: 'Stocks', desc: 'US & global equities',          bg: '#eff6ff', color: '#1d4ed8', icon: <StockSym /> },
]

const STEPS = [
  { num: '01', title: 'Open the app',     desc: 'No sign-up. No download. Just open walletlens.cc in your browser and you\'re in.' },
  { num: '02', title: 'Create a wallet',  desc: 'Add a wallet name (e.g. "Ledger", "Binance") to group your trades.' },
  { num: '03', title: 'Record trades',    desc: 'Tap Buy or Sell. Search the asset, enter amount and price. Balances update instantly.' },
  { num: '04', title: 'Scan for risks',   desc: 'Every crypto you hold is auto-scored for rug-pull risk via GoPlus on-chain data. Use Scam Catcher to check any contract.' },
  { num: '05', title: 'Set your alerts',  desc: 'Enter target prices for any holding. Walk away. When price hits — your device alarms. No babysitting required.' },
]

/* All 8 AI items */
const AI_ITEMS = [
  { icon: '📈', title: 'Portfolio Health Grade',  desc: 'A+ to D — based on concentration (HHI index), momentum, P&L health, market cap diversity, and asset count. Instantly.' },
  { icon: '⏰', title: 'Fear & Greed Gauge',      desc: 'Live sentiment meter calibrated to your holdings. Know when the market is about to flip before the crowd does.' },
  { icon: '⚡', title: 'Crash Stress Test',       desc: 'See your portfolio exact dollar loss under Bear (−50%), Sideways, and Bull (+100%) scenarios before they happen.' },
  { icon: '⚖️', title: 'Rebalancing Planner',     desc: 'Equal-weight targets vs current allocation. Exact dollar amounts to buy or sell to reach your ideal portfolio.' },
  { icon: '📊', title: 'Entry Quality Score',     desc: 'For every holding: how good was your entry vs the current price? Ranked and visualized so you know who is carrying the team.' },
  { icon: '💵', title: 'Market Cap Tier Map',     desc: 'Mega, Large, Mid, Small, Micro — see how exposed you are to risk tiers and whether you are truly diversified or not.' },
  { icon: '📅', title: 'Today\'s P&L Tracker',    desc: '24-hour gain or loss calculated from live prices against your cost basis. Know exactly how today treated you.' },
  { icon: '🧭', title: 'AI Decision Engine',      desc: 'One button: "What Should I Do Right Now?" — scores momentum, concentration, P&L, and 24h moves into HOLD / TRIM / ADD / SELL.' },
]

const MOCK_ROWS = [
  { name: 'Bitcoin',  ticker: 'BTC',  price: '$63,420', chg: '+4.2%', up: true,  color: '#f59e0b' },
  { name: 'Ethereum', ticker: 'ETH',  price: '$3,190',  chg: '+2.8%', up: true,  color: '#7c3aed' },
  { name: 'Gold',     ticker: 'XAU',  price: '$2,340',  chg: '−0.3%', up: false, color: '#d97706' },
  { name: 'Apple',    ticker: 'AAPL', price: '$189.45', chg: '+1.1%', up: true,  color: '#64748b' },
]

const FOOTER_NAV = [
  { label: 'Market',         href: '/market' },
  { label: 'Whale Tracker',  href: '/whales' },
  { label: 'Alpha',          href: '/alpha' },
  { label: 'Academy',        href: '/academy' },
  { label: 'AI Advisor',     href: '/coach' },
]

const FOOTER_LINKS = [
  { label: 'About',          href: '/about' },
  { label: 'Blog',           href: '/blog' },
  { label: 'Privacy',        href: '/privacy' },
  { label: 'Terms',          href: '/terms' },
  { label: '@walletlenss',   href: 'https://x.com/walletlenss', external: true },
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
  const [featRef, featVis] = useVisible(0.04)

  return (
    <div className="lt-root">

      {/* ──────── HERO ──────── */}
      <section className="lt-hero" ref={heroRef}>
        <div className="lt-hero-blob" aria-hidden />
        <div className="lt-hero-blob2" aria-hidden />

        <div className="lt-container lt-hero-inner">
          <div className={`lt-hero-text ${heroVis ? 'lt-vis' : ''}`}>
            <div className="lt-pill">
              <span className="lt-pill-dot" />
              Your financial rescue tool · free forever
            </div>

            <h1 className="lt-hero-h1">
              You deserve to know<br />
              <span className="lt-grad">exactly where you stand.</span>
            </h1>

            <p className="lt-hero-sub">
              Most investors are flying blind — guessing P&L, missing rug pulls, holding underwater positions
              without a plan. WalletLens gives you the clarity, protection, and intelligence to take back
              control. Free. Private. No account needed.
            </p>

            <div className="lt-ctas">
              <a href="/dashboard" className="lt-btn-green">
                Wake Up My Wealth — Free
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
            </div>

            <div className="lt-checks">
              {HERO_BADGES.map(b => (
                <div key={b.text} className="lt-check">
                  <div className="lt-check-icon">{b.icon}</div>
                  {b.text}
                </div>
              ))}
            </div>
          </div>

          {/* Right: mock dashboard */}
          <div className={`lt-hero-visual ${heroVis ? 'lt-vis' : ''}`}>
            <div className="lt-mock">
              <div className="lt-mock-topbar">
                <div className="lt-mock-dots">
                  <div className="lt-mock-dot" /><div className="lt-mock-dot" /><div className="lt-mock-dot" />
                </div>
                <div className="lt-mock-topbar-title">WalletLens — Portfolio</div>
                <div className="lt-live-dot">LIVE</div>
              </div>

              <div className="lt-mock-total-label">Portfolio Value</div>
              <div className="lt-mock-total">$48,320.85</div>
              <div className="lt-mock-gain">↑ +$12,450 (5.27%) all time</div>

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
          {['Bitcoin • BTC','Ethereum • ETH','Gold • XAU','Silver • XAG','Apple • AAPL',
            'S&P 500 • SPX','Solana • SOL','Tether • USDT','BNB','XRP','Dogecoin • DOGE',
            'Cardano • ADA','Avalanche • AVAX','Chainlink • LINK']
          .concat(['Bitcoin • BTC','Ethereum • ETH','Gold • XAU','Silver • XAG','Apple • AAPL',
            'S&P 500 • SPX','Solana • SOL','Tether • USDT','BNB','XRP','Dogecoin • DOGE',
            'Cardano • ADA','Avalanche • AVAX','Chainlink • LINK'])
          .map((t, i) => (
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
            <div className="lt-tag">We understand the pain</div>
            <h2 className="lt-sec-h2">
              Investing is hard enough.<br />
              <span className="lt-grad">Your tools shouldn't make it harder.</span>
            </h2>
            <p className="lt-sec-sub">
              We built WalletLens after watching too many people lose money not because of bad markets,
              but because they lacked clarity. This is our answer.
            </p>
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

      {/* ──────── FEATURES (29) ──────── */}
      <section className="lt-feat-sec" id="features" ref={featRef}>
        <div className="lt-container">
          <div className="lt-sec-head">
            <div className="lt-tag">What you get</div>
            <h2 className="lt-sec-h2">Built for investors who are serious about protecting their wealth</h2>
            <p className="lt-sec-sub">Every feature below is live in the app right now — risk, intelligence, and clarity that usually cost hundreds per month, free forever.</p>
          </div>
          <div className="lt-feat-grid">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`lt-feat-card ${featVis ? 'lt-vis' : ''}`}
                style={{ transitionDelay: `${Math.min(i * 35, 800)}ms` }}
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
            <h2 className="lt-sec-h2">One lens, every market</h2>
            <p className="lt-sec-sub">Crypto, precious metals, and equities — unified under one roof for the first time.</p>
          </div>
          <div className="lt-assets-grid">
            {ASSETS.map(a => (
              <div key={a.name} className="lt-asset-card" style={{ background: a.bg }}>
                <div className="lt-asset-icon">{a.icon}</div>
                <h3 style={{ color: a.color }}>{a.name}</h3>
                <p>{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────── HOW IT WORKS (5 steps) ──────── */}
      <section className="lt-how-sec">
        <div className="lt-container lt-how-inner">
          <div className="lt-how-left">
            <div className="lt-sec-head">
              <div className="lt-tag">How it works</div>
              <h2 className="lt-sec-h2">From zero to full picture in under 3 minutes</h2>
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

      {/* ──────── AI SHOWCASE (8 items) ──────── */}
      <section className="lt-ai-sec">
        <div className="lt-container lt-ai-inner">
          <div className="lt-ai-tag">✦ AI Intelligence</div>
          <h2>The analyst you never had — and never paid for</h2>
          <p>
            Seven analytical engines run entirely on your device. No API keys, no subscriptions,
            no data sharing. Just deep maths on your real numbers.
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
          <div className="lt-cta-tag">Free · Private · No account needed</div>
          <h2>
            Stop guessing.<br />
            <span className="lt-grad">Start knowing.</span>
          </h2>
          <p>
            Your portfolio deserves more than a spreadsheet and a prayer. WalletLens gives you the full
            picture — risks, opportunities, alerts, and AI analysis — all free, all private, all yours.
          </p>
          <div>
            <a href="/dashboard" className="lt-btn-cta">
              Start for Free — No Account Needed
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>
          <div className="lt-cta-perks">
            <span>🔒 Data stays on your device</span>
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
              <Logo size={28} />
              WalletLens
            </div>
            <p>Your financial rescue tool. Free forever.</p>
          </div>

          <div className="lt-footer-cols">
            <div className="lt-footer-col">
              <div className="lt-footer-col-title">Product</div>
              {FOOTER_NAV.map(l => (
                <a key={l.label} href={l.href}>{l.label}</a>
              ))}
            </div>
            <div className="lt-footer-col">
              <div className="lt-footer-col-title">Company</div>
              {FOOTER_LINKS.map(l => (
                <a key={l.label} href={l.href} target={l.external ? '_blank' : undefined} rel={l.external ? 'noopener noreferrer' : undefined}>{l.label}</a>
              ))}
            </div>
          </div>
        </div>
        <div className="lt-footer-copy">© {new Date().getFullYear()} WalletLens — Free forever · walletlens.cc</div>
      </footer>

    </div>
  )
}
