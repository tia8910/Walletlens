import { lazy, Suspense, useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import PriceTicker from './components/PriceTicker'
import ErrorBoundary from './components/ErrorBoundary'
import DynamicBackground from './components/DynamicBackground'

const Transactions = lazy(() => import('./pages/Transactions'))
const Market       = lazy(() => import('./pages/Market'))
const Whales       = lazy(() => import('./pages/Whales'))
const AssetDetail  = lazy(() => import('./pages/AssetDetail'))

function PageFallback() {
  return <div className="page"><div className="glass-card"><p className="muted">Loading…</p></div></div>
}

// ── Icons ──────────────────────────────────────────────────────────────
function IconHome() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></svg>
}
function IconTrades() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M9 7h8v8"/><circle cx="7" cy="17" r="1.2" fill="currentColor" stroke="none"/></svg>
}
function IconMarket() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="13" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="4" width="4" height="17" rx="1"/></svg>
}
function IconWhale() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14c2-2 5-3 8-3 4 0 7 2 9 5 1-1 2-2 3-2-1 3-4 5-7 5-3 0-5-1-7-3-1 1-3 1-4 0z"/><circle cx="7" cy="12" r="0.8" fill="currentColor"/></svg>
}
function IconWallet() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20z"/><circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg>
}
function IconBuy() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
}
function IconSell() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>
}
function IconData() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg>
}
function IconMenu() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
}
function IconClose() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}

// ── Slide-out drawer (mobile) ──────────────────────────────────────────
function Drawer({ open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()

  function go(path, state) {
    navigate(path, state ? { state } : undefined)
    onClose()
  }

  const isActive = (path) => location.pathname === path

  return (
    <>
      {open && <div className="drawer-overlay" onClick={onClose} />}
      <aside className={`drawer ${open ? 'drawer-open' : ''}`} aria-label="Navigation drawer">
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-brand">
            <div className="lens-ring lens-ring-sm">
              <div className="lens-mid" /><div className="lens-shine" /><div className="lens-core" />
            </div>
            <div>
              <div className="drawer-brand-name">WalletLens</div>
              <div className="drawer-brand-tag">zoom in your wealth</div>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close menu"><IconClose /></button>
        </div>

        {/* Pages */}
        <div className="drawer-section">
          <div className="drawer-section-label">Pages</div>
          <button className={`drawer-item ${isActive('/dashboard') ? 'drawer-item-active' : ''}`} onClick={() => go('/dashboard')}>
            <span className="drawer-icon"><IconHome /></span>Dashboard
          </button>
          <button className={`drawer-item ${isActive('/market') ? 'drawer-item-active' : ''}`} onClick={() => go('/market')}>
            <span className="drawer-icon"><IconMarket /></span>Market
          </button>
          <button className={`drawer-item ${isActive('/whales') ? 'drawer-item-active' : ''}`} onClick={() => go('/whales')}>
            <span className="drawer-icon"><IconWhale /></span>Whale Tracker
          </button>
        </div>

        {/* Quick actions */}
        <div className="drawer-section">
          <div className="drawer-section-label">Quick Actions</div>
          <button className="drawer-item drawer-item-buy" onClick={() => go('/transactions', { openAdd: true, defaultType: 'buy' })}>
            <span className="drawer-icon"><IconBuy /></span>Buy
          </button>
          <button className="drawer-item drawer-item-sell" onClick={() => go('/transactions', { openAdd: true, defaultType: 'sell' })}>
            <span className="drawer-icon"><IconSell /></span>Sell
          </button>
          <button className={`drawer-item ${isActive('/transactions') ? 'drawer-item-active' : ''}`} onClick={() => go('/transactions')}>
            <span className="drawer-icon"><IconTrades /></span>All Transactions
          </button>
        </div>

        {/* Settings */}
        <div className="drawer-section">
          <div className="drawer-section-label">Settings</div>
          <button className="drawer-item" onClick={() => go('/transactions', { openWallets: true })}>
            <span className="drawer-icon"><IconWallet /></span>Wallets
          </button>
          <button className="drawer-item" onClick={() => go('/transactions', { openData: true })}>
            <span className="drawer-icon"><IconData /></span>Import / Export Data
          </button>
        </div>

        <div className="drawer-footer">
          <span className="live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', display: 'inline-block', marginRight: 6 }} />
          LIVE · walletlens.cc
        </div>
      </aside>
    </>
  )
}

// ── Desktop sidebar ────────────────────────────────────────────────────
function Sidebar() {
  const navigate = useNavigate()

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="logo">
        <div className="logo-mark">
          <div className="lens-ring">
            <div className="lens-mid" /><div className="lens-shine" /><div className="lens-core" />
          </div>
        </div>
        <div className="logo-text">
          <h1 className="logo-wordmark"><span className="logo-w1">Wallet</span><span className="logo-w2">Lens</span></h1>
          <span className="logo-tagline">zoom in your wealth</span>
        </div>
      </div>

      <ul>
        <li><NavLink to="/dashboard"><span className="nav-icon-wrap"><IconHome /></span><span>Dashboard</span></NavLink></li>
        <li><NavLink to="/transactions"><span className="nav-icon-wrap"><IconTrades /></span><span>Transactions</span></NavLink></li>
        <li><NavLink to="/market"><span className="nav-icon-wrap"><IconMarket /></span><span>Market</span></NavLink></li>
        <li><NavLink to="/whales"><span className="nav-icon-wrap"><IconWhale /></span><span>Whales</span></NavLink></li>
      </ul>

      <div className="sidebar-actions">
        <div className="sidebar-actions-label">Quick Actions</div>
        <button className="sidebar-action-btn buy-action" onClick={() => navigate('/transactions', { state: { openAdd: true, defaultType: 'buy' } })}>
          <IconBuy /> Buy
        </button>
        <button className="sidebar-action-btn sell-action" onClick={() => navigate('/transactions', { state: { openAdd: true, defaultType: 'sell' } })}>
          <IconSell /> Sell
        </button>
        <button className="sidebar-action-btn" onClick={() => navigate('/transactions', { state: { openWallets: true } })}>
          <IconWallet /> Wallets
        </button>
        <button className="sidebar-action-btn" onClick={() => navigate('/transactions', { state: { openData: true } })}>
          <IconData /> Data
        </button>
      </div>
    </nav>
  )
}

// ── App shell ──────────────────────────────────────────────────────────
export default function App() {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 1280)
  const isLanding = location.pathname === '/'

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= 1280)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  if (isLanding) {
    return (
      <div className="app app-landing">
        <DynamicBackground particleCount={120} linkDistance={160} />
        <main className="content content-landing">
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Landing />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <DynamicBackground />

      {/* Desktop sidebar — only rendered when not mobile */}
      {!isMobile && <Sidebar />}

      {/* Mobile drawer */}
      {isMobile && <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />}

      {/* Mobile top bar */}
      {isMobile && (
        <header className="topbar">
          <div className="topbar-inner">
            <button className="topbar-hamburger" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <IconMenu />
            </button>
            <div className="topbar-brand">
              <div className="lens-ring lens-ring-sm">
                <div className="lens-mid" /><div className="lens-shine" /><div className="lens-core" />
              </div>
              <strong>WalletLens</strong>
            </div>
            <div className="topbar-badge">
              <span className="live-dot" /> LIVE
            </div>
          </div>
        </header>
      )}

      <main className={`content ${isMobile ? 'content-mobile' : ''}`}>
        <PriceTicker />
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/market" element={<Market />} />
              <Route path="/whales" element={<Whales />} />
              <Route path="/asset/:coinId" element={<AssetDetail />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <button
        type="button"
        className="floating-lens"
        onClick={(e) => {
          e.currentTarget.classList.add('burst')
          setTimeout(() => e.currentTarget.classList.remove('burst'), 220)
        }}
        aria-label="Pulse lens"
      >
        🔎
      </button>

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav className="bottom-nav" aria-label="Bottom navigation">
          <NavLink to="/dashboard" className="nav-item"><IconHome /><span>Home</span></NavLink>
          <NavLink to="/transactions" className="nav-item"><IconTrades /><span>Trades</span></NavLink>
          <NavLink to="/market" className="nav-item"><IconMarket /><span>Market</span></NavLink>
          <NavLink to="/whales" className="nav-item"><IconWhale /><span>Whales</span></NavLink>
        </nav>
      )}
    </div>
  )
}
