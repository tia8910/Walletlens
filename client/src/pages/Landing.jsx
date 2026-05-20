import { useEffect, useRef, useState } from 'react'
import cfBadge from '../assets/cf-badge.png'
import { useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import LandingBackground from '../components/LandingBackground'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import ExchangePartners from '../components/ExchangePartners'

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
function PainCard({ emoji, pain, solution, delay = 0, isRtl }) {
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
      <div className="lp-pain-divider">{isRtl ? '←' : '→'}</div>
      <p className="lp-pain-solution">{solution}</p>
    </div>
  )
}

// ── Live portfolio mockup: ticking counter + drawing SVG chart ────────────
function LiveMockup({ label, change }) {
  const [val, setVal]      = useState(248750.42)
  const [points, setPoints] = useState([])
  const [drawn, setDrawn]   = useState(0)
  const pathRef = useRef(null)
  const [pathLen, setPathLen] = useState(420)

  // Live counter ticks up/down by tiny amounts so it feels alive
  useEffect(() => {
    const id = setInterval(() => {
      setVal(v => Math.max(248000, v + (Math.random() - 0.35) * 14))
    }, 900)
    return () => clearInterval(id)
  }, [])

  // Generate a deterministic-ish upward-trending random walk for the chart
  useEffect(() => {
    const arr = []
    let y = 78
    for (let i = 0; i < 32; i++) {
      y += (Math.random() - 0.62) * 7
      y = Math.max(14, Math.min(86, y))
      arr.push(y)
    }
    setPoints(arr)
  }, [])

  // Animate the line drawing itself
  useEffect(() => {
    if (points.length === 0) return
    if (pathRef.current?.getTotalLength) setPathLen(pathRef.current.getTotalLength())
    let raf
    const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min((now - t0) / 1800, 1)
      setDrawn(p)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [points])

  if (points.length === 0) return null

  const W = 320, H = 100
  const step = W / (points.length - 1)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${p.toFixed(2)}`).join(' ')
  const fill = `${line} L ${W} ${H} L 0 ${H} Z`
  const tipX = (points.length - 1) * step
  const tipY = points[points.length - 1]
  const whole = Math.floor(val)
  const cents = (val - whole).toFixed(2).slice(2)

  return (
    <div className="lp-live-card">
      <div className="lp-live-header">
        <span className="lp-live-label">{label}</span>
        <span className="lp-live-status"><span className="lp-live-dot-anim" />LIVE</span>
      </div>
      <div className="lp-live-value">
        ${whole.toLocaleString()}<span className="lp-live-cents">.{cents}</span>
      </div>
      <div className="lp-live-change">{change}</div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="lp-live-chart">
        <defs>
          <linearGradient id="lp-live-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#00ff84" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00ff84" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#lp-live-fill)" opacity={drawn} />
        <path
          ref={pathRef}
          d={line}
          fill="none"
          stroke="#00ff84"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={pathLen}
          strokeDashoffset={pathLen * (1 - drawn)}
          style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,132,0.55))' }}
        />
        {drawn > 0.96 && (
          <circle cx={tipX} cy={tipY} r="4.5" fill="#00ff84" className="lp-live-tip" />
        )}
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate()
  const [logoAnim, setLogoAnim] = useState(false)
  const heroRef = useRef(null)
  const { t, lang, setLang, isRtl } = useLanguage()

  useEffect(() => {
    track('landing_view')
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref) track('referral_visit', { ref_source: ref })
  }, [])

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
            <span className="lp-logo-halo" />
            <span className="lp-logo-ring lp-logo-ring-1" />
            <Logo size={88} />
          </button>

          <div className="lp-brand-name">WalletLens</div>
          <div className="lp-brand-tag">{t('brandTag')}</div>

          <h1 className="lp-hero-h1">
            {t('heroH1a')}<br />
            <span className="lp-h1-accent">{t('heroH1b')}</span>
          </h1>

          <p className="lp-hero-sub">{t('heroSub')}</p>

          <div className="lp-cta-row">
            <button className="lp-cta-primary" onClick={() => { track('landing_cta_launch'); navigate('/dashboard') }}>
              {t('ctaLaunch')}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button className="lp-cta-ghost" onClick={() => { track('landing_cta_market'); navigate('/market') }}>
              {t('ctaMarket')}
            </button>
          </div>

          <button className="lp-lang-toggle" onClick={() => { const newLang = lang === 'en' ? 'ar' : 'en'; track('landing_lang_toggle', { to: newLang }); setLang(newLang) }}>
            {lang === 'en' ? '🌐 العربية' : '🌐 English'}
          </button>

          <div className="lp-badges">
            <span className="lp-badge">{t('badge1')}</span>
            <span className="lp-badge">{t('badge2')}</span>
            <span className="lp-badge">{t('badge3')}</span>
            <span className="lp-badge">{t('badge4')}</span>
          </div>
        </div>

        <div className="lp-hero-mockup">
          <LiveMockup label={t('mockupLabel')} change={t('mockupChange')} />
        </div>
      </section>

      {/* ══ PAIN POINTS / RESCUE ═══════════════════════════════════════ */}
      <section className="lp-section lp-rescue-section">
        <div className="lp-section-label">{t('painLabel')}</div>
        <h2 className="lp-section-h2">
          {t('painH2a')}<br />
          <span style={{ color: 'var(--g)' }}>{t('painH2b')}</span>
        </h2>
        <p className="lp-section-sub" style={{ maxWidth: 560, margin: '0 auto 2.5rem' }}>
          {t('painIntro')}
        </p>
        <div className="lp-pain-grid">
          <PainCard delay={0}   isRtl={isRtl} emoji="😰" pain={t('pain1')} solution={t('sol1')} />
          <PainCard delay={80}  isRtl={isRtl} emoji="💸" pain={t('pain2')} solution={t('sol2')} />
          <PainCard delay={160} isRtl={isRtl} emoji="😴" pain={t('pain3')} solution={t('sol3')} />
          <PainCard delay={240} isRtl={isRtl} emoji="🤯" pain={t('pain4')} solution={t('sol4')} />
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
        <div className="lp-section-label">{t('featLabel')}</div>
        <h2 className="lp-section-h2">{t('featH2')}</h2>
        <div className="lp-feat-grid">
          <FeatureCard delay={0} accent="52,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
            title={t('feat1Title')} desc={t('feat1Desc')}
          />
          <FeatureCard delay={80} accent="248,113,113"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>}
            title={t('feat2Title')} desc={t('feat2Desc')}
          />
          <FeatureCard delay={160} accent="251,146,60"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
            title={t('feat3Title')} desc={t('feat3Desc')}
          />
          <FeatureCard delay={0} accent="96,165,250"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>}
            title={t('feat4Title')} desc={t('feat4Desc')}
          />
          <FeatureCard delay={80} accent="167,139,250"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
            title={t('feat5Title')} desc={t('feat5Desc')}
          />
          <FeatureCard delay={160} accent="52,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/><path d="M12 10v4"/><path d="M8 18a4 4 0 0 1 8 0"/><path d="M3 7h2M19 7h2M3 17h2M19 17h2"/></svg>}
            title={t('feat6Title')} desc={t('feat6Desc')}
          />
          <FeatureCard delay={0} accent="52,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>}
            title={t('feat7Title')} desc={t('feat7Desc')}
          />
          <FeatureCard delay={80} accent="244,114,182"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
            title={t('feat8Title')} desc={t('feat8Desc')}
          />
          <FeatureCard delay={160} accent="251,191,36"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20z"/><circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg>}
            title={t('feat9Title')} desc={t('feat9Desc')}
          />
          <FeatureCard delay={0} accent="52,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
            title={t('feat10Title')} desc={t('feat10Desc')}
          />
          <FeatureCard delay={80} accent="96,165,250"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>}
            title={t('feat11Title')} desc={t('feat11Desc')}
          />
          <FeatureCard delay={160} accent="34,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
            title={t('feat12Title')} desc={t('feat12Desc')}
          />
          <FeatureCard delay={80} accent="52,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
            title={t('feat13Title')} desc={t('feat13Desc')}
          />
          <FeatureCard delay={160} accent="251,191,36"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>}
            title={t('feat14Title')} desc={t('feat14Desc')}
          />
          <FeatureCard delay={0} accent="167,139,250"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
            title={t('feat15Title')} desc={t('feat15Desc')}
          />
          <FeatureCard delay={80} accent="96,165,250"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/><polyline points="15 3 19 3 19 7"/></svg>}
            title={t('feat16Title')} desc={t('feat16Desc')}
          />
          <FeatureCard delay={0} accent="251,146,60"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>}
            title="🌡️ Market Mood Dial"
            desc="Live Fear/Greed gauge scoring dozens of crypto headlines in real-time — no API key, pure sentiment analysis. Know the crowd's emotion before you trade."
          />
          <FeatureCard delay={80} accent="96,165,250"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
            title="📊 Correlation Matrix"
            desc="30-day heatmap showing how your holdings move together. Spot hidden concentration risk — if BTC and ETH are 0.97 correlated, you are not as diversified as you think."
          />
          <FeatureCard delay={160} accent="248,113,113"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>}
            title="🔓 Token Unlock Alarms"
            desc="20 major tokens tracked for upcoming unlock cliffs. See severity, monthly unlock %, and exact date right on your holding card — no nasty surprises on unlock day."
          />
          <FeatureCard delay={0} accent="167,139,250"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
            title="🏷️ Asset Category Badges"
            desc="Every holding tagged at a glance — L1, L2, DeFi, AI, RWA, Meme, GameFi, Oracle, and stock sectors like Tech, Finance, Health. Diversification visible instantly."
          />
          <FeatureCard delay={80} accent="52,211,153"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>}
            title="📤 Portfolio Share Card"
            desc="Generate a beautiful snapshot of your portfolio and share it directly to X with one tap. Hide dollar amounts and show only percentages for privacy."
          />
          <FeatureCard delay={160} accent="251,191,36"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>}
            title="📅 Weekly Report"
            desc="Auto-generated weekly summary of your portfolio performance — top movers, P&L breakdown, and what changed this week. One tap to open, always ready."
          />
          <FeatureCard delay={0} accent="244,114,182"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
            title="🏆 Milestone Celebrations"
            desc="Confetti pops when your portfolio hits $1K, $10K, $100K, your first profit, or a big green day. The wins deserve to be celebrated."
          />
          <FeatureCard delay={80} accent="247,147,26"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 20v-8.5"/><path d="M20 20H4"/></svg>}
            title="🎨 Theme Your App"
            desc="Pick the theme of your favourite asset — Bitcoin Orange, Ethereum Blue, Solana Purple, Gold, Silver, Emerald, and more. The whole interface changes colour to match."
          />
          <FeatureCard delay={90} accent="34,197,94"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
            title="⏱️ Buy / Sell Timing Signal"
            desc="Before you trade, WalletLens tells you whether now is a good time. It checks 24h & 7d momentum, price vs 30-day average, distance from all-time high, and how far you are from your own average cost — then gives you a clear verdict: Strong Entry, FOMO Risk, Great Exit, or Wait for Recovery."
          />
          <FeatureCard delay={100} accent="34,197,94"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            title="🎯 Goal-Based Portfolio Tracker"
            desc="Set a target — e.g. '$50K by Dec 2026' — and track your progress with a live SVG ring, monthly DCA calculator, days remaining, and a probability badge (Likely / Possible / Stretch). Multiple goals supported."
          />
          <FeatureCard delay={110} accent="251,146,60"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>}
            title="📊 Sector Rotation Heatmap"
            desc="See which crypto sectors are hot or cold this week. Layer 1, Layer 2, DeFi, AI/Data, Gaming, Meme, and Exchange — each tile colour-coded by 7-day performance so you know where the money is flowing."
          />
          <FeatureCard delay={120} accent="248,113,113"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>}
            title="💧 Liquidity Risk Score"
            desc="Know before you sell. WalletLens compares your holding size against 24-hour trading volume to flag assets where a large exit could move the market against you — flagged 🟢 High, 🟡 Medium, or 🔴 Low Liquidity."
          />
          <FeatureCard delay={130} accent="139,92,246"
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>}
            title="📡 On-Chain Wallet Import"
            desc="Paste any Ethereum, Bitcoin, or Solana wallet address and WalletLens auto-detects the chain, fetches your live token balances, and imports them as holdings — no exchange API key, no account needed."
          />
        </div>
      </section>

      {/* ══ AI SHOWCASE ═════════════════════════════════════════════════ */}
      <section className="lp-section lp-ai-showcase">
        <div className="lp-section-label">{t('aiLabel')}</div>
        <h2 className="lp-section-h2">{t('aiH2')}</h2>
        <p className="lp-section-sub">{t('aiSub')}</p>
        <div className="lp-ai-grid">
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(0,255,132,0.12)',color:'#00ff84'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">{t('aiFeat1Title')}</div>
              <div className="lp-ai-feat-desc">{t('aiFeat1Desc')}</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(255,215,0,0.12)',color:'#ffd700'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">{t('aiFeat2Title')}</div>
              <div className="lp-ai-feat-desc">{t('aiFeat2Desc')}</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(239,68,68,0.12)',color:'#f87171'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">{t('aiFeat3Title')}</div>
              <div className="lp-ai-feat-desc">{t('aiFeat3Desc')}</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(168,85,247,0.12)',color:'#c084fc'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">{t('aiFeat4Title')}</div>
              <div className="lp-ai-feat-desc">{t('aiFeat4Desc')}</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(59,130,246,0.12)',color:'#60a5fa'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">{t('aiFeat5Title')}</div>
              <div className="lp-ai-feat-desc">{t('aiFeat5Desc')}</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(20,184,166,0.12)',color:'#2dd4bf'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">{t('aiFeat6Title')}</div>
              <div className="lp-ai-feat-desc">{t('aiFeat6Desc')}</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(251,146,60,0.12)',color:'#fb923c'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">{t('aiFeat7Title')}</div>
              <div className="lp-ai-feat-desc">{t('aiFeat7Desc')}</div>
            </div>
          </div>
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(167,139,250,0.12)',color:'#a78bfa'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div>
              <div className="lp-ai-feat-title">{t('aiFeat8Title')}</div>
              <div className="lp-ai-feat-desc">{t('aiFeat8Desc')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ════════════════════════════════════════════════ */}
      <section className="lp-section lp-section-alt">
        <div className="lp-section-label">{t('howLabel')}</div>
        <h2 className="lp-section-h2">{t('howH2')}</h2>
        <div className="lp-steps">
          <StepCard n="01" delay={0}   title={t('step1Title')} desc={t('step1Desc')} />
          <StepCard n="02" delay={100} title={t('step2Title')} desc={t('step2Desc')} />
          <StepCard n="03" delay={200} title={t('step3Title')} desc={t('step3Desc')} />
          <StepCard n="04" delay={300} title={t('step4Title')} desc={t('step4Desc')} />
          <StepCard n="05" delay={400} title={t('step5Title')} desc={t('step5Desc')} />
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
          {t('finalH2a')}<br />{t('finalH2b')}
        </h2>
        <p className="lp-final-sub">{t('finalSub')}</p>
        <button className="lp-cta-primary lp-final-btn" onClick={() => { track('landing_cta_launch'); navigate('/dashboard') }}>
          {t('finalBtn')}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <button className="lp-share-x-btn" onClick={async () => {
          track('landing_share_brand_x')
          const text = encodeURIComponent('🔍 Discovered WalletLens — free crypto portfolio tracker, no account, 100% private.\n\nRisk scanner, AI advisor, whale signals, and more.\n\nwalletlens.cc @walletlenss')
          if (navigator.canShare) {
            try {
              const res = await fetch('/brand-features.svg')
              const blob = await res.blob()
              const file = new File([blob], 'walletlens.svg', { type: 'image/svg+xml' })
              if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: decodeURIComponent(text) }); return }
            } catch {}
          }
          window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener')
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          Share WalletLens on X
        </button>
        {/* Partner exchanges on landing */}
        <ExchangePartners compact source="landing" />

        <div className="lp-final-links">
          <button className="lp-link" onClick={() => navigate('/market')}>{t('navMarket')}</button>
          <span>·</span>
          <button className="lp-link" onClick={() => navigate('/whales')}>{t('whaleTracker')}</button>
          <span>·</span>
          <button className="lp-link" onClick={() => navigate('/alpha')}>Alpha</button>
          <span>·</span>
          <button className="lp-link" onClick={() => navigate('/academy')}>Academy</button>
          <span>·</span>
          <button className="lp-link" onClick={() => navigate('/dashboard', { state: { tab: 'ai' } })}>AI Advisor</button>
          <span>·</span>
          <a className="lp-link lp-x-link" href="https://x.com/walletlenss" target="_blank" rel="noopener noreferrer" onClick={() => track('landing_x_follow')}>
            <svg className="lp-x-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            @walletlenss
          </a>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Logo size={24} />
          <span>WalletLens © {new Date().getFullYear()}</span>
        </div>
        <img src={cfBadge} alt="Protected by Cloudflare" className="lp-cf-badge" />
        <nav className="lp-footer-links">
          <Link to="/about" onClick={() => track('landing_footer_nav', { to: 'about' })}>{t('about')}</Link>
          <Link to="/blog" onClick={() => track('landing_footer_nav', { to: 'blog' })}>{t('blog')}</Link>
          <Link to="/privacy" onClick={() => track('landing_footer_nav', { to: 'privacy' })}>{t('privacy')}</Link>
          <a className="lp-footer-x" href="https://x.com/walletlenss" target="_blank" rel="noopener noreferrer" title="Follow @walletlenss on X" onClick={() => track('landing_x_follow')}>
            <svg className="lp-x-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            @walletlenss
          </a>
          <button className="lp-lang-toggle lp-lang-toggle-sm" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
            {lang === 'en' ? '🌐 العربية' : '🌐 English'}
          </button>
        </nav>
      </footer>
    </div>
  )
}
