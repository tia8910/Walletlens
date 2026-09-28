import { lazy, Suspense, memo, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import useScrollTop from './useScrollTop'
const Landing       = lazy(() => import('./pages/Landing'))
const TrackCoin     = lazy(() => import('./pages/TrackCoin'))
const Calculator    = lazy(() => import('./pages/Calculator'))
const Learn         = lazy(() => import('./pages/Learn'))
const Compare       = lazy(() => import('./pages/Compare'))
const PricePage     = lazy(() => import('./pages/PricePage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
// Lazy: PriceTicker statically imports api.js (which pulls in technicals.js and
// data/assets.js), and it's only ever rendered on non-landing routes. A static
// import here would force those chunks into the shared App.jsx graph, making
// the landing page and every SEO content page (blog, about, FAQ, ...) load
// price/technicals code they never use.
const PriceTicker = lazy(() => import('./components/PriceTicker'))
const SmartMoneyTicker = lazy(() => import('./components/SmartMoneyTicker'))
import ErrorBoundary from './components/ErrorBoundary'
import DynamicBackground from './components/DynamicBackground'
import Logo from './components/Logo'
import Icon from './components/Icon'
import BottomNav from './components/BottomNav'
import { V2_PATH, isV2Active, isV2Path, homePath, useV2Class } from './v2Preview'
import PullToRefresh from './components/PullToRefresh'
// Non-critical shell components — lazy-loaded after the app shell renders
const QuickStatsPopup = lazy(() => import('./components/QuickStatsPopup'))
const AssistantChat = lazy(() => import('./components/AssistantChat'))
const NotificationPrimer = lazy(() => import('./components/NotificationPrimer'))
const WelcomeModal = lazy(() => import('./components/WelcomeModal'))
const NativeOnboarding = lazy(() => import('./components/NativeOnboarding'))
const HelpGuide = lazy(() => import('./components/HelpGuide'))
const AddAssetTour = lazy(() => import('./components/AddAssetTour'))
import { useLanguage } from './LanguageContext'
import CoffeeButton, { SUPPORT_URL } from './components/CoffeeButton'
import { useTheme, THEMES } from './ThemeContext'
import { track } from './analytics'
import { useBiometricLock, BiometricLockScreen } from './components/BiometricLock'
import { setAppInteractive } from './reviewPrompt'
import { isInstalledApp, isAndroidApp } from './nativeBridge'
import { useCanInstall, promptInstall } from './pwaInstall'
import { applySettings } from './settingsUtils'
import { initMood } from './moodEngine'
import { pendingVaultPayload, consumeVaultPayload } from './nativeVault'
import { inAppShell, seedFromVault } from './nativeShell'

const CURRENT_YEAR = new Date().getFullYear()

// Module-level Set for O(1) path lookup (vs O(n) array .includes() per render).
const LANDING_PATH_SET = new Set([
  '/', '/tour', '/free-net-worth-tracker', '/crypto-and-stock-portfolio-tracker',
  '/portfolio-tracker-no-account', '/import-portfolio-from-screenshot',
  '/add-holdings-by-voice', '/blog', '/about', '/market-index',
  '/fear-and-greed-index', '/rebalancing-calculator', '/faq', '/privacy',
  '/zakat-calculator', '/ecosystem',
])
const LANDING_PREFIXES = [
  '/blog/', '/track/', '/calculator/', '/learn/', '/vs/', '/price/', '/ar/', '/admin/',
]
