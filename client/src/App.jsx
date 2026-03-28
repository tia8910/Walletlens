import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Market from './pages/Market'
import Exchanges from './pages/Exchanges'

export default function App() {
  const location = useLocation()
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="app">
      {/* Desktop sidebar */}
      <nav className="sidebar">
        <div className="logo">
          <span className="logo-icon">&#9670;</span>
          <h1>CryptoTracker</h1>
        </div>
        <ul>
          <li><NavLink to="/" end>Dashboard</NavLink></li>
          <li><NavLink to="/transactions">Transactions</NavLink></li>
          <li><NavLink to="/market">Market</NavLink></li>
          <li><NavLink to="/exchanges">Exchanges</NavLink></li>
        </ul>
      </nav>

      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard onAdd={() => setShowAdd(true)} />} />
          <Route path="/transactions" element={<Transactions showAdd={showAdd} onCloseAdd={() => setShowAdd(false)} />} />
          <Route path="/market" element={<Market />} />
          <Route path="/exchanges" element={<Exchanges />} />
        </Routes>
      </main>

      {/* Mobile bottom nav */}
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
        <NavLink to="/exchanges" className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          <span>Exchange</span>
        </NavLink>
      </nav>
    </div>
  )
}
