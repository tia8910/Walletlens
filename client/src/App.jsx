import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Market from './pages/Market'
import AssetDetail from './pages/AssetDetail'

export default function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">
          <div className="logo-mark">
            <svg viewBox="0 0 64 64" width="38" height="38" aria-hidden="true">
              <defs>
                <linearGradient id="wl-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6366f1">
                    <animate attributeName="stop-color" values="#6366f1;#22d3ee;#a855f7;#6366f1" dur="6s" repeatCount="indefinite" />
                  </stop>
                  <stop offset="100%" stopColor="#22d3ee">
                    <animate attributeName="stop-color" values="#22d3ee;#a855f7;#6366f1;#22d3ee" dur="6s" repeatCount="indefinite" />
                  </stop>
                </linearGradient>
                <radialGradient id="wl-glass" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
                  <stop offset="60%" stopColor="rgba(99,102,241,0.12)" />
                  <stop offset="100%" stopColor="rgba(34,211,238,0.18)" />
                </radialGradient>
              </defs>
              <circle cx="26" cy="26" r="18" fill="url(#wl-glass)" stroke="url(#wl-ring)" strokeWidth="4" />
              <polyline points="15,32 21,26 26,30 31,22 37,24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx="31" cy="22" r="1.8" fill="#fbbf24">
                <animate attributeName="r" values="1.5;2.4;1.5" dur="1.8s" repeatCount="indefinite" />
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
          <li><NavLink to="/" end>Dashboard</NavLink></li>
          <li><NavLink to="/transactions">Transactions</NavLink></li>
          <li><NavLink to="/market">Market</NavLink></li>
        </ul>
      </nav>

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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </NavLink>
        <NavLink to="/transactions" className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span>Trades</span>
        </NavLink>
        <NavLink to="/market" className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
          <span>Market</span>
        </NavLink>
      </nav>
    </div>
  )
}
