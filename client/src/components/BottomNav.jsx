import { memo, useMemo, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { track } from '../analytics'

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    tab: 'overview',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    id: 'watchlist',
    label: 'Watchlist',
    path: '/dashboard',
    tab: 'watchlist',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    ),
  },
  {
    id: 'analysis',
    label: 'Analysis',
    path: '/dashboard',
    tab: 'tools',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v16a2 2 0 0 0 2 2h16"/>
        <path d="M7 14.5l3.5-4 3 2.5L21 7"/>
        <circle cx="21" cy="7" r="1.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    id: 'alerts',
    label: 'Alerts',
    path: '/dashboard',
    tab: 'alerts',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
  },
  {
    id: 'targets',
    label: 'Targets',
    path: '/dashboard',
    tab: 'targets',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
      </svg>
    ),
  },
  {
    id: 'backup',
    label: 'Backup',
    path: '/dashboard',
    tab: 'manage',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 3H8L2 7h20z"/>
        <circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
]

const BottomNav = memo(function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('overview')

  // Sync from route state when navigating via bottom nav
  useEffect(() => {
    const stateTab = location.state?.tab
    if (stateTab && stateTab !== activeTab) {
      setActiveTab(stateTab)
    }
  }, [location.state?.tab])

  return (
    <nav className="wl-bottom-nav" role="navigation" aria-label="Main navigation">
      {NAV_ITEMS.map(item => {
        const isActive = activeTab === item.tab
        return (
          <button
            key={item.id}
            className={`wl-nav-item${isActive ? ' active' : ''}`}
            onClick={() => {
              setActiveTab(item.tab)
              track('bottomnav_click', { tab: item.id })
              navigate(item.path, { state: { tab: item.tab } })
            }}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="wl-nav-icon">{item.icon}</span>
            <span className="wl-nav-label">{item.label}</span>
            {isActive && <span className="wl-nav-indicator" />}
          </button>
        )
      })}
    </nav>
  )
})

export default BottomNav
