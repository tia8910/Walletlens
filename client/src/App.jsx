import { lazy, Suspense, useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import PriceTicker from './components/PriceTicker'
import ErrorBoundary from './components/ErrorBoundary'
import DynamicBackground from './components/DynamicBackground'
import Logo from './components/Logo'

const Transactions = lazy(() => import('./pages/Transactions'))
const Market       = lazy(() => import('./pages/Market'))
const Whales       = lazy(() => import('./pages/Whales'))
const AssetDetail  = lazy(() => import('./pages/AssetDetail'))
const Blog         = lazy(() => import('./pages/Blog'))
const About        = lazy(() => import('./pages/About'))
const Privacy      = lazy(() => import('./pages/Privacy'))

function PageFallback() {
  return <div className="wl-page-fallback"><p>Loading…</p></div>
}

function IconHome()   { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></svg> }
function IconTrades() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M9 7h8v8"/><circle cx="7" cy="17" r="1.2" fill="currentColor" stroke="none"/></svg> }
function IconMarket() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="13" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="4" width="4" height="17" rx="1"/></svg> }
function IconWhale()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14c2-2 5-3 8-3 4 0 7 2 9 5 1-1 2-2 3-2-1 3-4 5-7 5-3 0-5-1-7-3-1 1-3 1-4 0z"/><circle cx="7" cy="12" r="0.8" fill="currentColor"/></svg> }
function IconBuy()    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> }
function IconSell()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg> }
function IconWallet() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20z"/><circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg> }
function IconData()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg> }
function IconMenu()   { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> }
function IconClose()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }

// ── Slide-out drawer ──────────────────────────────────────────────────
function Drawer({ open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const go = (path, state) => { navigate(path, state ? { state } : undefined); onClose() }
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
              <div className="wl-drawer-tag">zoom in your wealth</div>
            </div>
          </div>
          <button className="wl-drawer-close" onClick={onClose}><IconClose /></button>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">Pages</div>
          <button className={active('/dashboard')} onClick={() => go('/dashboard')}><IconHome /><span>Dashboard</span></button>
          <button className={active('/market')} onClick={() => go('/market')}><IconMarket /><span>Market</span></button>
          <button className={active('/transactions')} onClick={() => go('/transactions')}><IconTrades /><span>All Transactions</span></button>
          <button className={active('/whales')} onClick={() => go('/whales')}><IconWhale /><span>Whale Tracker</span></button>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">Quick Actions</div>
          <button className="wl-drawer-item wl-drawer-buy" onClick={() => go('/transactions', { openAdd: true, type: 'buy' })}><IconBuy /><span>Buy</span></button>
          <button className="wl-drawer-item wl-drawer-sell" onClick={() => go('/transactions', { openAdd: true, type: 'sell' })}><IconSell /><span>Sell</span></button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'wallets' })}><IconWallet /><span>Wallets</span></button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'data' })}><IconData /><span>Import / Export</span></button>
        </div>

        <div className="wl-drawer-footer">
          <span className="wl-live-dot" /> LIVE · walletlens.cc
        </div>
      </aside>
    </>
  )
}

// ── App shell (no sidebar — always hamburger) ─────────────────────────
export default function App() {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isLanding = ['/', '/blog', '/about', '/privacy'].includes(location.pathname) || location.pathname.startsWith('/blog/')

  // Close drawer on route change
  useEffect(() => setDrawerOpen(false), [location.pathname])

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

      {/* Top bar — always visible */}
      <header className="wl-topbar">
        <div className="wl-topbar-inner">
          <button className="wl-hamburger" onClick={() => setDrawerOpen(true)} aria-label="Menu">
            <IconMenu />
          </button>
          <div className="wl-topbar-brand">
            <Logo size={28} />
            <strong>WalletLens</strong>
          </div>
          <div className="wl-topbar-right">
            <div className="wl-live-badge"><span className="wl-live-dot"/>LIVE</div>
          </div>
        </div>
        <PriceTicker />
      </header>

      {/* Slide-out drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Full-width content */}
      <main className="wl-content">
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/market" element={<Market />} />
              <Route path="/whales" element={<Whales />} />
              <Route path="/asset/:coinId" element={<AssetDetail />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<Blog />} />
              <Route path="/about" element={<About />} />
              <Route path="/privacy" element={<Privacy />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Floating lens orb */}
      <button className="floating-lens" onClick={e => { e.currentTarget.classList.add('burst'); setTimeout(() => e.currentTarget.classList.remove('burst'), 220) }} aria-label="WalletLens"><Logo size={30} /></button>

      {/* Bottom nav */}
      <nav className="wl-bottom-nav">
        <NavLink to="/dashboard" className="wl-nav-item"><IconHome /><span>Home</span></NavLink>
        <NavLink to="/transactions" className="wl-nav-item"><IconTrades /><span>Trades</span></NavLink>
        <NavLink to="/market" className="wl-nav-item"><IconMarket /><span>Market</span></NavLink>
        <NavLink to="/whales" className="wl-nav-item"><IconWhale /><span>Whales</span></NavLink>
      </nav>
    </div>
  )
}
