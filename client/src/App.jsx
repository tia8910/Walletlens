import { lazy, Suspense, useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import PriceTicker from './components/PriceTicker'
import ErrorBoundary from './components/ErrorBoundary'
import DynamicBackground from './components/DynamicBackground'
import Logo from './components/Logo'
import QuickStatsPopup from './components/QuickStatsPopup'
import OnboardingTour from './components/OnboardingTour'
import { useLanguage } from './LanguageContext'
import { track } from './analytics'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import { useBiometricLock, BiometricLockScreen } from './components/BiometricLock'
import { applySettings } from './settingsUtils'

const Transactions = lazy(() => import('./pages/Transactions'))
const Market       = lazy(() => import('./pages/Market'))
const Whales       = lazy(() => import('./pages/Whales'))
const Intel        = lazy(() => import('./pages/Intel'))
const Alpha        = lazy(() => import('./pages/Alpha'))
const Academy      = lazy(() => import('./pages/Academy'))
const AssetDetail  = lazy(() => import('./pages/AssetDetail'))
const Blog         = lazy(() => import('./pages/Blog'))
const About        = lazy(() => import('./pages/About'))
const Privacy      = lazy(() => import('./pages/Privacy'))
const Settings     = lazy(() => import('./pages/Settings'))

function PageFallback() {
  return <div className="wl-page-fallback"><p>Loading…</p></div>
}

function IconHome()   { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></svg> }
function IconTrades() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M9 7h8v8"/><circle cx="7" cy="17" r="1.2" fill="currentColor" stroke="none"/></svg> }
function IconMarket() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="13" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="4" width="4" height="17" rx="1"/></svg> }
function IconWhale()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14c2-2 5-3 8-3 4 0 7 2 9 5 1-1 2-2 3-2-1 3-4 5-7 5-3 0-5-1-7-3-1 1-3 1-4 0z"/><circle cx="7" cy="12" r="0.8" fill="currentColor"/></svg> }
function IconIntel()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg> }
function IconAlpha()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20L12 4l6 16"/><path d="M8.5 14h7"/><circle cx="12" cy="4" r="1" fill="currentColor" stroke="none"/></svg> }
function IconBuy()    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> }
function IconSell()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg> }
function IconWallet() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20z"/><circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg> }
function IconData()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg> }
function IconMenu()   { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> }
function IconClose()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }

function LangToggle() {
  const { lang, setLang } = useLanguage()
  return (
    <button
      className="wl-lang-btn"
      onClick={() => { const next = lang === 'en' ? 'ar' : 'en'; setLang(() => next); track('language_toggle', { to: next }) }}
      title={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}
    >
      {lang === 'en' ? 'ع' : 'EN'}
    </button>
  )
}

// ── PWA install button in topbar ─────────────────────────────────────
function PWATopbarButton() {
  const [prompt, setPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [tooltip, setTooltip] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setInstalled(true); return
    }
    const handler = (e) => { e.preventDefault(); setPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalled(true))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (installed) return null

  async function handleClick() {
    track('pwa_topbar_install_click')
    if (prompt) {
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      track('pwa_install_outcome', { outcome, source: 'topbar' })
      if (outcome === 'accepted') setInstalled(true)
    } else {
      setTooltip(v => !v)
    }
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
  const instructions = isIOS
    ? '📱 Tap Share → "Add to Home Screen"'
    : '🖥️ Click ☰ browser menu → "Install app" or "Add to Home Screen"'

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        onClick={handleClick}
        title="Add WalletLens to Home Screen"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
          <rect x="5" y="2" width="14" height="20" rx="2"/>
          <line x1="12" y1="6" x2="12" y2="12"/>
          <line x1="9" y1="9" x2="12" y2="6"/>
          <line x1="15" y1="9" x2="12" y2="6"/>
          <line x1="9" y1="16" x2="15" y2="16"/>
        </svg>
      </button>
      {tooltip && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 9999,
          background: 'linear-gradient(135deg,#0d2018,#071410)',
          border: '1px solid rgba(52,211,153,0.35)', borderRadius: 12,
          padding: '0.75rem 1rem', minWidth: 220, maxWidth: 280,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, color: '#34d399', marginBottom: '0.3rem' }}>Add to Home Screen</div>
          {instructions}
          <button onClick={() => setTooltip(false)} style={{
            display: 'block', marginTop: '0.6rem', width: '100%',
            background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)',
            borderRadius: 8, padding: '0.3rem', color: 'rgba(255,255,255,0.5)',
            fontSize: '0.75rem', cursor: 'pointer',
          }}>Got it</button>
        </div>
      )}
    </div>
  )
}

// ── Slide-out drawer ──────────────────────────────────────────────────
function Drawer({ open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  const go = (path, state) => { track('drawer_nav', { to: path, tab: state?.tab }); navigate(path, state ? { state } : undefined); onClose() }
  const active = (p) => location.pathname === p ? 'wl-drawer-item wl-drawer-active' : 'wl-drawer-item'

  return (
    <>
      <div className={`wl-overlay ${open ? 'wl-overlay-open' : ''}`} onClick={onClose} />
      <aside className={`wl-drawer ${open ? 'wl-drawer-open' : ''}`}>
        <div className="wl-drawer-head">
          <div className="wl-drawer-brand">
            <Logo size={30} />
            <div>
              <div className="wl-drawer-name">WalletLens</div>
              <div className="wl-drawer-tag">{t('footerTagline')}</div>
            </div>
          </div>
          <button className="wl-drawer-close" onClick={onClose}><IconClose /></button>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">Pages</div>
          <button className={active('/dashboard')} onClick={() => go('/dashboard')}><IconHome /><span>{t('dashboard')}</span></button>
          <button className={active('/market')} onClick={() => go('/market')}><IconMarket /><span>{t('market')}</span></button>
          <button className={active('/whales')} onClick={() => go('/whales')}><IconWhale /><span>{t('whaleTracker')}</span></button>
          <button className={active('/intel')} onClick={() => go('/intel')}>
            <IconIntel /><span style={{ color: '#38bdf8' }}>Intel</span>
          </button>
          <button className={active('/alpha')} onClick={() => go('/alpha')}>
            <IconAlpha /><span style={{ color: '#a78bfa' }}>Alpha</span>
          </button>
          <button className={active('/academy')} onClick={() => go('/academy')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            <span style={{ color: '#fbbf24' }}>Academy</span>
          </button>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">Tools</div>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'ai' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/><path d="M12 10v4"/><path d="M8 18a4 4 0 0 1 8 0"/><path d="M3 7h2M19 7h2"/></svg>
            <span>AI Analysis</span>
          </button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'targets' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            <span>Targets</span>
          </button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'alerts' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span>Price Alerts</span>
          </button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'risk' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Risk Scanner</span>
          </button>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">{t('quickActions')}</div>
          <button className="wl-drawer-item wl-drawer-buy" onClick={() => go('/transactions', { openAdd: true, type: 'buy' })}><IconBuy /><span>{t('buy')}</span></button>
          <button className="wl-drawer-item wl-drawer-sell" onClick={() => go('/transactions', { openAdd: true, type: 'sell' })}><IconSell /><span>{t('sell')}</span></button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'wallets' })}><IconWallet /><span>{t('wallets')}</span></button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'data' })}><IconData /><span>{t('importExport')}</span></button>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">Account</div>
          <button className={active('/settings')} onClick={() => go('/settings')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Settings</span>
          </button>
        </div>

        <div className="wl-drawer-footer">
          <span className="wl-live-dot" /> {t('live')} · walletlens.cc
          <a className="wl-drawer-x" href="https://x.com/walletlenss" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            @walletlenss
          </a>
        </div>
      </aside>
    </>
  )
}

// ── App shell ─────────────────────────────────────────────────────────
export default function App() {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [quickStatsOpen, setQuickStatsOpen] = useState(false)
  const { t } = useLanguage()
  const isLanding = ['/', '/blog', '/about', '/privacy'].includes(location.pathname) || location.pathname.startsWith('/blog/')
  const { locked, unlock } = useBiometricLock()

  useEffect(() => { applySettings() }, [])
  useEffect(() => setDrawerOpen(false), [location.pathname])

  // Fire GA page_view on every SPA route change
  useEffect(() => {
    if (typeof window.gtag !== 'function') return
    window.gtag('event', 'page_view', {
      page_path: location.pathname + location.search,
      page_title: document.title,
    })
  }, [location.pathname, location.search])

  if (locked && !isLanding) return <BiometricLockScreen onUnlock={unlock} />

  if (isLanding) {
    return (
      <div className="wl-app wl-app-landing">
        <DynamicBackground particleCount={120} linkDistance={160} />
        <ErrorBoundary><Suspense fallback={<PageFallback />}><Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<Blog />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes></Suspense></ErrorBoundary>
      </div>
    )
  }

  return (
    <div className="wl-app">
      <DynamicBackground />

      <header className="wl-topbar">
        <PriceTicker />
        <div className="wl-topbar-inner">
          <button className="wl-hamburger" onClick={() => setDrawerOpen(true)} aria-label={t('menu')}>
            <IconMenu />
          </button>
          <div className="wl-topbar-brand">
            <Logo size={28} />
            <strong>WalletLens</strong>
          </div>
          <div className="wl-topbar-right">
            <PWATopbarButton />
            <a className="wl-topbar-x" href="https://x.com/walletlenss" target="_blank" rel="noopener noreferrer" title="Follow @walletlenss">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <LangToggle />
            <div className="wl-live-badge"><span className="wl-live-dot"/>{t('live')}</div>
          </div>
        </div>
      </header>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="wl-content">
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/market" element={<Market />} />
              <Route path="/whales" element={<Whales />} />
              <Route path="/intel" element={<Intel />} />
              <Route path="/alpha" element={<Alpha />} />
              <Route path="/academy" element={<Academy />} />
              <Route path="/asset/:coinId" element={<AssetDetail />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<Blog />} />
              <Route path="/about" element={<About />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <OnboardingTour />
      <PWAInstallPrompt />

      <button className="floating-lens" onClick={e => { e.currentTarget.classList.add('burst'); setTimeout(() => e.currentTarget.classList.remove('burst'), 220); setQuickStatsOpen(true); track('quick_stats_open') }} aria-label="Quick Stats"><Logo size={30} /></button>
      {quickStatsOpen && <QuickStatsPopup onClose={() => setQuickStatsOpen(false)} />}

      <nav className="wl-bottom-nav">
        <NavLink to="/dashboard" className="wl-nav-item" onClick={() => track('bottom_nav', { to: 'dashboard' })}><IconHome /><span>{t('home')}</span></NavLink>
        <NavLink to="/transactions" className="wl-nav-item" onClick={() => track('bottom_nav', { to: 'transactions' })}><IconTrades /><span>{t('trades')}</span></NavLink>
        <NavLink to="/market" className="wl-nav-item" onClick={() => track('bottom_nav', { to: 'market' })}><IconMarket /><span>{t('market')}</span></NavLink>
        <NavLink to="/whales" className="wl-nav-item" onClick={() => track('bottom_nav', { to: 'whales' })}><IconWhale /><span>{t('whales')}</span></NavLink>
        <NavLink to="/alpha" className="wl-nav-item wl-nav-alpha" onClick={() => track('bottom_nav', { to: 'alpha' })}><IconAlpha /><span>Alpha</span></NavLink>
      </nav>
    </div>
  )
}
