import React, { memo, useMemo, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { homePath } from '../v2Preview'
import { LongPressMenu } from './LongPressMenu'

const NAV_ITEMS = [
  {
    id: 'dashboard',
    labelKey: 'dashboard',
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
    labelKey: 'watchlist',
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
    labelKey: 'analysis',
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
    labelKey: 'alerts',
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
    labelKey: 'targets',
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
    labelKey: 'backup',
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

// v2 keeps four tabs. Watchlist, Alerts and Backup moved into the menu,
// Analysis folded into Coach, and Goals and Coach take tabs of their own.
// Both are pages rather than dashboard tabs, so they carry a route.
const byId = (id) => NAV_ITEMS.find(i => i.id === id)
const V2_NAV_ITEMS = [
  byId('dashboard'),
  {
    id: 'goals',
    labelKey: 'navGoals',
    route: '/vision',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 21V4"/>
        <path d="M5 4h11l-2 4 2 4H5"/>
      </svg>
    ),
  },
  byId('targets'),
  {
    id: 'coach',
    labelKey: 'coach',
    route: '/coach',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/>
        <path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.5l-.8-2-1.9-.8 1.9-.8z"/>
      </svg>
    ),
  },
]

const DASHBOARD_LP_ITEMS = [
  { icon: 'zap', tone: 'green', labelKey: 'quickAddTrade', onClick: (nav, home) => nav(home, { state: { tab: 'overview', quickAdd: true } }) },
  { icon: 'import', tone: 'blue', labelKey: 'importData', onClick: (nav, home) => nav(home, { state: { tab: 'manage' } }) },
  { icon: 'bell', tone: 'amber', labelKey: 'viewAllAlerts', onClick: (nav, home) => nav(home, { state: { tab: 'alerts' } }) },
  { icon: 'target', tone: 'rose', labelKey: 'viewAllTargets', onClick: (nav, home) => nav(home, { state: { tab: 'targets' } }) },
  { divider: true },
  { icon: 'settings', tone: 'slate', labelKey: 'settingsNav', onClick: (nav) => nav('/settings') },
]

const BottomNav = memo(function BottomNav({ v2 = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('overview')
  const [lpMenu, setLpMenu] = useState(null)
  const closeLp = React.useCallback(() => setLpMenu(null), [])
  const { t } = useLanguage()
  const lpTimer = React.useRef(null)

  useEffect(() => {
    const stateTab = location.state?.tab
    if (stateTab && stateTab !== activeTab) setActiveTab(stateTab)
  }, [location.state?.tab])

  function triggerDashboardLp(clientX, clientY) {
    const items = DASHBOARD_LP_ITEMS.map(it =>
      it.divider ? it : { ...it, label: t(it.labelKey), onClick: () => it.onClick(navigate, homePath(v2)) }
    )
    // The shared menu clamps against its measured size.
    setLpMenu({ x: clientX, y: clientY, items })
    track('longpress_menu', { area: 'bottomnav' })
  }

  const home = homePath(v2)
  const onHome = location.pathname.replace(/\/+$/, '') === home

  return (
    <nav className={`wl-bottom-nav${v2 ? ' wl-bottom-nav-v2' : ''}`} role="navigation" aria-label={t('atMainNav')}>
      {(v2 ? V2_NAV_ITEMS : NAV_ITEMS).map(item => {
        // Classic lights a tab wherever you are. v2 also has a page tab
        // (Coach), so a dashboard tab only lights while on the dashboard.
        const isActive = item.route
          ? location.pathname.startsWith(item.route)
          : activeTab === item.tab && (!v2 || onHome)
        const isDash = item.id === 'dashboard'
        return (
          <button
            key={item.id}
            className={`wl-nav-item${isActive ? ' active' : ''}`}
            onClick={() => {
              track('bottomnav_click', { tab: item.id, v2 })
              if (item.route) {
                // The menu marks Goals as seen the same way.
                if (item.id === 'goals') { try { localStorage.setItem('wl_vision_visited', '1') } catch {} }
                navigate(item.route); return
              }
              setActiveTab(item.tab)
              navigate(v2 ? home : item.path, { state: { tab: item.tab } })
            }}
            onContextMenu={isDash ? (e => { e.preventDefault(); triggerDashboardLp(e.clientX, e.clientY) }) : undefined}
            onPointerDown={isDash ? (e => {
              const sx = e.clientX, sy = e.clientY
              let moved = false
              const onMove = ev => {
                if (Math.abs(ev.clientX - sx) > 8 || Math.abs(ev.clientY - sy) > 8) {
                  moved = true; clearTimeout(lpTimer.current); window.removeEventListener('pointermove', onMove)
                }
              }
              window.addEventListener('pointermove', onMove)
              lpTimer.current = setTimeout(() => {
                if (!moved) triggerDashboardLp(sx, sy)
                window.removeEventListener('pointermove', onMove)
              }, 500)
            }) : undefined}
            onPointerUp={isDash ? (() => clearTimeout(lpTimer.current)) : undefined}
            aria-label={t(item.labelKey)}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="wl-nav-icon">{item.icon}</span>
            <span className="wl-nav-label">{t(item.labelKey)}</span>
            {isActive && <span className="wl-nav-indicator" />}
          </button>
        )
      })}
      {/* The same menu as the dashboard's, rather than a second copy that
          drifted: this one closed on pointerdown, so a tap that began on an
          item could close the menu before the item's click arrived. */}
      <LongPressMenu items={lpMenu?.items || []} pos={lpMenu ? { x: lpMenu.x, y: lpMenu.y } : null}
        title={t('lpQuickActions')} onClose={closeLp} />
    </nav>
  )
})

export default BottomNav
