import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import LandingBackground from '../components/LandingBackground'
import { useLanguage } from '../LanguageContext'

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
function FeatureCard({ icon, title, desc, delay = 0, accent }) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { threshold: 0.15 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={`lp-feat-card ${vis ? 'lp-feat-vis' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="lp-feat-icon" style={accent ? { background: `rgba(${accent},0.12)`, color: `rgb(${accent})` } : {}}>{icon}</div>
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

// ── Pain point card ───────────────────────────────────────────────────────
function PainCard({ emoji, pain, solution, delay = 0 }) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { threshold: 0.15 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={`lp-pain-card ${vis ? 'lp-feat-vis' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="lp-pain-emoji">{emoji}</div>
      <p className="lp-pain-text">{pain}</p>
      <div className="lp-pain-divider">→</div>
      <p className="lp-pain-solution">{solution}</p>
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
  const { t, lang, setLang } = useLanguage()

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
          <div className="lp-brand-tag">YOUR FINANCIAL RESCUE TOOL</div>

          <h1 className="lp-hero-h1">
            You deserve to know<br />
            <span className="lp-h1-accent">exactly where you stand.</span>
          </h1>

          <p className="lp-hero-sub">
            Most investors are flying blind — guessing their P&amp;L, missing rug pulls, holding underwater positions without a plan. WalletLens gives you the clarity, protection, and intelligence to take back control. Free. Private. No account needed.
          </p>

          <div className="lp-cta-row">
            <button className="lp-cta-primary" onClick={() => navigate('/dashboard')}>
              Take Back Control — Free
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button className="lp-cta-ghost" onClick={() => navigate('/market')}>
              {t('ctaMarket')}
            </button>
          </div>

          <button className="lp-lang-toggle" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
            {lang === 'en' ? '🌐 العربية' : '🌐 English'}
          </button>

          <div className="lp-badges">
            <span className="lp-badge">🔒 100% Private</span>
            <span className="lp-badge">⚡ Real-time Prices</span>
            <span className="lp-badge">🛡 Rug Pull Scanner</span>
            <span className="lp-badge">🔔 Price Alerts</span>
          </div>
        </div>

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

      {/* ══ PAIN POINTS / RESCUE ═══════════════════════════════════════ */}
      <section className="lp-section lp-rescue-section">
        <div className="lp-section-label">WE UNDERSTAND THE PAIN</div>
        <h2 className="lp-section-h2">
          Investing is hard enough.<br />
          <span style={{ color: '#34d399' }}>Your tools shouldn't make it harder.</span>
        </h2>
        <p className="lp-section-sub" style={{ maxWidth: 560, margin: '0 auto 2.5rem' }}>
          We built WalletLens after watching too many people lose money not because of bad markets, but because they lacked clarity. This is our answer.
        </p>
        <div className="lp-pain-grid">
          <PainCard delay={0}
            emoji="😰"
            pain="I don't know if I'm actually up or down. The numbers are everywhere."
            solution="One dashboard. Every asset. Real P&L calculated from your actual cost basis."
          />
          <PainCard delay={80}
            emoji="💸"
            pain="I held a token that rugged. I had no idea the contract was dangerous."
            solution="Rug Pull Risk Scanner scores every token — honeypot detection, holder concentration, contract verification."
          />
          <PainCard delay={160}
            emoji="😴"
            pain="I missed my target price because I wasn't watching the screen."
            solution="Smart Price Alerts fire an audio alarm + browser notification the moment your target is hit."
          />
          <PainCard delay={240}
            emoji="🤯"
            pain="I know I'm losing but I don't know exactly how much more I need to break even."
            solution="Break-Even Calculator shows the exact price every holding needs to reach to recover your full investment."
          />
        </div>
      </section>

      {/* ══ STATS ══════════════════════════════════════════════════════ */}
      <section className="lp-stats">
        <div className="lp-stat-item">
          <div className="lp-stat-val"><Counter to={10000} suffix="+" /></div>
          <div className="lp-stat-lbl">{t('statAssetsLbl')}</div>
        </div>
        <div className="lp-stat-sep" />
        <div className="lp-stat-item">
          <div className="lp-stat-val"><Counter to={0} prefix="" suffix="%" /></div>
          <div className="lp-stat-lbl">{t('statFeesLbl')}</div>
        </div>
        <div className="lp-stat-sep" />
        <div className="lp-stat-item">
          <div className="lp-stat-val"><Counter to={60} suffix="s" /></div>
          <div className="lp-stat-lbl">{t('statRefreshLbl')}</div>
        </div>
        <div className="lp-stat-sep" />
        <div className="lp-stat-item">
          <div className="lp-stat-val"><Counter to={4} /></div>
          <div className="lp-stat-lbl">{t('statClassesLbl')}</div>
        </div>
      </section>

      {/* ══ FEATURES ═══════════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-section-label">WHAT YOU GET</div>
        <h2 className="lp-section-h2">Built for investors who are serious about protecting their wealth</h2>
        <div className="lp-feat-grid">
          <FeatureCard delay={0} accent="52,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
            title="Rug Pull Risk Scanner"
            desc="Every token in your wallet scored 0–100. Honeypot detection, contract verification, holder concentration, buy/sell tax — before you lose everything."
          />
          <FeatureCard delay={80} accent="251,146,60"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
            title="Smart Price Alerts"
            desc="Set a target, walk away. The moment price hits your level — audio alarm fires, your phone buzzes, a notification lands. No more sleeping on opportunities."
          />
          <FeatureCard delay={160} accent="96,165,250"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>}
            title="Break-Even Calculator"
            desc="Know exactly what price each holding needs to reach for you to be whole again. Not a guess — your actual cost basis, per asset, right now."
          />
          <FeatureCard delay={0} accent="167,139,250"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/><path d="M12 10v4"/><path d="M8 18a4 4 0 0 1 8 0"/><path d="M3 7h2M19 7h2M3 17h2M19 17h2"/></svg>}
            title="AI Portfolio Analysis"
            desc="Health grade, stress tests (Bear/Sideways/Bull), top risks, rebalancing plan — seven analytical engines running on your actual data, not generic advice."
          />
          <FeatureCard delay={80} accent="52,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>}
            title="Sell Targets Planner"
            desc="Map out every exit before emotions take over. Set multiple price targets, see how close you are, and know exactly how much you'll pocket at each level."
          />
          <FeatureCard delay={160} accent="244,114,182"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
            title="Whale Signal Tracker"
            desc="See what the big money is doing. Accumulation signals, unusual volume, momentum shifts — the intel that usually costs thousands per month."
          />
          <FeatureCard delay={0} accent="251,191,36"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20z"/><circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg>}
            title="Multi-Wallet Support"
            desc="Track every wallet you own across exchanges and self-custody. See the complete picture, not just one slice."
          />
          <FeatureCard delay={80} accent="52,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
            title="Encrypted Backup"
            desc="Export your entire portfolio as a compressed WLZ file. Import anywhere, anytime. Your data never touches our servers."
          />
          <FeatureCard delay={160} accent="34,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
            title="100% Private by Design"
            desc="Zero account. Zero cloud sync. Every byte stays on your device. Not even we can see your portfolio."
          />
          <FeatureCard delay={0} accent="96,165,250"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>}
            title="Every Asset Class"
            desc="Crypto, US stocks, gold, silver, and foreign exchange — all in one view with live prices updating every 60 seconds."
          />
        </div>
      </section>

      {/* ══ AI SHOWCASE ═════════════════════════════════════════════════ */}
      <section className="lp-section lp-ai-showcase">
        <div className="lp-section-label">AI INTELLIGENCE</div>
        <h2 className="lp-section-h2">The analyst you never had — and never paid for</h2>
        <p className="lp-section-sub">Seven analytical engines run entirely on your device. No API keys, no subscriptions, no data sharing. Just deep maths on your real numbers.</p>
        <div className="lp-ai-grid">
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(0,230,118,0.12)',color:'#00e676'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Portfolio Health Grade</div>
              <div className="lp-ai-feat-desc">A+ to D — based on concentration (HHI index), momentum, P&L health, market cap diversity, and asset count. Instantly.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(255,215,0,0.12)',color:'#ffd700'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Fear &amp; Greed Gauge</div>
              <div className="lp-ai-feat-desc">Live sentiment meter calibrated to your holdings. Know when the market is about to flip before the crowd does.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(239,68,68,0.12)',color:'#f87171'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Crash Stress Test</div>
              <div className="lp-ai-feat-desc">See your portfolio's exact dollar loss under Bear (−50%), Sideways, and Bull (+100%) scenarios before they happen.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(168,85,247,0.12)',color:'#c084fc'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Rebalancing Planner</div>
              <div className="lp-ai-feat-desc">Equal-weight targets vs current allocation. Exact dollar amounts to buy or sell to reach your ideal portfolio.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(59,130,246,0.12)',color:'#60a5fa'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Entry Quality Score</div>
              <div className="lp-ai-feat-desc">For every holding: how good was your entry vs the current price? Ranked and visualized so you know who's carrying the team.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(20,184,166,0.12)',color:'#2dd4bf'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Market Cap Tier Map</div>
              <div className="lp-ai-feat-desc">Mega, Large, Mid, Small, Micro — see how exposed you are to risk tiers and whether you're truly diversified or not.</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(251,146,60,0.12)',color:'#fb923c'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">Today's P&amp;L Tracker</div>
              <div className="lp-ai-feat-desc">24-hour gain or loss calculated from live prices against your cost basis. Know exactly how today treated you.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ════════════════════════════════════════════════ */}
      <section className="lp-section lp-section-alt">
        <div className="lp-section-label">{t('howLabel')}</div>
        <h2 className="lp-section-h2">From zero to full picture in under 3 minutes</h2>
        <div className="lp-steps">
          <StepCard n="01" delay={0}   title={t('step1Title')} desc={t('step1Desc')} />
          <StepCard n="02" delay={100} title={t('step2Title')} desc={t('step2Desc')} />
          <StepCard n="03" delay={200} title={t('step3Title')} desc={t('step3Desc')} />
          <StepCard n="04" delay={300} title="Scan for risks" desc="Open the Risk tab. Every crypto you hold is automatically scored for rug pull risk using GoPlus on-chain data." />
          <StepCard n="05" delay={400} title="Set your alerts" desc="Enter target prices for any holding. Walk away. When price hits — your device alarms. No babysitting required." />
        </div>
      </section>

      {/* ══ ASSET CLASSES ═══════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-section-label">{t('assetLabel')}</div>
        <h2 className="lp-section-h2">{t('assetTitle')}</h2>
        <div className="lp-asset-grid">
          <div className="lp-asset-card">
            <div className="lp-asset-icon" style={{ background: 'rgba(247,147,26,0.12)', color: '#f7931a' }}>₿</div>
            <div className="lp-asset-name">{t('assetCrypto')}</div>
            <div className="lp-asset-desc">{t('assetCryptoDesc')}</div>
          </div>
          <div className="lp-asset-card">
            <div className="lp-asset-icon" style={{ background: 'rgba(255,215,0,0.12)', color: '#ffd700' }}>Au</div>
            <div className="lp-asset-name">{t('assetGold')}</div>
            <div className="lp-asset-desc">{t('assetGoldDesc')}</div>
          </div>
          <div className="lp-asset-card">
            <div className="lp-asset-icon" style={{ background: 'rgba(192,192,192,0.12)', color: '#c0c0c0' }}>Ag</div>
            <div className="lp-asset-name">{t('assetSilver')}</div>
            <div className="lp-asset-desc">{t('assetSilverDesc')}</div>
          </div>
          <div className="lp-asset-card">
            <div className="lp-asset-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>$</div>
            <div className="lp-asset-name">{t('assetStocks')}</div>
            <div className="lp-asset-desc">{t('assetStocksDesc')}</div>
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══════════════════════════════════════════════════ */}
      <section className="lp-final">
        <div className="lp-final-glow" />
        <Logo size={64} animated />
        <h2 className="lp-final-h2">
          Stop guessing.<br />Start knowing.
        </h2>
        <p className="lp-final-sub">
          Your portfolio deserves more than a spreadsheet and a prayer. WalletLens gives you the full picture — risks, opportunities, alerts, and AI analysis — all free, all private, all yours.
        </p>
        <button className="lp-cta-primary lp-final-btn" onClick={() => navigate('/dashboard')}>
          Start for Free — No Account Needed
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <div className="lp-final-links">
          <button className="lp-link" onClick={() => navigate('/market')}>{t('navMarket')}</button>
          <span>·</span>
          <button className="lp-link" onClick={() => navigate('/whales')}>{t('whaleTracker')}</button>
          <span>·</span>
          <button className="lp-link" onClick={() => navigate('/transactions')}>{t('navTransactions')}</button>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Logo size={24} />
          <span>WalletLens © {new Date().getFullYear()}</span>
        </div>
        <nav className="lp-footer-links">
          <Link to="/about">{t('about')}</Link>
          <Link to="/blog">{t('blog')}</Link>
          <Link to="/privacy">{t('privacy')}</Link>
          <button className="lp-lang-toggle lp-lang-toggle-sm" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
            {lang === 'en' ? '🌐 العربية' : '🌐 English'}
          </button>
        </nav>
      </footer>
    </div>
  )
}
