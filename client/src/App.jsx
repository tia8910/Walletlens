import { lazy, Suspense, useState, useEffect, useRef, useMemo } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
const Landing       = lazy(() => import('./pages/Landing'))
const TrackCoin     = lazy(() => import('./pages/TrackCoin'))
const Calculator    = lazy(() => import('./pages/Calculator'))
const Learn         = lazy(() => import('./pages/Learn'))
const Compare       = lazy(() => import('./pages/Compare'))
const PricePage     = lazy(() => import('./pages/PricePage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
import PriceTicker from './components/PriceTicker'
import ErrorBoundary from './components/ErrorBoundary'
import DynamicBackground from './components/DynamicBackground'
import Logo from './components/Logo'
import Icon from './components/Icon'
// Non-critical shell components — lazy-loaded after the app shell renders
const QuickStatsPopup = lazy(() => import('./components/QuickStatsPopup'))
const PWAInstallPrompt = lazy(() => import('./components/PWAInstallPrompt'))
const AssistantChat = lazy(() => import('./components/AssistantChat'))
const WelcomeModal = lazy(() => import('./components/WelcomeModal'))
import { useLanguage } from './LanguageContext'
import { useTheme, THEMES } from './ThemeContext'
import { track } from './analytics'
import { useBiometricLock, BiometricLockScreen } from './components/BiometricLock'
import { applySettings } from './settingsUtils'
import { initMood } from './moodEngine'

const CURRENT_YEAR = new Date().getFullYear()

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
const Blog         = lazy(() => import('./pages/Blog'))
const About        = lazy(() => import('./pages/About'))
const FAQ          = lazy(() => import('./pages/FAQ'))
const Lenz         = lazy(() => import('./pages/Lenz'))
const Airdrop      = lazy(() => import('./pages/Airdrop'))
const Privacy      = lazy(() => import('./pages/Privacy'))
const Terms        = lazy(() => import('./pages/Terms'))
const Settings     = lazy(() => import('./pages/Settings'))
const AdminMail    = lazy(() => import('./pages/AdminMail'))

function PageFallback() {
  return <div className="wl-page-fallback"><p>Loading…</p></div>
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

// ── Slide-out drawer ──────────────────────────────────────────────────
function Drawer({ open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, lang } = useLanguage()
  const { theme, mode, setTheme, setMode } = useTheme()
  const actionIdx = useCycleIdx()
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
              <div className="wl-drawer-brand-actions">
                <span className={`wl-drawer-brand-action${actionIdx === 0 ? ' active' : ''}`}>
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/></svg>
                  {lang === 'ar' ? 'تتبع' : 'TRACK'}
                </span>
                <span className="wl-drawer-brand-sep">|</span>
                <span className={`wl-drawer-brand-action${actionIdx === 1 ? ' active' : ''}`}>
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M7 7V2a5 5 0 0 1 5 5H7z" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.25"/><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/></svg>
                  {lang === 'ar' ? 'تحليل' : 'ANALYZE'}
                </span>
                <span className="wl-drawer-brand-sep">|</span>
                <span className={`wl-drawer-brand-action${actionIdx === 2 ? ' active' : ''}`}>
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 10l3.5-4 2.5 2.5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 4h2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  {lang === 'ar' ? 'نمو' : 'GROW'}
                </span>
              </div>
            </div>
          </div>
          <button className="wl-drawer-close" onClick={onClose}><IconClose /></button>
        </div>

        <div className="wl-drawer-section">
          <div className="wl-drawer-label">Pages</div>
          <button className={active('/dashboard')} onClick={() => go('/dashboard')}><IconHome /><span>{t('dashboard')}</span></button>
          <button className={active('/coach')} onClick={() => go('/coach')}>
            <IconCoach /><span style={{ color: '#00c853' }}>Coach</span>
          </button>
          <button className={active('/academy')} onClick={() => go('/academy')}>
            <IconAcademy /><span style={{ color: '#fbbf24' }}>Academy</span>
          </button>
          <button className={active('/alpha')} onClick={() => go('/alpha')}>
            <IconAlpha /><span style={{ color: '#a78bfa' }}>Alpha</span>
          </button>
          <button className={active('/technicals')} onClick={() => go('/technicals')}>
            <IconTechnicals /><span style={{ color: '#60a5fa' }}>Analysis</span>
          </button>
          <button className={active('/transactions')} onClick={() => go('/transactions')}><IconTrades /><span>{t('trades')}</span></button>
          <button className={active('/whales')} onClick={() => go('/whales')}><IconWhale /><span>{t('whaleTracker')}</span></button>
          <button className={active('/airdrop')} onClick={() => go('/airdrop')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.4 2.4 0 0 1 4.8.2c0 1.6-2.4 2-2.4 3.5"/><circle cx="12" cy="16.5" r=".6" fill="currentColor"/></svg>
            <span style={{ color: 'var(--g-ink)' }}>Earn $LENZ</span>
            <span style={{ marginInlineStart: 'auto', fontSize: '.6rem', fontWeight: 700, letterSpacing: '.04em', color: '#fbbf24', border: '1px solid rgba(245,158,11,.45)', borderRadius: '999px', padding: '.08rem .4rem' }}>SOON</span>
          </button>
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
                  {th.logo ? <img src={th.logo} alt={th.name} loading="lazy" style={{ width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%' }} /> : th.icon}
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
        </div>

        <div className="wl-drawer-footer">
          <span className="wl-live-dot" /> {t('live')} · walletlens.live
          <a className="wl-drawer-tg" href="https://t.me/walletlenss" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.888.942z"/></svg>
            Telegram Community
          </a>
          <a className="wl-drawer-tg" href="https://x.com/wallet_lens" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            Follow @wallet_lens
          </a>
        </div>
      </aside>
    </>
  )
}

// ── App shell ─────────────────────────────────────────────────────────
export default function App() {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [quickStatsOpen, setQuickStatsOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const headerActionIdx = useCycleIdx()
  const navigate = useNavigate()
  const { t, lang } = useLanguage()
  const { theme, mode, setTheme, setMode } = useTheme()
  const isLanding = useMemo(() => {
    const p = location.pathname
    return ['/', '/free-net-worth-tracker', '/import-portfolio-from-screenshot', '/add-holdings-by-voice', '/blog', '/about', '/faq', '/privacy'].includes(p) ||
      p.startsWith('/blog/') || p.startsWith('/track/') || p.startsWith('/calculator/') ||
      p.startsWith('/learn/') || p.startsWith('/vs/') || p.startsWith('/price/') ||
      p.startsWith('/ar/') || p.startsWith('/admin/')
  }, [location.pathname])
  const { locked, unlock } = useBiometricLock()

  const _guardianChecked = useRef(false)
  useEffect(() => {
    applySettings()
    initMood()
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      track('pwa_session', { installed: true })
    }
    // Silent guardian check-in — fires once per session, well after app load
    if (!_guardianChecked.current) {
      _guardianChecked.current = true
      const local = (() => { try { return JSON.parse(localStorage.getItem('wl_guardian') || 'null') } catch { return null } })()
      if (local?.active) {
        setTimeout(() => {
          import('./components/PortfolioGuardian').then(m => m.silentCheckin()).catch(() => {})
        }, 4000)
      }
    }
  }, [])

  useEffect(() => setDrawerOpen(false), [location.pathname])

  // Prefetch the highest-traffic app chunks during idle on the landing page
  // so the first navigation to any of them is instant.
  useEffect(() => {
    if (location.pathname !== '/') return
    const schedule = requestIdleCallback
      ? (fn, opts) => requestIdleCallback(fn, opts)
      : (fn, opts) => setTimeout(fn, opts?.timeout ?? 2000)
    const cancel = requestIdleCallback ? cancelIdleCallback : clearTimeout
    // Dashboard first (most common destination), then Transactions and Coach
    // at lower priority so they don't compete with the critical render path.
    const id1 = schedule(() => import('./pages/Dashboard'),    { timeout: 3000 })
    const id2 = schedule(() => import('./pages/Transactions'), { timeout: 5000 })
    const id3 = schedule(() => import('./pages/Coach'),        { timeout: 7000 })
    return () => { cancel(id1); cancel(id2); cancel(id3) }
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
        <ErrorBoundary><Suspense fallback={<PageFallback />}><Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/free-net-worth-tracker" element={<Landing />} />
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
          <Route path="/faq" element={<FAQ />} />
          <Route path="/lenz" element={<Lenz />} />
          <Route path="/airdrop" element={<Airdrop />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/admin/mail" element={<AdminMail />} />
        </Routes></Suspense></ErrorBoundary>
      </div>
    )
  }

  return (
    <div className="wl-app">
      <DynamicBackground />
      <div className="wl-mood-aura" aria-hidden="true" />

      <header className="wl-topbar">
        <PriceTicker />
        <div className="wl-topbar-inner">
          <button className="wl-hamburger" onClick={() => setDrawerOpen(true)} aria-label={t('menu')}>
            <IconMenu />
          </button>
          <div className="wl-topbar-brand">
            <button
              className="wl-logo-btn"
              onClick={e => { e.currentTarget.classList.add('burst'); setTimeout(() => e.currentTarget.classList.remove('burst'), 220); setQuickStatsOpen(true); track('quick_stats_open') }}
              aria-label="Quick Stats"
            >
              <Logo size={36} animated />
            </button>
            <div className="wl-topbar-brand-text">
              <strong className="wl-topbar-brand-name">WalletLens<span className="wl-live-tld"><span className="wl-live-dot">.</span>live</span></strong>
              <div className="wl-topbar-brand-actions">
                <span className={`wl-topbar-brand-action${headerActionIdx === 0 ? ' active' : ''}`}>
                  {lang === 'ar' ? 'تتبع' : 'TRACK'}
                </span>
                <span className="wl-topbar-brand-sep">|</span>
                <span className={`wl-topbar-brand-action${headerActionIdx === 1 ? ' active' : ''}`}>
                  {lang === 'ar' ? 'تحليل' : 'ANALYZE'}
                </span>
                <span className="wl-topbar-brand-sep">|</span>
                <span className={`wl-topbar-brand-action${headerActionIdx === 2 ? ' active' : ''}`}>
                  {lang === 'ar' ? 'نمو' : 'GROW'}
                </span>
              </div>
            </div>
          </div>
          <div className="wl-topbar-right">
            <a
              className="wl-topbar-install"
              href="https://chromewebstore.google.com/detail/walletlens-portfolio/ajmjdeobjjmabgonhaeaaehoepfafhbn"
              target="_blank" rel="noopener noreferrer"
              title="Add WalletLens to Chrome"
              onClick={() => track('extension_install_click', { source: 'app_header' })}
            >
              <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                <circle cx="24" cy="24" r="11" fill="#fff" />
                <path fill="#4caf50" d="M24 13h17.6A23.9 23.9 0 0 0 24 0 24 24 0 0 0 3.4 11.8L12 26.7A12 12 0 0 1 24 13z" />
                <path fill="#ffc107" d="M41.6 13H24a12 12 0 0 1 10.4 18l-8.6 14.9A24 24 0 0 0 41.6 13z" />
                <path fill="#f44336" d="M12 26.7 3.4 11.8A24 24 0 0 0 25.8 47.9L34.4 33A12 12 0 0 1 12 26.7z" />
                <circle cx="24" cy="24" r="6" fill="#2196f3" />
              </svg>
              <span className="wl-topbar-install-label">Add to Chrome</span>
            </a>
            <button
              className="wl-topbar-x wl-topbar-ctrl"
              onClick={() => { const next = mode === 'dark' ? 'light' : 'dark'; setMode(next); track('mode_changed', { mode: next, source: 'topbar' }) }}
              title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle light or dark mode"
            >
              <span className="wl-topbar-ctrl-emoji">{mode === 'dark' ? '☀️' : '🌙'}</span>
            </button>
            <div className="wl-topbar-theme-wrap">
              <button
                className="wl-topbar-x wl-topbar-ctrl"
                onClick={() => setThemeMenuOpen(o => !o)}
                title="Change color theme"
                aria-label="Change color theme"
                aria-expanded={themeMenuOpen}
              >
                <span className="wl-topbar-ctrl-emoji">🎨</span>
              </button>
              {themeMenuOpen && (
                <>
                  <div className="wl-topbar-theme-backdrop" onClick={() => setThemeMenuOpen(false)} />
                  <div className="wl-topbar-theme-pop" role="menu">
                    {THEMES.map(th => (
                      <button
                        key={th.id}
                        className={`wl-topbar-theme-swatch${theme === th.id ? ' active' : ''}`}
                        onClick={() => { setTheme(th.id); track('theme_changed', { theme: th.id, source: 'topbar' }); setThemeMenuOpen(false) }}
                        title={th.name}
                        role="menuitem"
                      >
                        <span className="wl-topbar-theme-dot" style={{ background: `radial-gradient(circle at 35% 35%, ${th.light}, ${th.swatch})` }}>
                          {th.logo ? <img src={th.logo} alt="coin logo" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} /> : th.icon}
                        </span>
                        <span>{th.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <PWATopbarButton />
            <a className="wl-topbar-x" href="https://x.com/wallet_lens" target="_blank" rel="noopener noreferrer" title="Follow @wallet_lens on X">
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a className="wl-topbar-x" href="https://t.me/walletlenss" target="_blank" rel="noopener noreferrer" title="Telegram community">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.888.942z"/></svg>
            </a>
            <a className="wl-topbar-x" href="https://youtube.com/@walletlens" target="_blank" rel="noopener noreferrer" title="YouTube channel">
              <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </a>
            <div className="wl-live-badge"><span className="wl-live-dot"/>{t('live')}</div>
          </div>
        </div>
      </header>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="wl-content">
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
              <Route path="/faq" element={<FAQ />} />
              <Route path="/lenz" element={<Lenz />} />
              <Route path="/airdrop" element={<Airdrop />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="wl-app-footer">
        <div className="wl-app-footer-brand">
          <Logo size={22} />
          <span>WalletLens © {CURRENT_YEAR}</span>
        </div>
        <nav className="wl-app-footer-links">
          <button onClick={() => navigate('/lenz')}>$LENZ on Sui</button>
          <button onClick={() => navigate('/about')}>{t('about')}</button>
          <button onClick={() => navigate('/faq')}>FAQ</button>
          <button onClick={() => navigate('/blog')}>{t('blog')}</button>
          <button onClick={() => navigate('/privacy')}>{t('privacy')}</button>
          <button onClick={() => navigate('/terms')}>{t('terms') || 'Terms'}</button>
        </nav>
      </footer>

      <Suspense fallback={null}><WelcomeModal /></Suspense>
      <Suspense fallback={null}><PWAInstallPrompt /></Suspense>
      <Suspense fallback={null}><AssistantChat /></Suspense>

      {quickStatsOpen && <Suspense fallback={null}><QuickStatsPopup onClose={() => setQuickStatsOpen(false)} /></Suspense>}
    </div>
  )
}
