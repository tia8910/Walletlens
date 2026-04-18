import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Market from './pages/Market'
import AssetDetail from './pages/AssetDetail'

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

export default function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">
          <div className="logo-mark">
            <svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true">
              <defs>
                <linearGradient id="wl-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399">
                    <animate attributeName="stop-color" values="#34d399;#06b6d4;#f59e0b;#34d399" dur="7s" repeatCount="indefinite" />
                  </stop>
                  <stop offset="100%" stopColor="#06b6d4">
                    <animate attributeName="stop-color" values="#06b6d4;#f59e0b;#34d399;#06b6d4" dur="7s" repeatCount="indefinite" />
                  </stop>
                </linearGradient>
                <radialGradient id="wl-glass" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.65)" />
                  <stop offset="60%" stopColor="rgba(52,211,153,0.18)" />
                  <stop offset="100%" stopColor="rgba(6,182,212,0.24)" />
                </radialGradient>
              </defs>
              <circle cx="26" cy="26" r="18" fill="url(#wl-glass)" stroke="url(#wl-ring)" strokeWidth="4" />
              <polyline points="15,32 21,26 26,30 31,22 37,24" fill="none" stroke="#fbbf24" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx="31" cy="22" r="1.9" fill="#fbbf24">
                <animate attributeName="r" values="1.5;2.6;1.5" dur="1.8s" repeatCount="indefinite" />
              </circle>
              <rect x="40" y="40" width="5" height="18" rx="2.5" fill="url(#wl-ring)" transform="rotate(-45 42.5 49)" />
            </svg>
            <span className="logo-pulse" />
          </div>
          <h1 className="logo-wordmark">
            <span className="logo-w1">Wallet</span><span className="logo-w2">Lens</span>
          </h1>
        </div>
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
        </ul>
      </nav>

      {/* Mobile top bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-brand">
            <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
              <circle cx="32" cy="32" r="20" fill="rgba(52,211,153,0.22)" stroke="#34d399" strokeWidth="3.5" />
              <polyline points="19,38 27,30 33,34 40,24 47,28" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <strong>WalletLens</strong>
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
      </nav>
    </div>
  )
}
