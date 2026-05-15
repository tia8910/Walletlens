import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import LandingBackground from '../components/LandingBackground'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'

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

// ── Mini ticker simulation ────────────────────────────────────────────────
const TICKERS = [
  { sym: 'BTC',  price: 81_456, chg: +2.57 },
  { sym: 'ETH',  price: 2_835,  chg: +1.79 },
  { sym: 'SOL',  price: 148.5,  chg: -0.43 },
  { sym: 'XAU',  price: 3_240,  chg: +0.62 },
  { sym: 'AAPL', price: 211.4,  chg: +0.31 },
  { sym: 'XRP',  price: 2.18,   chg: +4.12 },
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
  const { t, lang, setLang, isRtl } = useLanguage()

  useEffect(() => { track('landing_view') }, [])

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
          <div className="lp-mockup-card">
            <div className="lp-mockup-label">{t('mockupLabel')}</div>
            <div className="lp-mockup-value">$248,750<span className="lp-mockup-cents">.42</span></div>
            <div className="lp-mockup-change up">{t('mockupChange')}</div>
            <ChartBars />
          </div>
          <MockTicker />
        </div>
      </section>

      {/* ══ PAIN POINTS / RESCUE ═══════════════════════════════════════ */}
      <section className="lp-section lp-rescue-section">
        <div className="lp-section-label">{t('painLabel')}</div>
        <h2 className="lp-section-h2">
          {t('painH2a')}<br />
          <span style={{ color: '#34d399' }}>{t('painH2b')}</span>
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
        </div>
      </section>

      {/* ══ AI SHOWCASE ═════════════════════════════════════════════════ */}
      <section className="lp-section lp-ai-showcase">
        <div className="lp-section-label">{t('aiLabel')}</div>
        <h2 className="lp-section-h2">{t('aiH2')}</h2>
        <p className="lp-section-sub">{t('aiSub')}</p>
        <div className="lp-ai-grid">
          <div className="lp-ai-feat">
            <div className="lp-ai-feat-icon" style={{background:'rgba(0,230,118,0.12)',color:'#00e676'}}>
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
        <button className="lp-cta-primary lp-final-btn" onClick={() => navigate('/dashboard')}>
          {t('finalBtn')}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <div className="lp-final-links">
          <button className="lp-link" onClick={() => navigate('/market')}>{t('navMarket')}</button>
          <span>·</span>
          <button className="lp-link" onClick={() => navigate('/whales')}>{t('whaleTracker')}</button>
          <span>·</span>
          <button className="lp-link" onClick={() => navigate('/transactions')}>{t('navTransactions')}</button>
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
