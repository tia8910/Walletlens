import { lazy, Suspense, memo, useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
const Landing       = lazy(() => import('./pages/Landing'))
const TrackCoin     = lazy(() => import('./pages/TrackCoin'))
const Calculator    = lazy(() => import('./pages/Calculator'))
const Learn         = lazy(() => import('./pages/Learn'))
const Compare       = lazy(() => import('./pages/Compare'))
const PricePage     = lazy(() => import('./pages/PricePage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
import PriceTicker from './components/PriceTicker'
import UpdateBanner from './components/UpdateBanner'
import ErrorBoundary from './components/ErrorBoundary'
import DynamicBackground from './components/DynamicBackground'
import Logo from './components/Logo'
import Icon from './components/Icon'
import BottomNav from './components/BottomNav'
import PullToRefresh from './components/PullToRefresh'
// Non-critical shell components — lazy-loaded after the app shell renders
const QuickStatsPopup = lazy(() => import('./components/QuickStatsPopup'))
const AssistantChat = lazy(() => import('./components/AssistantChat'))
const WelcomeModal = lazy(() => import('./components/WelcomeModal'))
const NativeOnboarding = lazy(() => import('./components/NativeOnboarding'))
const HelpGuide = lazy(() => import('./components/HelpGuide'))
const AddAssetTour = lazy(() => import('./components/AddAssetTour'))
import { useLanguage } from './LanguageContext'
import { useTheme, THEMES } from './ThemeContext'
import { track } from './analytics'
import { useBiometricLock, BiometricLockScreen } from './components/BiometricLock'
import { applySettings } from './settingsUtils'
import { initMood } from './moodEngine'
import { isTwa } from './twa'

const CURRENT_YEAR = new Date().getFullYear()

// Module-level Set for O(1) path lookup (vs O(n) array .includes() per render).
const LANDING_PATH_SET = new Set([
  '/', '/free-net-worth-tracker', '/crypto-and-stock-portfolio-tracker',
  '/portfolio-tracker-no-account', '/import-portfolio-from-screenshot',
  '/add-holdings-by-voice', '/blog', '/about', '/market-index',
  '/fear-and-greed-index', '/rebalancing-calculator', '/faq', '/privacy',
])
const LANDING_PREFIXES = [
  '/blog/', '/track/', '/calculator/', '/learn/', '/vs/', '/price/', '/ar/', '/admin/',
]

// Module-level cycling state shared between App topbar and Drawer.
// A single setInterval drives both so we avoid two redundant timers.
let _cycleListeners = []
let _cycleIdx = 0
let _cycleTimer = null
function _startCycle() {
  if (_cycleTimer !== null) return
  _cycleTimer = setInterval(() => {
    _cycleIdx = (_cycleIdx + 1) % 3
    _cycleListeners.forEach(fn => fn(_cycleIdx))
  }, 1800)
}
function _stopCycle() {
  clearInterval(_cycleTimer)
  _cycleTimer = null
}
function useCycleIdx() {
  const [idx, setIdx] = useState(_cycleIdx)
  useEffect(() => {
    _cycleListeners.push(setIdx)
    _startCycle()
    return () => {
      _cycleListeners = _cycleListeners.filter(fn => fn !== setIdx)
      if (_cycleListeners.length === 0) _stopCycle()
    }
  }, [])
  return idx
}

const Transactions = lazy(() => import('./pages/Transactions'))
const Whales       = lazy(() => import('./pages/Whales'))
const Alpha        = lazy(() => import('./pages/Alpha'))
const Academy      = lazy(() => import('./pages/Academy'))
const Coach        = lazy(() => import('./pages/Coach'))
const Technicals   = lazy(() => import('./pages/Technicals'))
const AssetDetail  = lazy(() => import('./pages/AssetDetail'))
const Blog             = lazy(() => import('./pages/Blog'))
const About            = lazy(() => import('./pages/About'))
const MarketIndex      = lazy(() => import('./pages/MarketIndex'))
const FearAndGreedIndex = lazy(() => import('./pages/FearAndGreedIndex'))
const Rebalancing      = lazy(() => import('./pages/Rebalancing'))
const FAQ              = lazy(() => import('./pages/FAQ'))
const Lenz         = lazy(() => import('./pages/Lenz'))
const Airdrop      = lazy(() => import('./pages/Airdrop'))
const Privacy      = lazy(() => import('./pages/Privacy'))
const Terms        = lazy(() => import('./pages/Terms'))
const Settings     = lazy(() => import('./pages/Settings'))
const Guardian     = lazy(() => import('./pages/Guardian'))
const AdminMail    = lazy(() => import('./pages/AdminMail'))
const Vision       = lazy(() => import('./pages/Vision'))

function PageFallback() {
  return (
    <div className="wl-page-fallback" role="status" aria-label="Loading">
      <div className="wl-page-fallback-spinner" aria-hidden="true" />
    </div>
  )
}

function IconHome()   { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></svg> }
function IconTrades() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M9 7h8v8"/><circle cx="7" cy="17" r="1.2" fill="currentColor" stroke="none"/></svg> }
function IconWhale()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14c2-2 5-3 8-3 4 0 7 2 9 5 1-1 2-2 3-2-1 3-4 5-7 5-3 0-5-1-7-3-1 1-3 1-4 0z"/><circle cx="7" cy="12" r="0.8" fill="currentColor"/></svg> }
function IconAlpha()   { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20L12 4l6 16"/><path d="M8.5 14h7"/><circle cx="12" cy="4" r="1" fill="currentColor" stroke="none"/></svg> }
function IconAcademy() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> }
function IconCoach()   { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="10" y1="17" x2="10" y2="21"/><line x1="14" y1="17" x2="14" y2="21"/></svg> }
function IconTechnicals() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> }
function IconBuy()    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> }
function IconSell()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg> }
function IconWallet() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20z"/><circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg> }
function IconData()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg> }
function IconMenu()   { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> }
function IconClose()  { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }

function LangToggle() {
  const { lang, setLang } = useLanguage()
  return (
    <button
      className="wl-lang-btn"
      onClick={() => { const next = lang === 'en' ? 'ar' : 'en'; setLang(() => next); track('language_toggle', { to: next }) }}
      title={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}
    >
      {lang === 'en' ? 'ع' : 'EN'}
    </button>
  )
}

// ── PWA install button in topbar ─────────────────────────────────────
// Only shown on Chrome/Edge where beforeinstallprompt fires — no-op on Firefox/iOS
function PWATopbarButton() {
  const [prompt, setPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setInstalled(true); return
    }
    const handler = (e) => { e.preventDefault(); setPrompt(e) }
    const onInstalled = () => { setInstalled(true); setPrompt(null); track('pwa_installed', { source: 'app_installed_event' }) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', handler); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  // Only show when native install prompt is available and not yet installed
  if (!prompt || installed) return null

  async function handleClick() {
    track('pwa_topbar_install_click')
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    track('pwa_install_outcome', { outcome, source: 'topbar' })
    if (outcome === 'accepted') setInstalled(true)
  }

  return (
    <button
      onClick={handleClick}
      title="Install WalletLens"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
        <rect x="5" y="2" width="14" height="20" rx="2"/>
        <line x1="12" y1="6" x2="12" y2="12"/>
        <line x1="9" y1="9" x2="12" y2="6"/>
        <line x1="15" y1="9" x2="12" y2="6"/>
        <line x1="9" y1="16" x2="15" y2="16"/>
      </svg>
    </button>
  )
}

// ── Cycling brand action labels ───────────────────────────────────────
// Isolated into memo components so only these tiny nodes re-render on each
// 1.8 s cycle tick — not the full App shell or Drawer tree.
const TopbarCyclingActions = memo(function TopbarCyclingActions() {
  const { lang } = useLanguage()
  const idx = useCycleIdx()
  return (
    <div className="wl-topbar-brand-actions">
      <span className={`wl-topbar-brand-action${idx === 0 ? ' active' : ''}`}>
        {lang === 'ar' ? 'تتبع' : 'TRACK'}
      </span>
      <span className="wl-topbar-brand-sep">|</span>
      <span className={`wl-topbar-brand-action${idx === 1 ? ' active' : ''}`}>
        {lang === 'ar' ? 'تحليل' : 'ANALYZE'}
      </span>
      <span className="wl-topbar-brand-sep">|</span>
      <span className={`wl-topbar-brand-action${idx === 2 ? ' active' : ''}`}>
        {lang === 'ar' ? 'نمو' : 'GROW'}
      </span>
    </div>
  )
})

const DrawerCyclingActions = memo(function DrawerCyclingActions() {
  const { lang } = useLanguage()
  const idx = useCycleIdx()
  return (
    <div className="wl-drawer-brand-actions">
      <span className={`wl-drawer-brand-action${idx === 0 ? ' active' : ''}`}>
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/></svg>
        {lang === 'ar' ? 'تتبع' : 'TRACK'}
      </span>
      <span className="wl-drawer-brand-sep">|</span>
      <span className={`wl-drawer-brand-action${idx === 1 ? ' active' : ''}`}>
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M7 7V2a5 5 0 0 1 5 5H7z" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.25"/><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/></svg>
        {lang === 'ar' ? 'تحليل' : 'ANALYZE'}
      </span>
      <span className="wl-drawer-brand-sep">|</span>
      <span className={`wl-drawer-brand-action${idx === 2 ? ' active' : ''}`}>
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 10l3.5-4 2.5 2.5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 4h2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        {lang === 'ar' ? 'نمو' : 'GROW'}
      </span>
    </div>
  )
})

// ── Slide-out drawer ──────────────────────────────────────────────────
// Wrapped in memo so the drawer subtree doesn't re-render when unrelated App
// state changes (e.g., quickStatsOpen, themeMenuOpen, shellReady).
const Drawer = memo(function Drawer({ open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  const { theme, mode, setTheme, setMode } = useTheme()
  const go = (path, state) => { track('drawer_nav', { to: path, tab: state?.tab }); navigate(path, state ? { state } : undefined); onClose() }
  const active = (p) => location.pathname === p ? 'wl-drawer-item wl-drawer-active' : 'wl-drawer-item'

  return (
    <>
      <div className={`wl-overlay ${open ? 'wl-overlay-open' : ''}`} onClick={onClose} />
      <aside className={`wl-drawer ${open ? 'wl-drawer-open' : ''}`}>
        <div className="wl-drawer-head">
          <div className="wl-drawer-brand">
            <Logo size={44} animated />
            <div className="wl-drawer-brand-text">
              <div className="wl-drawer-name">WalletLens</div>
              <div className="wl-drawer-tag">{t('brandTag')}</div>
              <DrawerCyclingActions />
            </div>
          </div>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">Pages</div>
          <button className={active('/dashboard')} onClick={() => go('/dashboard', { tab: 'overview' })}><IconHome /><span>{t('dashboard')}</span></button>
          <button className={active('/coach')} onClick={() => go('/coach')}>
            <IconCoach /><span>Coach</span>
          </button>
          <button className={active('/academy')} onClick={() => go('/academy')}>
            <IconAcademy /><span>Academy</span>
          </button>
          <button className={active('/alpha')} onClick={() => go('/alpha')}>
            <IconAlpha /><span>Alpha</span>
          </button>
          <button className={active('/technicals')} onClick={() => go('/technicals')}>
            <IconTechnicals /><span>Analysis</span>
          </button>
          <button className={active('/vision')} onClick={() => { localStorage.setItem('wl_vision_visited', '1'); go('/vision') }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            <span>Goals<span style={{ fontSize: '.7em', opacity: .55, fontWeight: 400, marginInlineStart: '.35em' }}>— Vision planner</span></span>
          </button>
          <button className={active('/transactions')} onClick={() => go('/transactions')}><IconTrades /><span>{t('trades')}</span></button>
          <button className={active('/whales')} onClick={() => go('/whales')}><IconWhale /><span>{t('whaleTracker')}</span></button>
          {/* Earn $LENZ hidden until Google Play approval (crypto-token/earn features
              can trip Play Store review). Restore this block once approved. */}
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">Tools</div>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'ai' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/><path d="M12 10v4"/><path d="M8 18a4 4 0 0 1 8 0"/><path d="M3 7h2M19 7h2"/></svg>
            <span>AI Analysis</span>
          </button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'targets' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            <span>Targets</span>
          </button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'alerts' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span>Price Alerts</span>
          </button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'risk' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Risk Scanner</span>
          </button>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">{t('quickActions')}</div>
          <button className="wl-drawer-item wl-drawer-buy" onClick={() => go('/transactions', { openAdd: true, type: 'buy' })}><IconBuy /><span>{t('buy')}</span></button>
          <button className="wl-drawer-item wl-drawer-sell" onClick={() => go('/transactions', { openAdd: true, type: 'sell' })}><IconSell /><span>{t('sell')}</span></button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'wallets' })}><IconWallet /><span>{t('wallets')}</span></button>
          <button className="wl-drawer-item" onClick={() => go('/dashboard', { tab: 'data' })}><IconData /><span>{t('importExport')}</span></button>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">Preferences</div>
          <div className="wl-drawer-theme-grid">
            {THEMES.map(th => (
              <button
                key={th.id}
                className={`wl-drawer-swatch-btn${theme === th.id ? ' wl-drawer-swatch-active' : ''}`}
                onClick={() => { setTheme(th.id); track('theme_changed', { theme: th.id }) }}
                title={th.name}
              >
                <span className="wl-drawer-swatch" style={{
                  background: `radial-gradient(circle at 35% 35%, ${th.light}, ${th.swatch})`,
                  boxShadow: theme === th.id ? `0 0 10px ${th.swatch}88` : 'none',
                }}>
                  {th.logo ? <img src={th.logo} alt={th.name} loading="lazy" decoding="async" style={{ width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%' }} /> : <Icon name={th.icon} size={14} />}
                </span>
                <span className="wl-drawer-swatch-label">{th.name}</span>
              </button>
            ))}
          </div>
          <button
            className="wl-drawer-mode-toggle"
            onClick={() => { const next = mode === 'dark' ? 'light' : 'dark'; setMode(next); track('mode_changed', { mode: next }) }}
          >
            <Icon name={mode === 'dark' ? 'sun' : 'moon'} size={16} />
            <span>{mode === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">Account</div>
          <button className={active('/settings')} onClick={() => go('/settings')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Settings</span>
          </button>
          <button className="wl-drawer-item" onClick={() => go('/guardian')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Portfolio Guardian</span>
          </button>
        </div>

        <div className="wl-drawer-footer">
          <span className="wl-live-dot" /> {t('live')} · walletlens.live
        </div>
      </aside>
    </>
  )
})

// ── Memoized app footer — re-renders only when language changes, not on every App state update ──
const AppFooter = memo(function AppFooter() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  return (
    <footer className="wl-app-footer">
      <div className="wl-app-footer-brand">
        <Logo size={22} />
        <span>WalletLens © {CURRENT_YEAR}</span>
      </div>
      <nav className="wl-app-footer-links">
        {/* $LENZ on Sui hidden until Google Play approval. Restore once approved. */}
        <button onClick={() => navigate('/about')}>{t('about')}</button>
        <button onClick={() => navigate('/faq')}>FAQ</button>
        <button onClick={() => navigate('/blog')}>{t('blog')}</button>
        <button onClick={() => navigate('/privacy')}>{t('privacy')}</button>
        <button onClick={() => navigate('/terms')}>{t('terms') || 'Terms'}</button>
      </nav>
    </footer>
  )
})

// ── App shell ─────────────────────────────────────────────────────────
export default function App() {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Only mount the Drawer DOM tree after the user first opens it — saves the
  // initial mount cost on every page load when the drawer is never opened.
  const [drawerMounted, setDrawerMounted] = useState(false)
  const [quickStatsOpen, setQuickStatsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [addGuideOpen, setAddGuideOpen] = useState(false)
  const [shellReady, setShellReady] = useState(false)
  const [onboardDone, setOnboardDone] = useState(() => {
    try { return localStorage.getItem('wl_welcomed_v2') === '1' } catch { return false }
  })
  const navigate = useNavigate()
  const { t, lang } = useLanguage()
  const isLanding = useMemo(() => {
    const p = location.pathname.replace(/\/+$/, '') || '/'
    return LANDING_PATH_SET.has(p) || LANDING_PREFIXES.some(pfx => p.startsWith(pfx))
  }, [location.pathname])
  const { locked, unlock } = useBiometricLock()
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const [isStandalone, setIsStandalone] = useState(false)

  const _guardianChecked = useRef(false)
  const _backupChecked = useRef(false)
  useEffect(() => {
    requestAnimationFrame(() => { applySettings(); initMood() })
    const _standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
    if (_standalone) {
      setIsStandalone(true)
      track('pwa_session', { installed: true })
    }
  }, [])

  // Automatic Portfolio Guardian check-in on sign-in. "Signing in" to WalletLens
  // means opening the app and, if App Lock is on, passing the fingerprint/face
  // unlock — that's the proof-of-life we reset the dead-man's-switch on, so the
  // user never has to press "I'm here". When App Lock is on we wait for unlock
  // (`locked` flips false); when it's off, `locked` is already false on open.
  useEffect(() => {
    if (locked) return
    if (_guardianChecked.current) return
    const local = (() => { try { return JSON.parse(localStorage.getItem('wl_guardian') || 'null') } catch { return null } })()
    if (local?.active) {
      _guardianChecked.current = true
      setTimeout(() => {
        import('./components/PortfolioGuardian').then(m => m.silentCheckin()).catch(() => {})
      }, 3000)
    }
  }, [locked])

  // Weekly email-backup subscription: if the user subscribed, resend their
  // backup automatically once ~7 days have passed since the last email. The
  // portfolio lives only on the device, so the app (not a server) does the send.
  useEffect(() => {
    if (locked) return
    if (_backupChecked.current) return
    _backupChecked.current = true
    setTimeout(() => {
      import('./backupSubscription').then(m => m.maybeSendWeeklyBackup()).catch(() => {})
    }, 5000)
  }, [locked])

  useEffect(() => setDrawerOpen(false), [location.pathname])
  useEffect(() => { if (drawerOpen) setDrawerMounted(true) }, [drawerOpen])

  // Any part of the app can open the Help guide by dispatching `wl:open-help`
  // (e.g. an on-screen tip's "how it works" link).
  useEffect(() => {
    const openHelp = () => setHelpOpen(true)
    const openAdd = () => setAddGuideOpen(true)
    window.addEventListener('wl:open-help', openHelp)
    window.addEventListener('wl:add-asset-guide', openAdd)
    return () => {
      window.removeEventListener('wl:open-help', openHelp)
      window.removeEventListener('wl:add-asset-guide', openAdd)
    }
  }, [])

  useEffect(() => {
    // Render shell immediately — no idle-callback delay
    setShellReady(true)
  }, [])

  // Prefetch page chunks during idle based on the current route so the next
  // likely navigation is instant. On the landing page we pre-warm all core app
  // pages; from within the app we prefetch the most common next destinations.
  useEffect(() => {
    const schedule = requestIdleCallback
      ? (fn, opts) => requestIdleCallback(fn, opts)
      : (fn, opts) => setTimeout(fn, opts?.timeout ?? 2000)
    const cancel = requestIdleCallback ? cancelIdleCallback : clearTimeout

    const path = location.pathname
    const ids = []

    if (path === '/') {
      // Landing: prime all primary app chunks in priority order.
      ids.push(
        schedule(() => import('./pages/Dashboard'),    { timeout: 3000 }),
        schedule(() => import('./pages/Transactions'), { timeout: 5000 }),
        schedule(() => import('./pages/Coach'),        { timeout: 7000 }),
        schedule(() => import('./pages/Blog'),         { timeout: 9000 }),
        schedule(() => import('./pages/Academy'),      { timeout: 11000 }),
      )
    } else if (path === '/dashboard') {
      ids.push(
        schedule(() => import('./pages/Transactions'), { timeout: 2000 }),
        schedule(() => import('./pages/Coach'),        { timeout: 4000 }),
        schedule(() => import('./pages/Technicals'),   { timeout: 6000 }),
        schedule(() => import('./pages/Alpha'),        { timeout: 8000 }),
      )
    } else if (path === '/transactions') {
      ids.push(
        schedule(() => import('./pages/Dashboard'),    { timeout: 2000 }),
        schedule(() => import('./pages/Coach'),        { timeout: 4000 }),
      )
    } else if (path === '/coach') {
      ids.push(
        schedule(() => import('./pages/Dashboard'),    { timeout: 2000 }),
        schedule(() => import('./pages/Technicals'),   { timeout: 4000 }),
      )
    }

    return () => ids.forEach(id => cancel(id))
  }, [location.pathname])

  // Fire GA page_view on every SPA route change so every page in the sitemap
  // (/, /track, /calculator, /learn, /vs, /price, /blog …) is measured in GA4.
  // page_location carries the full URL; the rAF defers the read so per-page
  // components have a chance to set document.title first.
  useEffect(() => {
    if (typeof window.gtag !== 'function') return
    requestAnimationFrame(() => {
      window.gtag('event', 'page_view', {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
        page_title: document.title,
      })
    })
  }, [location.pathname, location.search])

  if (locked && !isLanding) return <BiometricLockScreen onUnlock={unlock} />

  if (isLanding) {
    return (
      <div className="wl-app wl-app-landing">
        <UpdateBanner />
        <ErrorBoundary><Suspense fallback={<PageFallback />}><Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/free-net-worth-tracker" element={<Landing />} />
          <Route path="/crypto-and-stock-portfolio-tracker" element={<Landing />} />
          <Route path="/portfolio-tracker-no-account" element={<Landing />} />
          <Route path="/import-portfolio-from-screenshot" element={<Landing />} />
          <Route path="/add-holdings-by-voice" element={<Landing />} />
          <Route path="/ar/free-net-worth-tracker" element={<Landing />} />
          <Route path="/ar/import-portfolio-from-screenshot" element={<Landing />} />
          <Route path="/ar/add-holdings-by-voice" element={<Landing />} />
          <Route path="/ar/vs/:slug" element={<Compare />} />
          <Route path="/ar/blog/:slug" element={<Blog />} />
          <Route path="/track/:slug" element={<TrackCoin />} />
          <Route path="/calculator/:slug" element={<Calculator />} />
          <Route path="/learn/:slug" element={<Learn />} />
          <Route path="/vs/:slug" element={<Compare />} />
          <Route path="/price/:slug" element={<PricePage />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<Blog />} />
          <Route path="/about" element={<About />} />
          <Route path="/market-index" element={<MarketIndex />} />
          <Route path="/fear-and-greed-index" element={<FearAndGreedIndex />} />
          <Route path="/rebalancing-calculator" element={<Rebalancing />} />
          <Route path="/faq" element={<FAQ />} />
          {/* $LENZ pages are web-only: hidden in the Google Play (TWA) build
              to stay clear of Play's financial-features/contest policies. */}
          <Route path="/lenz" element={isTwa() ? <Navigate to="/dashboard" replace /> : <Lenz />} />
          <Route path="/airdrop" element={isTwa() ? <Navigate to="/dashboard" replace /> : <Airdrop />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/admin/mail" element={<AdminMail />} />
        </Routes></Suspense></ErrorBoundary>
      </div>
    )
  }

  return (
    <div className="wl-app">
      <UpdateBanner />
      <DynamicBackground />
      <div className="wl-mood-aura" aria-hidden="true" />

      <header className="wl-topbar">
        <div className="wl-topbar-inner">
          <button className="wl-hamburger" onClick={() => setDrawerOpen(true)} aria-label={t('menu')}>
            <IconMenu />
          </button>
          <div className="wl-topbar-brand">
            <button
              className="wl-logo-btn"
              onClick={() => navigate('/dashboard')}
              aria-label="WalletLens home"
            >
              <Logo size={36} animated />
            </button>
            <div className="wl-topbar-brand-text">
              <strong className="wl-topbar-brand-name">WalletLens<span className="wl-live-tld"><span className="wl-live-dot">.</span>live</span></strong>
              <TopbarCyclingActions />
            </div>
          </div>
          <div className="wl-topbar-right">
            <button
              className="wl-topbar-x wl-topbar-help"
              onClick={() => { setHelpOpen(true); track('help_guide_open', { source: 'topbar' }) }}
              title="How it works"
              aria-label="How WalletLens works"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9.2a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><circle cx="12" cy="17.4" r="0.7" fill="currentColor" stroke="none"/></svg>
            </button>
            <button
              className="wl-topbar-x wl-topbar-gear"
              onClick={() => { navigate('/settings'); track('settings_open', { source: 'topbar' }) }}
              title="Settings"
              aria-label="Open settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <PWATopbarButton />
            <button
              className="wl-topbar-stats"
              onClick={() => { setQuickStatsOpen(true); track('quick_stats_open', { source: 'topbar_button' }) }}
              title="Quick Stats"
              aria-label="Quick Stats"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <span>Stats</span>
            </button>
          </div>
        </div>
      </header>}

      <PriceTicker />

      {drawerMounted && <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />}

      <PullToRefresh>
      <main className={`wl-content${isStandalone ? ' twa-mode' : ''}`}>
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/whales" element={<Whales />} />
              <Route path="/alpha" element={<Alpha />} />
              <Route path="/academy" element={<Academy />} />
              <Route path="/coach" element={<Coach />} />
              <Route path="/technicals" element={<Technicals />} />
              <Route path="/asset/:coinId" element={<AssetDetail />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<Blog />} />
              <Route path="/about" element={<About />} />
              <Route path="/market-index" element={<MarketIndex />} />
              <Route path="/fear-and-greed-index" element={<FearAndGreedIndex />} />
              <Route path="/rebalancing-calculator" element={<Rebalancing />} />
              <Route path="/faq" element={<FAQ />} />
              {/* $LENZ pages are web-only: hidden in the Google Play (TWA) build
                  to stay clear of Play's financial-features/contest policies. */}
              <Route path="/lenz" element={isTwa() ? <Navigate to="/dashboard" replace /> : <Lenz />} />
              <Route path="/airdrop" element={isTwa() ? <Navigate to="/dashboard" replace /> : <Airdrop />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/guardian" element={<Guardian />} />
              <Route path="/vision" element={<Vision />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      </PullToRefresh>

      <AppFooter />

      {!isLanding && isStandalone && shellReady && <BottomNav />}

      {shellReady && isStandalone && !onboardDone && <Suspense fallback={null}><NativeOnboarding onDone={() => setOnboardDone(true)} /></Suspense>}
      {shellReady && !isStandalone && <Suspense fallback={null}><WelcomeModal /></Suspense>}
      {shellReady && <Suspense fallback={null}><AssistantChat /></Suspense>}

      {quickStatsOpen && <Suspense fallback={null}><QuickStatsPopup onClose={() => setQuickStatsOpen(false)} /></Suspense>}
      {helpOpen && <Suspense fallback={null}><HelpGuide open={helpOpen} onClose={() => setHelpOpen(false)} onNavigate={navigate} /></Suspense>}
      {addGuideOpen && <Suspense fallback={null}><AddAssetTour open={addGuideOpen} onClose={() => setAddGuideOpen(false)} onNavigate={navigate} /></Suspense>}
    </div>
  )
}
