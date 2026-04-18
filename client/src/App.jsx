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
            <svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true">
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
                  <stop offset="0%" stopColor="rgba(255,255,255,0.65)" />
                  <stop offset="60%" stopColor="rgba(99,102,241,0.14)" />
                  <stop offset="100%" stopColor="rgba(34,211,238,0.20)" />
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
          <div className="logo-text">
            <h1 className="logo-wordmark">
              <span className="logo-w1">Wallet</span><span className="logo-w2">Lens</span>
            </h1>
            <span className="logo-tagline">zoom in your wealth</span>
          </div>
        </div>

        {/* Why WalletLens — pitch card in sidebar */}
        <div className="sidebar-pitch" aria-label="Why WalletLens">
          <div className="pitch-badge">
            <span className="pitch-dot" />
            100% Free · No Account
          </div>
          <p className="pitch-headline">
            See <span className="pitch-em">every asset</span> in one lens.
          </p>
          <p className="pitch-body">
            Track crypto, stocks, fiat, gold &amp; silver — live prices, P&amp;L, AI insights. Your data stays on your device.
          </p>
          <ul className="pitch-points">
            <li>
              <span className="pitch-ico" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span><strong>Live</strong> crypto, stocks &amp; FX</span>
            </li>
            <li>
              <span className="pitch-ico" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span><strong>AI</strong> portfolio health &amp; risk</span>
            </li>
            <li>
              <span className="pitch-ico" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span><strong>Multi-target</strong> sell plans</span>
            </li>
            <li>
              <span className="pitch-ico" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span><strong>Private</strong> — local-first, no sign-up</span>
            </li>
          </ul>
          <div className="pitch-meter" aria-hidden="true">
            <span className="pitch-meter-dot" />
            <span className="pitch-meter-dot" />
            <span className="pitch-meter-dot" />
          </div>
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
              <defs>
                <linearGradient id="wl-topbar-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6366f1">
                    <animate attributeName="stop-color" values="#6366f1;#22d3ee;#a855f7;#6366f1" dur="6s" repeatCount="indefinite" />
                  </stop>
                  <stop offset="100%" stopColor="#22d3ee">
                    <animate attributeName="stop-color" values="#22d3ee;#a855f7;#6366f1;#22d3ee" dur="6s" repeatCount="indefinite" />
                  </stop>
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="20" fill="rgba(99,102,241,0.14)" stroke="url(#wl-topbar-ring)" strokeWidth="3.5" />
              <polyline points="19,38 27,30 33,34 40,24 47,28" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
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
