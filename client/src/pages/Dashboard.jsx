import { lazy, Suspense, memo, useEffect, useMemo, useRef, useState, useCallback, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  PieChart, Pie, Cell, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts'
import { api } from '../api'
import { useSwipeDismiss } from '../hooks/useSwipeDismiss'
import { isStablecoin } from '../stablecoins'
import { POPULAR_FIAT, getCryptoCategory, getStockSector, CRYPTO_CATEGORY_COLORS, STOCK_SECTOR_COLORS, POPULAR_TICKERS, assetClass } from '../data/assets'
import CoinLogo from '../components/CoinLogo'
import Logo from '../components/Logo'
import Icon from '../components/Icon'
import MilestonePopup, { detectMilestone, dismissMilestone } from '../components/MilestonePopup'
import { applyMood } from '../moodEngine'
import { getSoulGreeting } from '../soulGreeting'
import { exportToExcel, exportToPDF } from '../exportHoldings'
import { useLanguage } from '../LanguageContext'
import { useTheme, THEMES } from '../ThemeContext'
import { track, trackPortfolioLoaded, trackProfileCreated } from '../analytics'
import { saveSnapshot, getSnapshotsForDays, hasRealData } from '../snapshots'
import { getWeeklySub, isWeeklySubscribed, subscribeWeekly, refreshWeekly, buildWeeklyPayload } from '../weeklyEmail'
import { analyzeTarget, fetchTargetData } from '../targetAnalysis'
import { checkPortfolioMove, setPortfolioBaseline, notifyTargetsReached } from '../portfolioNotify'
import NewsTicker from '../components/NewsTicker'
import SentimentTicker from '../components/SentimentTicker'
import MarketMood from '../components/MarketMood'
import GoalTracker from '../components/GoalTracker'
import { pushPortfolioToExtension } from '../utils/extensionBridge'
import InstallExtension from '../components/InstallExtension'
import { BiometricToggle } from '../components/BiometricLock'
import { EMAIL_RE, loadBackupSub, clearBackupSub, subscribeBackupEmail, resendBackupNow, daysUntilNextBackup } from '../backupSubscription'
import InterestPicker, { interestsDone } from '../components/InterestPicker'
import WelcomeStart, { hasStarted } from '../components/WelcomeStart'
import Tip from '../components/Tip'
import RebalancePanel from '../components/RebalancePanel'

// Lazy-load qrBackup (pulls in jsqr + qrcode) only when the user opens the
// backup panel — saves ~120 KB parsed JS on every normal Dashboard visit.
let _qrBackupPromise = null
const _loadQrBackup = () => {
  if (!_qrBackupPromise) _qrBackupPromise = import('../utils/qrBackup')
  return _qrBackupPromise
}

// Lazy-loaded: modals, tab-specific panels, and below-the-fold overview widgets
const VoiceImport    = lazy(() => import('../components/VoiceImport'))
const TradeSheet     = lazy(() => import('../components/TradeSheet'))
const ShareCard      = lazy(() => import('../components/ShareCard'))
const CorrelationMatrix = lazy(() => import('../components/CorrelationMatrix'))
const SectorHeatmap  = lazy(() => import('../components/SectorHeatmap'))
const SmartImport    = lazy(() => import('../components/SmartImport'))
const PriceAlerts    = lazy(() => import('../components/PriceAlerts'))
const SmartAlerts    = lazy(() => import('../components/SmartAlerts'))
const RiskScanner    = lazy(() => import('../components/RiskScanner'))
const LiquidityRisk  = lazy(() => import('../components/LiquidityRisk'))
const MagicAnalysisPanel = lazy(() => import('../components/MagicAnalysisPanel'))
const AIDecisionEngine = lazy(() => import('../components/AIDecisionEngine'))
const AISellPlan     = lazy(() => import('../components/AISellPlan'))
const WeeklyReport   = lazy(() => import('../components/WeeklyReport'))
const Watchlist      = lazy(() => import('../components/Watchlist'))

function TabFallback() {
  return <div style={{ padding:'2rem', textAlign:'center', color:'var(--text-sub)', fontSize:'0.85rem' }}>Loading…</div>
}

// ── SVG icon set ─────────────────────────────────────────────────────────
const Ico = {
  overview: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  buy:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>,
  sell:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>,
  wallet:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20z"/><circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg>,
  data:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg>,
  history:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></svg>,
  plus:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  trash:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>,
  export:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  import:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  copy:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  check:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  target:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  close:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  search:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  ai:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/><path d="M12 10v4"/><path d="M8 18a4 4 0 0 1 8 0"/><path d="M3 7h2M19 7h2M3 17h2M19 17h2"/></svg>,
  qr:        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2zM18 14h3v3h-3zM14 18h3v3h-3zM18 20h3v1h-3z"/></svg>,
  watchlist: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
}

// ── Market-cap tier classifier ────────────────────────────────────────────
const MC_TIERS = [
  { id: 'mega',       label: 'Mega Cap',         min: 100e9,  color: 'var(--g-ink)', fontWeight: 700, emoji: '◈' },
  { id: 'large',      label: 'Large Cap',        min: 10e9,   color: '#3b82f6', emoji: '◆' },
  { id: 'mid',        label: 'Mid Cap',          min: 1e9,    color: '#f59e0b', emoji: '◇' },
  { id: 'small',      label: 'Small Cap',        min: 100e6,  color: '#f87171', emoji: '▸' },
  { id: 'micro',      label: 'Micro Cap',        min: 0,      color: '#8b5cf6', emoji: '▪' },
  { id: 'non-crypto', label: 'Non-Crypto Assets', min: -1,    color: '#a78bfa', emoji: '⊞' },
]

// Known mega/large-cap IDs to classify without needing live market cap data
const KNOWN_MEGA = new Set(['bitcoin','ethereum'])
const KNOWN_LARGE = new Set(['solana','binancecoin','xrp','cardano','dogecoin','avalanche-2','polkadot','chainlink','polygon','litecoin','tron','shiba-inu'])

function isNonCrypto(coinId, coinSymbol) {
  const id = (coinId || '').toLowerCase()
  const sym = (coinSymbol || '').toLowerCase()
  if (id.startsWith('metal:') || id.startsWith('stock:') || id.startsWith('real:') || id.startsWith('cash:') || id.startsWith('fiat:')) return true
  if (id.includes('appartment') || id.includes('apartment')) return true
  if (['xau','xag','xpt','xpd'].includes(sym)) return true
  if (['usd','eur','gbp','us'].includes(sym)) return true
  if (['usdt','usdc','dai','busd','tusd','frax','usdd','pyusd','gusd','lusd','susd','ust','usdp'].includes(sym)) return true
  if (['aapl','msft','tsla','amzn','nvda','googl','meta','nflx'].includes(sym)) return true
  return false
}

function classifyMcTier(coinId, marketCap, coinSymbol) {
  if (isNonCrypto(coinId, coinSymbol)) return MC_TIERS[5] // non-crypto
  if (marketCap > 0) {
    return MC_TIERS.find(t => t.min >= 0 && marketCap >= t.min) || MC_TIERS[4]
  }
  if (KNOWN_MEGA.has(coinId))  return MC_TIERS[0]
  if (KNOWN_LARGE.has(coinId)) return MC_TIERS[1]
  return MC_TIERS[4]
}

// Whether we're running inside the native mobile app shell (which provides its
// own bottom navigation). Used to hide the in-page 6-tile tab grid so it isn't
// duplicated by the native nav. Detection, most reliable first:
//   1. an explicit ?native=1 flag (persisted to localStorage), or wl_native=1;
//   2. a known WebView-wrapper bridge object (Median, GoNative, Capacitor,
//      React Native, or a custom WalletLensNative);
//   3. an Android WebView user-agent ("; wv").
// We deliberately do NOT treat a plain standalone/installed PWA as the native
// app — an installed PWA has no native nav and should keep the tile grid. The
// hamburger drawer always covers navigation, so the grid is safe to hide.
const IS_NATIVE_APP = (() => {
  try {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('native') === '1' || sp.get('app') === '1') { try { localStorage.setItem('wl_native', '1') } catch {} }
    if (localStorage.getItem('wl_native') === '1') return true
    if (window.median || window.gonative || window.Capacitor || window.ReactNativeWebView || window.WalletLensNative) return true
    // Android TWA / Custom-Tab shells report an android-app:// referrer.
    if (/^android-app:\/\//.test(document.referrer || '')) return true
    const ua = navigator.userAgent || ''
    return /Android/.test(ua) && /;\s*wv[;)]/.test(ua)
  } catch { return false }
})()

// The crypto Sector Rotation Heatmap is only meaningful when the user actually
// has crypto exposure — show it only when they hold or watch any crypto asset.
function hasCryptoExposure(enriched) {
  if (enriched.some(h => assetClass(h.coin_id) === 'crypto')) return true
  try {
    const wl = JSON.parse(localStorage.getItem('wl_watchlist') || '[]')
    return Array.isArray(wl) && wl.some(w => assetClass(w.coin_id) === 'crypto')
  } catch { return false }
}

// ── Asset category classifier ─────────────────────────────────────────────
function categorizeAsset(h) {
  const id = (h.coin_id || '').toLowerCase()
  const sym = (h.coin_symbol || '').toLowerCase()
  if (id.startsWith('metal:') || ['xau','xag','xpt','xpd'].includes(sym)) return 'metals'
  if (id.startsWith('stock:') || id.startsWith('xstock:') || ['aapl','msft','tsla','amzn','nvda','googl','goog','meta','nflx','baba','v','jpm','wmt'].includes(sym)) return 'stocks'
  if (id.startsWith('real:') || id.includes('appartment') || id.includes('apartment') || id.includes('property') || sym.includes('appartment') || sym.includes('property') || sym.includes('reit') || sym === 'real') return 'realestate'
  // Only actual fiat currencies go to cash — stablecoins (USDT, USDC, DAI…) are crypto
  if (id.startsWith('cash:') || id.startsWith('fiat:') || ['usd','eur','gbp','jpy','us'].includes(sym)) return 'cash'
  return 'crypto'
}


// Risk/market-cap bucket for the rebalance recommender: safe money (cash,
// stablecoins, metals), blue-chips (large-cap crypto + stocks), then mid and
// speculative small/micro caps.
function rebalBucket(h) {
  const cat = categorizeAsset(h)
  if (cat === 'cash') return 'cash'
  if (cat === 'metals') return 'metal'
  if (cat === 'stocks') return 'large'
  if (isStablecoin(h.coin_id, h.coin_symbol)) return 'stable'
  const tier = classifyMcTier(h.coin_id, h.market_cap || 0, h.coin_symbol).id
  if (tier === 'mega' || tier === 'large') return 'large'
  if (tier === 'mid') return 'mid'
  return 'small'
}

// Returns { label, color } category badge for a holding
function getAssetCategoryBadge(h) {
  const id = h.coin_id || ''
  if (id.startsWith('xstock:')) return { label: 'xStock', color: '#f0b90b' }
  if (id.startsWith('stock:')) {
    const sector = getStockSector(id) || 'Stock'
    return { label: sector, color: STOCK_SECTOR_COLORS[sector] || '#6366f1' }
  }
  const cat = getCryptoCategory(id)
  if (cat) return { label: cat, color: CRYPTO_CATEGORY_COLORS[cat] || '#6366f1' }
  return null
}

const CATEGORY_ORDER = ['crypto', 'metals', 'stocks', 'realestate', 'cash']
const CATEGORY_LABELS = {
  crypto: 'Crypto',
  metals: 'Precious Metals',
  stocks: 'Stocks & ETFs',
  realestate: 'Real Estate',
  cash: 'Cash',
}
// SVG icon per category (crypto keeps the elegant ₿ symbol). Premium, no emoji.
const CATEGORY_ICON = { metals: 'diamond', stocks: 'trend-up', realestate: 'building', cash: 'banknote' }
const CATEGORY_COLOR = { crypto: 'var(--g)', metals: '#f5c542', stocks: '#3b82f6', realestate: '#a78bfa', cash: '#64748b' }

function CatLabel({ cat, className, iconSize = 14 }) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
      {cat === 'crypto'
        ? <span style={{ fontWeight: 800, color: CATEGORY_COLOR.crypto, lineHeight: 1 }}>₿</span>
        : <Icon name={CATEGORY_ICON[cat]} size={iconSize} style={{ color: CATEGORY_COLOR[cat], flexShrink: 0 }} />}
      {CATEGORY_LABELS[cat]}
    </span>
  )
}

// ── AI analysis engine ────────────────────────────────────────────────────
function computeAI(enriched, prices, transactions, totalValue) {
  if (!enriched.length || !totalValue || !isFinite(totalValue)) return null

  const investments = enriched.filter(h => !isStablecoin(h.coin_id, h.coin_symbol))
  const investValue = investments.reduce((s, h) => s + h.value, 0) || 1
  if (!investments.length) return null

  // Weights (0-1 each)
  const weights = investments.map(h => h.value / investValue)
  const n = investments.length

  // 1. Concentration (Herfindahl-Hirschman Index, 0=perfect, 1=single asset)
  const hhi = weights.reduce((s, w) => s + w * w, 0)
  const hhiNorm = (hhi - 1/n) / (1 - 1/n + 1e-9)   // 0=diverse, 1=concentrated
  const concentrationScore = Math.round((1 - hhiNorm) * 100)

  // 2. Diversification (unique assets, ideal 5-12)
  const assetScore = n >= 12 ? 85 : n >= 7 ? 100 : n >= 4 ? 85 : n >= 2 ? 65 : 30

  // 3. Momentum — weighted 24h change
  const momentum = investments.reduce((s, h, i) => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return s + chg * weights[i]
  }, 0)
  const momentumScore = Math.min(100, Math.max(0, 50 + momentum * 3))

  // 4. P&L health
  const pnlScore = investments.reduce((s, h, i) => s + (h.pnl >= 0 ? 20 : -10) * weights[i], 0)
  const pnlHealth = Math.min(100, Math.max(0, 50 + pnlScore))

  // 5. Market cap tier diversity (reward spreading across tiers)
  const tierSet = new Set(investments.map(h => classifyMcTier(h.coin_id, h.market_cap || 0, h.coin_symbol).id))
  const tierScore = Math.min(100, tierSet.size * 28)

  // 6. Crypto category diversity (L1, DeFi, AI, RWA, etc.)
  const cryptoHoldings = investments.filter(h => categorizeAsset(h) === 'crypto')
  const cryptoCatSet = new Set(cryptoHoldings.map(h => getCryptoCategory(h.coin_id)).filter(Boolean))
  const cryptoCatScore = cryptoHoldings.length === 0 ? 50 : Math.min(100, cryptoCatSet.size * 22)

  // 7. Stock sector diversity
  const stockHoldings = investments.filter(h => categorizeAsset(h) === 'stocks')
  const stockSectorSet = new Set(stockHoldings.map(h => getStockSector(h.coin_id)).filter(Boolean))
  const stockSectorScore = stockHoldings.length === 0 ? 50 : Math.min(100, stockSectorSet.size * 30)

  // Overall health score (weighted average)
  const health = Math.round(
    concentrationScore * 0.25 +
    assetScore         * 0.15 +
    momentumScore      * 0.15 +
    pnlHealth          * 0.20 +
    tierScore          * 0.10 +
    cryptoCatScore     * 0.10 +
    stockSectorScore   * 0.05
  )

  // Grade
  const grade = health >= 88 ? 'A+' : health >= 80 ? 'A' : health >= 72 ? 'B+' :
                health >= 64 ? 'B'  : health >= 55 ? 'C+': health >= 45 ? 'C'  : 'D'

  const gradeColor = health >= 72 ? 'var(--g)' : health >= 55 ? '#f59e0b' : '#f87171'

  // Market cap breakdown
  const mcBreakdown = MC_TIERS.map(tier => {
    const assets = investments.filter(h => classifyMcTier(h.coin_id, h.market_cap || 0, h.coin_symbol).id === tier.id)
    const value  = assets.reduce((s, h) => s + h.value, 0)
    return { ...tier, assets, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }
  }).filter(t => t.assets.length > 0)

  // Smart AI insights
  const insights = []
  const topAsset = investments[0]
  const topWeight = weights[0] * 100

  const topSym = topAsset?.coin_symbol?.toUpperCase() || topAsset?.coin_id || ''
  if (topWeight > 60) insights.push({ type: 'warn', text: `${topSym} dominates ${topWeight.toFixed(0)}% of your portfolio — high concentration risk.` })
  else if (topWeight > 40) insights.push({ type: 'info', text: `${topSym} is your largest position at ${topWeight.toFixed(0)}%.` })

  if (n < 3) insights.push({ type: 'warn', text: `Only ${n} asset${n > 1 ? 's' : ''} detected — consider spreading into more positions to reduce risk.` })
  else if (n >= 8) insights.push({ type: 'good', text: `${n} assets tracked — solid diversification across your portfolio.` })

  const inProfit = investments.filter(h => h.pnl > 0)
  const inLoss   = investments.filter(h => h.pnl < 0)
  if (inProfit.length > 0 && inLoss.length === 0) insights.push({ type: 'good', text: `All ${inProfit.length} positions are in profit` })
  else if (inProfit.length > 0) insights.push({ type: 'info', text: `${inProfit.length} of ${n} positions in profit, ${inLoss.length} in loss.` })

  if (momentum > 3) insights.push({ type: 'good', text: `Strong bullish momentum: weighted 24h gain of +${momentum.toFixed(2)}% across holdings.` })
  else if (momentum < -3) insights.push({ type: 'warn', text: `Bearish pressure: weighted 24h loss of ${momentum.toFixed(2)}% across holdings.` })

  const hasMetals = investments.some(h => categorizeAsset(h) === 'metals')
  const hasStocks = investments.some(h => categorizeAsset(h) === 'stocks')
  const hasRealEstate = investments.some(h => categorizeAsset(h) === 'realestate')
  const hasCrypto = investments.some(h => categorizeAsset(h) === 'crypto')
  const nonCryptoCount = [hasMetals, hasStocks, hasRealEstate].filter(Boolean).length

  if (hasCrypto && nonCryptoCount >= 2) {
    insights.push({ type: 'good', text: `Strong cross-asset diversification — crypto combined with ${[hasMetals && 'precious metals', hasStocks && 'stocks', hasRealEstate && 'real estate'].filter(Boolean).join(' & ')}.` })
  } else if (hasCrypto && nonCryptoCount === 1) {
    const which = hasMetals ? 'precious metals' : hasStocks ? 'stocks' : 'real estate'
    insights.push({ type: 'good', text: `Good diversification — crypto + ${which} adds a hedge against crypto-only volatility.` })
  } else if (!hasMetals && !hasStocks && !hasRealEstate) {
    insights.push({ type: 'info', text: 'Portfolio is 100% crypto — adding gold/silver or stocks could hedge volatility.' })
  }

  const cryptoTierSet = new Set(investments.filter(h => categorizeAsset(h) === 'crypto').map(h => classifyMcTier(h.coin_id, h.market_cap || 0, h.coin_symbol).id))
  if (cryptoTierSet.size >= 3) insights.push({ type: 'good', text: `Well-diversified across ${cryptoTierSet.size} crypto market-cap tiers — balanced risk profile.` })
  else if (hasCrypto && !cryptoTierSet.has('mid') && !cryptoTierSet.has('small')) insights.push({ type: 'info', text: 'Holding mainly large/mega-cap crypto — mid/small-cap exposure could boost upside.' })

  // Crypto category diversity insight
  if (cryptoCatSet.size >= 3) {
    insights.push({ type: 'good', text: `Crypto holdings span ${cryptoCatSet.size} categories (${[...cryptoCatSet].join(', ')}) — good sector diversification.` })
  } else if (cryptoHoldings.length >= 3 && cryptoCatSet.size <= 1) {
    insights.push({ type: 'warn', text: `All crypto in ${cryptoCatSet.size === 1 ? [...cryptoCatSet][0] : 'one'} category — consider adding DeFi, AI, or RWA exposure.` })
  } else if (cryptoCatSet.size === 2) {
    insights.push({ type: 'info', text: `Crypto covers ${[...cryptoCatSet].join(' & ')} — diversifying into more categories reduces sector risk.` })
  }

  // Stock sector diversity insight
  if (stockHoldings.length >= 2) {
    if (stockSectorSet.size >= 3) {
      insights.push({ type: 'good', text: `Stocks span ${stockSectorSet.size} sectors (${[...stockSectorSet].join(', ')}) — well diversified.` })
    } else if (stockSectorSet.size === 1) {
      insights.push({ type: 'warn', text: `All stocks in ${[...stockSectorSet][0]} sector — sector concentration risk. Consider adding Healthcare, Finance, or Consumer.` })
    }
  }

  // Indicators
  const riskLevel = hhiNorm > 0.6 ? 'High' : hhiNorm > 0.3 ? 'Medium' : 'Low'
  const riskColor = hhiNorm > 0.6 ? '#f87171' : hhiNorm > 0.3 ? '#f59e0b' : 'var(--g)'

  const buyCount = transactions.filter(t => t.type === 'buy').length
  const sellCount = transactions.filter(t => t.type === 'sell').length
  const tradeRatio = buyCount + sellCount > 0 ? buyCount / (buyCount + sellCount) : 0.5
  const sentiment = tradeRatio > 0.65 ? 'Accumulating' : tradeRatio < 0.35 ? 'Distributing' : 'Balanced'
  const sentimentColor = tradeRatio > 0.65 ? 'var(--g)' : tradeRatio < 0.35 ? '#f87171' : '#f59e0b'

  // ── Fear / Greed score (0=extreme fear, 100=extreme greed) ───────────────
  // Signals: momentum, pnl bias, trade sentiment, diversification
  const fgRaw =
    (momentum > 0 ? Math.min(momentum * 6, 30) : Math.max(momentum * 6, -30)) +
    (inProfit.length / Math.max(n, 1)) * 30 +
    (tradeRatio - 0.5) * 40 +
    (concentrationScore > 70 ? 5 : concentrationScore < 40 ? -5 : 0)
  const fearGreed = Math.round(Math.min(100, Math.max(0, 50 + fgRaw)))
  const fgLabel =
    fearGreed >= 80 ? 'Extreme Greed' :
    fearGreed >= 60 ? 'Greed' :
    fearGreed >= 45 ? 'Neutral' :
    fearGreed >= 25 ? 'Fear' : 'Extreme Fear'
  const fgColor =
    fearGreed >= 80 ? '#f87171' :
    fearGreed >= 60 ? '#f59e0b' :
    fearGreed >= 45 ? 'var(--g)' :
    fearGreed >= 25 ? '#3b82f6' : '#8b5cf6'

  // ── Entry quality per asset ────────────────────────────────────────────────
  const entryQuality = investments.map(h => {
    const avgBuy = h.total_invested > 0 && h.amount > 0 ? h.total_invested / h.amount : 0
    const priceDiff = avgBuy > 0 ? ((h.price - avgBuy) / avgBuy) * 100 : 0
    const score = Math.min(100, Math.max(0, 50 + priceDiff * 2))
    return { ...h, avgBuy, priceDiff, entryScore: Math.round(score) }
  })

  // ── Rebalance planner (equal-weight target) ────────────────────────────────
  // Stablecoins are dry powder, not part of the equal-weight target — exclude them.
  const targetWeight = n > 0 ? 1 / n : 0
  const rebalanceAssets = investments.filter(h => categorizeAsset(h) !== 'cash')
  const rebalanceValue  = rebalanceAssets.reduce((s, h) => s + h.value, 0)
  const rebTargetWeight = rebalanceAssets.length ? 1 / rebalanceAssets.length : 0
  const rebalance = rebalanceAssets.map(h => {
    const currentW = rebalanceValue > 0 ? h.value / rebalanceValue : 0
    const diff     = (rebTargetWeight - currentW) * 100
    const diffVal  = (rebTargetWeight - currentW) * rebalanceValue
    return { ...h, currentW: currentW * 100, targetW: rebTargetWeight * 100, diff, diffVal }
  })

  // ── Today P&L (24h) ───────────────────────────────────────────────────────
  const todayPnL = enriched.reduce((s, h) => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return s + h.value * (chg / 100)
  }, 0)

  return {
    health, grade, gradeColor,
    concentrationScore, assetScore, momentumScore: Math.round(momentumScore), pnlHealth: Math.round(pnlHealth), tierScore,
    cryptoCatScore, stockSectorScore, cryptoCategories: [...cryptoCatSet], stockSectors: [...stockSectorSet],
    hhi, momentum, riskLevel, riskColor,
    mcBreakdown, insights,
    sentiment, sentimentColor, buyCount, sellCount,
    fearGreed, fgLabel, fgColor,
    entryQuality, rebalance, todayPnL,
    weights, targetWeight,
  }
}

// ── AI Analysis panel ─────────────────────────────────────────────────────
function AIPanel({ enriched, prices, transactions, totalValue, isDemo, pricesLoading }) {
  // AISellPlan is rendered at the bottom of the AI tab
  const { t } = useLanguage()
  const ai = useMemo(
    () => computeAI(enriched, prices, transactions, totalValue),
    [enriched, prices, transactions, totalValue]
  )

  if (pricesLoading && !ai) return (
    <div className="ai-empty glass-card">
      <div className="ai-empty-icon"><Icon name="hourglass" size={28} /></div>
      <p>{t('loadingAI')}</p>
    </div>
  )

  if (!ai) return (
    <div className="ai-empty glass-card">
      <div className="ai-empty-icon"><Icon name="sparkles" size={28} /></div>
      <p>{t('addHoldingsAI')}</p>
    </div>
  )

  return (
    <div className="ai-wrap">
      {isDemo && <div className="dvx-badge-demo" style={{marginBottom:'0.75rem',display:'inline-block'}}>{t('demoData')}</div>}

      {/* Health score orb */}
      <div className="ai-health-card glass-card">
        <div className="ai-health-left">
          <div className="ai-orb" style={{ '--health': ai.health, '--grade-color': ai.gradeColor }}>
            <svg className="ai-orb-ring" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10"/>
              <circle cx="60" cy="60" r="52" fill="none" stroke={ai.gradeColor} strokeWidth="10"
                strokeDasharray={`${2 * Math.PI * 52}`}
                strokeDashoffset={`${2 * Math.PI * 52 * (1 - ai.health / 100)}`}
                strokeLinecap="round" transform="rotate(-90 60 60)" />
            </svg>
            <div className="ai-orb-inner">
              <div className="ai-orb-score" style={{color: ai.gradeColor}}>{ai.health}</div>
              <div className="ai-orb-label">/ 100</div>
            </div>
          </div>
          <div>
            <div className="ai-grade" style={{color: ai.gradeColor}}>{ai.grade}</div>
            <div className="ai-grade-label">{t('portfolioGrade')}</div>
          </div>
        </div>
        <div className="ai-health-bars">
          {[
            { label: t('diversification'), val: ai.concentrationScore, color: 'var(--g-ink)', fontWeight: 700 },
            { label: t('momentum'),        val: ai.momentumScore,      color: '#3b82f6' },
            { label: t('pnlHealth'),       val: ai.pnlHealth,          color: '#f59e0b' },
            { label: t('capSpread'),       val: ai.tierScore,          color: '#8b5cf6' },
          ].map(b => (
            <div key={b.label} className="ai-bar-row">
              <div className="ai-bar-label">{b.label}</div>
              <div className="ai-bar-track">
                <div className="ai-bar-fill" style={{ width: `${b.val}%`, background: b.color }} />
              </div>
              <div className="ai-bar-val" style={{color: b.color}}>{b.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Key indicators row */}
      <div className="ai-indicators">
        <div className="ai-ind-card glass-card">
          <div className="ai-ind-label">{t('riskLevel')}</div>
          <div className="ai-ind-val" style={{color: ai.riskColor}}>{ai.riskLevel}</div>
          <div className="ai-ind-sub">HHI {ai.hhi.toFixed(2)}</div>
        </div>
        <div className="ai-ind-card glass-card">
          <div className="ai-ind-label">{t('momentum')}</div>
          <div className="ai-ind-val" style={{color: ai.momentum >= 0 ? 'var(--g-ink)' : '#f87171'}}>
            {ai.momentum >= 0 ? '+' : ''}{ai.momentum.toFixed(2)}%
          </div>
          <div className="ai-ind-sub">weighted avg</div>
        </div>
        <div className="ai-ind-card glass-card">
          <div className="ai-ind-label">{t('sentiment')}</div>
          <div className="ai-ind-val" style={{color: ai.sentimentColor}}>{ai.sentiment}</div>
          <div className="ai-ind-sub">{ai.buyCount}B · {ai.sellCount}S</div>
        </div>
        <div className="ai-ind-card glass-card">
          <div className="ai-ind-label">Assets</div>
          <div className="ai-ind-val" style={{color:'var(--text)'}}>{enriched.length}</div>
          <div className="ai-ind-sub">{ai.mcBreakdown.length} cap tier{ai.mcBreakdown.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Market cap breakdown */}
      <div className="glass-card ai-mc-card">
        <h4 className="ai-section-title">{t('mcDistribution')}</h4>
        <div className="ai-mc-bar-track">
          {ai.mcBreakdown.map(mc => (
            <div key={mc.id} className="ai-mc-seg" style={{ width: `${mc.pct}%`, background: mc.color }}
              title={`${mc.label}: ${mc.pct.toFixed(1)}%`} />
          ))}
        </div>
        <div className="ai-mc-legend">
          {ai.mcBreakdown.map(mc => (
            <div key={mc.id} className="ai-mc-item">
              <span className="ai-mc-dot" style={{background: mc.color}} />
              <div className="ai-mc-info">
                <span className="ai-mc-name">{mc.emoji} {mc.label}</span>
                <span className="ai-mc-assets">{mc.assets.map(a => a.coin_symbol?.toUpperCase()).join(', ')}</span>
              </div>
              <span className="ai-mc-pct" style={{color: mc.color}}>{mc.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Insights */}
      <div className="glass-card ai-insights-card">
        <h4 className="ai-section-title"><Icon name="sparkles" size={15} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{t('aiInsights')}</h4>
        <div className="ai-insights-list">
          {ai.insights.map((ins, i) => (
            <div key={i} className={`ai-insight ai-insight-${ins.type}`}>
              <span className="ai-insight-dot" />
              <span>{ins.text}</span>
            </div>
          ))}
          {ai.insights.length === 0 && (
            <p className="muted" style={{fontSize:'0.83rem'}}>Looking good — no critical signals detected.</p>
          )}
        </div>
      </div>

      {/* Radar-style indicator ring (SVG) */}
      <div className="glass-card ai-radar-card">
        <h4 className="ai-section-title">{t('portfolioRadar')}<Tip text="A snapshot of your portfolio's health across five axes — diversity, momentum, P&L, market-cap spread and asset count. The wider the shape, the healthier the mix." /></h4>
        <AIRadar
          diversity={ai.concentrationScore}
          momentum={ai.momentumScore}
          pnl={ai.pnlHealth}
          capSpread={ai.tierScore}
          assetCount={ai.assetScore}
        />
      </div>

      {/* ── Fear & Greed Meter ── */}
      <div className="glass-card ai-fg-card">
        <h4 className="ai-section-title">{t('fearGreed')}<Tip text="How fearful or greedy YOUR portfolio looks right now — built from your momentum, P&L bias, trade sentiment and concentration. High greed can be a signal to take profit; high fear, to be patient." /></h4>
        <FearGreedGauge value={ai.fearGreed} label={ai.fgLabel} color={ai.fgColor} />
        <p className="ai-fg-desc">
          Derived from momentum, P&amp;L bias, trade sentiment &amp; concentration — specific to <em>your</em> portfolio.
        </p>
      </div>

      {/* ── Today's P&L ── */}
      <div className="glass-card ai-today-card">
        <h4 className="ai-section-title">{t('todayPerformance')}</h4>
        <div className="ai-today-main" style={{ color: ai.todayPnL >= 0 ? 'var(--g-ink)' : '#f87171' }}>
          {ai.todayPnL >= 0 ? '+' : ''}${Math.abs(ai.todayPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="ai-today-assets">
          {enriched.map(h => {
            const chg = prices[h.coin_id]?.usd_24h_change ?? 0
            const dayPnL = h.value * (chg / 100)
            return (
              <div key={h.coin_id} className="ai-today-row">
                <span className="ai-today-sym">{(h.coin_symbol || '').toUpperCase()}</span>
                <div className="ai-today-bar-wrap">
                  <div className="ai-today-bar" style={{
                    width: `${Math.min(Math.abs(chg) * 5, 100)}%`,
                    background: chg >= 0 ? 'var(--g)' : '#f87171',
                    marginLeft: chg < 0 ? 'auto' : undefined,
                  }} />
                </div>
                <span className="ai-today-chg" style={{ color: chg >= 0 ? 'var(--g-ink)' : '#f87171' }}>
                  {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                </span>
                <span className="ai-today-pnl" style={{ color: dayPnL >= 0 ? 'var(--g-ink)' : '#f87171' }}>
                  {dayPnL >= 0 ? '+' : ''}${Math.abs(dayPnL).toFixed(0)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Entry Quality ── */}
      <div className="glass-card ai-entry-card">
        <h4 className="ai-section-title">{t('entryQuality')}<Tip text="How good your entry was for each asset — your average buy price versus the current price. Green means you're up on your entry; red means underwater." /></h4>
        <p className="ai-entry-sub muted">Avg buy price vs current price per asset</p>
        <div className="ai-entry-list">
          {ai.entryQuality.map(h => (
            <div key={h.coin_id} className="ai-entry-row">
              <div className="ai-entry-left">
                <span className="ai-entry-sym">{(h.coin_symbol || '').toUpperCase()}</span>
                <div className="ai-entry-prices">
                  <span className="muted" style={{fontSize:'0.7rem'}}>Avg buy ${h.avgBuy > 0 ? h.avgBuy.toLocaleString(undefined,{maximumFractionDigits:4}) : '—'}</span>
                  <span style={{fontSize:'0.7rem',color:'var(--text)'}}> · Now ${h.price.toLocaleString(undefined,{maximumFractionDigits:4})}</span>
                </div>
              </div>
              <div className="ai-entry-bar-wrap">
                <div className="ai-entry-bar-bg">
                  <div className="ai-entry-bar-fill" style={{
                    width: `${h.entryScore}%`,
                    background: h.priceDiff >= 0 ? 'var(--g)' : '#f87171',
                  }} />
                </div>
              </div>
              <span className="ai-entry-score" style={{ color: h.priceDiff >= 0 ? 'var(--g-ink)' : '#f87171' }}>
                {h.priceDiff >= 0 ? '+' : ''}{h.priceDiff.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <Suspense fallback={<TabFallback />}><AISellPlan enriched={enriched} prices={prices} /></Suspense>
    </div>
  )
}

// ── Fear & Greed arc gauge ────────────────────────────────────────────────
function FearGreedGauge({ value, label, color }) {
  const R = 70, cx = 100, cy = 90
  const startAngle = Math.PI        // 180°
  const endAngle   = 2 * Math.PI   // 360°
  const angle      = startAngle + (value / 100) * Math.PI
  const arc = (a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)]
  const [sx, sy] = arc(startAngle)
  const [ex, ey] = arc(endAngle)
  const [nx, ny] = arc(angle)
  const zones = [
    { label: 'Extreme Fear', color: '#8b5cf6', from: 0,  to: 20 },
    { label: 'Fear',         color: '#3b82f6', from: 20, to: 40 },
    { label: 'Neutral',      color: 'var(--g-ink)', fontWeight: 700, from: 40, to: 60 },
    { label: 'Greed',        color: '#f59e0b', from: 60, to: 80 },
    { label: 'Extreme Greed',color: '#f87171', from: 80, to: 100 },
  ]
  function zoneArc(from, to) {
    const a1 = startAngle + (from / 100) * Math.PI
    const a2 = startAngle + (to   / 100) * Math.PI
    const [x1, y1] = arc(a1); const [x2, y2] = arc(a2)
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`
  }
  return (
    <svg viewBox="0 0 200 110" className="ai-fg-svg">
      {/* Background arc */}
      <path d={`M ${sx} ${sy} A ${R} ${R} 0 0 1 ${ex} ${ey}`}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round" />
      {/* Zone arcs */}
      {zones.map(z => (
        <path key={z.label} d={zoneArc(z.from, z.to)}
          fill="none" stroke={z.color} strokeWidth="12" strokeLinecap="butt" opacity="0.7" />
      ))}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill={color} />
      {/* Value */}
      <text x={cx} y={cy - 18} textAnchor="middle" fontSize="22" fontWeight="900"
        fill={color} fontFamily="Inter,sans-serif">{value}</text>
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="9" fill="var(--text-muted)"
        fontFamily="Inter,sans-serif">{label}</text>
    </svg>
  )
}

// ── Radar chart (pure SVG, no library needed) ─────────────────────────────
const RADAR_LABELS = ['Diversity', 'Momentum', 'P&L', 'Cap Spread', 'Asset Count']

function AIRadar({ diversity, momentum, pnl, capSpread, assetCount }) {
  const vals   = [diversity, momentum, pnl, capSpread, assetCount]
  const labels = RADAR_LABELS
  const n = labels.length
  const cx = 130, cy = 130, r = 95

  function point(i, val) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const dist  = (val / 100) * r
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)]
  }
  function labelPoint(i) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const dist  = r + 22
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)]
  }

  const polygon = vals.map((v, i) => point(i, v).join(',')).join(' ')
  const rings   = [25, 50, 75, 100]

  return (
    <svg viewBox="0 0 260 260" className="ai-radar-svg">
      {/* Grid rings */}
      {rings.map(pct => (
        <polygon key={pct} points={labels.map((_, i) => {
          const [x, y] = point(i, pct); return `${x},${y}`
        }).join(' ')}
          fill="none" stroke="rgba(var(--g-rgb),0.1)" strokeWidth="1" />
      ))}
      {/* Axis lines */}
      {labels.map((_, i) => {
        const [x, y] = point(i, 100)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(var(--g-rgb),0.12)" strokeWidth="1" />
      })}
      {/* Data polygon */}
      <polygon points={polygon} fill="rgba(var(--g-rgb),0.15)" stroke="var(--g)" strokeWidth="2" />
      {/* Data points */}
      {vals.map((v, i) => {
        const [x, y] = point(i, v)
        return <circle key={i} cx={x} cy={y} r="4" fill="var(--g)" />
      })}
      {/* Labels */}
      {labels.map((lbl, i) => {
        const [x, y] = labelPoint(i)
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill="var(--text-muted)" fontFamily="Inter,sans-serif">
            {lbl}
          </text>
        )
      })}
    </svg>
  )
}


const DEMO = {
  totalValue: 248750.42, totalInvested: 236300,
  totalPnL: 12450.42, totalPnLPct: 5.27,
  holdings: [
    { coin_id: 'bitcoin',  coin_symbol: 'BTC', price: 67200, value: 142800, total_invested: 135000, amount: 2.125 },
    { coin_id: 'ethereum', coin_symbol: 'ETH', price: 3410,  value: 68450,  total_invested: 65000,  amount: 20.07 },
    { coin_id: 'solana',   coin_symbol: 'SOL', price: 188.5, value: 28300,  total_invested: 27000,  amount: 150.2 },
    { coin_id: 'xrp',      coin_symbol: 'XRP', price: 1.39,  value: 5700,   total_invested: 5400,   amount: 4100 },
    { coin_id: 'others',   coin_symbol: 'OTHER', price: 0,   value: 3500,   total_invested: 3900,   amount: 0 },
  ],
  transactions: [
    { id: 1, type: 'buy',  coin_symbol: 'BTC', amount: 0.08,  price_per_unit: 67200 },
    { id: 2, type: 'buy',  coin_symbol: 'ETH', amount: 1.2,   price_per_unit: 3410 },
    { id: 3, type: 'sell', coin_symbol: 'SOL', amount: 12,    price_per_unit: 188.5 },
    { id: 4, type: 'buy',  coin_symbol: 'XRP', amount: 1200,  price_per_unit: 1.39 },
    { id: 5, type: 'buy',  coin_symbol: 'BTC', amount: 0.04,  price_per_unit: 66800 },
  ],
}

const fmt   = n => { const v = Number(n); return isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00' }
const fmtN  = n => { const v = Number(n); if (!isFinite(v)) return '$0'; const s = Math.abs(v) >= 1000 ? `$${(Math.abs(v)/1000).toFixed(1)}k` : `$${Math.abs(v).toFixed(0)}`; return v < 0 ? `-${s}` : s }
const fmtAmt = n => { const v = parseFloat(n); if (!isFinite(v)) return '0'; if (v >= 100) return v.toLocaleString(undefined, { maximumFractionDigits: 2 }); if (v >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 4 }); return v.toLocaleString(undefined, { maximumSignificantDigits: 4 }) }
const pct   = n => { const v = Number(n); if (!isFinite(v)) return '0.00%'; return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` }
const PALETTE = ['var(--g)','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#22d3ee','#f87171','#64748b','var(--gd)','#a78bfa']

// Theme-aware tooltip — follows the card surface + text colour so it reads
// correctly in both light and dark mode (was a hardcoded near-black box that
// clashed with the light theme). --tooltip-bg is solid per-mode (see index.css).
const TOOLTIP_STYLE = {
  background: 'var(--tooltip-bg, var(--card-bg))', border: '1px solid var(--border)',
  borderRadius: 10, fontSize: '0.74rem', color: 'var(--text)',
  boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
}
// Subtle emerald hover highlight instead of Recharts' default grey rectangle.
// Uses a literal rgba (not var() inside rgba()) so it resolves as an SVG fill
// attribute and never falls back to the light-grey default that washes out
// bars in dark mode.
const BAR_CURSOR = { fill: 'rgba(16,185,129,0.16)', radius: 6 }
const CHART_HDR_STYLE  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }
const TEXT_RIGHT_STYLE = { textAlign: 'right', flexShrink: 0 }

// ── Wallet Evaluation ─────────────────────────────────────────────────────
// The rubric adapts to the portfolio's actual asset mix: crypto-only checks
// (BTC anchor, large-cap crypto, crypto sectors) only apply when crypto is a
// meaningful sleeve, and stock checks (sector spread) only when equities are.
// A stock investor is never told to "buy Bitcoin", and vice-versa.
const EVAL_STABLE_IDS = ['tether','usd-coin','dai','binance-usd','true-usd','frax','usdd','gemini-dollar','paxos-standard']
const EVAL_STABLE_SYMS = ['usdt','usdc','dai','busd','tusd','frax','usdd','gusd','usdp','pyusd','fdusd']
const evalIsStable = (h) => EVAL_STABLE_IDS.includes(h.coin_id) || EVAL_STABLE_SYMS.includes(h.coin_symbol?.toLowerCase())
const evalIsMetal = (k) => k === 'gold' || k === 'silver' || k === 'copper' || k === 'platinum'

function computeAssetMix(enriched, totalValue) {
  const mix = { crypto: 0, stock: 0, metal: 0, cash: 0, bond: 0, other: 0 }
  if (!totalValue) return mix
  for (const h of enriched) {
    const k = assetClass(h.coin_id)
    const share = h.value / totalValue
    if (evalIsStable(h) || k === 'fiat') mix.cash += share
    else if (k === 'crypto') mix.crypto += share
    else if (k === 'stock') mix.stock += share
    else if (evalIsMetal(k)) mix.metal += share
    else if (k === 'bond') mix.bond += share
    else mix.other += share
  }
  return mix
}

const EVAL_CATEGORIES = [
  {
    id: 'asset_mix',
    label: 'Asset-Class Balance',
    icon: 'grid',
    color: 'var(--g-ink)', fontWeight: 700,
    check: (enriched, totalValue, targets, mix) => {
      const classes = Object.entries(mix).filter(([, v]) => v >= 0.03)
      const n = classes.length
      const top = Math.max(...Object.values(mix))
      if (n <= 1) {
        const only = classes[0]?.[0] || 'one asset class'
        return { pass: false, score: 25, tip: `Everything is in ${only}. Spreading across uncorrelated classes (crypto + stocks + gold + cash) is the biggest way to cut portfolio risk.` }
      }
      if (top > 0.85) return { pass: false, score: 55, tip: `${(top*100).toFixed(0)}% sits in one asset class. A second or third class (stocks, gold, or cash) would hedge a downturn in your dominant one.` }
      if (n >= 3) return { pass: true, score: 100, tip: `Balanced across ${n} asset classes — they hedge each other well.` }
      return { pass: true, score: 85, tip: `Spread across ${n} asset classes. A third (e.g. gold or cash) would add another hedge.` }
    },
  },
  {
    id: 'btc_anchor',
    label: 'BTC Anchor',
    icon: '₿',
    color: '#f7931a',
    applies: (mix) => mix.crypto >= 0.1,
    check: (enriched, totalValue, targets, mix) => {
      const cryptoVal = mix.crypto * totalValue
      const btc = enriched.find(h => h.coin_id === 'bitcoin' || h.coin_symbol?.toLowerCase() === 'btc')
      if (!btc) return { pass: false, score: 20, tip: 'No Bitcoin in your crypto sleeve. BTC acts as a safe haven during crypto downturns — consider it as a stability anchor.' }
      const w = btc.value / cryptoVal * 100
      if (w < 20) return { pass: false, score: 50, tip: `BTC is only ${w.toFixed(1)}% of your crypto. Increasing toward 30–40% of the crypto sleeve reduces altcoin volatility.` }
      if (w > 80) return { pass: true, score: 75, tip: `BTC is ${w.toFixed(1)}% of your crypto — a strong anchor, though ETH/SOL would broaden exposure.` }
      return { pass: true, score: 100, tip: `Solid BTC anchor at ${w.toFixed(1)}% of your crypto sleeve.` }
    },
  },
  {
    id: 'eth_exposure',
    label: 'ETH / Smart Contract',
    icon: 'Ξ',
    color: '#627eea',
    applies: (mix) => mix.crypto >= 0.1,
    check: (enriched, totalValue) => {
      const eth = enriched.find(h => h.coin_id === 'ethereum' || h.coin_symbol?.toLowerCase() === 'eth')
      const hasAlt = enriched.some(h => ['solana','cardano','avalanche-2','polkadot'].includes(h.coin_id))
      if (!eth && !hasAlt) return { pass: false, score: 20, tip: 'No smart-contract layer exposure. ETH (or SOL/ADA/AVAX) drives DeFi, NFTs, and Web3 — your crypto misses this sector.' }
      const asset = eth || enriched.find(h => ['solana','cardano','avalanche-2','polkadot'].includes(h.coin_id))
      return { pass: true, score: 90, tip: `Good — ${asset.coin_symbol?.toUpperCase()} covers your smart-contract exposure.` }
    },
  },
  {
    id: 'diversification',
    label: 'Diversification',
    icon: 'scale',
    color: 'var(--g-ink)', fontWeight: 700,
    check: (enriched, totalValue) => {
      const n = enriched.length
      const weights = enriched.map(h => totalValue > 0 ? h.value / totalValue : 0)
      const hhi = weights.reduce((s, w) => s + w * w, 0)
      if (n < 3) return { pass: false, score: 10, tip: `Only ${n} holding${n===1?'':'s'} — extremely concentrated. Spread across 5–10 positions to reduce single-name risk.` }
      if (hhi > 0.5) return { pass: false, score: 30, tip: `One position dominates your portfolio (HHI ${hhi.toFixed(2)}). Rebalance so no single holding exceeds 50%.` }
      if (n < 5) return { pass: false, score: 60, tip: `${n} holdings is okay but aim for 5–10. Add 1–2 more quality positions from different sectors or classes.` }
      return { pass: true, score: 95, tip: `Well diversified across ${n} positions with balanced weights.` }
    },
  },
  {
    id: 'cash_reserve',
    label: 'Cash & Dry Powder',
    icon: 'bank',
    color: '#60a5fa',
    check: (enriched, totalValue, targets, mix) => {
      const pct = mix.cash * 100
      if (pct === 0) return { pass: false, score: 30, tip: 'No cash or stablecoin reserve. Holding 5–15% in cash/stablecoins gives you dry powder to buy dips without selling at a loss.' }
      if (pct < 5) return { pass: false, score: 60, tip: `Only ${pct.toFixed(1)}% in cash/stablecoins. Increasing to 5–15% gives you a proper "buy the dip" reserve.` }
      if (pct > 50) return { pass: true, score: 65, tip: `${pct.toFixed(1)}% in cash is high — you may be missing market upside. Consider deploying some into quality assets.` }
      return { pass: true, score: 100, tip: `${pct.toFixed(1)}% cash reserve — healthy dry powder for opportunities.` }
    },
  },
  {
    id: 'large_cap',
    label: 'Large-Cap Crypto',
    icon: 'award',
    color: '#3b82f6',
    applies: (mix) => mix.crypto >= 0.1,
    check: (enriched, totalValue, targets, mix) => {
      const cryptoVal = mix.crypto * totalValue
      const largeCap = new Set(['bitcoin','ethereum','ripple','binancecoin','solana','cardano','avalanche-2','polkadot','chainlink','litecoin'])
      const lcVal = enriched.filter(h => largeCap.has(h.coin_id)).reduce((s, h) => s + h.value, 0)
      const pct = lcVal / cryptoVal * 100
      if (pct < 40) return { pass: false, score: 30, tip: `Only ${pct.toFixed(1)}% of your crypto is large-cap. Heavy small-cap exposure raises wipeout risk — anchor with more BTC/ETH/SOL.` }
      if (pct < 60) return { pass: false, score: 70, tip: `${pct.toFixed(1)}% large-cap crypto. Aim for 60%+ in proven coins to absorb micro-cap volatility.` }
      return { pass: true, score: 95, tip: `${pct.toFixed(1)}% of your crypto is large-cap — a solid, volatility-absorbing base.` }
    },
  },
  {
    id: 'stock_sectors',
    label: 'Stock Sector Spread',
    icon: 'grid',
    color: '#818cf8',
    applies: (mix) => mix.stock >= 0.1,
    check: (enriched) => {
      const stocks = enriched.filter(h => assetClass(h.coin_id) === 'stock')
      const sectors = new Set(stocks.map(h => getStockSector(h.coin_id)).filter(Boolean))
      const n = sectors.size
      if (stocks.length < 2) return { pass: false, score: 40, tip: 'Only one stock position. Single-name risk is high — add 2–3 stocks from different sectors (Tech, Healthcare, Finance).' }
      if (n === 1) return { pass: false, score: 35, tip: `All your stocks are in ${[...sectors][0]}. Sector concentration is risky — diversify into Healthcare, Finance, Energy, or Consumer.` }
      if (n === 2) return { pass: false, score: 70, tip: `Stocks span 2 sectors (${[...sectors].join(', ')}). A third sector would smooth out sector-specific drawdowns.` }
      return { pass: true, score: 100, tip: `Stocks span ${n} sectors (${[...sectors].join(', ')}) — well diversified across the equity market.` }
    },
  },
  {
    id: 'sell_targets',
    label: 'Profit Targets Set',
    icon: 'target',
    color: '#fbbf24',
    check: (enriched, totalValue, targets) => {
      const coinsWithTargets = new Set(targets.map(tg => tg.coin_id))
      const covered = enriched.filter(h => coinsWithTargets.has(h.coin_id)).length
      const total = enriched.length
      if (covered === 0) return { pass: false, score: 0, tip: 'No sell targets set. Without a plan, emotions will decide when you sell — usually at the wrong time. Go to Targets and set exit levels.' }
      if (covered < total * 0.5) return { pass: false, score: 40, tip: `Only ${covered}/${total} holdings have sell targets. Set exit points for every position so you never exit on panic.` }
      return { pass: true, score: 95, tip: `${covered}/${total} holdings have sell targets — disciplined exit planning.` }
    },
  },
  {
    id: 'pnl_health',
    label: 'P&L Health',
    icon: 'pulse',
    color: 'var(--g-ink)', fontWeight: 700,
    check: (enriched, totalValue) => {
      if (!enriched.length) return { pass: false, score: 0, tip: 'No holdings to evaluate.' }
      const avgPnlPct = totalValue > 0 ? enriched.reduce((s, h) => s + (h.pnl / Math.max(h.total_invested, 1)) * (h.value / totalValue), 0) * 100 : 0
      if (avgPnlPct < -30) return { pass: false, score: 10, tip: `Portfolio is down ${Math.abs(avgPnlPct).toFixed(1)}% overall. Consider DCA-ing into your strongest convictions to lower average cost.` }
      if (avgPnlPct < 0) return { pass: false, score: 50, tip: `Portfolio is slightly underwater (${avgPnlPct.toFixed(1)}%). Hold quality assets and average down on dips if you believe in them.` }
      if (avgPnlPct > 100) return { pass: true, score: 100, tip: `Up ${avgPnlPct.toFixed(1)}%! Consider taking some profits to lock in gains.` }
      return { pass: true, score: 90, tip: `Portfolio up ${avgPnlPct.toFixed(1)}% — healthy. Keep managing risk.` }
    },
  },
]

function computeWalletEval(enriched, totalValue, targets = []) {
  if (!enriched.length) return null
  const mix = computeAssetMix(enriched, totalValue)
  const results = EVAL_CATEGORIES
    .filter(cat => !cat.applies || cat.applies(mix))
    .map(cat => {
      const result = cat.check(enriched, totalValue, targets, mix)
      return { ...cat, ...result }
    })
  const overall = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
  const missing = results.filter(r => !r.pass)
  const strong = results.filter(r => r.pass)
  return { results, overall, missing, strong }
}

function EvalScoreRing({ score }) {
  const r = 54, circ = 2 * Math.PI * r
  const dash = circ * score / 100
  const color = score >= 80 ? 'var(--g)' : score >= 55 ? '#fbbf24' : '#f87171'
  // Lighter companion stop for a subtle gradient sweep along the arc.
  const color2 = score >= 80 ? '#34d399' : score >= 55 ? '#f59e0b' : '#fb7185'
  const label = score >= 80 ? 'Strong' : score >= 55 ? 'Needs Work' : 'At Risk'
  return (
    <div className="eval-ring-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <defs>
          <linearGradient id="evalRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color2}/>
            <stop offset="100%" stopColor={color}/>
          </linearGradient>
          <filter id="evalRingGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="70" cy="70" r={r} fill="none" className="eval-ring-track" strokeWidth="10"/>
        <circle cx="70" cy="70" r={r} fill="none" stroke="url(#evalRingGrad)" strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 70 70)" filter="url(#evalRingGlow)"
          style={{ transition: 'stroke-dasharray 1.2s ease' }}/>
      </svg>
      <div className="eval-ring-inner">
        <div className="eval-ring-score" style={{ color }}>{score}</div>
        <div className="eval-ring-label" style={{ color }}>{label}</div>
      </div>
    </div>
  )
}

const WalletEvalTab = memo(function WalletEvalTab({ enriched, totalValue, targets }) {
  const eval_ = useMemo(() => computeWalletEval(enriched, totalValue, targets), [enriched, totalValue, targets])
  const [expanded, setExpanded] = useState(null)

  if (!enriched.length) return (
    <div className="dvx-form-page">
      <div className="glass-card" style={{ textAlign:'center', padding:'3rem 1.5rem' }}>
        <div style={{ marginBottom:'0.75rem', display:'flex', justifyContent:'center' }}><Icon name="search" size={38} style={{ color:'var(--text-sub)' }} /></div>
        <h3 style={{ marginBottom:'0.5rem' }}>No Holdings to Evaluate</h3>
        <p className="muted">Add some crypto holdings first and we'll tell you what your wallet is missing.</p>
      </div>
    </div>
  )

  const { results, overall, missing } = eval_

  return (
    <div className="dvx-form-page">
      {/* Header score */}
      <div className="glass-card eval-header-card">
        <div className="eval-header-left">
          <h2 style={{ margin:0, fontSize:'1.25rem' }}>Wallet Evaluation</h2>
          <p className="muted" style={{ margin:'0.3rem 0 0', fontSize:'0.82rem' }}>
            What your portfolio is missing vs best practices
          </p>
          {missing.length > 0 && (
            <div className="eval-missing-count">
              <Icon name="warning" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{missing.length} gap{missing.length > 1 ? 's' : ''} found — tap each to fix
            </div>
          )}
          {missing.length === 0 && (
            <div className="eval-missing-count" style={{ color: 'var(--g-ink)', fontWeight: 700 }}>
              <span style={{ marginRight:'0.4em', fontWeight:900 }}>✓</span>All checks passed — excellent wallet health!
            </div>
          )}
        </div>
        <EvalScoreRing score={overall} />
      </div>

      {/* Category cards */}
      <div className="eval-grid">
        {results.map(cat => (
          <div key={cat.id}
            className={`eval-cat-card ${cat.pass ? 'eval-cat-pass' : 'eval-cat-fail'} ${expanded === cat.id ? 'eval-cat-open' : ''}`}
            onClick={() => { const opening = expanded !== cat.id; setExpanded(opening ? cat.id : null); if (opening) track('eval_cat_expand', { cat: cat.id, pass: cat.pass, score: cat.score }) }}
            style={{ '--eval-color': cat.color }}>
            <div className="eval-cat-header">
              <span className="eval-cat-icon" style={{ background: cat.color + '22', color: cat.color }}>{cat.icon.length <= 2 ? cat.icon : <Icon name={cat.icon} size={16} />}</span>
              <div className="eval-cat-info">
                <div className="eval-cat-label">{cat.label}</div>
                <div className="eval-cat-bar-wrap">
                  <div className="eval-cat-bar" style={{ width: `${cat.score}%` }} />
                </div>
              </div>
              <div className="eval-cat-right">
                <span className="eval-cat-score" style={{ color: cat.color }}>{cat.score}</span>
                <span className={`eval-cat-badge ${cat.pass ? 'eval-badge-pass' : 'eval-badge-fail'}`}>
                  {cat.pass ? '✓' : '✗'}
                </span>
              </div>
            </div>
            {expanded === cat.id && (
              <div className="eval-cat-tip">
                <Icon name={cat.pass ? 'lightbulb' : 'warning'} size={14} style={{ marginRight:'0.5rem', verticalAlign:'-2px', color: cat.pass ? 'var(--g-ink)' : '#f59e0b' }} />
                {cat.tip}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

const TIMEFRAMES = [
  { id: '4H',  label: '4H',  pts: 48 },
  { id: '1D',  label: '1D',  pts: 48 },
  { id: '7D',  label: '7D',  pts: 56 },
  { id: '30D', label: '30D', pts: 60 },
  { id: '90D', label: '90D', pts: 60 },
  { id: '1Y',  label: '1Y',  pts: 64 },
  { id: 'ALL', label: 'All', pts: 64 },
]
// Days covered by each timeframe (0 = intraday 4-hour window; ALL = 10 years,
// effectively "everything we have").
const TF_DAYS = { '4H': 0, '1D': 1, '7D': 7, '30D': 30, '90D': 90, '1Y': 365, 'ALL': 3650 }
const TF_PTS  = { '4H': 48, '1D': 48, '7D': 56, '30D': 60, '90D': 60, '1Y': 64, 'ALL': 64 }

function buildPerfSeries(base, tf = '30D', transactions = []) {
  const days = TF_DAYS[tf] ?? 30
  const pts = TF_PTS[tf] ?? 60
  const b = Math.max(base || 10000, 1)

  // ── Level 1: real snapshots (most accurate) ──────────────────────────────
  if (days > 0) {
    const snaps = getSnapshotsForDays(days)
    if (snaps.length >= 2) {
      const first = snaps[0], last = snaps[snaps.length - 1]
      const timeRange = last.ts - first.ts || 1
      return Array.from({ length: pts }, (_, i) => {
        const t = i / (pts - 1)
        const targetTs = first.ts + t * timeRange
        let lo = snaps[0], hi = snaps[snaps.length - 1]
        for (let j = 0; j < snaps.length - 1; j++) {
          if (snaps[j].ts <= targetTs && snaps[j + 1].ts >= targetTs) {
            lo = snaps[j]; hi = snaps[j + 1]; break
          }
        }
        const segT = hi.ts === lo.ts ? 1 : (targetTs - lo.ts) / (hi.ts - lo.ts)
        return { i, ts: targetTs, v: Math.max(lo.v + (hi.v - lo.v) * segT, 0) }
      })
    }
  }

  // ── Level 2: reconstruct from transaction history ─────────────────────────
  // Each transaction has a real date + price_per_unit, so we can replay
  // the portfolio cost basis over time and scale it to the current market value.
  const validTxs = (transactions || [])
    .filter(tx => tx.date && (tx.amount > 0 || tx.quantity > 0) && tx.price_per_unit > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  if (validTxs.length >= 1) {
    const now = Date.now()
    const windowMs = Math.max(days, 1) * 24 * 60 * 60 * 1000
    const startTime = now - windowMs

    // Total current cost basis across all transactions
    const currentCostBasis = validTxs.reduce((s, tx) => {
      const qty = tx.amount || tx.quantity || 0
      const val = qty * tx.price_per_unit
      return tx.type === 'buy' ? s + val : Math.max(s - val, 0)
    }, 0)

    // Scale factor: stretch cost-basis curve to current market value
    const scale = currentCostBasis > 0 ? b / currentCostBasis : 1

    // Pre-parse tx timestamps once, then advance a pointer linearly (O(n+pts)).
    const txTimes = validTxs.map(tx => new Date(tx.date).getTime())
    let ptr = 0
    let runningCost = 0
    return Array.from({ length: pts }, (_, i) => {
      const t = i / (pts - 1)
      const pointTime = startTime + t * (now - startTime)

      while (ptr < validTxs.length && txTimes[ptr] <= pointTime) {
        const tx = validTxs[ptr]
        const qty = tx.amount || tx.quantity || 0
        const val = qty * tx.price_per_unit
        runningCost = tx.type === 'buy' ? runningCost + val : Math.max(runningCost - val, 0)
        ptr++
      }

      // Final point always equals current market value exactly
      const v = i === pts - 1 ? b : Math.max(runningCost * scale, 0)
      return { i, ts: pointTime, v }
    })
  }

  // ── Level 3: pure simulation (no real data at all) ───────────────────────
  const startRatio = { '4H': 0.97, '1D': 0.93, '7D': 0.82, '30D': 0.68, '90D': 0.6, '1Y': 0.5, 'ALL': 0.42 }[tf] || 0.75
  const seed = Math.round(b) % 997
  const simNow = Date.now()
  const simWindow = days > 0 ? days * 864e5 : 4 * 36e5
  return Array.from({ length: pts }, (_, i) => {
    const t = i / (pts - 1)
    const trend = startRatio * b + t * (1 - startRatio) * b
    const noise = Math.sin((i + seed) * 0.7) * b * 0.012 + Math.sin((i + seed) * 1.9) * b * 0.006
    return { i, ts: simNow - simWindow + t * simWindow, v: Math.max(trend + noise, b * 0.1) }
  })
}

// ── Wallet panel ─────────────────────────────────────────────────────────
function WalletPanel({ wallets, onRefresh, onCreated }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    const wasFirst = (wallets?.length || 0) === 0
    try {
      await api.createWallet({ name: name.trim() })
      track('wallet_created', {
        wallet_name: name.trim(),
        wallet_count: (wallets?.length || 0) + 1,
      })
      setName(''); onRefresh()
      // Guide the user straight into logging their first trade.
      onCreated?.(wasFirst)
    }
    finally { setBusy(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this wallet and all its transactions?')) return
    await api.deleteWallet(id); track('wallet_deleted', { wallet_id: id }); onRefresh()
  }

  return (
    <div className="dvx-panel">
      <div className="dvx-panel-row">
        <input className="dvx-input" placeholder="Wallet name…"
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="dvx-btn dvx-btn-primary" onClick={add} disabled={busy || !name.trim()}>
          {Ico.plus} Add
        </button>
      </div>
      <ul className="dvx-wallet-list">
        {wallets.map(w => (
          <li key={w.id} className="dvx-wallet-item">
            <span className="dvx-wallet-icon">{Ico.wallet}</span>
            <span className="dvx-wallet-name">{w.name}</span>
            <button className="dvx-btn-ghost dvx-btn-danger" onClick={() => del(w.id)}>{Ico.trash}</button>
          </li>
        ))}
        {wallets.length === 0 && <li className="muted" style={{ padding: '0.5rem 0', listStyle:'none' }}>No wallets yet. Add one above.</li>}
      </ul>
    </div>
  )
}

// ── Trade panel ──────────────────────────────────────────────────────────
function TradePanel({ wallets, onRefresh, defaultType = 'buy' }) {
  const [type, setType]     = useState(defaultType)
  const [walletId, setWalletId] = useState('')
  const [coin, setCoin]     = useState('')
  const [symbol, setSymbol] = useState('')
  const [amount, setAmount] = useState('')
  const [price, setPrice]   = useState('')
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0])
  const [busy, setBusy]     = useState(false)
  const [msg, setMsg]       = useState('')

  useEffect(() => { if (wallets.length) setWalletId(String(wallets[0].id)) }, [wallets])

  async function submit() {
    if (!walletId || !coin || !symbol || !amount || !price) { setMsg('Fill all fields.'); return }
    setBusy(true)
    try {
      // First-ever transaction = the user started their profile via manual entry.
      let isFirstHolding = false
      try { isFirstHolding = (await api.getTransactions()).length === 0 } catch {}
      const amt = parseFloat(amount), ppu = parseFloat(price)
      await api.addTransaction({
        wallet_id: walletId, type,
        coin_id: coin.toLowerCase().replace(/\s+/g, '-'),
        coin_symbol: symbol.toUpperCase(), coin_name: coin,
        amount: amt, price_per_unit: ppu,
        date, category: 'crypto',
      })
      const valueUsd = Math.round(amt * ppu)
      track(type === 'buy' ? 'buy_transaction' : 'sell_transaction', {
        asset_symbol:   symbol.toUpperCase(),
        asset_name:     coin,
        asset_category: 'crypto',
        value_usd:      valueUsd,
        value_tier:     valueUsd >= 10000 ? '10k+' : valueUsd >= 1000 ? '1k-10k' : valueUsd >= 100 ? '100-1k' : '<100',
        amount:         parseFloat(amt.toFixed(6)),
        price_usd:      Math.round(ppu),
        source:         'manage_tab',
      })
      track('trade_submitted', { trade_type: type, asset_symbol: symbol.toUpperCase(), asset_category: 'crypto', trade_value_usd: valueUsd, source: 'manage_tab' })
      if (isFirstHolding) trackProfileCreated({ method: 'manual_trade', assetCount: 1, source: 'manage_tab' })
      setMsg('Trade added!'); setCoin(''); setSymbol(''); setAmount(''); setPrice('')
      onRefresh(); setTimeout(() => setMsg(''), 2500)
    } finally { setBusy(false) }
  }

  return (
    <div className="dvx-panel">
      <div className="dvx-type-row">
        <button className={`dv-type-btn ${type === 'buy' ? 'active-buy' : ''}`} onClick={() => setType('buy')}>Buy</button>
        <button className={`dv-type-btn ${type === 'sell' ? 'active-sell' : ''}`} onClick={() => setType('sell')}>Sell</button>
      </div>
      <div className="dvx-form-grid">
        <select className="dvx-input" value={walletId} onChange={e => setWalletId(e.target.value)}>
          {wallets.length === 0 && <option value="">Create a wallet first</option>}
          {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <input className="dvx-input" placeholder="Coin name (e.g. Bitcoin)" value={coin} onChange={e => setCoin(e.target.value)} />
        <input className="dvx-input" placeholder="Ticker (BTC)" value={symbol} onChange={e => setSymbol(e.target.value)} />
        <input className="dvx-input" type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
        <input className="dvx-input" type="number" placeholder="Price per unit ($)" value={price} onChange={e => setPrice(e.target.value)} />
        <input className="dvx-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      {msg && <p className="dvx-msg">{msg}</p>}
      <button className={`dvx-btn dvx-btn-full ${type === 'buy' ? 'dvx-btn-primary' : 'dvx-btn-sell'}`}
        onClick={submit} disabled={busy}>
        {busy ? 'Adding…' : type === 'buy' ? 'Confirm Buy' : 'Confirm Sell'}
      </button>
    </div>
  )
}

// ── Data panel — short WLZ backup code ───────────────────────────────────
// Weekly email-backup subscription. Register an email once; the app emails the
// current backup (code + scannable QR) from noreply@walletlens.live now, then
// automatically every week when opened. The portfolio never leaves the device
// on our servers — the app regenerates and sends each time.
function EmailBackupPanel() {
  const [emailAddr, setEmailAddr] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [err, setErr] = useState('')
  const [sub, setSub] = useState(() => loadBackupSub())

  const explainMailErr = (reason) => {
    const r = String(reason || '')
    return r.includes('mail_not_configured') ? 'Email isn\'t set up on the server yet.'
      : r.includes('not verified') || r.includes('domain') ? 'The walletlens.live email domain isn\'t verified in Resend yet.'
      : r.includes('network') ? 'Couldn\'t reach the email service. Check your connection and try again.'
      : 'Couldn\'t send the backup email. Double-check your address and try again.'
  }

  const subscribe = async () => {
    const email = emailAddr.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { setErr('Enter a valid email address.'); return }
    setErr(''); setStatus('sending')
    try {
      await subscribeBackupEmail(email)
      setSub(loadBackupSub()); setStatus('sent'); track('backup_email_subscribed')
    } catch (e) {
      setErr(explainMailErr(e?.reason || (e?.message === 'Failed to fetch' ? 'network' : e?.message)))
      setStatus('error')
    }
  }

  const sendNow = async () => {
    setErr(''); setStatus('sending')
    try {
      await resendBackupNow()
      setSub(loadBackupSub()); setStatus('sent'); track('backup_email_resent')
    } catch (e) {
      setErr(explainMailErr(e?.reason || (e?.message === 'Failed to fetch' ? 'network' : e?.message)))
      setStatus('error')
    }
  }

  const unsubscribe = () => {
    clearBackupSub(); setSub(null); setStatus('idle'); setErr(''); track('backup_email_unsubscribed')
  }

  const btn = (extra) => ({
    padding:'0.55rem 0.85rem', borderRadius:'8px', cursor:'pointer',
    fontSize:'0.8rem', ...extra,
  })

  return (
    <div className="dvx-email-backup" style={{ marginTop:'1.1rem', paddingTop:'1.1rem', borderTop:'1px solid var(--border, rgba(128,128,128,0.18))' }}>
      <div style={{ fontSize:'0.85rem', fontWeight:800, marginBottom:'0.15rem', color:'var(--text)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
        <Icon name="mail" size={15} /> Weekly email backup
      </div>

      {!sub ? (
        <>
          <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', margin:'0.15rem 0 0.6rem', lineHeight:1.55 }}>
            Register your email and WalletLens will send your backup (code + scannable QR) from <strong>noreply@walletlens.live</strong> — right now, then automatically every week when you open the app. Delivered on demand; no copy is kept on our servers.
          </p>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <input
              type="email" inputMode="email" autoComplete="email"
              value={emailAddr}
              onChange={e => { setEmailAddr(e.target.value); if (err) setErr(''); if (status !== 'idle') setStatus('idle') }}
              placeholder="you@example.com"
              style={{
                flex:1, minWidth:0, background:'var(--input-bg, rgba(128,128,128,0.08))',
                border:'1px solid rgba(16,185,129,0.3)', borderRadius:'8px', color:'var(--text)',
                padding:'0.55rem 0.7rem', fontSize:'0.8rem', boxSizing:'border-box',
              }} />
            <button onClick={subscribe} disabled={status === 'sending'} style={btn({
              background:'linear-gradient(135deg, #047857, #10b981)', border:'none', color:'#fff',
              fontWeight:700, opacity: status === 'sending' ? 0.7 : 1, whiteSpace:'nowrap',
              display:'inline-flex', alignItems:'center', gap:'0.35rem',
            })}>
              {status === 'sending' ? 'Sending…' : <><Icon name="mail" size={14} /> Subscribe</>}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{
            display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap',
            background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.25)',
            borderRadius:'10px', padding:'0.55rem 0.75rem', margin:'0.15rem 0 0.6rem',
            fontSize:'0.75rem', color:'var(--g-ink)', fontWeight:600,
          }}>
            <Icon name="check" size={14} />
            <span style={{ wordBreak:'break-all' }}>Weekly backup on · {sub.email}</span>
            {daysUntilNextBackup() != null && (
              <span style={{ color:'var(--text-muted)', fontWeight:500, marginLeft:'auto' }}>
                next in ~{daysUntilNextBackup()}d
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <button onClick={sendNow} disabled={status === 'sending'} style={btn({
              flex:1, background:'rgba(59,130,246,0.18)', border:'1px solid rgba(59,130,246,0.4)',
              color:'#3b82f6', fontWeight:700, opacity: status === 'sending' ? 0.7 : 1,
              display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'0.35rem',
            })}>
              {status === 'sending' ? 'Sending…' : <><Icon name="mail" size={13} /> Send now</>}
            </button>
            <button onClick={unsubscribe} style={btn({
              background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.3)',
              color:'#f87171', fontWeight:700, whiteSpace:'nowrap',
            })}>Unsubscribe</button>
          </div>
        </>
      )}

      {status === 'sent' && (
        <p style={{ fontSize:'0.72rem', color:'var(--g-ink)', margin:'0.5rem 0 0', fontWeight:600 }}>
          <Icon name="check" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />Sent — check your inbox (and spam folder).
        </p>
      )}
      {err && <p style={{ fontSize:'0.72rem', color:'#f87171', margin:'0.5rem 0 0' }}>{err}</p>}
    </div>
  )
}

function DataPanel({ onRefresh, onImported }) {
  const { t } = useLanguage()
  const [code, setCode]     = useState('')
  const [copied, setCopied] = useState(false)
  const [msg, setMsg]       = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy]     = useState(false)

  // QR export
  const [showQr, setShowQr] = useState(false)
  const [qrParts, setQrParts] = useState([])

  async function doExport() {
    setBusy(true)
    try {
      const { makeQrParts } = await _loadQrBackup()
      // QR deep-link and full backup run in parallel.
      const [result, qrUrl] = await Promise.all([
        api.exportCode().catch(() => null),
        api.exportQrDeepLink().catch(() => null),
      ])
      const qrSource = qrUrl || result
      if (result) { setCode(result); setMsg('') }
      else if (!qrSource) setMsg('Export failed.')
      else setMsg('')
      if (qrSource) {
        const parts = await makeQrParts(qrSource)
        setQrParts(parts); setShowQr(false)
      }
    } finally { setBusy(false) }
  }

  async function toggleExportQr() {
    if (showQr) { setShowQr(false); return }
    if (qrParts.length) { setShowQr(true); return }
    const { makeQrParts } = await _loadQrBackup()
    const qrUrl = await api.exportQrDeepLink().catch(() => null)
    if (qrUrl) { const parts = await makeQrParts(qrUrl); setQrParts(parts); setShowQr(parts.length > 0) }
  }

  // Standalone QR generation — independent of the text backup code. Always
  // produces a single compact holdings-only QR, even if the full backup fails.
  async function generateQr() {
    if (showQr) { setShowQr(false); return }
    setBusy(true)
    try {
      const { makeQrParts } = await _loadQrBackup()
      const qrUrl = await api.exportQrDeepLink().catch(() => null)
      if (qrUrl) {
        const parts = await makeQrParts(qrUrl)
        setQrParts(parts); setShowQr(parts.length > 0)
        setMsg(parts.length > 0 ? '' : 'QR generation failed.')
      } else {
        setMsg('QR generation failed.')
      }
    } finally { setBusy(false) }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { setMsg('Copy failed — select and copy manually.') }
  }

  async function loadPreview() {
    if (!code.trim()) return
    setBusy(true)
    const result = await api.previewImportCode(code.trim())
    setBusy(false)
    if (!result.success) { setMsg('Invalid code: ' + result.error); setPreview(null); return }
    setPreview(result); setMsg('')
  }

  async function doImport() {
    if (!preview) return
    setBusy(true)
    const result = await api.importCode(code.trim())
    setBusy(false)
    if (result?.success === false) { setMsg('Import failed: ' + (result.error || 'unknown error')); return }
    setMsg('Imported! Redirecting…'); setCode(''); setPreview(null)
    onRefresh()
    // Jump to the portfolio overview so the user sees their restored holdings.
    if (onImported) setTimeout(() => onImported(), 300)
    setTimeout(() => setMsg(''), 2500)
  }

  return (
    <div className="dvx-panel">
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.5rem 0.15rem' }}>
          Security
        </div>
        <BiometricToggle />
      </div>

      <p className="dvx-data-hint">
        Your data is stored as a short backup code (WLZ format). Export it to save or transfer to another device. Paste a code to restore.
      </p>

      <div className="dvx-panel-row">
        <button className="dvx-btn dvx-btn-primary dvx-btn-full" onClick={doExport} disabled={busy}>
          {Ico.export} {t('generateBackup')}
        </button>
        <button className="dvx-btn dvx-btn-full" onClick={generateQr} disabled={busy}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
          {Ico.qr} {showQr ? 'Hide QR' : 'Generate QR'}
        </button>
      </div>

      {code && (
        <div className="dvx-code-box">
          <div className="dvx-code-text">{code}</div>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <button className="dvx-code-copy" onClick={copyCode}>
              {copied ? <>{Ico.check} Copied!</> : <>{Ico.copy} Copy</>}
            </button>
            <button className="dvx-code-copy" onClick={toggleExportQr}>
              {Ico.qr} {showQr ? 'Hide QR' : 'Show QR'}
            </button>
          </div>
        </div>
      )}

      {showQr && qrParts.length > 0 && (
        <div style={{ textAlign:'center', margin:'0.5rem 0' }}>
          {qrParts.length > 1 && (
            <p style={{ fontSize:'0.78rem', color: 'var(--g-ink)', fontWeight: 700, margin:'0 0 0.5rem', fontWeight:700 }}>
              <Icon name="phone" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{qrParts.length}-part QR — scan each in order on the other device
            </p>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.9rem', alignItems:'center' }}>
            {qrParts.map(part => (
              <div key={part.idx}>
                {part.total > 1 && (
                  <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', margin:'0 0 0.25rem', fontWeight:600 }}>
                    Part {part.idx} of {part.total}
                  </p>
                )}
                <img src={part.url} alt={`Backup QR ${part.idx} of ${part.total}`}
                  style={{ borderRadius:'8px', maxWidth:'100%', width:'220px', display:'block', margin:'0 auto' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dvx-divider">or restore from code</div>

      <textarea className="dvx-input dvx-textarea"
        placeholder="Paste your WLZ backup code here…"
        value={code} onChange={e => { setCode(e.target.value); setPreview(null); setMsg('') }}
        rows={4} />

      {preview && (
        <div className="dvx-preview-box">
          <div className="dvx-preview-title">Preview</div>
          <div className="dvx-preview-row">
            <span>Wallets</span><strong>{preview.summary.wallets}</strong>
          </div>
          <div className="dvx-preview-row">
            <span>Transactions</span><strong>{preview.summary.transactions}</strong>
          </div>
          {Object.entries(preview.summary.byCategory || {}).map(([cat, n]) => (
            <div key={cat} className="dvx-preview-row">
              <span>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span><strong>{n} assets</strong>
            </div>
          ))}
        </div>
      )}

      {msg && <p className="dvx-msg">{msg}</p>}

      <div className="dvx-panel-row" style={{ marginTop: '0.25rem' }}>
        <button className="dvx-btn dvx-btn-full" onClick={loadPreview} disabled={busy || !code.trim()}>
          {Ico.import} Preview Import
        </button>
        {preview && (
          <button className="dvx-btn dvx-btn-primary dvx-btn-full" onClick={doImport} disabled={busy}>
            {Ico.check} Confirm Import
          </button>
        )}
      </div>

      <EmailBackupPanel />
    </div>
  )
}

// ── Count-up: eases a number from its previous value to the new one ─────────
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(target)
  const prev = useRef(target)
  useEffect(() => {
    const to = Number(target) || 0
    const from = Number(prev.current) || 0
    if (from === to || prefersReducedMotion()) { prev.current = to; setVal(to); return }
    let raf, start
    const step = (ts) => {
      if (!start) start = ts
      const p = Math.min(1, (ts - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(step)
      else prev.current = to
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

// Money value that counts up to its target. `format` already returns the
// absolute magnitude (no sign), so we prefix the sign from the target.
const AnimatedMoney = memo(function AnimatedMoney({ value, format, signed }) {
  const n = useCountUp(Number(value) || 0)
  const sign = signed ? (Number(value) >= 0 ? '+' : '-') : ''
  return <>{sign}{format(n)}</>
})

// Tiny SVG sparkline built from a [{ v }] series — sits faintly behind a card.
const Sparkline = memo(function Sparkline({ data, up, width = 120, height = 40 }) {
  const pts = (data || []).map(d => Number(d.v) || 0)
  if (pts.length < 2) return null
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1
  const stepX = width / (pts.length - 1)
  const coords = pts.map((v, i) => [i * stepX, height - ((v - min) / span) * height])
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width} ${height} L0 ${height} Z`
  const col = up ? 'var(--g)' : '#f87171'
  return (
    <svg className="dvx-stat-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={col} fillOpacity="0.10" stroke="none" />
      <path d={line} fill="none" stroke={col} strokeWidth="1.6" strokeOpacity="0.55" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
})

// ── Summary stat card ─────────────────────────────────────────────────────
const StatCard = memo(function StatCard({ label, value, sub, color, tone, spark }) {
  return (
    <div className={`dvx-stat-card glass-card${tone ? ` dvx-stat-card--${tone}` : ''}`}>
      {spark}
      <span className="dvx-stat-label">{label}</span>
      <span className="dvx-stat-value" style={color ? { color } : {}}>{value}</span>
      {sub && <span className="dvx-stat-sub">{sub}</span>}
    </div>
  )
})

// ── Portfolio Heatmap ─────────────────────────────────────────────────────
const PortfolioHeatmap = memo(function PortfolioHeatmap({ enriched, prices, totalValue }) {
  const cells = enriched
    .filter(h => h.value > 0)
    .map(h => {
      const chg = prices[h.coin_id]?.usd_24h_change ?? 0
      const sizePct = totalValue > 0 ? (h.value / totalValue) * 100 : 0
      const intensity = Math.min(Math.abs(chg) / 15, 1)
      const color = chg > 0
        ? intensity < 0.35 ? `rgba(74,222,128,${0.28 + intensity * 0.4})` : intensity < 0.7 ? `rgba(34,197,94,${0.42 + intensity * 0.35})` : `rgba(22,163,74,${0.6 + intensity * 0.3})`
        : chg < 0
          ? intensity < 0.35 ? `rgba(248,113,113,${0.28 + intensity * 0.4})` : intensity < 0.7 ? `rgba(239,68,68,${0.42 + intensity * 0.35})` : `rgba(220,38,38,${0.6 + intensity * 0.3})`
          : 'rgba(255,255,255,0.06)'
      return { ...h, chg, sizePct, color }
    })
    .sort((a, b) => b.sizePct - a.sizePct)

  if (!cells.length) return null

  return (
    <div className="glass-card heatmap-card">
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="grid" size={16} style={{ color: 'var(--g-ink)', fontWeight: 700 }} />Portfolio Heatmap</h3>
      <div className="heatmap-grid">
        {cells.map((c, i) => {
          const minSize = 60
          const size = Math.max(minSize, Math.min(180, (c.sizePct / 100) * 800))
          return (
            <div
              key={c.coin_id}
              className="heatmap-cell"
              style={{ background: c.color, width: size, height: size }}
              title={`${c.coin_symbol?.toUpperCase()} — ${c.sizePct.toFixed(1)}% · ${c.chg >= 0 ? '+' : ''}${c.chg.toFixed(2)}%`}
            >
              <CoinLogo image={c.coin_image} symbol={c.coin_symbol} coinId={c.coin_id} size={Math.min(28, Math.floor(size * 0.35))} className="heatmap-img" />
              <div className="heatmap-sym" style={{ fontSize: size < 80 ? '0.6rem' : '0.75rem' }}>{c.coin_symbol?.toUpperCase()}</div>
              <div className={`heatmap-chg ${c.chg >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: size < 80 ? '0.55rem' : '0.7rem' }}>
                {c.chg >= 0 ? '+' : ''}{c.chg.toFixed(1)}%
              </div>
              {size >= 90 && (
                <div className="heatmap-pct" style={{ fontSize: '0.58rem', opacity: 0.7, marginTop: 2 }}>{c.sizePct.toFixed(1)}% of portfolio</div>
              )}
            </div>
          )
        })}
      </div>
      <div className="heatmap-legend">
        <span style={{ color:'rgba(248,113,113,0.9)' }}>■ Losing</span>
        <span style={{ color:'var(--text-sub)' }}>Darker = bigger move</span>
        <span style={{ color:'rgba(var(--g-rgb),0.9)' }}>■ Gaining</span>
      </div>
    </div>
  )
})

// ── Risk Profile ─────────────────────────────────────────────────────────

function getRiskLevel(h) {
  const cat = categorizeAsset(h)
  if (cat === 'cash' || cat === 'metals' || cat === 'realestate') return 'low'
  if (isStablecoin(h.coin_id, h.coin_symbol)) return 'low'
  const id = (h.coin_id || '').toLowerCase()
  if (cat === 'stocks') return 'medium'
  if (KNOWN_MEGA.has(id) || KNOWN_LARGE.has(id)) return 'medium'
  return 'high'
}

function computeRiskProfile(enriched, totalValue) {
  if (!enriched.length || !totalValue) return null
  let low = 0, medium = 0, high = 0
  enriched.forEach(h => {
    const val = h.value > 0 ? h.value : (h.total_invested || 0)
    const lvl = getRiskLevel(h)
    if (lvl === 'low') low += val
    else if (lvl === 'medium') medium += val
    else high += val
  })
  const total = low + medium + high
  if (!total) return null
  const lowPct  = (low    / total) * 100
  const medPct  = (medium / total) * 100
  const highPct = (high   / total) * 100
  let traderType, traderColor, traderDesc
  if (lowPct >= 60) {
    traderType = 'Conservative Trader'
    traderColor = '#fbbf24'
    traderDesc = 'Your portfolio is primarily in low-risk, stable assets.'
  } else if (highPct >= 50) {
    traderType = 'Aggressive Trader'
    traderColor = '#f87171'
    traderDesc = 'You hold significant high-risk positions.'
  } else {
    traderType = 'Moderate Trader'
    traderColor = '#10b981'
    traderDesc = 'Balanced mix of risk levels across your portfolio.'
  }
  return { lowPct, medPct, highPct, traderType, traderColor, traderDesc }
}

const RiskGauge = memo(function RiskGauge({ pct, color, label }) {
  const R = 36, cx = 50, cy = 50
  const circ = 2 * Math.PI * R
  const dash = circ * Math.min(pct / 100, 1)
  const gap  = circ - dash
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.45rem' }}>
      <svg viewBox="0 0 100 100" style={{ width:90, height:90 }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9"/>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth="9"
          strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
          transform="rotate(-90 50 50)"/>
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize="12" fontWeight="800" fill={color} fontFamily="Inter,sans-serif">
          {pct.toFixed(2)}%
        </text>
      </svg>
      <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', textAlign:'center', lineHeight:1.3, maxWidth:80 }}>{label}</span>
    </div>
  )
})

const RiskProfileCard = memo(function RiskProfileCard({ enriched, totalValue }) {
  const profile = useMemo(() => computeRiskProfile(enriched, totalValue), [enriched, totalValue])
  if (!profile) return null
  const { lowPct, medPct, highPct, traderType, traderColor, traderDesc } = profile

  const iconPath = traderColor === '#f87171'
    ? 'M13 2L3 14h9l-1 8 10-12h-9l1-8z'      // aggressive: lightning
    : traderColor === '#10b981'
      ? 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z'  // moderate: star
      : 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' // conservative: shield-star

  return (
    <div className="glass-card" style={{ marginTop:'0.75rem' }}>
      <h3 style={{ margin:'0 0 1rem', display:'inline-flex', alignItems:'center', gap:'0.4em', fontSize:'0.95rem', fontWeight:700 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--g-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        Risk Profile
      </h3>

      {/* Trader type hero */}
      <div style={{
        borderRadius:'12px', padding:'0.9rem 1.1rem', marginBottom:'1.2rem',
        background:`linear-gradient(135deg, ${traderColor}1a, ${traderColor}0a)`,
        border:`1px solid ${traderColor}40`,
        display:'flex', alignItems:'center', gap:'1rem',
      }}>
        <div style={{
          width:44, height:44, borderRadius:'50%', flexShrink:0,
          border:`2px solid ${traderColor}`, background:`${traderColor}22`,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={traderColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={iconPath}/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize:'1rem', fontWeight:800, color:traderColor }}>{traderType}</div>
          <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'0.15rem', lineHeight:1.4 }}>{traderDesc}</div>
        </div>
      </div>

      {/* Three gauges */}
      <div style={{ display:'flex', justifyContent:'space-around', gap:'0.5rem', paddingBottom:'0.25rem' }}>
        <RiskGauge pct={lowPct}  color="#fbbf24" label="Low-risk products" />
        <RiskGauge pct={medPct}  color="#10b981" label="Medium risk products" />
        <RiskGauge pct={highPct} color="#60a5fa" label="High-risk products" />
      </div>

      <p style={{ fontSize:'0.7rem', color:'var(--text-sub)', textAlign:'center', margin:'0.75rem 0 0', lineHeight:1.5 }}>
        Based on asset type and market capitalization
      </p>
    </div>
  )
})

// ── Empty portfolio state ─────────────────────────────────────────────────
const FEATURE_SLIDES = [
  { tag:'ALL ASSETS',    icon:'globe', color:'var(--g-ink)', title:'One Dashboard — All Assets',       desc:'Crypto, stocks, ETFs, precious metals & cash. Your complete net worth, updated live, in one view.' },
  { tag:'CRYPTO',        icon:'₿',  color:'#f7931a', title:'10,000+ Coins Tracked',             desc:'Real-time prices, P&L, and allocation for any cryptocurrency — from Bitcoin to micro-cap altcoins.' },
  { tag:'STOCKS & ETFs', icon:'trend-up', color:'#60a5fa', title:'Stocks & ETFs Side by Side',        desc:'Track AAPL, NVDA, TSLA, and any ticker alongside your crypto in one net worth view.' },
  { tag:'METALS',        icon:'diamond', color:'#ffd700', title:'Precious Metals by Weight',         desc:'Gold, silver & platinum tracked by oz or gram with live spot prices — a true asset class.' },
  { tag:'CASH',          icon:'banknote', color:'var(--g-ink)', title:'Cash & Stablecoins',                desc:'USDT, USDC, and fiat count toward net worth but are excluded from P&L — honest numbers.' },
  { tag:'AI ADVISOR',    icon:'sparkles',   color:'#818cf8', title:'AI Portfolio Advisor',              desc:'Portfolio health score A–F, diversification grade, momentum analysis & personalised action tips.' },
  { tag:'RISK SCANNER',  icon:'warning', color:'#f59e0b', title:'Risk Scanner',                     desc:'Concentration risk, volatility exposure, liquidity flags — spot every risk before the market moves.' },
  { tag:'RISK BUDGET',   icon:'sliders', color:'#a78bfa', title:'Risk Budget Planner',               desc:'Allocate risk like a pro. See how much of your total portfolio risk each holding is consuming.' },
  { tag:'SET TARGETS',   icon:'target', color:'#f87171', title:'Price Targets per Holding',         desc:'Set exact exit prices for every asset. Track how far away each target is in real time.' },
  { tag:'SELL PLAN',     icon:'clipboard', color:'var(--g-ink)', title:'AI Sell Plan Generator',            desc:'Tell the AI your goal — it builds a staged sell-down plan across your holdings to hit your number.' },
  { tag:'BUY/SELL TIMING',icon:'gauge',color:'var(--g-ink)', title:'Buy & Sell Timing Signal',         desc:'Before you trade, see momentum, price vs 30-day avg, and distance from ATH — get a clear verdict.' },
  { tag:'WHALE ALERTS',  icon:'flow', color:'#22d3ee', title:'Whale & Smart-Money Alerts',        desc:'Live alerts when large wallets move the coins you hold — know what smart money is doing first.' },
  { tag:'PRICE ALERTS',  icon:'bell', color:'#fb923c', title:'Price Alerts',                     desc:'Set a price level, get notified the instant it\'s crossed — no exchange account needed.' },
  { tag:'GOALS',         icon:'award', color:'#fbbf24', title:'Goal-Based Portfolio Tracker',      desc:'Set a target (e.g. $50K by Dec 2026) — track progress with a live ring, DCA calc & probability badge.' },
  { tag:'MARKET MOOD',   icon:'thermometer', color:'#f87171', title:'Fear & Greed Gauge',               desc:'Real-time market sentiment scored from live crypto headlines — know the crowd\'s emotion before you trade.' },
  { tag:'SECTOR MAP',    icon:'map', color:'#818cf8', title:'Sector Rotation Heatmap',          desc:'L1, L2, DeFi, AI, Gaming, Meme — each sector colour-coded by 7-day performance so you follow the money.' },
  { tag:'CORRELATION',   icon:'grid', color:'#60a5fa', title:'30-Day Correlation Matrix',         desc:'See which holdings move together. If BTC and ETH are 0.97 correlated you are less diversified than you think.' },
  { tag:'ACADEMY',       icon:'graduation', color:'var(--g-ink)', title:'WalletLens Academy',                desc:'Free lessons on investing, risk, and reading the market — go from beginner to confident at your own pace.' },
  { tag:'INVESTMENT HACKS',icon:'lightbulb',color:'#fbbf24', title:'Investment Hacks & Tips',          desc:'Bite-sized, actionable tips — DCA, rebalancing, tax-lot thinking & risk control — to invest smarter.' },
  { tag:'VOICE',         icon:'mic', color:'var(--g-ink)', title:'Voice Trade Import',               desc:'Say "I bought 0.5 BTC at 60K" and WalletLens logs it. Crypto, stocks, gold & more. Multiple trades at once.' },
  { tag:'SCREENSHOT',    icon:'camera', color:'#f472b6', title:'Screenshot Import',                desc:'Snap your exchange or wallet screen — AI reads every holding and logs your trades. No typing.' },
  { tag:'PRIVACY',       icon:'lock', color:'#3b82f6', title:'100% Private — No Server',         desc:'Everything stays on your device. No account, no cloud, no tracking. Your data is yours alone.' },
  { tag:'FREE',          icon:'award', color:'#fb923c', title:'Free Forever — No Catch',          desc:'No subscription, no fees, no exchange referral codes. A pure net worth tracker that works for you.' },
]

const FS_SLIDE_MS = 4500

const FeatureSlideshow = memo(function FeatureSlideshow() {
  const [idx, setIdx]         = useState(0)
  const [dir, setDir]         = useState(1)
  const [animKey, setAnimKey] = useState(0)
  const [paused, setPaused]   = useState(false)
  const touchX = useRef(null)

  const goTo = useCallback((newIdx, direction) => {
    setDir(direction); setIdx(newIdx); setAnimKey(k => k + 1)
  }, [])

  const next = useCallback(() => goTo((idx + 1) % FEATURE_SLIDES.length,  1), [idx, goTo])
  const prev = useCallback(() => goTo((idx - 1 + FEATURE_SLIDES.length) % FEATURE_SLIDES.length, -1), [idx, goTo])

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setDir(1); setIdx(i => (i + 1) % FEATURE_SLIDES.length); setAnimKey(k => k + 1)
    }, FS_SLIDE_MS)
    return () => clearInterval(id)
  }, [paused])

  const slide = FEATURE_SLIDES[idx]
  return (
    <div style={{ margin:'0 auto 1.25rem', width:'100%', userSelect:'none' }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; setPaused(true) }}
      onTouchEnd={e => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 28) { if (dx < 0) next(); else prev() }
        touchX.current = null; setPaused(false)
      }}
    >
      <div style={{ position:'relative', padding:'0 20px' }}>
        <button onClick={prev} aria-label="Previous" style={{
          position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', zIndex:3,
          width:30, height:30, borderRadius:'50%', border:`1px solid ${slide.color}40`,
          cursor:'pointer', background:'var(--surface-1)', color:slide.color,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', lineHeight:1,
          boxShadow:`0 0 12px ${slide.color}22`, transition:'all 0.3s',
        }}>‹</button>

        <div key={animKey} style={{
          position:'relative', borderRadius:18,
          border:`1.5px solid ${slide.color}38`,
          background:`linear-gradient(160deg,${slide.color}14,${slide.color}06 55%, transparent)`,
          padding:'1.4rem 1.1rem 1.15rem', minHeight:172,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          textAlign:'center', overflow:'hidden',
          boxShadow:`0 8px 30px ${slide.color}1a, inset 0 1px 0 ${slide.color}22`,
          animation:`${dir > 0 ? 'fs-in-right' : 'fs-in-left'} 0.4s cubic-bezier(0.22,1,0.36,1) both`,
        }}>
          {/* Animated aurora blob background */}
          <div className="fs-aurora" aria-hidden="true" style={{
            position:'absolute', top:'-40%', left:'-20%', width:'140%', height:'180%',
            background:`radial-gradient(closest-side, ${slide.color}30, transparent 70%)`,
            filter:'blur(26px)', opacity:0.8, pointerEvents:'none',
            animation:'fs-aurora 14s linear infinite',
          }} />
          {/* Glowing orb behind icon */}
          <div style={{ position:'relative', marginBottom:'0.55rem' }}>
            <div className="fs-orb" aria-hidden="true" style={{
              position:'absolute', inset:'-14px', borderRadius:'50%',
              background:`radial-gradient(circle, ${slide.color}55, transparent 68%)`,
              filter:'blur(8px)', animation:'fs-orb 3.2s ease-in-out infinite',
            }} />
            <div className="fs-icon" style={{
              position:'relative', fontSize:'2.2rem', lineHeight:1, color:slide.color,
              animation:'fs-icon-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) both',
              filter:`drop-shadow(0 3px 8px ${slide.color}66)`,
            }}>{slide.icon.length <= 2 ? slide.icon : <Icon name={slide.icon} size={38} />}</div>
          </div>

          {/* Tag with shimmer sweep */}
          <span style={{
            position:'relative', fontSize:'0.58rem', fontWeight:800, letterSpacing:'0.12em',
            textTransform:'uppercase', color:slide.color, borderRadius:5,
            padding:'0.2rem 0.55rem', marginBottom:'0.55rem', display:'inline-block',
            border:`1px solid ${slide.color}40`, overflow:'hidden',
            background:`linear-gradient(100deg, ${slide.color}14 30%, ${slide.color}40 50%, ${slide.color}14 70%)`,
            backgroundSize:'250% 100%', animation:'fs-tag-shine 2.6s linear infinite',
          }}>{slide.tag}</span>

          <div style={{ fontWeight:800, fontSize:'0.98rem', color:'var(--text)', marginBottom:'0.4rem', lineHeight:1.3, animation:'fs-rise 0.5s 0.05s ease both' }}>{slide.title}</div>
          <div style={{ fontSize:'0.77rem', color:'var(--text-muted)', lineHeight:1.6, maxWidth:290, animation:'fs-rise 0.5s 0.12s ease both' }}>{slide.desc}</div>

          {/* Auto-advance progress bar */}
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:`${slide.color}18` }}>
            <div className="fs-bar" key={`bar-${animKey}-${paused}`} style={{
              height:'100%', background:slide.color, borderRadius:'0 2px 2px 0',
              boxShadow:`0 0 8px ${slide.color}`,
              animation: paused ? 'none' : `fs-bar ${FS_SLIDE_MS}ms linear both`,
            }} />
          </div>
        </div>

        <button onClick={next} aria-label="Next" style={{
          position:'absolute', right:0, top:'50%', transform:'translateY(-50%)', zIndex:3,
          width:30, height:30, borderRadius:'50%', border:`1px solid ${slide.color}40`,
          cursor:'pointer', background:'var(--surface-1)', color:slide.color,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', lineHeight:1,
          boxShadow:`0 0 12px ${slide.color}22`, transition:'all 0.3s',
        }}>›</button>
      </div>

      {/* Counter + dot nav */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem', marginTop:'0.7rem' }}>
        <span style={{ fontSize:'0.62rem', fontWeight:700, color:'var(--text-sub)', minWidth:38, textAlign:'right' }}>
          {String(idx + 1).padStart(2,'0')}<span style={{ opacity:0.5 }}> / {FEATURE_SLIDES.length}</span>
        </span>
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:'0.18rem', flexWrap:'nowrap' }}>
          {FEATURE_SLIDES.map((_, i) => (
            <button key={i} aria-label={`Slide ${i + 1}`} onClick={() => goTo(i, i > idx ? 1 : -1)} style={{
              width: i === idx ? 14 : 5, height:5, borderRadius:3, flexShrink:0,
              border:'none', cursor:'pointer', padding:0,
              background: i === idx ? slide.color : 'rgba(var(--g-rgb),0.2)',
              boxShadow: i === idx ? `0 0 8px ${slide.color}` : 'none',
              transition:'all 0.3s',
            }} />
          ))}
        </div>
      </div>
    </div>
  )
})

// ── Onboarding tutorial — animated vertical timeline that tracks REAL
// progress (wallet created, first trade, holdings, AI viewed). Shown on the
// ── Feature discovery nudge strip ────────────────────────────────────────
const FN_DISMISS_KEY = 'wl_fn_dismissed_v1'
function FeatureNudgeStrip({ onGoToTargets, onGoToVision, onWeeklyReport }) {
  const [visible, setVisible] = useState(() => !localStorage.getItem(FN_DISMISS_KEY))
  if (!visible) return null
  function dismiss() { localStorage.setItem(FN_DISMISS_KEY, '1'); setVisible(false); track('feature_nudge_dismissed') }
  const items = [
    { emoji: 'target', label: 'Price Targets', action: () => { onGoToTargets(); dismiss() } },
    { emoji: 'map', label: 'Goals', action: () => { onGoToVision(); dismiss() } },
    { emoji: 'calendar', label: 'Weekly Report', action: () => { onWeeklyReport(); dismiss() } },
  ]
  return (
    <div className="fn-strip">
      <span className="fn-strip-label"><Icon name="lightbulb" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />Try</span>
      {items.map((item, i) => (
        <button key={i} className="fn-strip-btn" onClick={() => { track('feature_nudge_click', { feature: item.label }); item.action() }}>
          <Icon name={item.emoji} size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{item.label}
        </button>
      ))}
      <button className="fn-strip-close" onClick={dismiss} aria-label="Dismiss">×</button>
    </div>
  )
}

// Manage tab until all four steps are done or the user skips. ──────────────
function OnboardingTutorial({ wallets, transactions, enriched, aiSeen, onCreateWallet, onAddTrade, onViewDashboard, onOpenAI, onDismiss }) {
  const steps = [
    { key:'wallet', icon:'banknote', label:'Create your wallet', desc:'Name your first portfolio wallet to hold your assets.', done: wallets.length > 0,   cta:{ label:'Create wallet', fn:onCreateWallet } },
    { key:'trade',  icon:'mic', label:'Add your first trade', desc:'Type it, speak it by voice, or import a file — your call.', done: transactions.length > 0, cta:{ label:'Add a trade', fn:onAddTrade } },
    { key:'track',  icon:'bar-chart', label:'Track your net worth', desc:'Live prices, P&L and allocation across crypto, stocks, metals & cash.', done: enriched.length > 0, cta:{ label:'View dashboard', fn:onViewDashboard } },
    { key:'ai',     icon:'sparkles',  label:'Get AI insights', desc:'Risk scanner, price targets and your personal AI advisor.', done: !!aiSeen, cta:{ label:'Open AI Analysis', fn:onOpenAI } },
  ]
  const total = steps.length
  const doneCount = steps.filter(s => s.done).length
  const currentIdx = steps.findIndex(s => !s.done) // -1 when all done
  const allDone = currentIdx === -1
  const pct = Math.round((doneCount / total) * 100)

  return (
    <div className="glass-card dvx-form-card" style={{ position:'relative', overflow:'hidden', padding:'1.6rem 1.25rem 1.4rem' }}>
      {/* Aurora glow background */}
      <div className="ob-anim" aria-hidden="true" style={{
        position:'absolute', top:'-50%', left:'-25%', width:'150%', height:'150%',
        background:'radial-gradient(closest-side, rgba(var(--g-rgb),0.22), transparent 70%)',
        filter:'blur(30px)', pointerEvents:'none', animation:'ob-aurora 16s linear infinite',
      }} />

      {/* Hero */}
      <div style={{ position:'relative', textAlign:'center', marginBottom:'1.3rem' }}>
        <div style={{ position:'relative', display:'inline-flex', justifyContent:'center', marginBottom:'0.7rem' }}>
          <div className="ob-anim" aria-hidden="true" style={{
            position:'absolute', inset:'-16px', borderRadius:'50%',
            background:'radial-gradient(circle, rgba(var(--g-rgb),0.5), transparent 68%)',
            filter:'blur(10px)', animation:'ob-orb 3.4s ease-in-out infinite',
          }} />
          <div className="ob-anim" style={{ position:'relative', animation:'ob-logo-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <Logo size={56} animated />
          </div>
        </div>
        <div style={{ fontWeight:800, fontSize:'1.25rem', color:'var(--text)', marginBottom:'0.25rem' }}>
          {allDone ? "You're all set!" : 'Welcome to WalletLens'}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem', fontSize:'0.62rem', fontWeight:800, letterSpacing:'0.14em', color: 'var(--g-ink)', fontWeight: 700, marginBottom:'0.9rem' }}>
          <span>TRACK</span><span style={{ opacity:0.4 }}>·</span><span>ANALYZE</span><span style={{ opacity:0.4 }}>·</span><span>GROW</span>
        </div>
        {/* Progress bar + counter */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', maxWidth:300, margin:'0 auto' }}>
          <div style={{ flex:1, height:7, borderRadius:4, background:'rgba(var(--g-rgb),0.14)', overflow:'hidden' }}>
            <div className="ob-anim" style={{
              height:'100%', width:`${pct}%`, borderRadius:4,
              background:'linear-gradient(90deg, var(--g), #10b981)',
              boxShadow:'0 0 10px rgba(var(--g-rgb),0.6)',
              transition:'width 0.6s cubic-bezier(0.22,1,0.36,1)', animation:'ob-bar 0.8s ease both',
            }} />
          </div>
          <span style={{ fontSize:'0.72rem', fontWeight:800, color:'var(--text-sub)', whiteSpace:'nowrap' }}>{doneCount} / {total}</span>
        </div>
      </div>

      {/* Vertical timeline */}
      <div style={{ position:'relative' }}>
        {steps.map((s, i) => {
          const isCurrent = i === currentIdx
          const isLast = i === total - 1
          const nodeColor = s.done ? 'var(--g)' : isCurrent ? 'var(--g)' : 'rgba(var(--g-rgb),0.3)'
          return (
            <div key={s.key} className="ob-anim" style={{
              position:'relative', display:'flex', gap:'0.85rem', paddingBottom: isLast ? 0 : '0.95rem',
              animation:`ob-row 0.45s ${(i * 0.09).toFixed(2)}s ease both`,
            }}>
              {/* Connector line */}
              {!isLast && (
                <span aria-hidden="true" style={{
                  position:'absolute', left:15, top:32, bottom:6, width:2, borderRadius:2,
                  background: s.done ? 'var(--g)' : 'rgba(var(--g-rgb),0.18)',
                  boxShadow: s.done ? '0 0 8px rgba(var(--g-rgb),0.5)' : 'none',
                  transition:'background 0.4s',
                }} />
              )}
              {/* Node */}
              <span style={{
                position:'relative', zIndex:1, flexShrink:0, width:32, height:32, borderRadius:'50%',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'0.85rem', fontWeight:800,
                background: s.done ? 'var(--g)' : isCurrent ? 'rgba(var(--g-rgb),0.18)' : 'rgba(var(--g-rgb),0.06)',
                color: s.done ? '#03130c' : nodeColor,
                border:`1.5px solid ${s.done ? 'var(--g)' : isCurrent ? 'var(--g)' : 'rgba(var(--g-rgb),0.25)'}`,
                boxShadow: isCurrent && !s.done ? '0 0 0 4px rgba(var(--g-rgb),0.12), 0 0 14px rgba(var(--g-rgb),0.3)' : 'none',
              }}>
                {s.done
                  ? <svg className="ob-anim" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation:'ob-check 0.4s ease both' }}><polyline points="20 6 9 17 4 12"/></svg>
                  : (s.icon.length <= 2 ? <span style={{ fontSize:'1rem' }}>{s.icon}</span> : <Icon name={s.icon} size={15} />)}
              </span>
              {/* Content */}
              <div style={{
                flex:1, padding:'0.55rem 0.8rem', borderRadius:'12px',
                background: isCurrent ? 'rgba(var(--g-rgb),0.08)' : 'rgba(var(--g-rgb),0.03)',
                border:`1px solid ${isCurrent ? 'rgba(var(--g-rgb),0.3)' : 'rgba(var(--g-rgb),0.1)'}`,
                opacity: s.done ? 0.7 : 1, transition:'all 0.3s',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
                  <span style={{ fontWeight:800, fontSize:'0.88rem', color:'var(--text)', textDecoration: s.done ? 'line-through' : 'none', textDecorationColor:'rgba(var(--g-rgb),0.5)' }}>{s.label}</span>
                  {s.done && <span style={{ fontSize:'0.6rem', fontWeight:800, color: 'var(--g-ink)', fontWeight: 700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Done</span>}
                </div>
                <div style={{ fontSize:'0.74rem', color:'var(--text-muted)', marginTop:'0.15rem', lineHeight:1.45 }}>{s.desc}</div>
                {isCurrent && s.cta && (
                  <button onClick={s.cta.fn} style={{
                    marginTop:'0.6rem', display:'inline-flex', alignItems:'center', gap:'0.4rem',
                    padding:'0.45rem 0.9rem', borderRadius:'9px', border:'none', cursor:'pointer',
                    fontWeight:800, fontSize:'0.8rem', color:'#fff',
                    background:'linear-gradient(135deg, #047857, #10b981)',
                    boxShadow:'0 4px 14px rgba(5,150,105,0.4)',
                  }}>
                    {s.cta.label}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'1.1rem', paddingTop:'0.85rem', borderTop:'1px solid rgba(var(--g-rgb),0.1)' }}>
        <span style={{ fontSize:'0.68rem', color:'var(--text-sub)', display:'inline-flex', alignItems:'center', gap:'0.3rem' }}>
          <Icon name="lock" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Your data stays on your device
        </span>
        <button onClick={onDismiss} style={{ background:'none', border:'none', cursor:'pointer', fontSize:'0.74rem', fontWeight:700, color:'var(--text-muted)' }}>
          {allDone ? 'Dismiss' : 'Skip tour'}
        </button>
      </div>
    </div>
  )
}

function ConstellationMap() {
  const canvasRef = useRef(null)
  const NODES = [
    { symbol:'BTC',  coinId:'bitcoin',  color:'#f7931a', x:0.50, y:0.14 },
    { symbol:'ETH',  coinId:'ethereum', color:'#627eea', x:0.82, y:0.38 },
    { symbol:'GOLD', color:'#ffd700', x:0.68, y:0.80, iconBg:'linear-gradient(135deg,#7a5c00,#c8960c)', svg:'gold' },
    { symbol:'SLVR', color:'#c0c8d8', x:0.18, y:0.72, iconBg:'linear-gradient(135deg,#4a4a4a,#9aa0ac)', svg:'silver' },
    { symbol:'AAPL', color:'#a2aaad',   x:0.12, y:0.32, logo:'https://logo.clearbit.com/apple.com', logoBg:'#000' },
    { symbol:'NVDA', color:'#76b900',   x:0.62, y:0.10, logo:'https://logo.clearbit.com/nvidia.com', logoBg:'#000' },
    { symbol:'USD',  color:'var(--g-ink)', x:0.88, y:0.64, svg:'usd' },
  ]
  // Edges (constellation lines between node indices)
  const EDGES = [[0,1],[1,2],[2,3],[3,4],[4,0],[0,5],[1,5],[1,6],[2,6]]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, raf = 0, t = 0

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // Background twinkle stars
    const STARS = Array.from({ length: 55 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.008 + Math.random() * 0.014,
    }))

    // Cache theme-derived values; refresh only when the theme attribute changes.
    let col = getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#34d399'
    let rgb = getComputedStyle(document.documentElement).getPropertyValue('--g-rgb').trim() || '52,211,153'
    let isLight = document.documentElement.hasAttribute('data-wl-light')

    const themeObserver = new MutationObserver(() => {
      col = getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#34d399'
      rgb = getComputedStyle(document.documentElement).getPropertyValue('--g-rgb').trim() || '52,211,153'
      isLight = document.documentElement.hasAttribute('data-wl-light')
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-wl-light', 'class'] })

    function draw() {
      t += 0.016
      ctx.clearRect(0, 0, w, h)

      // Twinkle stars / dots
      for (const s of STARS) {
        const alpha = 0.15 + 0.5 * (0.5 + 0.5 * Math.sin(s.phase + t * s.speed * 60))
        ctx.beginPath()
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2)
        ctx.fillStyle = isLight ? `rgba(0,0,0,${alpha * 0.35})` : `rgba(255,255,255,${alpha})`
        ctx.fill()
      }

      // Constellation edges — fade in/out per edge with offset phases
      EDGES.forEach(([a, b], i) => {
        const na = NODES[a], nb = NODES[b]
        const ax = na.x * w, ay = na.y * h
        const bx = nb.x * w, by = nb.y * h
        const alpha = 0.08 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.4 + i * 0.9))
        const grad = ctx.createLinearGradient(ax, ay, bx, by)
        grad.addColorStop(0, `rgba(${rgb},${alpha})`)
        grad.addColorStop(0.5, `rgba(${rgb},${alpha * 1.8})`)
        grad.addColorStop(1, `rgba(${rgb},${alpha})`)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1
        ctx.setLineDash([4, 6])
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
        ctx.setLineDash([])
      })

      // Node glow pulses
      NODES.forEach((n, i) => {
        const nx = n.x * w, ny = n.y * h
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.2 + i * 1.1)
        const r = 22 + pulse * 8
        const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, r)
        grad.addColorStop(0, `rgba(${rgb},${0.22 * pulse})`)
        grad.addColorStop(1, 'rgba(128,128,128,0)')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2); ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }

    resize()
    let resizeTimer = null
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 150)
    })
    ro.observe(canvas)
    draw()
    return () => { cancelAnimationFrame(raf); clearTimeout(resizeTimer); ro.disconnect(); themeObserver.disconnect() }
  }, [])

  return (
    <div style={{ position:'relative', width:'100%', height:260, margin:'0 auto 1.5rem' }}>
      <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }} aria-hidden="true" />
      {NODES.map((n, i) => (
        <div key={n.symbol} style={{
          position:'absolute',
          left:`calc(${n.x * 100}% - 18px)`,
          top:`calc(${n.y * 100}% - 18px)`,
          width:36, height:36, borderRadius:'50%',
          background: n.logoBg || n.iconBg || `${n.color}18`,
          border:`1.5px solid ${n.color}70`,
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:`0 0 14px ${n.color}40`,
          overflow:'hidden', zIndex:1,
          animation:`ep-node-pulse 2.4s ${(i * 0.35).toFixed(1)}s ease-in-out infinite`,
        }}>
          {n.logo
            ? <img src={n.logo} alt={n.symbol} width={24} height={24}
                style={{ borderRadius:'50%', objectFit:'contain' }}
                onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='flex' }}
              />
            : null}
          {n.logo
            ? <span style={{ display:'none', fontSize:'0.6rem', fontWeight:800, color:n.color }}>{n.symbol}</span>
            : n.svg === 'gold'
              ? <svg width="30" height="22" viewBox="0 0 30 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* right side face */}
                  <polygon points="22,4 28,7 28,17 22,14" fill="#7a5200"/>
                  {/* front face */}
                  <polygon points="2,7 22,7 22,17 2,17" fill="#c8860a"/>
                  {/* top face */}
                  <polygon points="2,7 22,7 28,4 8,4" fill="#f5c518"/>
                  {/* top shine */}
                  <polygon points="4,4.5 26,4.5 28,4 8,4" fill="rgba(255,255,255,0.35)"/>
                  {/* emboss border on front */}
                  <polygon points="4,9 20,9 20,15 4,15" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.7"/>
                  {/* text FINE GOLD */}
                  <text x="12" y="12.2" textAnchor="middle" fontSize="3" fill="rgba(0,0,0,0.45)" fontFamily="Arial" fontWeight="bold" letterSpacing="0.3">FINE GOLD</text>
                  <text x="12" y="15" textAnchor="middle" fontSize="2.4" fill="rgba(0,0,0,0.35)" fontFamily="Arial">999.9</text>
                </svg>
              : n.svg === 'silver'
                ? <svg width="30" height="22" viewBox="0 0 30 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* right side face */}
                    <polygon points="22,4 28,7 28,17 22,14" fill="#4a4a55"/>
                    {/* front face */}
                    <polygon points="2,7 22,7 22,17 2,17" fill="#8a9099"/>
                    {/* top face */}
                    <polygon points="2,7 22,7 28,4 8,4" fill="#d8dde6"/>
                    {/* top shine */}
                    <polygon points="4,4.5 26,4.5 28,4 8,4" fill="rgba(255,255,255,0.5)"/>
                    {/* emboss border on front */}
                    <polygon points="4,9 20,9 20,15 4,15" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="0.7"/>
                    {/* text FINE SILVER */}
                    <text x="12" y="12.2" textAnchor="middle" fontSize="2.6" fill="rgba(0,0,0,0.4)" fontFamily="Arial" fontWeight="bold" letterSpacing="0.2">FINE SILVER</text>
                    <text x="12" y="15" textAnchor="middle" fontSize="2.4" fill="rgba(0,0,0,0.3)" fontFamily="Arial">999.9</text>
                  </svg>
                : n.svg === 'usd'
                  ? <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="14" cy="14" r="13" fill="#1a3a1a" stroke="#22c55e" strokeWidth="1.5"/>
                      <text x="14" y="19" textAnchor="middle" fontSize="16" fill="#22c55e" fontFamily="Arial" fontWeight="bold">$</text>
                    </svg>
                  : n.icon
                    ? <span style={{ fontSize:'1.1rem', lineHeight:1 }}>{n.icon}</span>
                    : <CoinLogo coinId={n.coinId} symbol={n.symbol} size={28} className="coin-logo" />
          }
        </div>
      ))}
    </div>
  )
}

// Map an interest id (from InterestPicker) to a quick-add prefill category.
const INTEREST_TO_CAT = { crypto:'crypto', stablecoins:'crypto', stocks:'stock', etfs:'stock', gold:'gold', silver:'gold', cash:'fiat' }
function readInterests() {
  try { const v = JSON.parse(localStorage.getItem('wl_interests') || 'null'); return Array.isArray(v) ? v : [] }
  catch { return [] }
}
// Personalize the quick-add chips from the classes the user said they track:
// show only those classes when that still yields a usable set, otherwise just
// lead with them. Returns the full list when no interests are set.
function orderQuickAdd(list) {
  const interests = readInterests()
  if (!interests.length) return list
  const wanted = new Set(interests.map(i => INTEREST_TO_CAT[i]).filter(Boolean))
  const ordered = list.map((a, i) => [a, i]).sort((x, y) => {
    const xm = wanted.has(x[0].prefill.category) ? 0 : 1
    const ym = wanted.has(y[0].prefill.category) ? 0 : 1
    return xm - ym || x[1] - y[1] // stable: keep original order within a group
  }).map(p => p[0])
  // Hide the classes they didn't pick — but only when enough shortcuts remain.
  const matched = ordered.filter(a => wanted.has(a.prefill.category))
  return matched.length >= 2 ? matched : ordered
}

const QUICK_ADD_ASSETS = [
  { label:'USDT', imgSrc:'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/usdt.svg', prefill:{ category:'crypto', coin:{ id:'tether',   symbol:'USDT', name:'Tether'   } } },
  { label:'USDC', imgSrc:'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/usdc.svg', prefill:{ category:'crypto', coin:{ id:'usd-coin', symbol:'USDC', name:'USD Coin' } } },
  { label:'BTC',  imgSrc:'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/btc.svg',  prefill:{ category:'crypto', coin:{ id:'bitcoin',  symbol:'BTC',  name:'Bitcoin'  } } },
  { label:'ETH',  imgSrc:'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/eth.svg',  prefill:{ category:'crypto', coin:{ id:'ethereum', symbol:'ETH',  name:'Ethereum' } } },
  { label:'Gold', useGoldLogo:true, prefill:{ category:'gold' } },
  { label:'NVDA', bg:'#000', icon:'NVDA', iconColor:'#76b900', iconSize:'0.42rem', prefill:{ category:'stock', stockTicker:'NVDA' } },
  { label:'AAPL', bg:'#1d1d1f', icon:'AAPL', iconColor:'#fff',  iconSize:'0.42rem', prefill:{ category:'stock', stockTicker:'AAPL' } },
]

// Header shield shown when Portfolio Guardian is active. Colour + days-left
// reflect the countdown; tapping opens Settings to manage it.
function GuardianBadge() {
  const navigate = useNavigate()
  const [g, setG] = useState(() => { try { return JSON.parse(localStorage.getItem('wl_guardian') || 'null') } catch { return null } })
  useEffect(() => {
    const refresh = () => { try { setG(JSON.parse(localStorage.getItem('wl_guardian') || 'null')) } catch {} }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  if (!g?.active) return null
  const elapsed = g.lastCheckin ? (Date.now() - new Date(g.lastCheckin).getTime()) / 86400000 : 0
  const daysLeft = Math.max(0, Math.ceil((g.intervalDays || 0) - elapsed))
  const state = daysLeft <= 2 ? 'urgent' : daysLeft <= 7 ? 'warning' : 'ok'
  return (
    <button
      className={`dvx-eye-btn dvx-guardian-badge dvx-guardian-${state}`}
      title={`Portfolio Guardian active — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left. Opening the app resets it. Tap to manage.`}
      onClick={() => { track('guardian_badge_click'); navigate('/settings') }}
      aria-label="Portfolio Guardian active"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span className="dvx-guardian-days">{daysLeft}</span>
    </button>
  )
}

function EmptyPortfolio({ onAddTrade, onImportAction, onQuickAdd, navigate, loaded, importsSlot }) {
  if (!loaded) return null

  return (
    <div style={{ textAlign:'center', padding:'2rem 1rem 1.5rem', position:'relative', overflow:'hidden', marginTop:'0.5rem' }}>

      {/* Feature slideshow */}
      <FeatureSlideshow />

      {/* Headline */}
      <div style={{ fontWeight:800, fontSize:'1.25rem', color:'var(--text)', marginBottom:'0.5rem', lineHeight:1.3 }}>
        Start your first trade
      </div>
      <div style={{ fontSize:'0.875rem', color:'var(--text-muted)', marginBottom:'1.1rem', lineHeight:1.65 }}>
        Track crypto, stocks &amp; metals.<br/>Unlock AI signals, risk scores &amp; live charts.
      </div>

      {/* Guided walkthrough launcher — starts the step-by-step arrow tour */}
      <button
        className="wl-guide-cta"
        onClick={() => { track('add_asset_guide_open', { source: 'empty_state' }); window.dispatchEvent(new Event('wl:add-asset-guide')) }}>
        <span className="wl-guide-cta-ico" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.2l1.7 5.1a3 3 0 0 0 1.9 1.9l5.1 1.7-5.1 1.7a3 3 0 0 0-1.9 1.9L12 19.6l-1.7-5.1a3 3 0 0 0-1.9-1.9L3.3 10.9l5.1-1.7a3 3 0 0 0 1.9-1.9L12 2.2z"/>
            <path d="M19 3.5l.55 1.65a1 1 0 0 0 .63.63L21.8 6.3l-1.62.52a1 1 0 0 0-.63.63L19 9.1l-.55-1.65a1 1 0 0 0-.63-.63L16.2 6.3l1.62-.52a1 1 0 0 0 .63-.63L19 3.5z" opacity=".85"/>
          </svg>
        </span>
        <span className="wl-guide-cta-text">
          <strong>Show me how</strong>
          <span>Step-by-step guided tour</span>
        </span>
        <span className="wl-guide-cta-badge" aria-hidden="true">GUIDED</span>
        <span className="wl-guide-cta-arrow" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </span>
      </button>

      {/* Primary import boxes — every method lives here (the duplicate cards
          that used to sit below have been removed). */}
      {(() => {
        const boxStyle = {
          display: 'flex', alignItems: 'center', gap: '0.45rem',
          padding: '0.7rem 0.75rem', borderRadius: '12px', cursor: 'pointer',
          background: 'rgba(var(--g-rgb),0.1)', border: '1.5px solid rgba(var(--g-rgb),0.3)',
          color: 'var(--g-ink)', fontWeight: 700, fontSize: '0.82rem',
          transition: 'background 0.15s',
        }
        return (
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem',
        marginBottom: '1.25rem',
      }}>
        <button data-tour="add-asset" onClick={onAddTrade} style={boxStyle}>
          <span style={{ fontSize: '1rem', fontWeight: 700 }}>+</span> Start adding assets
        </button>
        <button onClick={() => onImportAction('screenshot')} style={boxStyle}>
          <Icon name="camera" size={15} /> Import from screenshot
        </button>
        <button onClick={() => onImportAction('excel')} style={boxStyle}>
          <Icon name="bar-chart" size={15} /> Import Excel
        </button>
        <button onClick={() => onImportAction('voice')} style={boxStyle}>
          <Icon name="mic" size={15} /> Voice import
        </button>
        <button onClick={() => onImportAction('backup')} style={boxStyle}>
          <Icon name="folder" size={15} /> Import backup
        </button>
      </div>
        )
      })()}

      {/* Import buttons (Excel / Voice) */}
      {importsSlot}

      {/* Quick-add chips */}
      <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text-sub)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.55rem' }}>
        Or quickly add
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:'0.45rem', marginBottom:'1.25rem' }}>
        {orderQuickAdd(QUICK_ADD_ASSETS).map(a => {
          const goldLogo = a.useGoldLogo ? THEMES.find(t => t.id === 'gold')?.logo : null
          return (
            <button key={a.label} onClick={() => onQuickAdd(a.prefill)} style={{
              display:'inline-flex', alignItems:'center', gap:'0.38rem',
              padding:'0.42rem 0.8rem', borderRadius:'50px',
              background:'var(--surface-1)',
              border:'1.5px solid rgba(var(--g-rgb),0.18)',
              color:'var(--text)', fontWeight:700, fontSize:'0.8rem', cursor:'pointer',
              transition:'border-color 0.15s, background 0.15s',
            }}>
              {a.imgSrc || goldLogo
                ? <img
                    src={a.imgSrc
                      ? `https://walletlens-voice-parse.tia8910.deno.net/proxy?url=${encodeURIComponent(a.imgSrc)}`
                      : goldLogo}
                    onError={e => { if (a.imgSrc && !e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = '1'; e.currentTarget.src = a.imgSrc } }}
                    alt={a.label} style={{ width:22, height:22, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                : <span style={{
                    width:22, height:22, borderRadius:'50%', background:a.bg,
                    display:'inline-flex', alignItems:'center', justifyContent:'center',
                    fontSize:a.iconSize || '0.6rem', color:a.iconColor || 'white', fontWeight:800, flexShrink:0,
                  }}>{a.icon}</span>
              }
              <span style={{ color: 'var(--g-ink)', fontWeight: 700, fontWeight:800, fontSize:'0.75rem', marginRight:1 }}>+</span>
              {a.label}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize:'0.72rem', color:'var(--text-sub)' }}>
        Your data stays on your device — no account needed
      </div>
    </div>
  )
}

// ── Tools Tab (AI + Risk Scanner + Wallet Eval) ──────────────────────────
function ToolsTab({ enriched, prices, transactions, totalValue, isDemo, pricesLoading, coinTargets, initialTool }) {
  const [tool, setTool] = useState(initialTool || 'ai')
  const subTabs = [
    { id: 'ai',     label: 'AI Analysis' },
    { id: 'ta',     label: 'Technicals' },
    { id: 'risk',   label: 'Risk Scanner' },
  ]
  return (
    <div>
      <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', background:'var(--surface-1)', borderRadius:'12px', padding:'0.3rem' }}>
        {subTabs.map(s => (
          <button key={s.id} onClick={() => setTool(s.id)} style={{
            flex:1, padding:'0.45rem', borderRadius:'9px', border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.8rem',
            background: tool === s.id ? 'rgba(var(--g-rgb),0.18)' : 'none',
            color: tool === s.id ? 'var(--g-ink)' : 'var(--text-muted)',
            transition:'all 0.15s',
          }}>{s.label}</button>
        ))}
      </div>
      {tool === 'ai'     && <AIPanel enriched={enriched} prices={prices} transactions={transactions} totalValue={totalValue} isDemo={isDemo} pricesLoading={pricesLoading} />}
      {tool === 'ta'     && <Suspense fallback={<TabFallback />}><MagicAnalysisPanel enriched={isDemo ? [] : enriched} totalValue={totalValue} /></Suspense>}
      {tool === 'risk'   && <Suspense fallback={<TabFallback />}><LiquidityRisk holdings={(isDemo ? [] : enriched).map(h => ({ id: h.coin_id, coin_id: h.coin_id, symbol: h.coin_symbol, coin_symbol: h.coin_symbol, value: h.value }))} /><RiskScanner enriched={isDemo ? [] : enriched} /></Suspense>}
    </div>
  )
}

// ── Targets Tab ──────────────────────────────────────────────────────────
function fmtQty(n) {
  if (!n && n !== 0) return '0'
  return n.toFixed(4).replace(/\.?0+$/, '') || '0'
}

// Sell-target reality check — "is this target reasonable, and how long might it
// take?" Local heuristic (ATH + past-year pace + trend) with an optional AI take.
const VOICE_ENDPOINT = 'https://walletlens-voice-parse.tia8910.deno.net/'
function TargetRealityCheck({ coinId, coinSymbol, coinName, currentPrice, targetPrice, assetClass, compact = false }) {
  const [data, setData] = useState(null)
  const [ai, setAi] = useState({ state: 'idle' })

  useEffect(() => {
    let alive = true
    fetchTargetData(coinId).then(d => { if (alive) setData(d) }).catch(() => {})
    return () => { alive = false }
  }, [coinId])

  const analysis = useMemo(
    () => (targetPrice > 0 ? analyzeTarget({ symbol: coinSymbol, currentPrice, targetPrice, ath: data?.ath, change30d: data?.change30d, oneYearReturnPct: data?.oneYearReturnPct }) : null),
    [coinSymbol, currentPrice, targetPrice, data]
  )
  if (!analysis) return null

  async function askAi() {
    setAi({ state: 'loading' })
    track('target_ai_analysis', { coin_id: coinId })
    try {
      const resp = await fetch(VOICE_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'target_analysis', symbol: coinSymbol, name: coinName, current: currentPrice, target: targetPrice, ath: data?.ath, oneYearReturnPct: data?.oneYearReturnPct, volatilityPct: data?.volatilityPct, assetClass }),
      })
      const j = await resp.json().catch(() => ({}))
      if (resp.ok && j.ok && j.analysis) setAi({ state: 'done', ...j.analysis })
      else setAi({ state: 'error' })
    } catch { setAi({ state: 'error' }) }
  }

  if (compact) {
    return (
      <div className="dvx-trc dvx-trc-compact" style={{ '--trc': analysis.color }}>
        <span className="dvx-trc-badge">{analysis.label}</span>
        {analysis.timeframe && <span className="dvx-trc-compact-tf">{analysis.timeframe}</span>}
      </div>
    )
  }

  return (
    <div className="dvx-trc" style={{ '--trc': analysis.color }}>
      <div className="dvx-trc-head">
        <span className="dvx-trc-badge">{analysis.label}</span>
        <span className="dvx-trc-req">{analysis.requiredPct >= 0 ? '+' : ''}{analysis.requiredPct.toFixed(0)}% away</span>
      </div>
      <div className="dvx-trc-line">{analysis.context}</div>
      {analysis.timeframe && <div className="dvx-trc-line"><Icon name="clock" size={12} style={{ verticalAlign:'-1px', marginRight:'0.3em' }} />{analysis.timeframe}</div>}
      {analysis.trend && <div className="dvx-trc-line dvx-trc-sub">{analysis.trend}</div>}
      {ai.state === 'done' && ai.reasoning && (
        <div className="dvx-trc-ai"><Icon name="sparkles" size={12} style={{ verticalAlign:'-1px', marginRight:'0.3em' }} /><strong>{ai.verdict || 'AI'}{ai.timeframe ? ` · ${ai.timeframe}` : ''}</strong><br />{ai.reasoning}</div>
      )}
      <div className="dvx-trc-foot">
        {ai.state !== 'done' && (
          <button type="button" className="dvx-trc-ai-btn" onClick={askAi} disabled={ai.state === 'loading'}>
            {ai.state === 'loading' ? 'Analyzing…' : ai.state === 'error' ? 'Retry AI take' : '✨ Ask AI for a deeper take'}
          </button>
        )}
        <span className="dvx-trc-disclaimer">Rough estimate — not a prediction or financial advice.</span>
      </div>
    </div>
  )
}

function TargetsTab({ enriched, targetsAnalysis, coinTargets, prices, onTargetsChange }) {
  const navigate = useNavigate()
  const [adding, setAdding] = useState({}) // coinId → { price, mode, pct, qty }

  // Pegged assets (fiat cash + stablecoins) have no sell target — exclude both.
  const targetable = enriched.filter(h => categorizeAsset(h) !== 'cash' && !isStablecoin(h.coin_id, h.coin_symbol))

  async function saveTarget(coinId, priceVal, qtyVal, currentPrice = 0) {
    const p = parseFloat(priceVal)
    const q = parseFloat(qtyVal)
    if (!p || p <= 0) return
    if (!q || q <= 0) return
    // A price target is a "sell higher" goal — reject anything at or below the
    // current market price so users can't set an already-met / downside target.
    if (currentPrice > 0 && p <= currentPrice) return
    await api.addCoinTarget(coinId, { price: p, quantity: q })
    track('goal_set', { coin_id: coinId, target_price: p, qty: q })
    setAdding(prev => { const n = { ...prev }; delete n[coinId]; return n })
    onTargetsChange()
  }

  async function removeTarget(coinId, targetId) {
    await api.removeCoinTargetItem(coinId, targetId)
    track('target_deleted', { coin_id: coinId })
    onTargetsChange()
  }

  // Summary stats
  const { totalTargets, totalReached, totalPotentialProceeds, chartData, rows, rowsWithTargets } = targetsAnalysis

  // Fire a one-time "you reached your target" alert per target as it's hit.
  useEffect(() => {
    const reached = []
    const activeIds = []
    for (const r of rows) {
      for (const t of r.targets) {
        activeIds.push(String(t.id))
        if (t.reached) reached.push({ id: String(t.id), symbol: r.coinSymbol, price: t.price })
      }
    }
    if (activeIds.length) notifyTargetsReached(reached, activeIds)
  }, [rows])

  return (
    <div className="dvx-targets-page">
      {/* Summary cards */}
      <div className="dvx-stats-row">
        <StatCard label="Total Targets" value={totalTargets} />
        <StatCard label="Reached" value={totalReached} color={totalReached > 0 ? 'var(--g)' : undefined} />
        <StatCard label="Potential Proceeds"
          value={`$${totalPotentialProceeds >= 1000 ? (totalPotentialProceeds/1000).toFixed(1)+'k' : fmt(totalPotentialProceeds)}`}
          color="var(--g)" />
        <StatCard label="Assets Planned" value={`${rowsWithTargets} / ${rows.length}`} />
      </div>

      {/* Sell targets table — asset × Target 1, 2, 3… */}
      {rows.length > 0 && (() => {
        const maxTargets = rows.reduce((m, r) => Math.max(m, r.targets.length), 0)
        if (maxTargets === 0) return null
        return (
          <div className="glass-card">
            <h3 style={{ margin:'0 0 0.85rem' }}>Sell Targets Plan</h3>
            <div className="dvx-tgt-table-wrap">
              <table className="dvx-tgt-table">
                <thead>
                  <tr>
                    <th className="dvx-tgt-th-asset">Asset</th>
                    {Array.from({ length: maxTargets }, (_, i) => (
                      <th key={i}>Target {i + 1}</th>
                    ))}
                    <th className="dvx-tgt-th-total">Total Projected</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    if (r.targets.length === 0) {
                      return (
                        <tr key={r.coinId}>
                          <td className="dvx-tgt-td-asset">
                            <strong>{r.coinSymbol?.toUpperCase()}</strong>
                            <span className="dvx-tgt-now">{r.currentPrice > 0 ? `$${fmt(r.currentPrice)}` : '—'}</span>
                          </td>
                          <td colSpan={maxTargets + 1} className="dvx-tgt-empty" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No targets yet — scroll down to add
                          </td>
                        </tr>
                      )
                    }
                    const totalProjected = r.targets.reduce((s, t) => s + t.proceeds, 0)
                    return (
                    <tr key={r.coinId}>
                      <td className="dvx-tgt-td-asset">
                        <strong>{r.coinSymbol?.toUpperCase()}</strong>
                        <span className="dvx-tgt-now">{r.currentPrice > 0 ? `$${fmt(r.currentPrice)}` : '—'}</span>
                      </td>
                      {Array.from({ length: maxTargets }, (_, i) => {
                        const t = r.targets[i]
                        if (!t) return <td key={i} className="dvx-tgt-empty">—</td>
                        const sellPct = r.amount > 0 ? (t.sellQty / r.amount) * 100 : 0
                        return (
                          <td key={i} className={t.reached ? 'dvx-tgt-cell-reached' : ''}>
                            <span className="dvx-tgt-price">${fmt(t.price)}</span>
                            <span className="dvx-tgt-meta">
                              {t.reached ? '✓ reached' : `sell ${sellPct.toFixed(0)}% · ${fmtQty(t.sellQty)} ${r.coinSymbol.toUpperCase()}`}
                            </span>
                          </td>
                        )
                      })}
                      <td className="dvx-tgt-td-total">${fmt(totalProjected)}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* All holdings — show target state + add form for each (stablecoins excluded — no sell target) */}
      {targetable.length === 0 ? (
        <div className="glass-card" style={{ textAlign:'center', padding:'2.5rem 1.5rem' }}>
          <div style={{ fontSize:'2rem', marginBottom:'0.75rem', opacity:0.4 }}>{Ico.target}</div>
          <p style={{ color:'var(--text-muted)', marginBottom:'1rem' }}>Add holdings first to set price targets.</p>
          <button className="dvx-btn dvx-btn-primary" onClick={() => navigate('/transactions')}>Add Trade</button>
        </div>
      ) : (
        targetable.map(h => {
          const plan = coinTargets[h.coin_id]?.targets || []
          const currentPrice = h.price
          const isAdding = !!adding[h.coin_id]
          const addState = adding[h.coin_id] || {}
          // How much of the holding is already committed to existing targets,
          // and what's left to allocate to a new target.
          const plannedQty = plan.reduce((s, t) => s + (t.quantity == null ? h.amount : Math.min(t.quantity, h.amount)), 0)
          const available  = Math.max(0, h.amount - plannedQty)
          const plannedPct = h.amount > 0 ? Math.min(100, (plannedQty / h.amount) * 100) : 0
          // New-target quantity from the chosen mode (% of available, or typed qty)
          const addMode = addState.mode || 'pct'
          const addQty  = addMode === 'pct'
            ? available * (Number(addState.pct ?? 100)) / 100
            : Math.max(0, Math.min(parseFloat(addState.qty) || 0, available))
          const remainingAfter = Math.max(0, available - addQty)
          // A target only makes sense above the current price — flag when it isn't.
          const addPriceNum = parseFloat(addState.price)
          const priceTooLow = addPriceNum > 0 && currentPrice > 0 && addPriceNum <= currentPrice

          return (
            <div key={h.coin_id} className="glass-card dvx-target-card">
              {/* Holding header */}
              <div className="dvx-target-header">
                <div className="dvx-target-coin" style={{ cursor:'pointer' }}
                  onClick={() => navigate(`/asset/${encodeURIComponent(h.coin_id)}`)}>
                  <CoinLogo coinId={h.coin_id} symbol={h.coin_symbol} image={h.coin_image} size={36} className="dvx-holding-icon" />
                  <div>
                    <strong style={{ color:'var(--text)' }}>{h.coin_symbol?.toUpperCase()}</strong>
                    <div className="muted" style={{ fontSize:'0.72rem' }}>
                      {currentPrice > 0 ? `$${fmt(currentPrice)}` : '—'} · {Number(h.amount).toLocaleString(undefined, { maximumFractionDigits:6 })} held
                      {h.value > 0 && ` · $${fmt(h.value)}`}
                    </div>
                    {plannedQty > 0 && (
                      <div style={{ fontSize:'0.7rem', color:'var(--text-sub)', marginTop:'0.1rem' }}>
                        {plannedPct.toFixed(0)}% planned · {parseFloat(available.toFixed(6))} {h.coin_symbol?.toUpperCase()} left
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="dvx-btn dvx-btn-primary"
                  style={{ padding:'0.35rem 0.8rem', fontSize:'0.75rem' }}
                  disabled={!isAdding && available <= 0}
                  onClick={() => setAdding(prev => prev[h.coin_id] ? (({ [h.coin_id]: _, ...rest }) => rest)(prev) : { ...prev, [h.coin_id]: { price:'', mode:'pct', pct:100 } })}>

                  {isAdding ? 'Cancel' : '+ Target'}
                </button>
              </div>

              {/* Inline add-target form */}
              {isAdding && (
                <div className="dvx-tgt-form">
                  <div className="dvx-tgt-form-row">
                    <div style={{ flex:'1 1 120px' }}>
                      <div className="dvx-tgt-form-lbl">Target Price ($)</div>
                      <input
                        type="number" placeholder="e.g. 75000" min="0" step="any"
                        value={addState.price || ''}
                        onChange={e => setAdding(prev => ({ ...prev, [h.coin_id]: { ...prev[h.coin_id], price: e.target.value } }))}
                        style={{ width:'100%', background:'var(--surface-2)', border:`1px solid ${priceTooLow ? 'rgba(239,68,68,0.6)' : 'rgba(var(--g-rgb),0.3)'}`, borderRadius:8, padding:'0.5rem 0.6rem', color:'var(--text)', fontSize:'0.9rem' }}
                      />
                      {priceTooLow && (
                        <div style={{ fontSize:'0.72rem', color:'#ef4444', marginTop:'0.35rem' }}>
                          Target must be higher than the current price ({`$${fmt(currentPrice)}`}).
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="dvx-tgt-form-lbl">How much to sell at this target</div>
                    {/* Mode toggle: percentage or exact quantity */}
                    <div className="dvx-tgt-mode-row">
                      <button type="button" className={`dvx-tgt-mode-btn ${addMode === 'pct' ? 'active' : ''}`}
                        onClick={() => setAdding(prev => ({ ...prev, [h.coin_id]: { ...prev[h.coin_id], mode:'pct', pct: prev[h.coin_id]?.pct ?? 100 } }))}>
                        Percentage
                      </button>
                      <button type="button" className={`dvx-tgt-mode-btn ${addMode === 'qty' ? 'active' : ''}`}
                        onClick={() => setAdding(prev => ({ ...prev, [h.coin_id]: { ...prev[h.coin_id], mode:'qty' } }))}>
                        Quantity
                      </button>
                    </div>
                    {addMode === 'pct' ? (
                      <div className="dvx-tgt-pct-row">
                        {[25, 50, 75, 100].map(p => (
                          <button key={p} type="button"
                            className={`dvx-tgt-pct-btn ${Number(addState.pct ?? 100) === p ? 'active' : ''}`}
                            onClick={() => setAdding(prev => ({ ...prev, [h.coin_id]: { ...prev[h.coin_id], pct: p } }))}>
                            {p}%
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
                        <input
                          type="number" min="0" step="any"
                          placeholder={`0 – ${parseFloat(available.toFixed(6))}`}
                          value={addState.qty || ''}
                          onChange={e => setAdding(prev => ({ ...prev, [h.coin_id]: { ...prev[h.coin_id], qty: e.target.value } }))}
                          style={{ flex:1, background:'var(--surface-2)', border:'1px solid rgba(var(--g-rgb),0.3)', borderRadius:8, padding:'0.5rem 0.6rem', color:'var(--text)', fontSize:'0.9rem' }}
                        />
                        <button type="button" className="dvx-tgt-pct-btn"
                          onClick={() => setAdding(prev => ({ ...prev, [h.coin_id]: { ...prev[h.coin_id], qty: String(parseFloat(available.toFixed(8))) } }))}>
                          MAX
                        </button>
                      </div>
                    )}
                    <div className="dvx-tgt-form-hint">
                      Sell {parseFloat(addQty.toFixed(6))} {h.coin_symbol?.toUpperCase()}
                      {addState.price && parseFloat(addState.price) > 0 && ` · $${fmt(addQty * parseFloat(addState.price))} proceeds`}
                      {' · '}<strong style={{ color:'var(--text)' }}>{parseFloat(remainingAfter.toFixed(6))} {h.coin_symbol?.toUpperCase()} left</strong>
                    </div>
                  </div>
                  {addPriceNum > currentPrice && (
                    <TargetRealityCheck
                      coinId={h.coin_id} coinSymbol={h.coin_symbol} coinName={h.coin_name}
                      currentPrice={currentPrice} targetPrice={addPriceNum} assetClass={categorizeAsset(h)} />
                  )}
                  <button
                    className="dvx-btn dvx-btn-primary dvx-tgt-save"
                    disabled={!(addState.price && parseFloat(addState.price) > 0) || addQty <= 0 || priceTooLow}
                    onClick={() => saveTarget(h.coin_id, addState.price, addQty, currentPrice)}>
                    Save Target
                  </button>
                </div>
              )}

              {/* Existing targets */}
              {plan.map(t => {
                const sellQty   = t.quantity == null ? h.amount : Math.min(t.quantity, h.amount)
                const proceeds  = sellQty * t.price
                const progress  = currentPrice > 0 && t.price > 0 ? Math.min((currentPrice / t.price) * 100, 100) : 0
                const reached   = currentPrice >= t.price && currentPrice > 0
                const gainVsNow = currentPrice > 0 ? ((t.price - currentPrice) / currentPrice) * 100 : 0
                return (
                  <div key={t.id} className={`dvx-target-row ${reached ? 'dvx-target-reached' : ''}`}>
                    {reached && (
                      <div className="dvx-target-reached-banner">
                        <Icon name="target" size={13} />
                        Target reached — consider taking profits on {h.coin_symbol?.toUpperCase()}
                      </div>
                    )}
                    <div className="dvx-target-row-top">
                      <div className="dvx-target-cell">
                        <span className="dvx-target-lbl">Target Price</span>
                        <span className="dvx-target-val">${fmt(t.price)}</span>
                      </div>
                      <div className="dvx-target-cell">
                        <span className="dvx-target-lbl">Qty to Sell</span>
                        <span className="dvx-target-val">{t.quantity == null ? `All (${h.amount.toFixed(4)})` : sellQty.toFixed(4)}</span>
                      </div>
                      <div className="dvx-target-cell">
                        <span className="dvx-target-lbl">Proceeds</span>
                        <span className="dvx-target-val" style={{ color: 'var(--g-ink)', fontWeight: 700 }}>${fmt(proceeds)}</span>
                      </div>
                      <div className="dvx-target-cell">
                        <span className="dvx-target-lbl">Distance</span>
                        <span className="dvx-target-val" style={{ color: reached ? 'var(--g-ink)' : gainVsNow > 0 ? 'var(--text)' : '#f87171' }}>
                          {reached ? '✓ Reached' : `${gainVsNow >= 0 ? '+' : ''}${gainVsNow.toFixed(1)}%`}
                        </span>
                      </div>
                      <button onClick={() => removeTarget(h.coin_id, t.id)} title="Remove target"
                        style={{ background:'none', border:'none', color:'rgba(248,113,113,0.7)', cursor:'pointer', fontSize:'1rem', padding:'0 4px', flexShrink:0 }}>✕</button>
                    </div>
                    <div className="dvx-target-bar-wrap">
                      <div className="dvx-target-bar-bg">
                        <div className="dvx-target-bar-fill"
                          style={{ width:`${progress}%`, background: reached ? 'var(--g)' : 'linear-gradient(90deg,#3b82f6,var(--g))' }}/>
                      </div>
                      <span className="dvx-target-bar-pct">{progress.toFixed(0)}%</span>
                    </div>
                    {!reached && (
                      <TargetRealityCheck compact
                        coinId={h.coin_id} coinSymbol={h.coin_symbol} coinName={h.coin_name}
                        currentPrice={currentPrice} targetPrice={t.price} assetClass={categorizeAsset(h)} />
                    )}
                  </div>
                )
              })}

              {/* Empty state per holding */}
              {plan.length === 0 && !isAdding && (
                <div style={{ fontSize:'0.75rem', color:'var(--text-sub)', padding:'0.25rem 0 0.1rem' }}>
                  No targets set — tap "+ Target" to add one
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Static card config — defined at module level to avoid recreating on every render ──
const CARD_CONFIG = [
  { id:'spin_learn',         label:'Spin & Learn' },
  { id:'pnl_chart',          label:'P&L by Asset' },
  { id:'portfolio_heatmap',  label:'Portfolio Heatmap' },
  { id:'goal_tracker',       label:'Goal Tracker' },
  { id:'allocation',         label:'Allocation' },
  { id:'net_worth_history',  label:'Net Worth History' },
  { id:'market_mood',        label:'Market Mood' },
  { id:'movers',             label:"Today's Movers" },
  { id:'correlation',        label:'Correlation Matrix' },
  { id:'sector_heatmap',     label:'Sector Heatmap' },
]
const DEFAULT_VIS = Object.fromEntries(CARD_CONFIG.map(c => [c.id, true]))

// ── Main Dashboard ────────────────────────────────────────────────────────
function AlertsSection({ enriched, prices, isDemo }) {
  const [alertTab, setAlertTab] = useState('smart')
  return (
    <div>
      <div className="sa-alert-tabs">
        <button className={`sa-alert-tab ${alertTab === 'smart' ? 'active' : ''}`} onClick={() => setAlertTab('smart')}>
          <Icon name="zap" size={14} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Smart Alerts
        </button>
        <button className={`sa-alert-tab ${alertTab === 'price' ? 'active' : ''}`} onClick={() => setAlertTab('price')}>
          <Icon name="bell" size={14} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Price Alerts
        </button>
      </div>
      {alertTab === 'smart' && (
        <Suspense fallback={<TabFallback />}>
          <SmartAlerts enriched={isDemo ? [] : enriched} prices={prices} />
        </Suspense>
      )}
      {alertTab === 'price' && (
        <Suspense fallback={<TabFallback />}>
          <PriceAlerts enriched={isDemo ? [] : enriched} prices={prices} />
        </Suspense>
      )}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, lang } = useLanguage()
  const [isTabPending, startTabTransition] = useTransition()
  const [portfolio, setPortfolio]         = useState([])
  const portfolioRef = useRef([])
  const loadAllRef = useRef(null)
  const [prices, setPrices]               = useState({})
  const [coinImages, setCoinImages]       = useState({})
  const [transactions, setTransactions]   = useState([])
  const [wallets, setWallets]             = useState([])
  // Portfolio wallet filter ('all' = every wallet combined).
  const [selectedWalletId, setSelectedWalletId] = useState('all')
  const selectedWalletRef = useRef('all')
  const [coinTargets, setCoinTargets]     = useState({})
  const [loaded, setLoaded]               = useState(false)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [activeTab, setActiveTab]         = useState(() => {
    // If a QR deep-link import is waiting in sessionStorage, open the manage tab
    // so DataPanel mounts and its auto-import effect fires immediately.
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('wl_pending_import')) {
      return 'manage'
    }
    return location.state?.tab || 'overview'
  })
  const [showAllHoldings, setShowAllHoldings] = useState(false)
  const [showBreakEven, setShowBreakEven]     = useState(false)

  // The 6-tile "boxes" navigation is a desktop convenience — on mobile the app
  // uses the bottom nav, so we only render the grid on wide (desktop) viewports.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = e => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const showTabGrid = !IS_NATIVE_APP && isDesktop
  const [holdingsSearch,  setHoldingsSearch]  = useState('')
  const [holdingsCat,     setHoldingsCat]     = useState('all')
  const [holdingsSort,    setHoldingsSort]    = useState('value')
  const [holdingsSortDir, setHoldingsSortDir] = useState('desc')
  const [holdingsBadge,   setHoldingsBadge]   = useState('all')
  const [selectedAssets,  setSelectedAssets]  = useState(() => new Set())
  const [expandedActions, setExpandedActions] = useState(() => new Set())
  const [sheetOpen, setSheetOpen]         = useState(false)
  const [sheetType, setSheetType]         = useState('buy')
  const [sheetPrefill, setSheetPrefill]   = useState(null)
  const openSheet = useCallback((t, source = 'dashboard', prefill = null) => { setSheetType(t); setSheetPrefill(prefill); setSheetOpen(true); track('trade_sheet_open', { type: t, source }) }, [])
  // The "How to add assets" guide ends by opening the Buy sheet for real.
  useEffect(() => {
    const openBuy = () => openSheet('buy', 'add_asset_guide')
    window.addEventListener('wl:open-buy', openBuy)
    const onPortfolioUpdated = () => { lastLoadAll = Date.now(); loadAllRef.current?.() }
    window.addEventListener('wl:portfolio-updated', onPortfolioUpdated)
    return () => { window.removeEventListener('wl:open-buy', openBuy); window.removeEventListener('wl:portfolio-updated', onPortfolioUpdated) }
  }, [openSheet])
  const [isMobile, setIsMobile]           = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const handler = e => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ── Timed nudge toast (fires after 15 min if no trade logged) ──────────
  const [nudgeVisible, setNudgeVisible] = useState(false)
  // Flick the nudge toast sideways to dismiss it (in-app notifications should
  // be swipe-dismissable, not just tap-the-×).
  const { swipeHandlers: nudgeSwipe, swipeStyle: nudgeSwipeStyle } = useSwipeDismiss(
    () => setNudgeVisible(false), { axis: 'x', centered: true }
  )
  useEffect(() => {
    if (sheetOpen || transactions.length > 0) { setNudgeVisible(false); return }
    const t = setTimeout(() => {
      if (!sheetOpen && transactions.length === 0) { setNudgeVisible(true); track('trade_nudge_shown') }
    }, 900000)
    return () => clearTimeout(t)
  }, [sheetOpen, transactions.length])

  // ── Quick Strip visibility tracking (IntersectionObserver) ───────────────
  const quickStripRef = useRef(null)
  useEffect(() => {
    const el = quickStripRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let fired = false
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !fired) {
        fired = true
        track('trade_cta_visible', { source: 'quick_strip' })
      }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const [shareOpen, setShareOpen]         = useState(false)
  const [weeklyOpen, setWeeklyOpen]       = useState(false)
  const [weeklyEmail, setWeeklyEmail]     = useState('')
  const [weeklyStatus, setWeeklyStatus]   = useState('idle')
  const [weeklyMsg, setWeeklyMsg]         = useState('')
  const [weeklyBannerDismissed, setWeeklyBannerDismissed] = useState(() => {
    try { return localStorage.getItem('wl_weekly_banner_dismissed') === '1' } catch { return false }
  })
  const [rebalanceOpen, setRebalanceOpen] = useState(false)
  const [milestone, setMilestone]         = useState(null)
  const prevPnLRef                        = useRef(null)
  // Import-method chooser shown after creating a wallet
  const [importChooser, setImportChooser] = useState(false)
  const [importMode, setImportMode]       = useState('menu') // 'menu' | 'voice' | 'screenshot' | 'excel' | 'backup'
  // First-run flow for brand-new users: (welcome tour) → interests → cash/USDT.
  // We wait for the global welcome tour to finish so the modals don't stack.
  const [obStep, setObStep] = useState(() => {
    if (hasStarted()) return 'done'
    let welcomed = false
    try { welcomed = localStorage.getItem('wl_welcomed_v2') === '1' } catch {}
    if (!welcomed) return 'wait'
    return interestsDone() ? 'balances' : 'interests'
  })
  useEffect(() => {
    const onWelcomeDone = () => setObStep(s => {
      if (s !== 'wait') return s
      if (hasStarted()) return 'done'
      return interestsDone() ? 'balances' : 'interests'
    })
    window.addEventListener('wl-welcome-done', onWelcomeDone)
    return () => window.removeEventListener('wl-welcome-done', onWelcomeDone)
  }, [])
  // Track first-run onboarding progress (privacy-safe: step name only).
  const obStepSeen = useRef(new Set())
  useEffect(() => {
    if (obStep === 'wait' || obStepSeen.current.has(obStep)) return
    obStepSeen.current.add(obStep)
    if (obStep === 'interests' || obStep === 'balances') track('onboarding_step_view', { step: obStep })
    else if (obStep === 'done' && obStepSeen.current.size > 1) track('onboarding_complete')
  }, [obStep])
  // Onboarding tutorial progress flags
  const [onboardDismissed, setOnboardDismissed] = useState(() => { try { return localStorage.getItem('wl_onboard_dismissed') === '1' } catch { return false } })
  const [aiSeen, setAiSeen]               = useState(() => { try { return localStorage.getItem('wl_onboard_ai_seen') === '1' } catch { return false } })
  const dismissOnboard = () => { setOnboardDismissed(true); try { localStorage.setItem('wl_onboard_dismissed', '1') } catch {} }
  const { theme, mode, setTheme, setMode } = useTheme()
  const [hidden, setHidden]               = useState(() => {
    try { return JSON.parse(localStorage.getItem('wl_settings') || '{}').hideValues === true } catch { return false }
  })
  const tickerStart = useRef(null)
  const [tickerValue, setTickerValue] = useState(0)
  // Brief "heartbeat" on the net-worth figure whenever a fresh price tick moves
  // it — a small sign of life so the number feels live, not frozen.
  const [valuePulse, setValuePulse] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [displayCurrency, setDisplayCurrency] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wl_settings') || '{}').displayCurrency || 'USD' } catch { return 'USD' }
  })
  const [fxRates, setFxRates] = useState({})
  const [btcUsd, setBtcUsd] = useState(0)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [showExcelImport, setShowExcelImport] = useState(false)
  const [showVoiceImport, setShowVoiceImport] = useState(false)
  const [showScreenshot, setShowScreenshot] = useState(false)
  const [showBackupCode, setShowBackupCode] = useState(false)
  // Smart Import tree — which method branch is expanded (excel | voice | screenshot | null)
  const [openImport, setOpenImport] = useState(null)
  const currencyBtnRef = useRef(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })

  const [cardVis, setCardVis] = useState(() => {
    try { return { ...DEFAULT_VIS, ...JSON.parse(localStorage.getItem('wl_card_vis') || '{}') } }
    catch { return DEFAULT_VIS }
  })
  const [showCardConfig, setShowCardConfig] = useState(false)
  // Academy "Spin & Learn" snapshot (spins left today + current IQ) for the
  // dashboard card. Read once on mount; the route remounts when returning from
  // /academy, so it stays current.
  const [spinLearn] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('wl_academy_v1') || '{}')
      const today = new Date().toISOString().split('T')[0]
      const w = s.wheel
      const spins = (!w || w.date !== today) ? 3 : Math.max(0, w.left ?? 3)
      return { spins, iq: s.iq || 0 }
    } catch { return { spins: 3, iq: 0 } }
  })
  function toggleCard(id) {
    setCardVis(v => {
      const next = { ...v, [id]: !v[id] }
      try { localStorage.setItem('wl_card_vis', JSON.stringify(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    api.getFiatRates().then(r => setFxRates(r || {})).catch(() => {})
  }, [])

  // Always keep a live BTC/USD price so "view in Bitcoin" works even when the
  // user holds no BTC (its price isn't otherwise in the `prices` map).
  useEffect(() => {
    if (displayCurrency !== 'BTC') return
    if (prices['bitcoin']?.usd || prices['bitcoin']?.price) return
    let cancelled = false
    api.getPrices('bitcoin').then(p => {
      const px = p?.bitcoin?.usd || p?.bitcoin?.price
      if (px && !cancelled) setBtcUsd(px)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [displayCurrency, prices])

  // ── Display-currency conversion ───────────────────────────────────────────
  // Every monetary figure on the dashboard is stored in USD. `cv()` turns a USD
  // amount into the currency the user picked (fiat via live FX, or BTC) so the
  // whole dashboard re-denominates consistently — not just the hero total.
  const curConv = useMemo(() => {
    if (displayCurrency === 'BTC') {
      const btcPrice = prices['bitcoin']?.usd || prices['bitcoin']?.price || btcUsd
      return { sym: '₿', rate: btcPrice ? 1 / btcPrice : null, btc: true }
    }
    if (displayCurrency === 'USD') return { sym: '$', rate: 1, btc: false }
    const fiat = POPULAR_FIAT.find(f => f.code === displayCurrency)
    return { sym: fiat?.symbol || displayCurrency, rate: fxRates[displayCurrency] || null, btc: false }
  }, [displayCurrency, fxRates, btcUsd, prices])

  // Full-precision money string in the active currency (e.g. "E£ 410,233.50").
  const cv = useCallback((usd) => {
    const n = Number(usd) || 0
    if (!curConv.rate) return `$${fmt(Math.abs(n))}`
    const v = n * curConv.rate
    if (curConv.btc) return `₿ ${Math.abs(v) < 1 ? Math.abs(v).toFixed(6) : Math.abs(v).toFixed(4)}`
    const sp = curConv.sym.length > 1 ? ' ' : ''
    return `${curConv.sym}${sp}${fmt(Math.abs(v))}`
  }, [curConv])

  // Compact variant for chart axes (e.g. "E£12k", "₿0.45").
  const cvN = useCallback((usd) => {
    const n = Number(usd) || 0
    const rate = curConv.rate || 1
    const v = n * rate
    if (curConv.btc) return `₿${Math.abs(v) < 1 ? Math.abs(v).toFixed(3) : Math.abs(v).toFixed(1)}`
    const sp = curConv.sym.length > 1 ? ' ' : ''
    const abs = Math.abs(v)
    const s = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : `${abs.toFixed(0)}`
    return `${v < 0 ? '-' : ''}${curConv.sym}${sp}${s}`
  }, [curConv])

  function saveCurrency(code) {
    setDisplayCurrency(code)
    setShowCurrencyPicker(false)
    try {
      const s = JSON.parse(localStorage.getItem('wl_settings') || '{}')
      localStorage.setItem('wl_settings', JSON.stringify({ ...s, displayCurrency: code }))
    } catch {}
  }

  useEffect(() => {
    if (location.state?.tab) setActiveTab(normalizeTab(location.state.tab))
  }, [location.state?.tab])

  // Open wallet creation panel when navigated here from landing "Create wallet"
  useEffect(() => {
    if (location.state?.openAddWallet) {
      setActiveTab('manage')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track dashboard tab switches as virtual page views in GA
  useEffect(() => {
    if (typeof window.gtag !== 'function') return
    window.gtag('event', 'page_view', {
      page_path: `/dashboard/${activeTab}`,
      page_title: `Dashboard — ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`,
    })
    track('dashboard_tab_switch', { tab: activeTab })
    if (activeTab === 'tools')  track('tools_tab_view')
    if (activeTab === 'alerts') track('alerts_tab_view')
    // Mark the onboarding "Get AI insights" step complete once visited.
    if (activeTab === 'tools' && !aiSeen) { setAiSeen(true); try { localStorage.setItem('wl_onboard_ai_seen', '1') } catch {} }
  }, [activeTab])

  async function loadAll() {
    loadAllRef.current = loadAll
    const sel = selectedWalletRef.current
    const [p, txs, ws, ct] = await Promise.all([
      api.getPortfolio(sel && sel !== 'all' ? sel : undefined),
      api.getTransactions(), api.getWallets(), api.getCoinTargets(),
    ])
    portfolioRef.current = p
    // Auto-create a default wallet for brand-new users so they never see
    // "Please select a wallet first." on their very first visit.
    if (ws.length === 0) {
      await api.createWallet({ name: 'My Wallet' })
      track('wallet_created', { wallet_name: 'My Wallet', wallet_count: 1, auto: true })
      const freshWs = await api.getWallets()
      setWallets(freshWs)
    } else {
      setWallets(ws)
    }
    setPortfolio(p); setTransactions(txs); setCoinTargets(ct || {})
    // Auto-sync the live portfolio to the browser extension (no manual paste).
    pushPortfolioToExtension({ transactions: txs, wallets: ws })
    if (p.length) {
      setPricesLoading(true)
      const ids = p.map(h => h.coin_id).join(',')
      try {
        const [px, imgs] = await Promise.all([
          api.getPrices(ids),
          api.getCoinImages(ids).catch(() => ({})),
        ])
        setPrices(px || {})
        setCoinImages(imgs || {})
      } catch {}
      setPricesLoading(false)
    }
    setLoaded(true)
  }

  // Reload the portfolio when the wallet filter changes.
  useEffect(() => {
    selectedWalletRef.current = selectedWalletId
    if (loaded) loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWalletId])

  // Refresh only prices — does NOT reset portfolio/prices state so value stays visible.
  // Reads from portfolioRef (not portfolio state) so setInterval never has a stale closure.
  async function refreshPrices() {
    const ids = portfolioRef.current.map(h => h.coin_id).join(',')
    if (!ids) return
    setPricesLoading(true)
    try {
      const px = await api.getPrices(ids)
      if (px && Object.keys(px).length) setPrices(px)
    } catch {}
    setPricesLoading(false)
  }

  useEffect(() => {
    // Two polling tiers:
    //   • priceInterval (60s) — only refreshes prices, lightweight
    //   • dataInterval  (5min) — full reload (portfolio, txs, wallets, prices)
    let priceInterval = null
    let dataInterval  = null
    let lastLoadAll = 0

    function startPolling() {
      if (!priceInterval) priceInterval = setInterval(refreshPrices, 60_000)
      if (!dataInterval)  dataInterval  = setInterval(() => { lastLoadAll = Date.now(); loadAll() }, 5 * 60_000)
    }

    function stopPolling() {
      clearInterval(priceInterval); priceInterval = null
      clearInterval(dataInterval);  dataInterval  = null
    }

    function handleVisibility() {
      if (document.hidden) {
        stopPolling()
      } else {
        // Only call loadAll on focus if the data is stale (>60 s since last full load).
        if (Date.now() - lastLoadAll > 60_000) { lastLoadAll = Date.now(); loadAll() }
        startPolling()
      }
    }

    lastLoadAll = Date.now(); loadAll()
    if (!document.hidden) startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    // Backup: if any other component writes to localStorage, refresh data
    const onStorage = (e) => {
      if (e.key && e.key.startsWith('wl_') || e.key === 'transactions' || e.key === 'wallets' || e.key === 'coin_targets') {
        if (Date.now() - lastLoadAll > 2000) { lastLoadAll = Date.now(); loadAll() }
      }
    }
    window.addEventListener('storage', onStorage)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // QR deep-link auto-import: runs once on mount, no confirmation needed.
  useEffect(() => {
    const pending = sessionStorage.getItem('wl_pending_import')
    if (!pending) return
    sessionStorage.removeItem('wl_pending_import')
    const failToManualImport = () => {
      // Don't fail silently — a returning user restoring from a QR/deep-link
      // would otherwise see their old (or empty) portfolio with no idea the
      // restore failed. Drop them on the backup panel so they can retry/paste.
      setActiveTab('manage')
      setShowBackupCode(true)
    }
    api.importCode(pending).then(result => {
      if (result?.success === false) { failToManualImport(); return }
      loadAll()
      setActiveTab('overview')
    }).catch(() => { failToManualImport() })
  }, [])

  const { enriched, totalValue, totalInvested, totalPnL, totalPnLPct, isDemo, pricesFailed } = useMemo(() => {
    const raw = portfolio.map(h => {
      const price   = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value   = h.amount * price
      // No price yet ≠ worthless: neutralize P&L until a real quote arrives.
      const pnl     = price > 0 ? value - h.total_invested : 0
      const pnlPct  = price > 0 && h.total_invested > 0 ? (pnl / h.total_invested) * 100 : 0
      const coin_image = h.coin_image || coinImages[h.coin_id] || ''
      const pct24h  = prices[h.coin_id]?.usd_24h_change ?? 0
      return { ...h, coin_image, price, value, pnl, pnlPct, pct24h }
    }).sort((a, b) => (b.value || b.total_invested) - (a.value || a.total_invested))

    const hasPortfolio = raw.length > 0
    const hasPrices    = raw.some(h => h.value > 0)

    if (!hasPortfolio && loaded) {
      return { enriched: [], totalValue: 0, totalInvested: 0,
        totalPnL: 0, totalPnLPct: 0, isDemo: false, pricesFailed: false }
    }

    // Holdings with a failed quote count at cost so the total isn't understated.
    const tv  = hasPrices
      ? raw.reduce((s, h) => s + (h.price > 0 ? h.value : h.total_invested), 0)
      : raw.reduce((s, h) => s + h.total_invested, 0)
    // Exclude stablecoins/cash from invested & P&L — they don't generate returns.
    // categorizeAsset() buckets stablecoins under 'crypto', so check isStablecoin
    // explicitly too, otherwise USDT/USDC/DAI dilute the portfolio P&L%.
    const nonStables = raw.filter(h => !isStablecoin(h.coin_id, h.coin_symbol) && categorizeAsset(h) !== 'cash')
    const ti  = nonStables.length > 0
      ? nonStables.reduce((s, h) => s + h.total_invested, 0)
      : raw.reduce((s, h) => s + h.total_invested, 0)
    // P&L only over holdings that actually have a live quote.
    const priced = nonStables.filter(h => h.price > 0)
    const pnl = hasPrices && priced.length > 0
      ? priced.reduce((s, h) => s + h.pnl, 0)
      : 0
    const pricedTi = priced.reduce((s, h) => s + h.total_invested, 0)
    return {
      enriched: raw, totalValue: tv, totalInvested: ti,
      totalPnL: pnl, totalPnLPct: hasPrices && pricedTi > 0 ? (pnl / pricedTi) * 100 : 0,
      isDemo: false, pricesFailed: hasPortfolio && !hasPrices && loaded && !pricesLoading,
    }
  }, [portfolio, prices, coinImages, loaded, pricesLoading])

  // Count-up animation — starts from current displayed value to avoid $0 flash
  const tickerValueRef = useRef(0)
  useEffect(() => {
    if (!loaded) return
    if (tickerStart.current === totalValue) return
    tickerStart.current = totalValue
    const t0 = performance.now(), dur = 1400, from = tickerValueRef.current, to = totalValue
    let raf = 0
    const step = now => {
      const ease = 1 - Math.pow(1 - Math.min(1, (now - t0) / dur), 3)
      const next = from + (to - from) * ease
      tickerValueRef.current = next
      setTickerValue(next)
      if (ease < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [loaded, totalValue])

  // Pulse the figure once whenever a fresh value lands (price poll / refresh).
  useEffect(() => {
    if (!loaded || totalValue <= 0) return
    setValuePulse(true)
    const id = setTimeout(() => setValuePulse(false), 900)
    return () => clearTimeout(id)
  }, [loaded, totalValue])

  useEffect(() => {
    if (loaded && totalValue > 0) saveSnapshot(totalValue, totalInvested)
  }, [loaded, totalValue, totalInvested])

  // Portfolio move notifications (±5%)
  useEffect(() => {
    if (!loaded || totalValue <= 0) return
    const enabled = (() => { try { return JSON.parse(localStorage.getItem('wl_settings') || '{}').notifPortfolio ?? false } catch { return false } })()
    if (!enabled) return
    checkPortfolioMove(totalValue)
  }, [loaded, totalValue])

  // Set baseline on first load so the first alert is relative to app-open value
  useEffect(() => {
    if (loaded && totalValue > 0) setPortfolioBaseline(totalValue)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // Milestone detection
  useEffect(() => {
    if (!loaded || totalValue === 0 || milestone) return
    // Use actual 24h coin price changes, not the chart timeframe % which can be all-time
    const todayPnLVal = enriched.reduce((s, h) => s + (h.value * (h.pct24h || 0) / 100), 0)
    const dayBase = totalValue - todayPnLVal
    const dayChangePct = dayBase > 0 ? (todayPnLVal / dayBase) * 100 : 0
    const m = detectMilestone({ totalValue, totalPnL, prevTotalPnL: prevPnLRef.current, dayChangePct })
    if (m) setMilestone(m)
    prevPnLRef.current = totalPnL
  }, [loaded, totalValue, totalPnL])

  // ── Generative brand reactivity: let the day's P&L tint the whole app ──
  useEffect(() => {
    if (!loaded) return
    const todayVal = enriched.reduce((s, h) => s + (h.value * (h.pct24h || 0) / 100), 0)
    const prevVal = totalValue - todayVal
    applyMood(prevVal > 0 ? (todayVal / prevVal) * 100 : 0)
  }, [loaded, totalValue, enriched])

  useEffect(() => {
    if (!loaded || !enriched.length) return
    const cats = new Set(enriched.map(h => categorizeAsset(h)))
    const assetTypes = [...cats].join('+')
    trackPortfolioLoaded({
      assetCount: enriched.length,
      totalValue,
      hasProfit: enriched.some(h => h.pnl > 0),
      assetTypes,
    })
  }, [loaded])

  // Keep the weekly-report email snapshot fresh: if the user is subscribed, push
  // the current rounded stats on open so the Monday cron sends up-to-date numbers.
  useEffect(() => {
    if (!loaded || isDemo || !isWeeklySubscribed()) return
    if (!(totalValue > 0)) return
    refreshWeekly(buildWeeklyPayload({ enriched, currency: 'USD' }))
  }, [loaded, isDemo, totalValue])

  const [perfTf, setPerfTf] = useState('30D')
  const [chartType, setChartType] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wl_settings') || '{}').chartType || 'area' } catch { return 'area' }
  })
  const setChartTypePersist = useCallback(type => {
    setChartType(type)
    try {
      const s = JSON.parse(localStorage.getItem('wl_settings') || '{}')
      s.chartType = type
      localStorage.setItem('wl_settings', JSON.stringify(s))
    } catch {}
    track('perf_chart_type_switch', { type })
  }, [])
  const perfSeries = useMemo(() => buildPerfSeries(totalValue, perfTf, transactions), [totalValue, perfTf, transactions])
  // OHLC candles: bucket the raw perf series into ~22 candles (open/close = first/last
  // value in each bucket, high/low = min/max). Recharts has no native candlestick, so a
  // custom Bar shape draws the wick + body from the [low, high] range dataKey below.
  const perfCandles = useMemo(() => {
    if (chartType !== 'candles' || perfSeries.length < 2) return []
    const target = Math.min(22, perfSeries.length)
    const size = Math.ceil(perfSeries.length / target)
    const out = []
    for (let i = 0; i < perfSeries.length; i += size) {
      const bucket = perfSeries.slice(i, i + size)
      if (!bucket.length) continue
      let hi = bucket[0].v, lo = bucket[0].v
      for (const p of bucket) { if (p.v > hi) hi = p.v; if (p.v < lo) lo = p.v }
      out.push({
        i: out.length,
        ts: bucket[0].ts,
        open: bucket[0].v,
        close: bucket[bucket.length - 1].v,
        high: hi,
        low: lo,
        range: [lo, hi],
      })
    }
    return out
  }, [chartType, perfSeries])
  const perfHasRealData = useMemo(() => {
    const days = TF_DAYS[perfTf] ?? 30
    return hasRealData(days) || transactions.some(tx => tx.date && tx.price_per_unit > 0)
  }, [perfTf, transactions])
  const perfChange = useMemo(() => {
    if (!perfSeries.length) return { abs: 0, pct: 0 }
    const first = perfSeries[0]?.v || 0
    const last  = perfSeries[perfSeries.length - 1]?.v || 0
    const abs   = last - first
    const pct   = first > 0 ? (abs / first) * 100 : 0
    return { abs, pct }
  }, [perfSeries])
  const allocData = useMemo(() => {
    if (!enriched.length) return []
    const items = enriched
      .map(h => ({ name: h.coin_symbol?.toUpperCase(), value: h.value > 0 ? h.value : h.total_invested }))
      .filter(d => d.value > 0)
    const total = items.reduce((s, d) => s + d.value, 0)
    return items.map(d => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }))
  }, [enriched])

  const catBreakdown = useMemo(() => {
    if (!enriched.length) return []
    const totals = {}; const investeds = {}; const pnls = {}; const assetsByCat = {}
    enriched.forEach(h => {
      const cat = categorizeAsset(h)
      const val = h.value > 0 ? h.value : h.total_invested
      totals[cat] = (totals[cat] || 0) + val
      ;(assetsByCat[cat] = assetsByCat[cat] || []).push({ symbol: h.coin_symbol?.toUpperCase() || '?', value: val, coin_id: h.coin_id, image: h.coin_image })
      if (cat !== 'cash') {
        investeds[cat] = (investeds[cat] || 0) + h.total_invested
        pnls[cat] = (pnls[cat] || 0) + (h.pnl || 0)
      }
    })
    return CATEGORY_ORDER.filter(cat => totals[cat] > 0).map(cat => {
      const invested = investeds[cat] || 0
      const pnl = pnls[cat] || 0
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0
      const assets = (assetsByCat[cat] || []).sort((a, b) => b.value - a.value)
      return {
        cat, label: CATEGORY_LABELS[cat],
        value: totals[cat],
        pct: totalValue > 0 ? (totals[cat] / totalValue) * 100 : 0,
        invested, pnl, pnlPct, assets,
      }
    })
  }, [enriched, totalValue])

  const catAllocData = useMemo(() => {
    if (!enriched.length) return []
    const totals = {}
    enriched.forEach(h => {
      const cat = categorizeAsset(h)
      totals[cat] = (totals[cat] || 0) + (h.value > 0 ? h.value : h.total_invested)
    })
    const total = Object.values(totals).reduce((s, v) => s + v, 0)
    return CATEGORY_ORDER.filter(cat => totals[cat] > 0).map(cat => ({
      name: CATEGORY_LABELS[cat], cat,
      value: totals[cat],
      pct: total > 0 ? (totals[cat] / total) * 100 : 0,
    }))
  }, [enriched])

  const pnlData = useMemo(() => {
    if (pricesFailed || !enriched.some(h => h.pnl !== 0)) return []
    return enriched.slice(0, 8).map(h => ({
      name: h.coin_symbol?.toUpperCase(),
      pnl: parseFloat((h.pnl || 0).toFixed(2)),
    }))
  }, [enriched, pricesFailed])

  // Badge labels available per main category (derived from unfiltered enriched for stable chip list)
  const badgesByCategory = useMemo(() => {
    const result = {}
    enriched.forEach(h => {
      const cat   = categorizeAsset(h)
      const badge = getAssetCategoryBadge(h)?.label
      if (badge) {
        if (!result[cat]) result[cat] = new Set()
        result[cat].add(badge)
      }
    })
    return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, [...v]]))
  }, [enriched])


  const filteredHoldings = useMemo(() => {
    let list = [...enriched]
    const q = holdingsSearch.trim().toLowerCase()
    if (q) list = list.filter(h => h.coin_symbol?.toLowerCase().includes(q) || h.coin_name?.toLowerCase().includes(q))
    if (holdingsCat !== 'all') list = list.filter(h => categorizeAsset(h) === holdingsCat)
    if (holdingsBadge !== 'all') list = list.filter(h => getAssetCategoryBadge(h)?.label === holdingsBadge)
    list.sort((a, b) => {
      if (holdingsSort === 'name') {
        const cmp = (a.coin_symbol ?? '').localeCompare(b.coin_symbol ?? '')
        return holdingsSortDir === 'asc' ? cmp : -cmp
      }
      const va = holdingsSort === 'pnl_pct' ? (a.pnlPct ?? 0) : holdingsSort === 'pct24h' ? (a.pct24h ?? 0) : holdingsSort === 'invested' ? (a.total_invested ?? 0) : (a.value ?? 0)
      const vb = holdingsSort === 'pnl_pct' ? (b.pnlPct ?? 0) : holdingsSort === 'pct24h' ? (b.pct24h ?? 0) : holdingsSort === 'invested' ? (b.total_invested ?? 0) : (b.value ?? 0)
      return holdingsSortDir === 'asc' ? va - vb : vb - va
    })
    return list
  }, [enriched, holdingsSearch, holdingsCat, holdingsBadge, holdingsSort, holdingsSortDir])

  const isHoldingsFiltered = holdingsSearch.trim() !== '' || holdingsCat !== 'all' || holdingsBadge !== 'all'

  const filteredStats = useMemo(() => {
    if (!isHoldingsFiltered || !filteredHoldings.length) return null
    const value    = filteredHoldings.reduce((s, h) => s + (h.value || 0), 0)
    const invested = filteredHoldings.reduce((s, h) => s + (h.total_invested || 0), 0)
    const pnl      = filteredHoldings.reduce((s, h) => s + (h.pnl || 0), 0)
    const pnlPct   = invested > 0 ? (pnl / invested) * 100 : 0
    return { value, invested, pnl, pnlPct }
  }, [filteredHoldings, isHoldingsFiltered])

  const selectedStats = useMemo(() => {
    if (selectedAssets.size === 0) return null
    const sel = filteredHoldings.filter(h => selectedAssets.has(h.coin_id))
    if (!sel.length) return null
    const value    = sel.reduce((s, h) => s + (h.value || 0), 0)
    const invested = sel.reduce((s, h) => s + (h.total_invested || 0), 0)
    const pnl      = sel.reduce((s, h) => s + (h.pnl || 0), 0)
    const pnlPct   = invested > 0 ? (pnl / invested) * 100 : 0
    return { value, invested, pnl, pnlPct, count: sel.size || selectedAssets.size }
  }, [filteredHoldings, selectedAssets])

  const displayHoldings = (showAllHoldings || isHoldingsFiltered) ? filteredHoldings : filteredHoldings.slice(0, 6)

  // Stale manual price check — warn if any non-crypto asset price is >7 days old
  const staleAssets = useMemo(() => {
    const manual = api.getManualPrices ? api.getManualPrices() : {}
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return enriched.filter(h => {
      const id = (h.coin_id || '').toLowerCase()
      const isManual = id.startsWith('stock:') || id.startsWith('real:') || id.startsWith('other:') || id.startsWith('bond:')
      if (!isManual) return false
      const m = manual[h.coin_id]
      if (!m?.updated_at) return true
      return new Date(m.updated_at).getTime() < cutoff
    })
  }, [enriched])

  // ── Sell-targets analysis ────────────────────────────────────────────────
  const targetsAnalysis = useMemo(() => {
    const rows = []
    let totalPotentialProceeds = 0
    let totalReached = 0

    for (const h of enriched) {
      if (categorizeAsset(h) === 'cash' || isStablecoin(h.coin_id, h.coin_symbol)) continue
      const plan = coinTargets[h.coin_id]?.targets || []
      if (!plan.length) {
        rows.push({ coinId: h.coin_id, coinSymbol: h.coin_symbol, currentPrice: h.price, amount: h.amount, targets: [] })
        continue
      }
      const currentPrice = h.price
      const holdingRows = plan.map(t => {
        const sellQty    = t.quantity == null ? h.amount : Math.min(t.quantity, h.amount)
        const proceeds   = sellQty * t.price
        const progress   = currentPrice > 0 && t.price > 0 ? Math.min((currentPrice / t.price) * 100, 100) : 0
        const reached    = currentPrice >= t.price && currentPrice > 0
        const gainVsNow  = currentPrice > 0 ? ((t.price - currentPrice) / currentPrice) * 100 : 0
        totalPotentialProceeds += proceeds
        if (reached) totalReached++
        return { ...t, sellQty, proceeds, progress, reached, gainVsNow, coinSymbol: h.coin_symbol, coinId: h.coin_id }
      }).sort((a, b) => a.price - b.price)
      rows.push({ coinId: h.coin_id, coinSymbol: h.coin_symbol, currentPrice, amount: h.amount, targets: holdingRows })
    }

    const chartData = rows.flatMap(r =>
      r.targets.map(t => ({
        name: `${r.coinSymbol} $${t.price >= 1000 ? (t.price/1000).toFixed(0)+'k' : t.price.toFixed(0)}`,
        proceeds: parseFloat(t.proceeds.toFixed(2)),
        reached: t.reached,
      }))
    ).slice(0, 10)

    return { rows, totalPotentialProceeds, totalReached, chartData, totalTargets: rows.reduce((s, r) => s + r.targets.length, 0), rowsWithTargets: rows.filter(r => r.targets.length > 0).length }
  }, [enriched, coinTargets])

  // Pre-sorted top-3 gainers/losers — memoized so the two sort+filter+slice
  // operations don't repeat on every Dashboard render.
  const { topGainers, topLosers } = useMemo(() => {
    const withChange = enriched.filter(h => prices[h.coin_id]?.usd_24h_change != null)
    const sorted = [...withChange].sort((a, b) =>
      (prices[b.coin_id]?.usd_24h_change ?? 0) - (prices[a.coin_id]?.usd_24h_change ?? 0)
    )
    return { topGainers: sorted.slice(0, 3), topLosers: sorted.slice(-3).reverse() }
  }, [enriched, prices])

  const tabs = [
    { id: 'overview',   label: 'Dashboard',   icon: Ico.overview,  color: '#10b981' },
    { id: 'watchlist',  label: 'Watchlist',   icon: Ico.watchlist, color: '#38bdf8' },
    { id: 'tools',      label: 'Analysis',    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 14.5l3.5-4 3 2.5L21 7"/><circle cx="21" cy="7" r="1.5" fill="currentColor" stroke="none"/></svg>, color: '#a78bfa' },
    { id: 'alerts',     label: 'Alerts',      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>, color: '#fbbf24' },
    { id: 'targets',    label: t('targets'),  icon: Ico.target,    color: '#fb7185' },
    { id: 'manage',     label: 'Backup',      icon: Ico.wallet,    color: '#2dd4bf' },
  ]

  // Map legacy tab names from location.state to new names
  const normalizeTab = (id) => {
    if (id === 'ai' || id === 'risk' || id === 'eval') return 'tools'
    if (id === 'wallets' || id === 'data') return 'manage'
    if (id === 'watch') return 'watchlist'
    return id
  }

  // Import your net worth smartly — Excel / Voice / Screenshot / Backup shown as
  // an always-visible tree. Each branch expands its import panel INLINE (nothing
  // hidden elsewhere on the page). Shown under the Buy/Sell strip on the web, and
  // in place of the tile grid inside the native app.
  const importOptions = (
    <div style={{ margin:'0 0 0.75rem' }}>
      <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text-sub)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.55rem' }}>
        Import your net worth smartly
      </div>
      <div className="wl-import-tree">
        {[
          { key:'excel',      icon:'bar-chart', label:'Excel / CSV', desc:'Switch from messy spreadsheets to WalletLens', color:'167,139,250' },
          { key:'voice',      icon:'mic',       label:'Voice',       desc:'Skip the typing — just say your trades',       color:'16,185,129' },
          { key:'screenshot', icon:'camera',    label:'Screenshot',  desc:'Turn any exchange screenshot into holdings',   color:'244,114,182' },
          { key:'backup',     icon:'folder',    label:'Backup',      desc:'Bring your portfolio to any device',           color:'96,165,250' },
        ].map(m => {
          const open = openImport === m.key
          return (
            <div className={`wl-import-branch${open ? ' open' : ''}`} key={m.key}>
              <button className="wl-import-node" style={{ '--c':`rgb(${m.color})`, '--cbg':`rgba(${m.color},0.12)` }}
                aria-expanded={open}
                onClick={() => { const next = open ? null : m.key; setOpenImport(next); if (next) track('quick_import_open', { method: m.key }) }}>
                <span className="wl-import-node-icon"><Icon name={m.icon} size={18} /></span>
                <span className="wl-import-node-text">
                  <span className="wl-import-node-label">{m.label}</span>
                  <span className="wl-import-node-desc">{m.desc}</span>
                </span>
                <span className="wl-import-node-chev">{open ? '▾' : '▸'}</span>
              </button>
              {open && (
                <div className="wl-import-panel">
                  <Suspense fallback={<TabFallback />}>
                    {m.key === 'excel'      && <SmartImport wallets={wallets} onImported={() => { loadAll(); setOpenImport(null) }} />}
                    {m.key === 'voice'      && <VoiceImport hideTrigger onImported={loadAll} />}
                    {m.key === 'screenshot' && <SmartImport wallets={wallets} defaultMode="screenshot" onImported={() => { loadAll(); setOpenImport(null) }} />}
                    {m.key === 'backup'     && <DataPanel onRefresh={loadAll} onImported={loadAll} />}
                  </Suspense>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="dvx">
      {/* Live news ticker — above the tab navigation so it's always visible */}
      <NewsTicker />

      {/* Weekly Report Email subscribe banner — shown at top until subscribed or dismissed */}
      {!isWeeklySubscribed() && !weeklyBannerDismissed && !isDemo && enriched.length > 0 && (
        <div style={{
          margin: '0.5rem 0.75rem', padding: '0.7rem 0.9rem', borderRadius: '14px',
          background: 'linear-gradient(135deg, rgba(var(--g-rgb),0.12), rgba(var(--g-rgb),0.04))',
          boxShadow: '0 0 0 1px rgba(var(--g-rgb),0.2)',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--g)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="3"/><path d="M22 7l-10 6L2 7"/>
              </svg>
              <span style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--g-ink)' }}>Weekly Report</span>
            </div>
            <button onClick={() => { try { localStorage.setItem('wl_weekly_banner_dismissed', '1') } catch {} setWeeklyBannerDismissed(true) }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0.2rem' }}>×</button>
          </div>
          {weeklyStatus === 'ok' ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--g-ink)', fontWeight: 600, margin: 0 }}>✅ Check your inbox — your first report is on the way!</p>
          ) : (
            <>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                Get a branded weekly portfolio report delivered to your inbox every Sunday — no exact amounts shared, privacy-first.
              </p>
              <form onSubmit={async (e) => {
                e.preventDefault()
                const val = weeklyEmail.trim()
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setWeeklyStatus('error'); setWeeklyMsg('Enter a valid email.'); return }
                setWeeklyStatus('sending'); setWeeklyMsg('')
                try {
                  const payload = buildWeeklyPayload({ enriched, currency: 'USD' })
                  await subscribeWeekly(val, payload)
                  setWeeklyStatus('ok'); setWeeklyMsg('')
                  track('weekly_email_subscribe', { source: 'dashboard_banner' })
                } catch {
                  setWeeklyStatus('error'); setWeeklyMsg('Network error — try again.')
                }
              }} style={{ display: 'flex', gap: '0.45rem' }}>
                <input
                  type="email" inputMode="email" autoComplete="email"
                  placeholder="your@email.com"
                  value={weeklyEmail}
                  onChange={e => { setWeeklyEmail(e.target.value); if (weeklyStatus === 'error') { setWeeklyStatus('idle'); setWeeklyMsg('') } }}
                  style={{
                    flex: 1, minWidth: 0, borderRadius: '10px',
                    padding: '0.55rem 0.75rem', fontSize: '0.8rem',
                    background: 'var(--surface-1)', border: '1px solid var(--border)',
                    color: 'var(--text)', outline: 'none',
                  }}
                />
                <button type="submit" disabled={weeklyStatus === 'sending'} style={{
                  padding: '0.55rem 1rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #047857, #10b981)', color: '#fff',
                  fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap',
                  opacity: weeklyStatus === 'sending' ? 0.7 : 1,
                }}>
                  {weeklyStatus === 'sending' ? 'Joining…' : 'Subscribe'}
                </button>
              </form>
              {weeklyStatus === 'error' && <p style={{ fontSize: '0.72rem', color: '#f87171', margin: 0 }}>{weeklyMsg}</p>}
            </>
          )}
        </div>
      )}

      {/* Tab nav — labeled tile grid on the web. Inside the native app the tile
          grid is redundant with the native bottom nav, so we replace it with the
          quick import options (for populated dashboards; the empty profile shows
          its own import boxes). */}
      {showTabGrid ? (
      <div className="dvx-tabgrid">
        {tabs.map(tab => (
          <button key={tab.id} className={`dvx-tabtile ${activeTab === tab.id ? 'active' : ''}`}
            style={{ '--tile-col': tab.color }}
            onClick={() => startTabTransition(() => setActiveTab(tab.id))}>
            <span className="dvx-tabtile-icon">{tab.icon}</span>
            <span className="dvx-tabtile-label">{tab.label}</span>
          </button>
        ))}
      </div>
      ) : (activeTab === 'overview' && enriched.length > 0 && importOptions)}

      {/* Tab content — opacity fades slightly during lazy-load transitions */}
      <div style={isTabPending ? { opacity: 0.7, transition: 'opacity 0.15s' } : undefined}>

      {/* ══ OVERVIEW ══ */}
      {activeTab === 'overview' && (
        <>
          {/* Quick Trade strip — always at top when portfolio exists */}
          {enriched.length > 0 && (
            <div ref={quickStripRef} style={{
              display: 'flex', gap: '0.6rem', margin: '0.5rem 0',
            }}>
              <button onClick={() => openSheet('buy', 'quick_strip')} style={{
                flex: 1, padding: '0.75rem', borderRadius: '14px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(var(--g-rgb),0.22), rgba(var(--g-rgb),0.10))',
                color: 'var(--g-ink)', fontWeight: 700, fontWeight: 800, fontSize: '0.9rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
                boxShadow: '0 0 0 1px rgba(var(--g-rgb),0.3), 0 4px 16px rgba(var(--g-rgb),0.15)',
                transition: 'box-shadow 0.15s',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Buy
              </button>
              <button onClick={() => openSheet('sell', 'quick_strip')} style={{
                flex: 1, padding: '0.75rem', borderRadius: '14px', border: 'none', cursor: 'pointer',
                background: 'rgba(248,113,113,0.10)',
                color: '#f87171', fontWeight: 800, fontSize: '0.9rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
                boxShadow: '0 0 0 1px rgba(248,113,113,0.25)',
                transition: 'box-shadow 0.15s',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Sell
              </button>
              <button onClick={() => navigate('/transactions')} style={{
                padding: '0.75rem 1rem', borderRadius: '14px', border: 'none', cursor: 'pointer',
                background: 'var(--surface-1)',
                color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem',
                boxShadow: '0 0 0 1px var(--border)',
                whiteSpace: 'nowrap',
              }}>
                History
              </button>
            </div>
          )}

          {/* Import options under Buy/Sell — only when the desktop tile grid is
              shown up top. On mobile web and in the native app the import
              options already replace the grid at the top, so we don't repeat
              them here. Populated dashboards only. */}
          {showTabGrid && enriched.length > 0 && importOptions}

          {/* Feature discovery nudge — only shown once, until dismissed */}
          {!isDemo && enriched.length > 0 && (
            <FeatureNudgeStrip
              onGoToTargets={() => { setActiveTab('targets'); track('feature_nudge_click', { feature: 'targets' }) }}
              onGoToVision={() => { navigate('/vision'); track('feature_nudge_click', { feature: 'vision' }) }}
              onWeeklyReport={() => { setWeeklyOpen(true); track('feature_nudge_click', { feature: 'weekly_report' }) }}
            />
          )}

{(() => {
            const importsBlock = (
              <>
                {showExcelImport && (
                  <div className="dvx-excel-import-panel glass-card">
                    <SmartImport wallets={wallets} onImported={() => { loadAll(); setShowExcelImport(false) }} />
                  </div>
                )}
                {showVoiceImport && (
                  <Suspense fallback={<TabFallback />}><VoiceImport hideTrigger onImported={loadAll} /></Suspense>
                )}
                {showScreenshot && (
                  <div className="dvx-excel-import-panel glass-card">
                    <SmartImport wallets={wallets} defaultMode="screenshot" onImported={() => { loadAll(); setShowScreenshot(false) }} />
                  </div>
                )}
                {showBackupCode && (
                  <DataPanel onRefresh={loadAll} onImported={() => setActiveTab('overview')} />
                )}
              </>
            )
            // While the first load is in flight, show a lightweight loading
            // line instead of the empty-state CTA — otherwise a returning user
            // with holdings sees a blank flash on slow connections and may
            // think their data was wiped.
            if (!loaded) return (
              <div className="dvx-loading-holdings" style={{ padding:'2.5rem 1rem', textAlign:'center', color:'var(--text-sub)', fontSize:'0.9rem' }}>
                Loading your portfolio…
              </div>
            )
            const isEmpty = enriched.length === 0
            return (
              <>
                {isEmpty
                  ? <EmptyPortfolio
                      onAddTrade={() => openSheet('buy', 'empty_state')}
                      onImportAction={action => {
                        if (action === 'voice')      { setShowVoiceImport(true);  setShowExcelImport(false); setShowScreenshot(false); setShowBackupCode(false) }
                        if (action === 'excel')      { setShowExcelImport(true);  setShowVoiceImport(false); setShowScreenshot(false); setShowBackupCode(false) }
                        if (action === 'screenshot') { setShowScreenshot(true);   setShowExcelImport(false); setShowVoiceImport(false); setShowBackupCode(false) }
                        if (action === 'backup')     { setShowBackupCode(true);   setShowExcelImport(false); setShowVoiceImport(false); setShowScreenshot(false) }
                      }}
                      onQuickAdd={prefill => openSheet('buy', 'quick_add', prefill)}
                      navigate={navigate}
                      loaded={loaded}
                      importsSlot={importsBlock}
                    />
                  : importsBlock}
              </>
            )
          })()}

          {/* Sentiment + portfolio tips ticker */}
          {enriched.length > 0 && (
            <SentimentTicker
              holdings={enriched}
              totalValue={totalValue}
              totalPnLPct={totalPnLPct}
            />
          )}

          {/* Hero + stats — only shown when portfolio has holdings */}
          {enriched.length > 0 && <div className="dvx-hero glass-card lens-pulse">
            {!hidden && !isDemo && (() => {
              const dayPnLVal = enriched.reduce((s, h) => s + (h.value * (h.pct24h || 0) / 100), 0)
              const dayBase = totalValue - dayPnLVal
              const dayChangePct = dayBase > 0 ? (dayPnLVal / dayBase) * 100 : 0
              const soul = getSoulGreeting({ dayChangePct, lang })
              return (
                <p className="dvx-soul" data-tone={soul.tone}>
                  <span className="dvx-soul-emoji" aria-hidden="true"><Icon name={soul.emoji} size={16} /></span>
                  <span className="dvx-soul-hello">{soul.hello}</span> — {soul.line}
                </p>
              )
            })()}
            <p className="dvx-hero-label">
              {pricesFailed ? t('investedValue') : pricesLoading ? t('loadingPrices') : t('totalPortfolioValue')}
              {isDemo && <span className="dvx-badge-demo">DEMO</span>}
              {pricesFailed && <span className="dvx-badge-warn">PRICES OFFLINE</span>}
              {pricesLoading && <span className="dvx-badge-info">LIVE</span>}
              <button className="dvx-refresh-btn" title="Refresh prices" disabled={refreshing} onClick={async () => {
                setRefreshing(true)
                track('manual_refresh')
                try { await refreshPrices() } finally { setRefreshing(false) }
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ display:'block', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                  <path d="M8 16H3v5"/>
                </svg>
              </button>
              <button className="dvx-eye-btn" title="Customize dashboard" onClick={() => setShowCardConfig(v => !v)} style={{ color: showCardConfig ? 'var(--g-ink)' : undefined }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
              <button className="dvx-eye-btn" onClick={() => { setHidden(h => {
  const next = !h
  track('hide_values_toggle', { hidden: next })
  try { const s = JSON.parse(localStorage.getItem('wl_settings') || '{}'); localStorage.setItem('wl_settings', JSON.stringify({ ...s, hideValues: next })) } catch {}
  return next
}) }} title={hidden ? 'Show values' : 'Hide values'}>
                {hidden
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
              <GuardianBadge />
            </p>
            <h2 className={`dvx-hero-value ${hidden ? 'dvx-hidden-val' : ''} ${valuePulse ? 'dvx-value-beat' : ''}`}>
              {hidden ? '••••••' : cv(loaded ? tickerValue : 0)}
            </h2>
            {wallets.length > 1 && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem', marginBottom:'0.6rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
                <select
                  value={selectedWalletId}
                  onChange={e => setSelectedWalletId(e.target.value)}
                  style={{
                    background:'var(--surface-1)', color:'var(--text)', fontWeight:700, fontSize:'0.82rem',
                    border:'1px solid rgba(var(--g-rgb),0.25)', borderRadius:'9px', padding:'0.3rem 0.6rem',
                    cursor:'pointer', maxWidth:200,
                  }}
                >
                  <option value="all">All wallets</option>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            )}
            <div className="dvx-currency-switcher">
              {[...POPULAR_FIAT.slice(0, 3).map(f => f.code), 'BTC'].map(code => (
                <button
                  key={code}
                  className={`dvx-currency-pill${displayCurrency === code ? ' active' : ''}`}
                  onClick={() => saveCurrency(code)}
                >
                  {code === 'BTC' ? '₿' : code}
                </button>
              ))}
              <button
                ref={currencyBtnRef}
                className={`dvx-currency-pill${!['USD','EUR','GBP','BTC'].includes(displayCurrency) ? ' active' : ''}`}
                onClick={() => {
                  if (currencyBtnRef.current) {
                    const r = currencyBtnRef.current.getBoundingClientRect()
                    // Keep the 180px-wide menu fully on-screen — right-align to the
                    // button if it would spill past the right edge, and never go < 8px.
                    const menuW = 190
                    const left = Math.max(8, Math.min(r.left, window.innerWidth - menuW - 8))
                    setDropdownPos({ top: r.bottom + 6, left })
                  }
                  setShowCurrencyPicker(p => !p)
                }}
                title="More currencies"
              >
                {!['USD','EUR','GBP','BTC'].includes(displayCurrency)
                  ? (POPULAR_FIAT.find(f => f.code === displayCurrency)?.symbol || displayCurrency)
                  : '···'}
              </button>
              {showCurrencyPicker && createPortal(
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.08)' }} onClick={() => setShowCurrencyPicker(false)} />
                  <div className="dvx-currency-dropdown" style={{ top: dropdownPos.top, left: dropdownPos.left }}>
                    {POPULAR_FIAT.filter(f => !['USD','EUR','GBP'].includes(f.code)).map(f => (
                      <button key={f.code} className={`dvx-currency-opt${displayCurrency === f.code ? ' active' : ''}`} onClick={() => saveCurrency(f.code)}>
                        {f.symbol} {f.code} <span>{f.name}</span>
                      </button>
                    ))}
                  </div>
                </>,
                document.body
              )}
              {showCardConfig && createPortal(
                <>
                  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000, backdropFilter:'blur(2px)' }} onClick={() => setShowCardConfig(false)} />
                  <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:'20px', padding:'1.5rem', zIndex:1001, width:'min(400px,94vw)', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.4)' }}>
                    {/* Header */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.4rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--g)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3"/>
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                        <h3 style={{ margin:0, fontSize:'1rem', color:'var(--text)' }}>Customize Dashboard</h3>
                      </div>
                      <button onClick={() => setShowCardConfig(false)} aria-label="Close" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0, width:36, height:36, lineHeight:0, display:'flex', alignItems:'center', justifyContent:'center' }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg></button>
                    </div>
                    <p style={{ fontSize:'0.73rem', color:'var(--text-muted)', margin:'0 0 1.1rem', lineHeight:1.4 }}>Tap a card to show or hide it on your dashboard.</p>

                    {/* Card grid */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
                      {CARD_CONFIG.map(c => {
                        const on = !!cardVis[c.id]
                        return (
                          <label key={c.id} onClick={() => toggleCard(c.id)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.5rem', padding:'0.6rem 0.75rem', borderRadius:'10px', background: on ? 'rgba(var(--g-rgb),0.12)' : 'var(--surface-2)', border:`1.5px solid ${on ? 'rgba(var(--g-rgb),0.4)' : 'var(--border)'}`, cursor:'pointer', transition:'all 0.15s', userSelect:'none' }}>
                            <span style={{ fontSize:'0.78rem', fontWeight:600, color: on ? 'var(--text)' : 'var(--text-muted)', transition:'color 0.15s' }}>{c.label}</span>
                            {/* Toggle pill */}
                            <div style={{ width:34, height:18, borderRadius:9, background: on ? 'var(--g)' : 'rgba(128,134,148,0.4)', flexShrink:0, position:'relative', transition:'background 0.2s', boxShadow: on ? '0 0 8px rgba(var(--g-rgb),0.4)' : 'none' }}>
                              <div style={{ position:'absolute', top:2, left: on ? 18 : 2, width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.35)' }}/>
                            </div>
                          </label>
                        )
                      })}
                    </div>

                    {/* Footer */}
                    <div style={{ marginTop:'1.1rem', display:'flex', gap:'0.6rem' }}>
                      <button onClick={() => { const all = Object.fromEntries(CARD_CONFIG.map(c => [c.id, false])); setCardVis(all); try { localStorage.setItem('wl_card_vis', JSON.stringify(all)) } catch {} }} style={{ flex:1, background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.32)', borderRadius:'10px', color:'#ef4444', padding:'0.6rem', fontSize:'0.8rem', cursor:'pointer', fontWeight:700 }}>
                        Hide all
                      </button>
                      <button onClick={() => { setCardVis(DEFAULT_VIS); try { localStorage.setItem('wl_card_vis', JSON.stringify(DEFAULT_VIS)) } catch {} }} style={{ flex:1, background:'linear-gradient(135deg, var(--accent2), var(--accent))', border:'none', borderRadius:'10px', color:'#fff', padding:'0.6rem', fontSize:'0.8rem', cursor:'pointer', fontWeight:700, boxShadow:'0 3px 12px rgba(var(--g-rgb),0.32)' }}>
                        Show all
                      </button>
                    </div>
                  </div>
                </>,
                document.body
              )}
            </div>
            {!pricesFailed && totalPnL !== 0 && (
              <p className={`dvx-hero-change ${totalPnL >= 0 ? 'up' : 'dn'} ${hidden ? 'dvx-hidden-val' : ''}`}>
                {hidden ? '••••• (••••%)' : `${totalPnL >= 0 ? '↑' : '↓'} ${cv(totalPnL)} (${pct(totalPnLPct)}) ${t('allTime')}`}
              </p>
            )}
            {/* Timeframe selector + performance chart — merged into portfolio overview card */}
            <div style={{ display:'flex', gap:'0.3rem', margin:'0.85rem 0 0.5rem', flexWrap:'wrap' }}>
              {TIMEFRAMES.map(tf => (
                <button key={tf.id} className={`dvx-tf-chip${perfTf === tf.id ? ' active' : ''}`} onClick={() => { setPerfTf(tf.id); track('perf_timeframe_switch', { timeframe: tf.id }) }}>
                  {tf.label}
                </button>
              ))}
              <span className={perfHasRealData ? 'dvx-live-ind' : ''} style={{ marginLeft:'auto', fontSize:'0.65rem', color: perfHasRealData ? 'var(--g-ink)' : 'var(--text-sub)', alignSelf:'center' }}>
                {perfHasRealData ? '● live' : '○ simulated'}
              </span>
            </div>
            {/* Chart-type picker — Area (default) · Line · Candles */}
            <div className="dvx-charttype-seg" role="tablist" aria-label="Chart type">
              {[
                { id: 'area',    label: 'Area',    icon: <><path d="M3 15l4-5 4 3 5-7 3 4v6H3z"/></> },
                { id: 'line',    label: 'Line',    icon: <><polyline points="3 14 8 9 12 12 20 4"/></> },
                { id: 'candles', label: 'Candles', icon: <><line x1="6" y1="3" x2="6" y2="21"/><rect x="3.5" y="7" width="5" height="8" rx="1"/><line x1="16" y1="3" x2="16" y2="21"/><rect x="13.5" y="10" width="5" height="7" rx="1"/></> },
              ].map(ct => (
                <button key={ct.id} role="tab" aria-selected={chartType === ct.id}
                  className={`dvx-ct-chip${chartType === ct.id ? ' active' : ''}`}
                  onClick={() => setChartTypePersist(ct.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ct.icon}</svg>
                  {ct.label}
                </button>
              ))}
            </div>
            {(() => {
              const up = perfChange.pct >= 0
              const strokeColor = up ? 'var(--g)' : '#f87171'
              const gradId = up ? 'pg-up' : 'pg-dn'
              // Invested baseline: a dashed cost-basis line with the area tinted
              // green above it (profit zone) and red below it (loss zone). The
              // split point of the vertical gradient is where the baseline sits
              // within the chart's y-domain, which we pin exactly via YAxis.
              const inv = !hidden && totalInvested > 0 ? totalInvested : 0
              let invStop = null
              if (inv > 0 && perfSeries.length) {
                let min = inv, max = inv
                for (const p of perfSeries) { if (p.v < min) min = p.v; if (p.v > max) max = p.v }
                invStop = max === min ? 0.5 : Math.min(Math.max((max - inv) / (max - min), 0), 1)
              }
              // Tooltip label: intraday ranges show the time, longer ranges the date.
              const fmtTs = ts => {
                if (!ts) return ''
                const d = new Date(ts)
                if (perfTf === '4H' || perfTf === '1D') return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
                if (perfTf === '1Y' || perfTf === 'ALL') return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
                return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
              }
              // Candlestick shape — recharts has no native candle, so we draw the
              // wick (high→low) and body (open↔close) from the [low, high] range bar.
              const Candle = ({ x, y, width, height, payload }) => {
                if (!payload) return null
                const { open, close, high, low } = payload
                const color = close >= open ? 'var(--g)' : '#f87171'
                const span = high - low
                const pp = span > 0 ? height / span : 0
                const bodyY = span > 0 ? y + (high - Math.max(open, close)) * pp : y
                const bodyH = Math.max(1.5, span > 0 ? Math.abs(close - open) * pp : height)
                const cx = x + width / 2
                const bw = Math.min(Math.max(width * 0.6, 3), 11)
                return (
                  <g>
                    <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={color} strokeWidth={1.25} strokeOpacity={0.85} />
                    <rect x={cx - bw / 2} y={bodyY} width={bw} height={bodyH} rx={1} fill={color} />
                  </g>
                )
              }
              // O/H/L/C tooltip for the candlestick view.
              const candleTip = ({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div style={{ background:'var(--bg4)', border:'1px solid var(--border)', borderRadius:10, padding:'0.5rem 0.75rem', boxShadow:'var(--shadow)', fontSize:'0.72rem' }}>
                    <div style={{ color:'var(--text-muted)', fontWeight:600, marginBottom:'0.3rem' }}>{fmtTs(d.ts)}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'auto auto', gap:'0.1rem 0.7rem', fontWeight:700, color:'var(--text)' }}>
                      <span style={{ color:'var(--text-sub)' }}>O</span><span>{cv(d.open)}</span>
                      <span style={{ color:'var(--text-sub)' }}>H</span><span>{cv(d.high)}</span>
                      <span style={{ color:'var(--text-sub)' }}>L</span><span>{cv(d.low)}</span>
                      <span style={{ color:'var(--text-sub)' }}>C</span><span style={{ color: d.close >= d.open ? 'var(--g)' : '#f87171' }}>{cv(d.close)}</span>
                    </div>
                  </div>
                )
              }
              const isCandles = chartType === 'candles'
              // Driven directly by the real perfSeries values (snapshots → transaction
              // replay → simulation), so the curve is accurate across all chart types.
              return (
                <ResponsiveContainer key={perfTf + chartType} width="100%" height={180}>
                  <ComposedChart data={isCandles ? perfCandles : perfSeries} margin={{ left:0, right:0, top:8, bottom:0 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={strokeColor} stopOpacity={0.22}/>
                        <stop offset="85%" stopColor={strokeColor} stopOpacity={0.02}/>
                        <stop offset="100%" stopColor={strokeColor} stopOpacity={0}/>
                      </linearGradient>
                      {invStop != null && (
                        <linearGradient id="pg-split" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--g)" stopOpacity={0.26}/>
                          <stop offset={invStop} stopColor="var(--g)" stopOpacity={0.03}/>
                          <stop offset={invStop} stopColor="#f87171" stopOpacity={0.04}/>
                          <stop offset="100%" stopColor="#f87171" stopOpacity={0.22}/>
                        </linearGradient>
                      )}
                    </defs>
                    <XAxis hide dataKey="i" />
                    <YAxis hide domain={inv > 0
                      ? [dMin => Math.min(dMin, inv), dMax => Math.max(dMax, inv)]
                      : ['auto', 'auto']} />
                    {isCandles ? (
                      <Tooltip content={candleTip} cursor={{ stroke: 'var(--text-sub)', strokeWidth:1, strokeDasharray:'4 3', opacity:0.4 }} />
                    ) : (
                      <Tooltip
                        contentStyle={{ background:'var(--bg4)', border:'1px solid var(--border)', borderRadius:10, padding:'0.5rem 0.85rem', boxShadow:'var(--shadow)' }}
                        itemStyle={{ color:'var(--text)', fontWeight:700, fontSize:'0.9rem' }}
                        labelStyle={{ color:'var(--text-muted)', fontWeight:600, fontSize:'0.72rem', marginBottom:'0.15rem' }}
                        separator=""
                        formatter={v => [cv(v), '']}
                        labelFormatter={(_, payload) => fmtTs(payload?.[0]?.payload?.ts)}
                        cursor={{ stroke: strokeColor, strokeWidth:1, strokeDasharray:'4 3', opacity:0.5 }}
                      />
                    )}
                    {inv > 0 && (
                      <ReferenceLine y={inv} stroke="var(--text-sub)" strokeDasharray="5 4" strokeOpacity={0.7}
                        label={{ value: 'Invested', position: 'insideLeft', fill: 'var(--text-sub)', fontSize: 10, fontWeight: 700, dy: -7 }} />
                    )}
                    {chartType === 'area' && (
                      <Area type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={2.25}
                        fill={invStop != null ? 'url(#pg-split)' : `url(#${gradId})`} dot={false} activeDot={{ r:5, fill:strokeColor, stroke:'#0d1f14', strokeWidth:2 }}
                        isAnimationActive={true} animationDuration={900} animationEasing="ease-out"/>
                    )}
                    {chartType === 'line' && (
                      <Line type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={2.25}
                        dot={false} activeDot={{ r:5, fill:strokeColor, stroke:'#0d1f14', strokeWidth:2 }}
                        isAnimationActive={true} animationDuration={900} animationEasing="ease-out"/>
                    )}
                    {isCandles && (
                      <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )
            })()}
            {!isDemo && totalValue > 0 && (
              <button className="dvx-share-btn" onClick={() => { setShareOpen(true); track('share_portfolio_open') }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                {t('shareGains')}
              </button>
            )}
          </div>}

          {/* Stats row */}
          {enriched.length > 0 && (
            <div className="dvx-stats-row">
              <StatCard label={t('invested')}    value={hidden ? '••••' : <AnimatedMoney value={totalInvested} format={cv} />} />
              <StatCard label={t('pnl')}         value={hidden ? '••••' : <AnimatedMoney value={totalPnL} format={cv} signed />}
                color={totalPnL >= 0 ? 'var(--g)' : '#f87171'}
                tone={totalPnL >= 0 ? 'pos' : 'neg'}
                spark={!hidden && perfSeries.length > 1 ? <Sparkline data={perfSeries} up={totalPnL >= 0} /> : null}
                sub={hidden ? undefined : (totalPnLPct !== 0 ? pct(totalPnLPct) : undefined)} />
            </div>
          )}

          {/* Category summary cards row */}
          {catBreakdown.length > 0 && (
            <div className="dvx-cat-summary-row">
              {catBreakdown.map(({ cat, label, value, pct, pnl, pnlPct }) => (
                <div key={cat} className="dvx-cat-summary-card glass-card" style={{ '--bar-col': CATEGORY_COLOR[cat] || 'var(--g)' }}>
                  <CatLabel cat={cat} className="dvx-cat-summary-label" />
                  <div className="dvx-cat-summary-value">{hidden ? '••••' : cv(value)}</div>
                  <div className="dvx-cat-summary-pct">{pct.toFixed(1)}%</div>
                  {cat !== 'cash' && pnl !== 0 && !pricesFailed && (
                    <div className={`dvx-cat-summary-pnl${pnl >= 0 ? ' pos' : ' neg'}`}>
                      {pnl >= 0 ? '+' : '-'}{hidden ? '••' : cv(pnl)}
                      <span className="dvx-cat-summary-pnlpct"> ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
                    </div>
                  )}
                  <div className="dvx-cat-summary-bar-track">
                    <div className="dvx-cat-summary-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Portfolio breakdown by asset category */}
          {catBreakdown.length > 0 && (
            <div className="glass-card dvx-cat-breakdown">
              <h3 style={{ margin:'0 0 0.75rem', fontSize:'0.9rem', fontWeight:700 }}>Portfolio Breakdown</h3>
              <div className="dvx-cat-list">
                {catBreakdown.map(({ cat, label, value, pct, pnl, pnlPct, invested, assets }) => (
                  <div key={cat} className="dvx-cat-row" style={{ '--bar-col': CATEGORY_COLOR[cat] || 'var(--g)' }}>
                    <div className="dvx-cat-info">
                      <CatLabel cat={cat} className="dvx-cat-label" />
                      <span className="dvx-cat-pct">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="dvx-cat-bar-track">
                      <div className="dvx-cat-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="dvx-cat-right">
                      <span className="dvx-cat-value">{hidden ? '••••' : cv(value)}</span>
                      {cat !== 'cash' && pnl !== 0 && !pricesFailed && (
                        <span className={`dvx-cat-pnl${pnl >= 0 ? ' pos' : ' neg'}`}>
                          {pnl >= 0 ? '+' : '-'}{hidden ? '••' : cv(pnl)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                        </span>
                      )}
                      {cat !== 'cash' && invested > 0 && (
                        <span className="dvx-cat-invested">inv: {hidden ? '••••' : cv(invested)}</span>
                      )}
                    </div>
                    {assets.length > 1 && (
                      <div className="dvx-cat-asset-list">
                        {assets.map(a => {
                          const aPct = value > 0 ? (a.value / value) * 100 : 0
                          return (
                            <div key={a.symbol} className="dvx-cat-asset-row">
                              <CoinLogo image={a.image} symbol={a.symbol} coinId={a.coin_id} size={16} className="dvx-cat-asset-logo" />
                              <span className="dvx-cat-asset-sym">{a.symbol}</span>
                              <div className="dvx-cat-asset-bar">
                                <div className="dvx-cat-asset-fill" style={{ width: `${Math.min(aPct, 100)}%` }} />
                              </div>
                              <span className="dvx-cat-asset-pct">{aPct.toFixed(0)}%</span>
                              <span className="dvx-cat-asset-val">{hidden ? '••' : cv(a.value)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main grid */}
          <div className="dvx-grid">
            {/* Left column */}
            <div className="dvx-col-main">

              {/* Spin & Learn — link to the Academy Knowledge Wheel */}
              {cardVis.spin_learn && (
                <Link to="/academy?tab=wheel" className="glass-card dvx-spin-card"
                  onClick={() => track('spin_learn_card_click', { spins: spinLearn.spins })}>
                  <span className="dvx-spin-emoji">🎡</span>
                  <span className="dvx-spin-text">
                    <span className="dvx-spin-title">Spin &amp; Learn</span>
                    <span className="dvx-spin-sub">Grow your Investor IQ · {spinLearn.iq} IQ</span>
                  </span>
                  <span className="dvx-spin-badge">{spinLearn.spins} spin{spinLearn.spins === 1 ? '' : 's'} left</span>
                </Link>
              )}

              {/* P&L bar chart */}
              {cardVis.pnl_chart && pnlData.length > 0 && (
                <div className="glass-card">
                  <h3 style={{ margin:'0 0 0.75rem' }}>Profit / Loss by Asset</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={pnlData} margin={{ left:0, right:0, top:4, bottom:0 }}>
                      <defs>
                        <linearGradient id="dvxPnlPos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity="0.98"/>
                          <stop offset="100%" stopColor="#0f9d76" stopOpacity="0.85"/>
                        </linearGradient>
                        <linearGradient id="dvxPnlNeg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f98080" stopOpacity="0.95"/>
                          <stop offset="100%" stopColor="#dc4646" stopOpacity="0.85"/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false}/>
                      <XAxis dataKey="name" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fill:'var(--text-sub)', fontSize:10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => cvN(v)} width={50}/>
                      <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" strokeWidth={1}/>
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color:'var(--text)', fontWeight:700 }} cursor={false}
                        formatter={v => [<span style={{ color: v >= 0 ? 'var(--g)' : '#f87171', fontWeight:700 }}>{cv(v)}</span>, 'P&L']}/>
                      <Bar dataKey="pnl" radius={[6,6,0,0]} isAnimationActive animationDuration={800} animationEasing="ease-out">
                        {pnlData.map((d, i) => (
                          <Cell key={i} fill={d.pnl >= 0 ? 'url(#dvxPnlPos)' : 'url(#dvxPnlNeg)'}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── Holdings (primary column) ── */}
              <div className="glass-card">
                <div style={CHART_HDR_STYLE}>
                  <h3 style={{ margin:0 }}>
                    Holdings ({isHoldingsFiltered ? `${filteredHoldings.length} of ${enriched.length}` : enriched.length})
                  </h3>
                  <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', flexWrap:'wrap' }}>
                    {pricesFailed && <span className="dvx-badge-warn" style={{ fontSize:'0.6rem' }}>INVESTED</span>}
                    <button
                      className={`dvx-breakeven-toggle ${showBreakEven ? 'active' : ''}`}
                      onClick={() => setShowBreakEven(v => !v)}
                      title="Toggle break-even view"
                    >
                      <Icon name="scale" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Break-Even
                    </button>
                    <button
                      className="dvx-export-btn"
                      title="Export to Excel"
                      onClick={() => { track('holdings_export', { format: 'excel' }); exportToExcel(filteredHoldings, totalValue, displayCurrency) }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      Excel
                    </button>
                    <button
                      className="dvx-export-btn"
                      title="Export to PDF"
                      onClick={() => { track('holdings_export', { format: 'pdf' }); exportToPDF(filteredHoldings, totalValue, totalPnL, totalPnLPct, displayCurrency) }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h1a2 2 0 0 1 0 4H9v-4z"/><path d="M14 13h1.5a1.5 1.5 0 0 1 0 3H14v-3z"/></svg>
                      PDF
                    </button>
                  </div>
                </div>

                {/* ── Filter / sort bar ── */}
                {enriched.length > 1 && (
                  <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {/* Search + sort row */}
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input
                          type="text"
                          placeholder="Search assets…"
                          value={holdingsSearch}
                          onChange={e => setHoldingsSearch(e.target.value)}
                          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.35rem 1.6rem 0.35rem 0.6rem', color: 'var(--text)', fontSize: '0.77rem', outline: 'none' }}
                        />
                        {holdingsSearch && (
                          <button onClick={() => setHoldingsSearch('')} style={{ position:'absolute', right:'0.4rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:'0.85rem', padding:0, lineHeight:1 }}>✕</button>
                        )}
                      </div>
                      <select
                        value={holdingsSort}
                        onChange={e => setHoldingsSort(e.target.value)}
                        style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'8px', padding:'0.35rem 0.5rem', color:'var(--text)', fontSize:'0.75rem', cursor:'pointer', flexShrink:0 }}
                      >
                        <option value="value">Value</option>
                        <option value="pnl_pct">P&L %</option>
                        <option value="pct24h">24 h</option>
                        <option value="invested">Invested</option>
                        <option value="name">Name</option>
                      </select>
                      <button
                        onClick={() => setHoldingsSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                        title={holdingsSortDir === 'desc' ? 'Descending' : 'Ascending'}
                        style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'8px', padding:'0.35rem 0.55rem', color:'var(--text)', fontSize:'0.85rem', cursor:'pointer', flexShrink:0, lineHeight:1 }}
                      >
                        {holdingsSortDir === 'desc' ? '↓' : '↑'}
                      </button>
                    </div>

                    {/* Category chips — only when >1 category */}
                    {catBreakdown.length > 1 && (
                      <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap' }}>
                        {[{ cat:'all', label:`All (${enriched.length})` }, ...catBreakdown.map(c => ({ cat: c.cat, label: `${c.label} (${c.assets.length})` }))].map(({ cat, label }) => (
                          <button key={cat} onClick={() => { setHoldingsCat(cat); setHoldingsBadge('all') }} style={{ background: holdingsCat === cat ? 'linear-gradient(135deg, #047857, #10b981)' : 'var(--surface-2)', color: holdingsCat === cat ? '#fff' : 'var(--text-muted)', border: `1px solid ${holdingsCat === cat ? 'transparent' : 'var(--border)'}`, boxShadow: holdingsCat === cat ? '0 2px 8px rgba(5,150,105,0.35)' : 'none', borderRadius:'20px', padding:'0.2rem 0.7rem', fontSize:'0.69rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Filtered summary stats */}
                    {filteredStats && !selectedStats && (
                      <div style={{ fontSize:'0.71rem', color:'var(--text-muted)', display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center' }}>
                        <span>{filteredHoldings.length} asset{filteredHoldings.length !== 1 ? 's' : ''}</span>
                        <span style={{ opacity:0.4 }}>·</span>
                        <span style={{ fontWeight:600, color:'var(--text)' }}>{hidden ? '••••' : cv(filteredStats.value)}</span>
                        {filteredStats.pnl !== 0 && !pricesFailed && (
                          <>
                            <span style={{ opacity:0.4 }}>·</span>
                            <span style={{ fontWeight:600, color: filteredStats.pnl >= 0 ? 'var(--g-ink)' : '#f87171' }}>
                              {filteredStats.pnl >= 0 ? '+' : ''}{hidden ? '••' : cv(filteredStats.pnl)} ({filteredStats.pnlPct >= 0 ? '+' : ''}{filteredStats.pnlPct.toFixed(1)}%)
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Selected assets summary */}
                    {selectedStats && (
                      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                        <div style={{ fontSize:'0.71rem', display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center', background:'rgba(0,255,170,0.08)', border:'1px solid rgba(0,255,170,0.25)', borderRadius:'8px', padding:'0.25rem 0.6rem' }}>
                          <span style={{ color: 'var(--g-ink)', fontWeight: 700, fontWeight:700 }}>✓ {selectedAssets.size} selected</span>
                          <span style={{ opacity:0.4 }}>·</span>
                          <span style={{ fontWeight:600, color:'var(--text)' }}>{hidden ? '••••' : cv(selectedStats.value)}</span>
                          {selectedStats.pnl !== 0 && !pricesFailed && (
                            <>
                              <span style={{ opacity:0.4 }}>·</span>
                              <span style={{ fontWeight:600, color: selectedStats.pnl >= 0 ? 'var(--g-ink)' : '#f87171' }}>
                                {selectedStats.pnl >= 0 ? '+' : ''}{hidden ? '••' : cv(selectedStats.pnl)} ({selectedStats.pnlPct >= 0 ? '+' : ''}{selectedStats.pnlPct.toFixed(1)}%)
                              </span>
                            </>
                          )}
                        </div>
                        <button onClick={() => setSelectedAssets(new Set())} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:'0.78rem', padding:'0.2rem 0.3rem', lineHeight:1 }} title="Clear selection">✕ Clear</button>
                      </div>
                    )}
                  </div>
                )}

                {enriched.length === 0
                  ? <p className="muted">Nothing yet.</p>
                  : <>
                    <div>
                      {(() => {
                        const grouped = {}
                        displayHoldings.forEach(h => {
                          const cat = categorizeAsset(h)
                          if (!grouped[cat]) grouped[cat] = []
                          grouped[cat].push(h)
                        })
                        return CATEGORY_ORDER.filter(cat => grouped[cat]?.length > 0).map(cat => {
                          const ci = catBreakdown.find(c => c.cat === cat)
                          return (
                          <div key={cat}>
                            <div className="dvx-cat-group-hdr">
                              <CatLabel cat={cat} className="dvx-cat-group-name" />
                              {ci && (
                                <span className="dvx-cat-group-stats">
                                  <span>{hidden ? '••••' : cv(ci.value)}</span>
                                  <span className="dvx-cat-group-sep">·</span>
                                  <span>{ci.pct.toFixed(1)}%</span>
                                  {cat !== 'cash' && ci.pnl !== 0 && !pricesFailed && (
                                    <>
                                      <span className="dvx-cat-group-sep">·</span>
                                      <span style={{ color: ci.pnl >= 0 ? 'var(--g-ink)' : '#f87171' }}>
                                        {ci.pnl >= 0 ? '+' : '-'}{hidden ? '••' : cv(ci.pnl)} ({ci.pnlPct >= 0 ? '+' : ''}{ci.pnlPct.toFixed(1)}%)
                                      </span>
                                    </>
                                  )}
                                </span>
                              )}
                            </div>
                            {/* Sub-category badge chips — shown inside the group when >1 badge type exists */}
                            {badgesByCategory[cat]?.length > 1 && (
                              <div style={{ display:'flex', gap:'0.3rem', flexWrap:'wrap', padding:'0.3rem 0 0.4rem' }}>
                                {['all', ...badgesByCategory[cat]].map(badge => {
                                  const isActive = holdingsBadge === badge
                                  const badgeColor = badge !== 'all' ? (CRYPTO_CATEGORY_COLORS[badge] || STOCK_SECTOR_COLORS[badge] || '#6366f1') : null
                                  return (
                                    <button key={badge} onClick={() => setHoldingsBadge(badge)} style={{ background: isActive ? (badgeColor || 'var(--g)') : 'var(--surface-2)', color: isActive ? '#fff' : 'var(--text-muted)', border: `1px solid ${isActive ? (badgeColor || 'var(--g)') : 'var(--border)'}`, borderRadius:'20px', padding:'0.15rem 0.5rem', fontSize:'0.68rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                                      {badge === 'all' ? 'All' : badge}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                            <ul className="dvx-holdings" style={{ margin:0 }}>
                              {(() => {
                                const symCount = {}
                                grouped[cat].forEach(h => { const s = (h.coin_symbol||'').toUpperCase(); symCount[s] = (symCount[s]||0) + 1 })
                                const dupSymbols = new Set(Object.keys(symCount).filter(s => symCount[s] > 1))
                                return grouped[cat].map(h => {
                                const isDupTicker = dupSymbols.has((h.coin_symbol||'').toUpperCase())
                                const displayValue  = h.value > 0 ? h.value : h.total_invested
                                const isStable          = categorizeAsset(h) === 'cash' || isStablecoin(h.coin_id, h.coin_symbol)
                                const isCryptoOnly      = !isStable && categorizeAsset(h) === 'crypto'
                                const hasPnl        = h.pnl !== 0 && !pricesFailed && !isStable
                                const breakEvenPrice = h.amount > 0 ? h.total_invested / h.amount : 0
                                const beDistance     = h.price > 0 && breakEvenPrice > 0
                                  ? ((h.price - breakEvenPrice) / breakEvenPrice) * 100 : 0
                                const bePct = h.price > 0 && breakEvenPrice > 0
                                  ? Math.min(100, (h.price / breakEvenPrice) * 100) : 0
                                const isSelected = selectedAssets.has(h.coin_id)
                                const isDimmed   = selectedAssets.size > 0 && !isSelected
                                return (
                                  <li key={h.coin_id} className={`dvx-holding holo-card-v2${isSelected ? ' selected' : ''}`}
                                    style={{ opacity: isDimmed ? 0.3 : 1, transition: 'opacity 0.15s', '--row-col': CATEGORY_COLOR[categorizeAsset(h)] || 'var(--g)' }}
                                    onClick={() => { if (!isDemo) { track('asset_click', { asset_id: h.coin_id, symbol: h.coin_symbol }); navigate(`/asset/${encodeURIComponent(h.coin_id)}`) } }}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onClick={e => e.stopPropagation()}
                                      onChange={() => setSelectedAssets(prev => { const n = new Set(prev); if (n.has(h.coin_id)) n.delete(h.coin_id); else n.add(h.coin_id); return n })}
                                      style={{ flexShrink:0, width:'16px', height:'16px', marginRight:'0.5rem', cursor:'pointer', accentColor:'var(--g)' }}
                                    />
                                    <CoinLogo image={h.coin_image} symbol={h.coin_symbol} coinId={h.coin_id} size={36} className="dvx-holding-icon" />
                                    <div className="dvx-holding-body">
                                      <div className="dvx-holding-line1">
                                        <div className="dvx-holding-meta">
                                          <strong>{h.coin_symbol?.toUpperCase()}</strong>
                                          {isStable && <span className="dvx-stable-badge">STABLE</span>}
                                          {!isStable && (() => { const b = getAssetCategoryBadge(h); return b ? <span className="dvx-cat-badge" style={{ background: b.color + '22', color: b.color, borderColor: b.color + '44' }}>{b.label}</span> : null })()}
                                          {isDupTicker && <span className="dvx-cat-badge" style={{ background:'#f59e0b22', color:'#f59e0b', borderColor:'#f59e0b44', cursor:'help' }} title={`Two holdings share the ticker ${(h.coin_symbol||'').toUpperCase()} — one may have a wrong ID. Delete the one with no price and re-add it.`}><Icon name="warning" size={11} style={{ verticalAlign:'-1px', marginRight:'0.25em' }} />dup</span>}
                                        </div>
                                        <div className="dvx-holding-valblock">
                                          <div className="dvx-holding-val">{cv(displayValue)}</div>
                                          {!showBreakEven && hasPnl && (
                                            <span className={`dvx-holding-pnl-pill ${h.pnl >= 0 ? 'pos' : 'neg'}`}>
                                              {h.pnl >= 0 ? '▲' : '▼'} {cv(h.pnl)} ({pct(h.pnlPct)})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {showBreakEven ? (
                                        <span className="muted dvx-holding-detail" style={{ fontSize:'0.72rem' }}>
                                          Break-even: <span style={{ color: beDistance >= 0 ? 'var(--g-ink)' : '#f87171', fontWeight:700 }}>
                                            {cv(breakEvenPrice)}
                                          </span>
                                          {h.price > 0 && <span style={{ color: beDistance >= 0 ? 'var(--g-ink)' : '#f87171' }}>
                                            {' '}{beDistance >= 0 ? '↑ ' : '↓ '}{Math.abs(beDistance).toFixed(1)}% {beDistance >= 0 ? 'above' : 'below'}
                                          </span>}
                                        </span>
                                      ) : (
                                        <div className="dvx-holding-stats">
                                          {h.price > 0 ? (() => {
                                            const ch = Number(h.pct24h) || 0
                                            const priceColor = ch > 0 ? 'var(--g-ink)' : ch < 0 ? '#f87171' : undefined
                                            return <span className="dvx-hstat"><em>Price</em><b style={{ color: priceColor }}>{cv(h.price)}</b></span>
                                          })() : <span className="dvx-hstat"><em>Invested</em><b>{cv(h.total_invested)}</b></span>}
                                          {breakEvenPrice > 0 && categorizeAsset(h) !== 'cash' && (
                                            <span className="dvx-hstat"><em>Avg</em><b>{cv(breakEvenPrice)}</b></span>
                                          )}
                                          <span className="dvx-hstat dvx-hstat-qty"><em>Qty</em><b>{Number(h.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} {Number(h.amount) === 1 ? 'unit' : 'units'}</b></span>
                                        </div>
                                      )}
                                      {showBreakEven && h.price > 0 && breakEvenPrice > 0 && (
                                        <div className="dvx-be-bar-wrap">
                                          <div className="dvx-be-bar-track">
                                            <div className="dvx-be-bar-fill" style={{
                                              width: `${bePct}%`,
                                              background: beDistance >= 0 ? 'var(--g)' : '#f87171',
                                            }} />
                                            <div className="dvx-be-bar-marker" />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    {!isDemo && (() => {
                                      const actionsOpen = expandedActions.has(h.coin_id)
                                      return (<>
                                      <button
                                        className={`dvx-ha-toggle${actionsOpen ? ' open' : ''}`}
                                        aria-label="Asset actions" title="Actions"
                                        aria-expanded={actionsOpen}
                                        onClick={e => { e.stopPropagation(); setExpandedActions(prev => { const n = new Set(prev); if (n.has(h.coin_id)) n.delete(h.coin_id); else n.add(h.coin_id); return n }) }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
                                      </button>
                                      <div className={`dvx-holding-actions${actionsOpen ? ' open' : ''}`} onClick={e => e.stopPropagation()}>
                                        {!isStable && (
                                          <button className="dvx-ha-btn"
                                            onClick={() => navigate('/dashboard', { state: { tab: 'targets' } })}>
                                            <Icon name="target" size={13} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />Set Target
                                          </button>
                                        )}
                                        <button className="dvx-ha-btn"
                                          onClick={() => navigate('/vision', { state: { linkAsset: h.coin_id } })}>
                                          <Icon name="map" size={13} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />Set Vision
                                        </button>
                                        {isCryptoOnly && (
                                          <button className="dvx-ha-btn"
                                            onClick={() => navigate('/technicals')}>
                                            <Icon name="ruler" size={13} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />Technicals
                                          </button>
                                        )}
                                        {isCryptoOnly && (
                                          <button className="dvx-ha-btn"
                                            onClick={() => navigate('/dashboard', { state: { tab: 'tools', tool: 'ta' } })}>
                                            <Icon name="sparkles" size={13} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />Magic Score
                                          </button>
                                        )}
                                        {!isStable && (
                                          <button className="dvx-ha-btn"
                                            onClick={() => navigate('/dashboard', { state: { tab: 'tools', tool: 'risk' } })}>
                                            <Icon name="search" size={13} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />Risk Scan
                                          </button>
                                        )}
                                      </div>
                                      </>)
                                    })()}
                                  </li>
                                )
                              })
                            })()}
                            </ul>
                          </div>
                        )})
                      })()}
                    </div>
                    {!isHoldingsFiltered && filteredHoldings.length > 6 && (
                      <button className="dvx-show-more" onClick={() => setShowAllHoldings(v => !v)}>
                        {showAllHoldings ? '▲ Show less' : `▼ Show all ${filteredHoldings.length} assets`}
                      </button>
                    )}
                  </>
                }
              </div>

              {/* Portfolio Heatmap */}
              {cardVis.portfolio_heatmap && !isDemo && enriched.length >= 2 && !pricesFailed && (
                <PortfolioHeatmap enriched={enriched} prices={prices} totalValue={totalValue} />
              )}

              {/* Recent transactions card removed */}
            </div>

            {/* Right column — order: -1 on mobile so it renders before left col */}
            <div className="dvx-col-side">

              {/* ── Allocation donut (by category) ── */}
              {cardVis.allocation && <div className="glass-card">
                <h3>{pricesFailed ? t('allocationInvested') : 'Net Worth by Category'}</h3>
                {catAllocData.length === 0
                  ? <p className="muted">{t('noHoldings')}</p>
                  : <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={catAllocData} dataKey="value" cx="50%" cy="50%"
                          innerRadius="60%" outerRadius="85%" stroke="none" paddingAngle={2}>
                          {catAllocData.map((d, i) => <Cell key={i} fill={CATEGORY_COLOR[d.cat] || PALETTE[i % PALETTE.length]}/>)}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color:'var(--text)', fontWeight:700 }} labelStyle={{ color:'var(--text)', fontWeight:700 }} formatter={(v, n) => [cv(v), n]}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="dvx-legend">
                      {catAllocData.map((d, i) => (
                        <li key={d.name} className="dvx-legend-item">
                          <span className="dvx-legend-dot" style={{ background: CATEGORY_COLOR[d.cat] || PALETTE[i % PALETTE.length] }}/>
                          <span className="dvx-legend-name">{d.name}</span>
                          <span className="dvx-legend-val">{d.pct.toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => { track('rebalance_open', { source: 'dashboard_allocation' }); setRebalanceOpen(true) }}
                      style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem', width:'100%', marginTop:'0.85rem', padding:'0.55rem 0.75rem', background:'rgba(var(--g-rgb),0.1)', border:'1.5px solid rgba(var(--g-rgb),0.25)', borderRadius:'10px', color:'var(--g)', fontWeight:700, fontSize:'0.78rem', cursor:'pointer', transition:'background 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.background='rgba(var(--g-rgb),0.18)'}
                      onMouseOut={e => e.currentTarget.style.background='rgba(var(--g-rgb),0.1)'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      Rebalance my portfolio
                    </button>
                  </>
                }
              </div>}

              {/* Net Worth History — removed */}
              {false && !isDemo && transactions.length > 0 && (() => {
                const now = Date.now()
                const days = 30
                const points = Array.from({ length: days }, (_, i) => {
                  const cutoff = now - (days - 1 - i) * 86400000
                  const invested = transactions
                    .filter(tx => new Date(tx.date).getTime() <= cutoff)
                    .reduce((s, tx) => {
                      const val = (tx.amount || 0) * (tx.price_per_unit || 0)
                      return tx.type === 'buy' ? s + val : s - val
                    }, 0)
                  return { day: i + 1, v: Math.max(0, invested) }
                })
                const minV = Math.min(...points.map(p => p.v))
                const maxV = Math.max(...points.map(p => p.v))
                if (maxV === minV) return null
                return (
                  <div className="glass-card">
                    <div style={CHART_HDR_STYLE}>
                      <h3 style={{ margin:0, display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="pulse" size={16} style={{ color: 'var(--g-ink)', fontWeight: 700 }} />Net Worth History</h3>
                      <span className="muted" style={{ fontSize:'0.72rem' }}>30-day invested capital</span>
                    </div>
                    <ResponsiveContainer width="100%" height={175}>
                      <AreaChart data={points} margin={{ left:0, right:8, top:10, bottom:0 }}>
                        <defs>
                          <linearGradient id="nwg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--g)" stopOpacity={0.22}/>
                            <stop offset="75%" stopColor="var(--g)" stopOpacity={0.04}/>
                            <stop offset="100%" stopColor="var(--g)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} strokeDasharray="2 6"/>
                        <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:9 }} axisLine={false} tickLine={false}
                          tickFormatter={v => cvN(v)} width={42}/>
                        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color:'var(--text)', fontWeight:700 }} labelStyle={{ color:'var(--text)', fontWeight:700 }} formatter={v => [cv(v), 'Invested']} labelFormatter={l => `Day ${l}`} cursor={{ stroke:'rgba(255,255,255,0.12)' }}/>
                        <Area type="monotone" dataKey="v" stroke="var(--g)" strokeWidth={1.5} fill="url(#nwg)" dot={false} activeDot={{ r:4, fill:'var(--g)', stroke:'var(--bg)', strokeWidth:2 }}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}

              {/* Market Mood — sentiment from crypto headlines */}
              {cardVis.market_mood && <MarketMood />}

              {/* Stale price warning */}
              {staleAssets.length > 0 && (
                <div style={{ background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'12px', padding:'0.65rem 1rem', display:'flex', gap:'0.6rem', alignItems:'flex-start', marginBottom:'0.5rem' }}>
                  <span style={{ flexShrink:0, display:'inline-flex' }}><Icon name="warning" size={15} /></span>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', lineHeight:1.5 }}>
                    <strong style={{ color:'#f59e0b' }}>Stale prices:</strong>{' '}
                    {staleAssets.map(h => h.coin_symbol?.toUpperCase()).join(', ')} — prices are over 7 days old.
                    Update them via Add Trade to keep your portfolio value accurate.
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── Secondary content — below the fold ─────────────────────── */}

          {/* Today's Movers — actionable daily insight */}
          {cardVis.movers && !isDemo && enriched.length >= 2 && !pricesFailed && (
            <div className="glass-card dvx-movers-card">
              <h3 style={{ margin:'0 0 0.75rem', display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="trend-up" size={16} style={{ color: 'var(--g-ink)', fontWeight: 700 }} />Today's Movers</h3>
              <div className="dvx-movers-row">
                {[...enriched]
                  .filter(h => prices[h.coin_id]?.usd_24h_change != null)
                  .sort((a, b) => (prices[b.coin_id]?.usd_24h_change ?? 0) - (prices[a.coin_id]?.usd_24h_change ?? 0))
                  .slice(0, 3)
                  .map(h => {
                    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
                    return (
                      <div key={h.coin_id} className="dvx-mover-item dvx-mover-up">
                        <CoinLogo image={h.coin_image} symbol={h.coin_symbol} coinId={h.coin_id} size={28} />
                        <div className="dvx-mover-meta">
                          <strong>{h.coin_symbol?.toUpperCase()}</strong>
                          <span style={{ color: 'var(--g-ink)', fontWeight: 700 }}>+{chg.toFixed(2)}%</span>
                        </div>
                        <div className="dvx-mover-impact" style={{ color: 'var(--g-ink)', fontWeight: 700 }}>
                          +${fmt(h.value * chg / 100)}
                        </div>
                      </div>
                  )
                })}
              </div>
              <div className="dvx-movers-divider" />
              <div className="dvx-movers-row">
                {topLosers.map(h => {
                  const chg = prices[h.coin_id]?.usd_24h_change ?? 0
                  return (
                    <div key={h.coin_id} className="dvx-mover-item dvx-mover-dn">
                      <CoinLogo image={h.coin_image} symbol={h.coin_symbol} coinId={h.coin_id} size={28} />
                      <div className="dvx-mover-meta">
                        <strong>{h.coin_symbol?.toUpperCase()}</strong>
                        <span style={{ color:'#f87171' }}>{chg.toFixed(2)}%</span>
                      </div>
                      <div className="dvx-mover-impact" style={{ color:'#f87171' }}>
                        {chg < 0 ? '-' : ''}${fmt(Math.abs(h.value * chg / 100))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* AI Decision Engine */}
          {enriched.length > 0 && (
            <Suspense fallback={<TabFallback />}><AIDecisionEngine
              enriched={enriched}
              prices={prices}
              transactions={transactions}
              totalValue={totalValue}
              totalInvested={totalInvested}
            /></Suspense>
          )}

          {/* Risk Profile */}
          {!isDemo && enriched.length > 0 && (
            <RiskProfileCard enriched={enriched} totalValue={totalValue} />
          )}

          {/* Wallet Evaluation */}
          {enriched.length > 0 && (
            <WalletEvalTab
              enriched={enriched}
              totalValue={totalValue}
              targets={Object.entries(coinTargets).map(([coin_id, v]) => ({ coin_id, ...v }))}
            />
          )}


          {/* Correlation, heatmap — below-fold, loaded lazily */}
          <Suspense fallback={null}>
            {cardVis.correlation && enriched.length >= 2 && <CorrelationMatrix enriched={enriched} />}
            {cardVis.sector_heatmap && hasCryptoExposure(enriched) && <SectorHeatmap />}
          </Suspense>
        </>
      )}


      {/* ══ WATCHLIST ══ */}
      {activeTab === 'watchlist' && (
        <Suspense fallback={<TabFallback />}>
          <Watchlist portfolioPrices={prices} />
        </Suspense>
      )}

      {/* ══ SELL TARGETS ══ */}
      {activeTab === 'targets' && (
        <TargetsTab
          enriched={enriched}
          targetsAnalysis={targetsAnalysis}
          coinTargets={coinTargets}
          prices={prices}
          onTargetsChange={loadAll}
        />
      )}

      {/* ══ ANALYSIS (AI + Risk + Eval) ══ */}
      {activeTab === 'tools' && enriched.length === 0 && (
        <div className="glass-card" style={{ textAlign:'center', padding:'1.5rem 1.25rem 1.25rem', marginBottom:'1rem' }}>
          <FeatureSlideshow />
          <div style={{ fontWeight:800, fontSize:'1rem', color:'var(--text)', marginBottom:'0.3rem' }}>
            Add holdings to unlock AI analysis
          </div>
          <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'1.25rem' }}>
            Import your portfolio in seconds — no account needed
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.55rem', marginBottom:'0.75rem' }}>
            <button onClick={() => openSheet('buy', 'tools_empty')} style={{ display:'flex', alignItems:'center', gap:'0.45rem', padding:'0.7rem 0.75rem', borderRadius:'12px', cursor:'pointer', background:'rgba(var(--g-rgb),0.1)', border:'1.5px solid rgba(var(--g-rgb),0.3)', color: 'var(--g-ink)', fontWeight: 700, fontWeight:700, fontSize:'0.82rem' }}>
              <span style={{ fontSize:'1rem', fontWeight:700 }}>+</span> Start adding assets
            </button>
            <button onClick={() => { setShowBackupCode(v => !v); setShowExcelImport(false); setShowVoiceImport(false) }} style={{ display:'flex', alignItems:'center', gap:'0.45rem', padding:'0.7rem 0.75rem', borderRadius:'12px', cursor:'pointer', background:'rgba(var(--g-rgb),0.1)', border:'1.5px solid rgba(var(--g-rgb),0.3)', color:'var(--g-ink)', fontWeight:700, fontSize:'0.82rem' }}>
              <Icon name="folder" size={15} /> Import backup
            </button>
            <button onClick={() => { setShowVoiceImport(v => !v); setShowExcelImport(false); setShowBackupCode(false) }} style={{ display:'flex', alignItems:'center', gap:'0.45rem', padding:'0.7rem 0.75rem', borderRadius:'12px', cursor:'pointer', background:'rgba(var(--g-rgb),0.1)', border:'1.5px solid rgba(var(--g-rgb),0.3)', color:'var(--g-ink)', fontWeight:700, fontSize:'0.82rem' }}>
              <Icon name="mic" size={15} /> Voice import
            </button>
            <button onClick={() => { setShowExcelImport(v => !v); setShowVoiceImport(false); setShowBackupCode(false) }} style={{ display:'flex', alignItems:'center', gap:'0.45rem', padding:'0.7rem 0.75rem', borderRadius:'12px', cursor:'pointer', background:'rgba(var(--g-rgb),0.1)', border:'1.5px solid rgba(var(--g-rgb),0.3)', color:'var(--g-ink)', fontWeight:700, fontSize:'0.82rem' }}>
              <Icon name="bar-chart" size={15} /> Import Excel
            </button>
          </div>
          {showVoiceImport && <Suspense fallback={<TabFallback />}><VoiceImport hideTrigger onImported={loadAll} /></Suspense>}
          {showExcelImport && <Suspense fallback={null}><div className="dvx-excel-import-panel glass-card"><SmartImport wallets={wallets} onImported={() => { loadAll(); setShowExcelImport(false) }} /></div></Suspense>}
          {showBackupCode && <DataPanel onRefresh={loadAll} onImported={() => setActiveTab('overview')} />}
        </div>
      )}
      {activeTab === 'tools' && enriched.length > 0 && (
        <ToolsTab
          enriched={enriched}
          prices={prices}
          transactions={transactions}
          totalValue={totalValue}
          isDemo={isDemo}
          pricesLoading={pricesLoading}
          coinTargets={coinTargets}
          initialTool={location.state?.tool}
        />
      )}

      {/* ══ ALERTS (Price + Smart) ══ */}
      {activeTab === 'alerts' && (
        <AlertsSection enriched={enriched} prices={prices} isDemo={isDemo} />
      )}

      {/* ══ MANAGE (Wallets + Backup) ══ */}
      {activeTab === 'manage' && (
        <div className="dvx-form-page">

          {/* ── Onboarding tutorial — animated, tracks real progress ── */}
          {!onboardDismissed && !(wallets.length > 0 && transactions.length > 0 && enriched.length > 0 && aiSeen) && (
            <OnboardingTutorial
              wallets={wallets}
              transactions={transactions}
              enriched={enriched}
              aiSeen={aiSeen}
              onCreateWallet={() => {
                const el = document.getElementById('wl-wallet-create')
                if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => el.querySelector('input')?.focus(), 350) }
              }}
              onAddTrade={() => openSheet('buy', 'onboarding')}
              onViewDashboard={() => setActiveTab('overview')}
              onOpenAI={() => setActiveTab('tools')}
              onDismiss={dismissOnboard}
            />
          )}

          <div className="glass-card dvx-form-card" id="wl-wallet-create">
            <h3>{t('walletsTitle')(wallets.length)}</h3>
            <WalletPanel wallets={wallets} onRefresh={loadAll} onCreated={() => {
              // After creating a wallet, let the user choose HOW to add holdings
              // (manual / voice / Excel / backup) — only when none exist yet.
              if (transactions.length === 0) setTimeout(() => { setImportMode('menu'); setImportChooser(true) }, 300)
            }} />
          </div>
          <div className="glass-card dvx-form-card">
            <h3>{t('backupTitle')}</h3>
            <DataPanel onRefresh={loadAll} onImported={() => setActiveTab('overview')} />
          </div>
          <div className="glass-card dvx-form-card">
            <h3>Browser Extension</h3>
            <p className="dvx-data-hint" style={{ marginBottom: '0.75rem' }}>
              Track your portfolio from the toolbar in Chrome, Edge or Brave — it syncs automatically whenever this page is open.
            </p>
            <InstallExtension variant="badge" source="dashboard_data_tab" />
          </div>
          <div className="glass-card dvx-form-card">
            <h3>Smart Import</h3>
            <p className="dvx-data-hint" style={{ marginBottom: '0.9rem' }}>Import your net worth smartly — pick a method.</p>
            <div className="wl-import-tree">
              {[
                { key:'excel',      icon:'bar-chart', label:'Excel / CSV', desc:'Switch from messy spreadsheets to WalletLens', color:'167,139,250' },
                { key:'voice',      icon:'mic',       label:'Voice',       desc:'Skip the typing — just say your trades',       color:'16,185,129' },
                { key:'screenshot', icon:'camera',    label:'Screenshot',  desc:'Turn any exchange screenshot into holdings',   color:'244,114,182' },
              ].map(m => {
                const open = openImport === m.key
                return (
                  <div className={`wl-import-branch${open ? ' open' : ''}`} key={m.key}>
                    <button className="wl-import-node" style={{ '--c': `rgb(${m.color})`, '--cbg': `rgba(${m.color},0.12)` }}
                      aria-expanded={open}
                      onClick={() => { const next = open ? null : m.key; setOpenImport(next); if (next) track('smart_import_open', { method: m.key }) }}>
                      <span className="wl-import-node-icon"><Icon name={m.icon} size={18} /></span>
                      <span className="wl-import-node-text">
                        <span className="wl-import-node-label">{m.label}</span>
                        <span className="wl-import-node-desc">{m.desc}</span>
                      </span>
                      <span className="wl-import-node-chev">{open ? '▾' : '▸'}</span>
                    </button>
                    {open && (
                      <div className="wl-import-panel">
                        <Suspense fallback={<TabFallback />}>
                          {m.key === 'excel'      && <SmartImport wallets={wallets} onImported={loadAll} />}
                          {m.key === 'voice'      && <VoiceImport hideTrigger onImported={loadAll} />}
                          {m.key === 'screenshot' && <SmartImport wallets={wallets} defaultMode="screenshot" onImported={loadAll} />}
                        </Suspense>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ IMPORT-METHOD CHOOSER (after creating a wallet) ══ */}
      {importChooser && createPortal(
        <div onClick={() => setImportChooser(false)} style={{
          position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.6)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem',
        }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{
            width:'min(440px,96vw)', maxHeight:'88vh', overflowY:'auto',
            borderRadius:'20px', padding:'1.4rem 1.25rem', position:'relative',
          }}>
            <button onClick={() => setImportChooser(false)} aria-label="Close" style={{
              position:'absolute', top:10, right:10, width:40, height:40,
              border:'none', background:'none', color:'var(--text-muted)',
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
            </button>

            {importMode === 'menu' ? (
              <>
                <div style={{ textAlign:'center', marginBottom:'1.1rem' }}>
                  <div style={{ display:'flex', justifyContent:'center', marginBottom:'0.6rem' }}><Logo size={40} animated /></div>
                  <div style={{ fontWeight:800, fontSize:'1.05rem', color:'var(--text)' }}>Wallet created</div>
                  <div style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>How would you like to add your holdings?</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.6rem' }}>
                  {[
                    { icon:'notes', label:'Add manually', desc:'Type a trade', color:'52,211,153', fn:() => { setImportChooser(false); openSheet('buy', 'wallet_created') } },
                    { icon:'mic', label:'Voice import', desc:'Just say it', color:'16,185,129', fn:() => setImportMode('voice') },
                    { icon:'camera', label:'Screenshot', desc:'AI reads it', color:'244,114,182', fn:() => setImportMode('screenshot') },
                    { icon:'bar-chart', label:'Excel / CSV', desc:'Upload a file', color:'167,139,250', fn:() => setImportMode('excel') },
                    { icon:'folder', label:'Restore backup', desc:'Paste a code', color:'96,165,250', fn:() => setImportMode('backup') },
                  ].map(o => (
                    <button key={o.label} onClick={o.fn} style={{
                      display:'flex', flexDirection:'column', alignItems:'flex-start', gap:'0.2rem',
                      padding:'0.85rem 0.9rem', borderRadius:'14px', cursor:'pointer', textAlign:'left',
                      background:`rgba(${o.color},0.1)`, border:`1.5px solid rgba(${o.color},0.3)`,
                      color:`rgb(${o.color})`,
                    }}>
                      <Icon name={o.icon} size={22} style={{ color:`rgb(${o.color})` }} />
                      <span style={{ fontWeight:800, fontSize:'0.88rem', color:'var(--text)' }}>{o.label}</span>
                      <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{o.desc}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button onClick={() => setImportMode('menu')} style={{
                  display:'inline-flex', alignItems:'center', gap:'0.3rem', marginBottom:'0.9rem',
                  background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontWeight:700, fontSize:'0.8rem',
                }}>‹ Back</button>
                {importMode === 'voice' && <Suspense fallback={<TabFallback />}><VoiceImport hideTrigger onImported={() => { loadAll(); setImportChooser(false) }} /></Suspense>}
                {importMode === 'screenshot' && <Suspense fallback={<TabFallback />}><SmartImport wallets={wallets} defaultMode="screenshot" onImported={() => { loadAll(); setImportChooser(false) }} /></Suspense>}
                {importMode === 'excel' && <Suspense fallback={<TabFallback />}><SmartImport wallets={wallets} onImported={() => { loadAll(); setImportChooser(false) }} /></Suspense>}
                {importMode === 'backup' && <DataPanel onRefresh={loadAll} onImported={() => { loadAll(); setImportChooser(false) }} />}
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ══ TRADE BOTTOM SHEET ══ */}
      <Suspense fallback={null}>
        <TradeSheet
          open={sheetOpen}
          type={sheetType}
          onClose={() => setSheetOpen(false)}
          wallets={wallets}
          onDone={() => {
            const wasFirstTrade = transactions.length === 0
            loadAll()
            window.dispatchEvent(new Event('wl:portfolio-updated'))
            // First trade ever → jump to Overview + fire "set a target" nudge
            if (wasFirstTrade) {
              setTimeout(() => setActiveTab('overview'), 200)
              setTimeout(() => {
                const seen = new Set(JSON.parse(localStorage.getItem('wl_milestones_seen') || '[]'))
                if (!seen.has('first_buy')) {
                  setMilestone({ key: 'first_buy', type: 'first_buy', emoji: 'target', title: 'First trade logged!', sub: 'Set a price target so you know exactly when to take profit or cut losses.', ctaLabel: 'Set a Price Target' })
                }
              }, 1400)
            }
          }}
          holdings={enriched}
          prefillCoin={sheetPrefill?.coin}
          prefillCategory={sheetPrefill?.category}
          prefillStockTicker={sheetPrefill?.stockTicker}
          variant="page"
        />
      </Suspense>

      </div>{/* end tab-content transition wrapper */}

      {/* ── Nudge toast — appears after 20s idle · swipe sideways to dismiss ── */}
      {nudgeVisible && !sheetOpen && (
        <div {...nudgeSwipe} style={{
          position: 'fixed', bottom: '148px', left: '50%',
          zIndex: 9001, display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: 'var(--bg4)', border: '1px solid var(--border)',
          borderRadius: '50px', padding: '0.6rem 1rem 0.6rem 0.75rem',
          boxShadow: 'var(--shadow)',
          whiteSpace: 'nowrap', cursor: 'grab',
          ...nudgeSwipeStyle,
        }}>
          <Icon name="bar-chart" size={15} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Log your latest trade</span>
          <button onClick={() => { setNudgeVisible(false); openSheet('buy', 'nudge_toast') }} style={{
            padding: '0.35rem 0.85rem', borderRadius: '50px', border: 'none', cursor: 'pointer',
            background: 'var(--g)', color: '#000', fontWeight: 800, fontSize: '0.8rem',
          }}>Buy</button>
          <button onClick={() => { setNudgeVisible(false); openSheet('sell', 'nudge_toast') }} style={{
            padding: '0.35rem 0.85rem', borderRadius: '50px', cursor: 'pointer',
            background: 'rgba(248,113,113,0.15)', color: '#f87171', fontWeight: 800, fontSize: '0.8rem',
            border: '1px solid rgba(248,113,113,0.3)',
          }}>Sell</button>
          <button onClick={() => setNudgeVisible(false)} style={{
            background: 'none', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
          }}>×</button>
        </div>
      )}

      {weeklyOpen && (
        <Suspense fallback={null}><WeeklyReport
          enriched={isDemo ? [] : enriched}
          totalValue={totalValue}
          onClose={() => setWeeklyOpen(false)}
        /></Suspense>
      )}
      {shareOpen && (
        <Suspense fallback={null}>
          <ShareCard
            totalValue={totalValue}
            totalPnL={totalPnL}
            totalPnLPct={totalPnLPct}
            topHoldings={enriched.slice(0, 4)}
            todayPnL={enriched.reduce((s, h) => s + (h.value * (h.pct24h || 0) / 100), 0)}
            perfSeries={perfSeries}
            onClose={() => setShareOpen(false)}
          />
        </Suspense>
      )}
      {milestone && (
        <MilestonePopup
          milestone={milestone}
          totalValue={totalValue}
          totalPnL={totalPnL}
          totalPnLPct={totalPnLPct}
          topHoldings={enriched.slice(0, 4)}
          todayPnL={enriched.reduce((s, h) => s + (h.value * (h.pct24h || 0) / 100), 0)}
          onShare={() => { setMilestone(null); setShareOpen(true) }}
          onDismiss={() => setMilestone(null)}
          onCta={milestone.type === 'first_buy' ? () => { setActiveTab('targets'); track('first_buy_cta_targets') } : undefined}
        />
      )}
      {rebalanceOpen && (
        <RebalancePanel
          open={rebalanceOpen}
          onClose={() => setRebalanceOpen(false)}
          holdings={enriched.map(h => ({
            id: h.coin_id || h.coin_symbol,
            sym: (h.coin_symbol || h.coin_id || '').toUpperCase(),
            value: h.value || 0,
            bucket: rebalBucket(h),
          }))}
          cv={cv}
        />
      )}

      {/* First-run flow for a brand-new user: interests → cash/USDT balances.
          Both steps are skippable and only show while there are no holdings. */}
      {loaded && !isDemo && transactions.length === 0 && obStep === 'interests' && (
        <InterestPicker onDone={() => setObStep(hasStarted() ? 'done' : 'balances')} />
      )}
      {loaded && !isDemo && transactions.length === 0 && obStep === 'balances' && (
        <WelcomeStart onDone={() => { setObStep('done'); loadAll() }} />
      )}
    </div>
  )
}
