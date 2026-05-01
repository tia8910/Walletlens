import { lazy, Suspense } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import PitchCard from './components/PitchCard'
import PriceTicker from './components/PriceTicker'
import ErrorBoundary from './components/ErrorBoundary'

// Route-level code splitting: only Dashboard ships in the initial bundle;
// the rest are fetched on first navigation. Cuts the initial JS payload
// significantly (~40% with recharts deferred).
const Transactions = lazy(() => import('./pages/Transactions'))
const Market       = lazy(() => import('./pages/Market'))
const Whales       = lazy(() => import('./pages/Whales'))
const AssetDetail  = lazy(() => import('./pages/AssetDetail'))

function PageFallback() {
  return <div className="page"><div className="card"><p className="muted">Loading…</p></div></div>
}

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/>
    </svg>
  )
}
function IconTrades() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 L17 7"/>
      <path d="M9 7h8v8"/>
      <circle cx="7" cy="17" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function IconMarket() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="13" width="4" height="8" rx="1"/>
      <rect x="10" y="8" width="4" height="13" rx="1"/>
      <rect x="17" y="4" width="4" height="17" rx="1"/>
    </svg>
  )
}
function IconWhale() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14c2-2 5-3 8-3 4 0 7 2 9 5 1-1 2-2 3-2-1 3-4 5-7 5-3 0-5-1-7-3-1 1-3 1-4 0z"/>
      <circle cx="7" cy="12" r="0.8" fill="currentColor"/>
    </svg>
  )
}

export default function App() {
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Primary">
        <div className="logo">
          <div className="logo-mark">
            <div className="lens-ring">
              <div className="lens-mid" />
              <div className="lens-shine" />
              <div className="lens-core" />
            </div>
            <span className="logo-pulse" />
          </div>
          <div className="logo-text">
            <h1 className="logo-wordmark">
              <span className="logo-w1">Wallet</span><span className="logo-w2">Lens</span>
            </h1>
            <span className="logo-tagline">zoom in your wealth</span>
          </div>
        </div>

        {/* Why WalletLens — pitch card in sidebar (desktop) */}
        <PitchCard className="sidebar-pitch-desktop" />

        <ul>
          <li>
            <NavLink to="/" end>
              <span className="nav-icon-wrap" aria-hidden="true"><IconHome /></span>
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/transactions">
              <span className="nav-icon-wrap" aria-hidden="true"><IconTrades /></span>
              <span>Transactions</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/market">
              <span className="nav-icon-wrap" aria-hidden="true"><IconMarket /></span>
              <span>Market</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/whales">
              <span className="nav-icon-wrap" aria-hidden="true"><IconWhale /></span>
              <span>Whales</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* Mobile top bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-brand">
            <div className="lens-ring lens-ring-sm">
              <div className="lens-mid" />
              <div className="lens-shine" />
              <div className="lens-core" />
            </div>
            <div className="topbar-brand-text">
              <strong>WalletLens</strong>
              <span className="topbar-tagline">zoom in your wealth</span>
            </div>
          </div>
          <div className="topbar-badge">
            <span className="live-dot" /> LIVE
          </div>
        </div>
      </header>

      <main className="content">
        <PriceTicker />
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/market" element={<Market />} />
              <Route path="/whales" element={<Whales />} />
              <Route path="/asset/:coinId" element={<AssetDetail />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <nav className="bottom-nav" aria-label="Bottom navigation">
        <NavLink to="/" end className="nav-item">
          <IconHome />
          <span>Home</span>
        </NavLink>
        <NavLink to="/transactions" className="nav-item">
          <IconTrades />
          <span>Trades</span>
        </NavLink>
        <NavLink to="/market" className="nav-item">
          <IconMarket />
          <span>Market</span>
        </NavLink>
        <NavLink to="/whales" className="nav-item">
          <IconWhale />
          <span>Whales</span>
        </NavLink>
      </nav>
    </div>
  )
}
