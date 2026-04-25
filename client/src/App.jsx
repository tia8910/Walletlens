import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Market from './pages/Market'
import Whales from './pages/Whales'
import AssetDetail from './pages/AssetDetail'
import PitchCard from './components/PitchCard'

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

function TrendBackground() {
  const wave1 = "M0,200 C120,160 220,260 340,220 S540,130 680,180 S880,270 1020,210 S1260,120 1440,200";
  const wave2 = "M1440,200 C1560,160 1660,260 1780,220 S1980,130 2120,180 S2320,270 2460,210 S2700,120 2880,200";
  const filled1 = `${wave1} L1440,400 L0,400 Z`;
  const filled2 = `${wave2} L2880,400 L1440,400 Z`;
  return (
    <div className="bg-trend" aria-hidden="true">
      <svg viewBox="0 0 2880 400" preserveAspectRatio="none" className="bg-trend-svg">
        <defs>
          <linearGradient id="bg-trend-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366f1">
              <animate attributeName="stop-color" values="#6366f1;#22d3ee;#ec4899;#6366f1" dur="9s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="#22d3ee">
              <animate attributeName="stop-color" values="#22d3ee;#ec4899;#a855f7;#22d3ee" dur="9s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#ec4899">
              <animate attributeName="stop-color" values="#ec4899;#a855f7;#6366f1;#ec4899" dur="9s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <linearGradient id="bg-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(99,102,241,0.18)" />
            <stop offset="100%" stopColor="rgba(236,72,153,0)" />
          </linearGradient>
        </defs>
        <path className="bg-trend-area" d={filled1} fill="url(#bg-trend-fill)" />
        <path className="bg-trend-area" d={filled2} fill="url(#bg-trend-fill)" />
        <path className="bg-trend-line" d={wave1} fill="none" stroke="url(#bg-trend-stroke)" strokeWidth="2.2" strokeLinecap="round" />
        <path className="bg-trend-line" d={wave2} fill="none" stroke="url(#bg-trend-stroke)" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function App() {
  return (
    <div className="app">
      <TrendBackground />
      <nav className="sidebar">
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
              <span className="nav-icon-wrap"><IconHome /></span>
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/transactions">
              <span className="nav-icon-wrap"><IconTrades /></span>
              <span>Transactions</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/market">
              <span className="nav-icon-wrap"><IconMarket /></span>
              <span>Market</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/whales">
              <span className="nav-icon-wrap"><IconWhale /></span>
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
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/market" element={<Market />} />
          <Route path="/whales" element={<Whales />} />
          <Route path="/asset/:coinId" element={<AssetDetail />} />
        </Routes>
      </main>

      <nav className="bottom-nav">
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
