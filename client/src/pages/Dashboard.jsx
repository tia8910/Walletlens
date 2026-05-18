import { lazy, Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts'
import { api } from '../api'
import { POPULAR_FIAT } from '../data/assets'
import TradeSheet from '../components/TradeSheet'
import ShareCard from '../components/ShareCard'
import TradeTips from '../components/TradeTips'
import CoinLogo from '../components/CoinLogo'
import { useLanguage } from '../LanguageContext'
import { useTheme, THEMES } from '../ThemeContext'
import { track, trackPortfolioLoaded } from '../analytics'
import { saveSnapshot, getSnapshotsForDays, hasRealData } from '../snapshots'
import NewsTicker from '../components/NewsTicker'
import ExchangePartners from '../components/ExchangePartners'

// Heavy components only loaded when the user opens that tab
const PriceAlerts    = lazy(() => import('../components/PriceAlerts'))
const SmartAlerts    = lazy(() => import('../components/SmartAlerts'))
const RiskScanner    = lazy(() => import('../components/RiskScanner'))
const RiskBudget     = lazy(() => import('../components/RiskBudget'))
const AIDecisionEngine = lazy(() => import('../components/AIDecisionEngine'))
const AISellPlan     = lazy(() => import('../components/AISellPlan'))
const WeeklyReport   = lazy(() => import('../components/WeeklyReport'))

function TabFallback() {
  return <div style={{ padding:'2rem', textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:'0.85rem' }}>Loading…</div>
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
}

// ── Market-cap tier classifier ────────────────────────────────────────────
const MC_TIERS = [
  { id: 'mega',       label: 'Mega Cap',         min: 100e9,  color: 'var(--g)', emoji: '🐋' },
  { id: 'large',      label: 'Large Cap',        min: 10e9,   color: '#3b82f6', emoji: '🔵' },
  { id: 'mid',        label: 'Mid Cap',          min: 1e9,    color: '#f59e0b', emoji: '🟡' },
  { id: 'small',      label: 'Small Cap',        min: 100e6,  color: '#f87171', emoji: '🔴' },
  { id: 'micro',      label: 'Micro Cap',        min: 0,      color: '#8b5cf6', emoji: '💜' },
  { id: 'non-crypto', label: 'Non-Crypto Assets', min: -1,    color: '#a78bfa', emoji: '🏦' },
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

// ── Asset category classifier ─────────────────────────────────────────────
function categorizeAsset(h) {
  const id = (h.coin_id || '').toLowerCase()
  const sym = (h.coin_symbol || '').toLowerCase()
  if (id.startsWith('metal:') || ['xau','xag','xpt','xpd'].includes(sym)) return 'metals'
  if (id.startsWith('stock:') || ['aapl','msft','tsla','amzn','nvda','googl','goog','meta','nflx','baba','v','jpm','wmt'].includes(sym)) return 'stocks'
  if (id.startsWith('real:') || id.includes('appartment') || id.includes('apartment') || id.includes('property') || sym.includes('appartment') || sym.includes('property') || sym.includes('reit') || sym === 'real') return 'realestate'
  if (id.startsWith('cash:') || id.startsWith('fiat:') || ['usd','eur','gbp','jpy','us','usdt','usdc','dai','busd','tusd','frax','usdd'].includes(sym)) return 'cash'
  return 'crypto'
}

const CATEGORY_ORDER = ['crypto', 'metals', 'stocks', 'realestate', 'cash']
const CATEGORY_LABELS = {
  crypto: '₿ Crypto',
  metals: '🟡 Precious Metals',
  stocks: '📈 Stocks & ETFs',
  realestate: '🏠 Real Estate',
  cash: '💵 Cash & Stables',
}

// ── AI analysis engine ────────────────────────────────────────────────────
function computeAI(enriched, prices, transactions, totalValue) {
  if (!enriched.length || totalValue === 0) return null

  // Weights (0-1 each)
  const weights = enriched.map(h => h.value / totalValue)
  const n = enriched.length

  // 1. Concentration (Herfindahl-Hirschman Index, 0=perfect, 1=single asset)
  const hhi = weights.reduce((s, w) => s + w * w, 0)
  const hhiNorm = (hhi - 1/n) / (1 - 1/n + 1e-9)   // 0=diverse, 1=concentrated
  const concentrationScore = Math.round((1 - hhiNorm) * 100)

  // 2. Diversification (unique assets, ideal 5-12)
  const assetScore = n >= 12 ? 85 : n >= 7 ? 100 : n >= 4 ? 85 : n >= 2 ? 65 : 30

  // 3. Momentum — weighted 24h change
  const momentum = enriched.reduce((s, h, i) => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return s + chg * weights[i]
  }, 0)
  const momentumScore = Math.min(100, Math.max(0, 50 + momentum * 3))

  // 4. P&L health
  const pnlScore = enriched.reduce((s, h, i) => s + (h.pnl >= 0 ? 20 : -10) * weights[i], 0)
  const pnlHealth = Math.min(100, Math.max(0, 50 + pnlScore))

  // 5. Market cap tier diversity (reward spreading across tiers)
  const tierSet = new Set(enriched.map(h => classifyMcTier(h.coin_id, h.market_cap || 0, h.coin_symbol).id))
  const tierScore = Math.min(100, tierSet.size * 28)

  // Overall health score (weighted average)
  const health = Math.round(
    concentrationScore * 0.30 +
    assetScore         * 0.20 +
    momentumScore      * 0.15 +
    pnlHealth          * 0.20 +
    tierScore          * 0.15
  )

  // Grade
  const grade = health >= 88 ? 'A+' : health >= 80 ? 'A' : health >= 72 ? 'B+' :
                health >= 64 ? 'B'  : health >= 55 ? 'C+': health >= 45 ? 'C'  : 'D'

  const gradeColor = health >= 72 ? 'var(--g)' : health >= 55 ? '#f59e0b' : '#f87171'

  // Market cap breakdown
  const mcBreakdown = MC_TIERS.map(tier => {
    const assets = enriched.filter(h => classifyMcTier(h.coin_id, h.market_cap || 0, h.coin_symbol).id === tier.id)
    const value  = assets.reduce((s, h) => s + h.value, 0)
    return { ...tier, assets, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }
  }).filter(t => t.assets.length > 0)

  // Smart AI insights
  const insights = []
  const topAsset = enriched[0]
  const topWeight = weights[0] * 100

  if (topWeight > 60) insights.push({ type: 'warn', text: `${topAsset.coin_symbol.toUpperCase()} dominates ${topWeight.toFixed(0)}% of your portfolio — high concentration risk.` })
  else if (topWeight > 40) insights.push({ type: 'info', text: `${topAsset.coin_symbol.toUpperCase()} is your largest position at ${topWeight.toFixed(0)}%.` })

  if (n < 3) insights.push({ type: 'warn', text: `Only ${n} asset${n > 1 ? 's' : ''} detected — consider spreading into more positions to reduce risk.` })
  else if (n >= 8) insights.push({ type: 'good', text: `${n} assets tracked — solid diversification across your portfolio.` })

  const inProfit = enriched.filter(h => h.pnl > 0)
  const inLoss   = enriched.filter(h => h.pnl < 0)
  if (inProfit.length > 0 && inLoss.length === 0) insights.push({ type: 'good', text: `All ${inProfit.length} positions are in profit 🚀` })
  else if (inProfit.length > 0) insights.push({ type: 'info', text: `${inProfit.length} of ${n} positions in profit, ${inLoss.length} in loss.` })

  if (momentum > 3) insights.push({ type: 'good', text: `Strong bullish momentum: weighted 24h gain of +${momentum.toFixed(2)}% across holdings.` })
  else if (momentum < -3) insights.push({ type: 'warn', text: `Bearish pressure: weighted 24h loss of ${momentum.toFixed(2)}% across holdings.` })

  const hasMetals = enriched.some(h => categorizeAsset(h) === 'metals')
  const hasStocks = enriched.some(h => categorizeAsset(h) === 'stocks')
  const hasRealEstate = enriched.some(h => categorizeAsset(h) === 'realestate')
  const hasCrypto = enriched.some(h => categorizeAsset(h) === 'crypto')
  const nonCryptoCount = [hasMetals, hasStocks, hasRealEstate].filter(Boolean).length

  if (hasCrypto && nonCryptoCount >= 2) {
    insights.push({ type: 'good', text: `Strong cross-asset diversification — crypto combined with ${[hasMetals && 'precious metals', hasStocks && 'stocks', hasRealEstate && 'real estate'].filter(Boolean).join(' & ')}.` })
  } else if (hasCrypto && nonCryptoCount === 1) {
    const which = hasMetals ? 'precious metals' : hasStocks ? 'stocks' : 'real estate'
    insights.push({ type: 'good', text: `Good diversification — crypto + ${which} adds a hedge against crypto-only volatility.` })
  } else if (!hasMetals && !hasStocks && !hasRealEstate) {
    insights.push({ type: 'info', text: 'Portfolio is 100% crypto — adding gold/silver or stocks could hedge volatility.' })
  }

  const cryptoTierSet = new Set(enriched.filter(h => categorizeAsset(h) === 'crypto').map(h => classifyMcTier(h.coin_id, h.market_cap || 0, h.coin_symbol).id))
  if (cryptoTierSet.size >= 3) insights.push({ type: 'good', text: `Well-diversified across ${cryptoTierSet.size} crypto market-cap tiers — balanced risk profile.` })
  else if (hasCrypto && !cryptoTierSet.has('mid') && !cryptoTierSet.has('small')) insights.push({ type: 'info', text: 'Holding mainly large/mega-cap crypto — mid/small-cap exposure could boost upside.' })

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

  // ── Stress test scenarios (asset-class-aware) ─────────────────────────────
  // Apply per-asset volatility multipliers so gold/real estate aren't hit -60%
  const VOLATILITY = { crypto: 1, metals: 0.35, stocks: 0.5, realestate: 0.2, cash: 0.02 }
  function stressPortfolio(pct) {
    return enriched.reduce((sum, h) => {
      const mult = VOLATILITY[categorizeAsset(h)] ?? 1
      const adjustedPct = pct * mult
      const newVal = h.value * (1 + adjustedPct / 100)
      return sum + newVal
    }, 0)
  }
  const stressScenarios = [
    { label: 'Mild Dip',   pct: -10, color: '#f59e0b', icon: '📉' },
    { label: 'Correction', pct: -30, color: '#f87171', icon: '🩸' },
    { label: 'Bear Market',pct: -60, color: '#8b5cf6', icon: '🐻' },
    { label: 'Bull +50%',  pct: +50, color: 'var(--g)', icon: '🚀' },
    { label: 'Moon +200%', pct: +200,color: '#ffd700', icon: '🌕' },
  ].map(s => ({ ...s, stressedVal: stressPortfolio(s.pct) }))

  // ── Entry quality per asset ────────────────────────────────────────────────
  const entryQuality = enriched.map(h => {
    const avgBuy = h.total_invested > 0 && h.amount > 0 ? h.total_invested / h.amount : 0
    const priceDiff = avgBuy > 0 ? ((h.price - avgBuy) / avgBuy) * 100 : 0
    const score = Math.min(100, Math.max(0, 50 + priceDiff * 2))
    return { ...h, avgBuy, priceDiff, entryScore: Math.round(score) }
  })

  // ── Rebalance planner (equal-weight target) ────────────────────────────────
  const targetWeight = 1 / n
  const rebalance = enriched.map((h, i) => {
    const currentW = weights[i]
    const diff     = (targetWeight - currentW) * 100
    const diffVal  = (targetWeight - currentW) * totalValue
    return { ...h, currentW: currentW * 100, targetW: targetWeight * 100, diff, diffVal }
  })

  // ── Today P&L (24h) ───────────────────────────────────────────────────────
  const todayPnL = enriched.reduce((s, h) => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return s + h.value * (chg / 100)
  }, 0)

  return {
    health, grade, gradeColor,
    concentrationScore, assetScore, momentumScore: Math.round(momentumScore), pnlHealth: Math.round(pnlHealth), tierScore,
    hhi, momentum, riskLevel, riskColor,
    mcBreakdown, insights,
    sentiment, sentimentColor, buyCount, sellCount,
    fearGreed, fgLabel, fgColor,
    stressScenarios, entryQuality, rebalance, todayPnL,
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
      <div className="ai-empty-icon">⏳</div>
      <p>{t('loadingAI')}</p>
    </div>
  )

  if (!ai) return (
    <div className="ai-empty glass-card">
      <div className="ai-empty-icon">🤖</div>
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
            { label: t('diversification'), val: ai.concentrationScore, color: 'var(--g)' },
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
          <div className="ai-ind-val" style={{color: ai.momentum >= 0 ? 'var(--g)' : '#f87171'}}>
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
          <div className="ai-ind-val" style={{color:'#fff'}}>{enriched.length}</div>
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
        <h4 className="ai-section-title">🤖 {t('aiInsights')}</h4>
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
        <h4 className="ai-section-title">{t('portfolioRadar')}</h4>
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
        <h4 className="ai-section-title">{t('fearGreed')}</h4>
        <FearGreedGauge value={ai.fearGreed} label={ai.fgLabel} color={ai.fgColor} />
        <p className="ai-fg-desc">
          Derived from momentum, P&amp;L bias, trade sentiment &amp; concentration — specific to <em>your</em> portfolio.
        </p>
      </div>

      {/* ── Today's P&L ── */}
      <div className="glass-card ai-today-card">
        <h4 className="ai-section-title">{t('todayPerformance')}</h4>
        <div className="ai-today-main" style={{ color: ai.todayPnL >= 0 ? 'var(--g)' : '#f87171' }}>
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
                <span className="ai-today-chg" style={{ color: chg >= 0 ? 'var(--g)' : '#f87171' }}>
                  {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                </span>
                <span className="ai-today-pnl" style={{ color: dayPnL >= 0 ? 'var(--g)' : '#f87171' }}>
                  {dayPnL >= 0 ? '+' : ''}${Math.abs(dayPnL).toFixed(0)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Stress Test ── */}
      <div className="glass-card ai-stress-card">
        <h4 className="ai-section-title">{t('stressTest')}</h4>
        <div className="ai-stress-grid">
          {ai.stressScenarios.map(s => {
            const newVal = s.stressedVal ?? totalValue * (1 + s.pct / 100)
            const diff   = newVal - totalValue
            return (
              <div key={s.label} className="ai-stress-item" style={{ borderColor: s.color + '33' }}>
                <div className="ai-stress-icon">{s.icon}</div>
                <div className="ai-stress-label">{s.label}</div>
                <div className="ai-stress-pct" style={{ color: s.color }}>
                  {s.pct > 0 ? '+' : ''}{s.pct}%
                </div>
                <div className="ai-stress-val">${newVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className="ai-stress-diff" style={{ color: s.color }}>
                  {diff > 0 ? '+' : ''}${diff.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Entry Quality ── */}
      <div className="glass-card ai-entry-card">
        <h4 className="ai-section-title">{t('entryQuality')}</h4>
        <p className="ai-entry-sub muted">Avg buy price vs current price per asset</p>
        <div className="ai-entry-list">
          {ai.entryQuality.map(h => (
            <div key={h.coin_id} className="ai-entry-row">
              <div className="ai-entry-left">
                <span className="ai-entry-sym">{(h.coin_symbol || '').toUpperCase()}</span>
                <div className="ai-entry-prices">
                  <span className="muted" style={{fontSize:'0.7rem'}}>Avg buy ${h.avgBuy > 0 ? h.avgBuy.toLocaleString(undefined,{maximumFractionDigits:4}) : '—'}</span>
                  <span style={{fontSize:'0.7rem',color:'#fff'}}> · Now ${h.price.toLocaleString(undefined,{maximumFractionDigits:4})}</span>
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
              <span className="ai-entry-score" style={{ color: h.priceDiff >= 0 ? 'var(--g)' : '#f87171' }}>
                {h.priceDiff >= 0 ? '+' : ''}{h.priceDiff.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Rebalance Planner ── */}
      <div className="glass-card ai-rebal-card">
        <h4 className="ai-section-title">{t('rebalancePlanner')}</h4>
        <p className="ai-entry-sub muted">Equal-weight target vs current allocation</p>
        <div className="ai-rebal-list">
          {ai.rebalance.map(h => (
            <div key={h.coin_id} className="ai-rebal-row">
              <span className="ai-rebal-sym">{(h.coin_symbol || '').toUpperCase()}</span>
              <div className="ai-rebal-bars">
                <div className="ai-rebal-bar-row">
                  <span className="ai-rebal-bar-lbl">Now</span>
                  <div className="ai-rebal-bar-track">
                    <div className="ai-rebal-bar-fill" style={{ width: `${Math.min(h.currentW, 100)}%`, background: '#3b82f6' }} />
                  </div>
                  <span className="ai-rebal-bar-val">{h.currentW.toFixed(1)}%</span>
                </div>
                <div className="ai-rebal-bar-row">
                  <span className="ai-rebal-bar-lbl">Target</span>
                  <div className="ai-rebal-bar-track">
                    <div className="ai-rebal-bar-fill" style={{ width: `${Math.min(h.targetW, 100)}%`, background: 'var(--g)' }} />
                  </div>
                  <span className="ai-rebal-bar-val">{h.targetW.toFixed(1)}%</span>
                </div>
              </div>
              <div className={`ai-rebal-action ${h.diff > 0 ? 'buy' : 'sell'}`}>
                {h.diff > 0 ? '↑ Buy' : '↓ Sell'}
                <span>${Math.abs(h.diffVal).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
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
    { label: 'Neutral',      color: 'var(--g)', from: 40, to: 60 },
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
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)"
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
            fontSize="9" fill="rgba(255,255,255,0.55)" fontFamily="Inter,sans-serif">
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

const fmt   = n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtN  = n => { const s = Math.abs(n) >= 1000 ? `$${(Math.abs(n)/1000).toFixed(1)}k` : `$${Math.abs(n).toFixed(0)}`; return n < 0 ? `-${s}` : s }
const pct   = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const PALETTE = ['var(--g)','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#22d3ee','#f87171','#64748b','var(--gd)','#a78bfa']

const TOOLTIP_STYLE = {
  background: 'rgba(6,14,10,0.97)', border: '1px solid rgba(var(--g-rgb),0.4)',
  borderRadius: 10, fontSize: '0.76rem', color: '#fff',
}
const CHART_HDR_STYLE  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }
const TEXT_RIGHT_STYLE = { textAlign: 'right', flexShrink: 0 }

// ── Wallet Evaluation ─────────────────────────────────────────────────────
const EVAL_CATEGORIES = [
  {
    id: 'btc_anchor',
    label: 'BTC Anchor',
    icon: '₿',
    color: '#f7931a',
    check: (enriched, totalValue) => {
      const btc = enriched.find(h => h.coin_id === 'bitcoin' || h.coin_symbol?.toLowerCase() === 'btc')
      if (!btc) return { pass: false, score: 0, tip: 'Add Bitcoin as a portfolio anchor. BTC historically acts as a safe haven during crypto downturns and gives your portfolio a stability base.' }
      const w = btc.value / totalValue * 100
      if (w < 5) return { pass: false, score: 40, tip: `BTC is only ${w.toFixed(1)}% of your portfolio. Consider increasing to at least 20% — it reduces volatility and acts as a hedge.` }
      if (w > 70) return { pass: true, score: 70, tip: `BTC is ${w.toFixed(1)}% of your portfolio — heavily concentrated. Consider diversifying to other quality assets.` }
      return { pass: true, score: 100, tip: `Solid BTC anchor at ${w.toFixed(1)}% — gives your portfolio a stable foundation.` }
    },
  },
  {
    id: 'eth_exposure',
    label: 'ETH / Smart Contract',
    icon: 'Ξ',
    color: '#627eea',
    check: (enriched, totalValue) => {
      const eth = enriched.find(h => h.coin_id === 'ethereum' || h.coin_symbol?.toLowerCase() === 'eth')
      const hasAlt = enriched.some(h => ['solana','cardano','avalanche-2','polkadot'].includes(h.coin_id))
      if (!eth && !hasAlt) return { pass: false, score: 0, tip: 'No smart-contract layer exposure. ETH (or SOL/ADA/AVAX) drives DeFi, NFTs, and Web3 — missing this entire sector.' }
      const asset = eth || enriched.find(h => ['solana','cardano','avalanche-2','polkadot'].includes(h.coin_id))
      const w = asset.value / totalValue * 100
      return { pass: true, score: 90, tip: `Good — ${asset.coin_symbol?.toUpperCase()} covers your smart-contract exposure at ${w.toFixed(1)}%.` }
    },
  },
  {
    id: 'diversification',
    label: 'Diversification',
    icon: '⚖️',
    color: 'var(--g)',
    check: (enriched, totalValue) => {
      const n = enriched.length
      const weights = enriched.map(h => h.value / totalValue)
      const hhi = weights.reduce((s, w) => s + w * w, 0)
      if (n < 3) return { pass: false, score: 10, tip: `Only ${n} holding${n===1?'':'s'} — extremely concentrated. Spread across 5–10 assets to reduce single-coin risk.` }
      if (hhi > 0.5) return { pass: false, score: 30, tip: `One coin dominates your portfolio (HHI ${hhi.toFixed(2)}). Rebalance so no single asset exceeds 50%.` }
      if (n < 5) return { pass: false, score: 60, tip: `${n} holdings is okay but aim for 5–10. Add 1–2 more quality assets from different sectors.` }
      return { pass: true, score: 95, tip: `Well diversified across ${n} assets with balanced weights.` }
    },
  },
  {
    id: 'stablecoin',
    label: 'Stablecoin Reserve',
    icon: '🏦',
    color: '#60a5fa',
    check: (enriched, totalValue) => {
      const stables = ['tether','usd-coin','dai','binance-usd','true-usd','frax']
      const stableHoldings = enriched.filter(h => stables.includes(h.coin_id) || ['usdt','usdc','dai','busd','tusd','frax'].includes(h.coin_symbol?.toLowerCase()))
      const stableVal = stableHoldings.reduce((s, h) => s + h.value, 0)
      const pct = stableVal / totalValue * 100
      if (pct === 0) return { pass: false, score: 0, tip: 'No stablecoin reserve. Holding 5–15% in USDT/USDC gives you dry powder to buy dips without selling at a loss.' }
      if (pct < 5) return { pass: false, score: 50, tip: `Only ${pct.toFixed(1)}% in stablecoins. Increase to 5–15% for a proper "buy the dip" reserve.` }
      if (pct > 40) return { pass: true, score: 65, tip: `${pct.toFixed(1)}% in stablecoins is high — you might be over-hedged and missing upside. Deploy some into quality assets.` }
      return { pass: true, score: 100, tip: `${pct.toFixed(1)}% stablecoin reserve — perfect dry powder for opportunities.` }
    },
  },
  {
    id: 'large_cap',
    label: 'Large-Cap Weight',
    icon: '🐋',
    color: '#3b82f6',
    check: (enriched, totalValue) => {
      const largeCap = new Set(['bitcoin','ethereum','ripple','binancecoin','solana','cardano','avalanche-2','polkadot','chainlink','litecoin'])
      const lcVal = enriched.filter(h => largeCap.has(h.coin_id)).reduce((s, h) => s + h.value, 0)
      const pct = lcVal / totalValue * 100
      if (pct < 40) return { pass: false, score: 20, tip: `Only ${pct.toFixed(1)}% in large-cap coins. Heavy small-cap exposure means higher risk of total loss — add more BTC/ETH/SOL.` }
      if (pct < 60) return { pass: false, score: 70, tip: `${pct.toFixed(1)}% large-cap. Aim for at least 60% in proven coins to anchor your portfolio against micro-cap wipeouts.` }
      return { pass: true, score: 95, tip: `${pct.toFixed(1)}% large-cap — solid foundation that absorbs volatility.` }
    },
  },
  {
    id: 'sell_targets',
    label: 'Profit Targets Set',
    icon: '🎯',
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
    icon: '💚',
    color: 'var(--g)',
    check: (enriched, totalValue) => {
      if (!enriched.length) return { pass: false, score: 0, tip: 'No holdings to evaluate.' }
      const avgPnlPct = enriched.reduce((s, h) => s + (h.pnl / Math.max(h.invested, 1)) * (h.value / totalValue), 0) * 100
      if (avgPnlPct < -30) return { pass: false, score: 10, tip: `Portfolio is down ${Math.abs(avgPnlPct).toFixed(1)}% overall. Consider DCA-ing into your strongest convictions to lower average cost.` }
      if (avgPnlPct < 0) return { pass: false, score: 50, tip: `Portfolio is slightly underwater (${avgPnlPct.toFixed(1)}%). Hold quality assets and average down on dips if you believe in them.` }
      if (avgPnlPct > 100) return { pass: true, score: 100, tip: `Up ${avgPnlPct.toFixed(1)}%! Consider taking some profits into stablecoins to lock in gains.` }
      return { pass: true, score: 90, tip: `Portfolio up ${avgPnlPct.toFixed(1)}% — healthy. Keep managing risk.` }
    },
  },
  {
    id: 'sector_spread',
    label: 'Sector Spread',
    icon: '🗂️',
    color: '#a78bfa',
    check: (enriched) => {
      const sectors = {
        store_of_value: new Set(['bitcoin','litecoin','bitcoin-cash']),
        smart_contract: new Set(['ethereum','solana','cardano','avalanche-2','polkadot','near','cosmos']),
        defi: new Set(['uniswap','aave','compound-governance-token','maker','curve-dao-token','synthetix-network-token']),
        exchange: new Set(['binancecoin','ftx-token','huobi-token','crypto-com-chain']),
        oracle: new Set(['chainlink','band-protocol','api3']),
        payment: new Set(['ripple','stellar','nano','algorand']),
        gaming: new Set(['axie-infinity','the-sandbox','decentraland','enjincoin']),
      }
      const covered = new Set()
      for (const h of enriched) for (const [sec, ids] of Object.entries(sectors)) if (ids.has(h.coin_id)) covered.add(sec)
      const n = covered.size
      if (n < 2) return { pass: false, score: 20, tip: `Only ${n} sector covered. Spread across Store of Value, Smart Contracts, DeFi, and Payments to reduce sector-specific risk.` }
      if (n < 3) return { pass: false, score: 60, tip: `${n} sectors covered. Add 1–2 more: consider DeFi (AAVE/UNI) or Oracles (LINK) for true diversification.` }
      return { pass: true, score: 90, tip: `${n} crypto sectors covered — well-rounded portfolio strategy.` }
    },
  },
]

function computeWalletEval(enriched, totalValue, targets = []) {
  if (!enriched.length) return null
  const results = EVAL_CATEGORIES.map(cat => {
    const result = cat.check(enriched, totalValue, targets)
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
  const label = score >= 80 ? 'Strong' : score >= 55 ? 'Needs Work' : 'At Risk'
  return (
    <div className="eval-ring-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10"/>
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 70 70)" style={{ transition: 'stroke-dasharray 1.2s ease' }}/>
      </svg>
      <div className="eval-ring-inner">
        <div className="eval-ring-score" style={{ color }}>{score}</div>
        <div className="eval-ring-label" style={{ color }}>{label}</div>
      </div>
    </div>
  )
}

function WalletEvalTab({ enriched, totalValue, targets }) {
  const eval_ = useMemo(() => computeWalletEval(enriched, totalValue, targets), [enriched, totalValue, targets])
  const [expanded, setExpanded] = useState(null)

  if (!enriched.length) return (
    <div className="dvx-form-page">
      <div className="glass-card" style={{ textAlign:'center', padding:'3rem 1.5rem' }}>
        <div style={{ fontSize:'2.5rem', marginBottom:'0.75rem' }}>🔍</div>
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
              ⚠️ {missing.length} gap{missing.length > 1 ? 's' : ''} found — tap each to fix
            </div>
          )}
          {missing.length === 0 && (
            <div className="eval-missing-count" style={{ color:'var(--g)' }}>
              ✅ All checks passed — excellent wallet health!
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
              <span className="eval-cat-icon" style={{ background: cat.color + '22', color: cat.color }}>{cat.icon}</span>
              <div className="eval-cat-info">
                <div className="eval-cat-label">{cat.label}</div>
                <div className="eval-cat-bar-wrap">
                  <div className="eval-cat-bar" style={{ width: `${cat.score}%`, background: cat.color }} />
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
                <span style={{ marginRight:'0.5rem' }}>{cat.pass ? '💡' : '🔧'}</span>
                {cat.tip}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const TIMEFRAMES = [
  { id: '4H',  label: '4H',  pts: 48 },
  { id: '1D',  label: '1D',  pts: 48 },
  { id: '7D',  label: '7D',  pts: 56 },
  { id: '30D', label: '30D', pts: 60 },
]

function buildPerfSeries(base, tf = '30D') {
  const days = { '4H': 0, '1D': 1, '7D': 7, '30D': 30 }[tf] || 30
  const pts = { '4H': 48, '1D': 48, '7D': 56, '30D': 60 }[tf] || 60
  const b = Math.max(base || 10000, 1)

  // For 1D/7D/30D try to use real snapshots
  if (days > 0) {
    const snaps = getSnapshotsForDays(days)
    if (snaps.length >= 2) {
      // Interpolate snapshots to pts data points
      const first = snaps[0], last = snaps[snaps.length - 1]
      const timeRange = last.ts - first.ts || 1
      return Array.from({ length: pts }, (_, i) => {
        const t = i / (pts - 1)
        const targetTs = first.ts + t * timeRange
        // Find surrounding snapshots and interpolate
        let lo = snaps[0], hi = snaps[snaps.length - 1]
        for (let j = 0; j < snaps.length - 1; j++) {
          if (snaps[j].ts <= targetTs && snaps[j + 1].ts >= targetTs) {
            lo = snaps[j]; hi = snaps[j + 1]; break
          }
        }
        const segT = hi.ts === lo.ts ? 1 : (targetTs - lo.ts) / (hi.ts - lo.ts)
        const v = lo.v + (hi.v - lo.v) * segT
        return { i, v: Math.max(v, 0) }
      })
    }
  }

  // Fallback: smooth uptrend with subtle noise (seeded by portfolio value)
  const startRatio = { '4H': 0.97, '1D': 0.93, '7D': 0.82, '30D': 0.68 }[tf] || 0.75
  const seed = Math.round(b) % 997
  return Array.from({ length: pts }, (_, i) => {
    const t = i / (pts - 1)
    // Smooth uptrend base
    const trend = startRatio * b + t * (1 - startRatio) * b
    // Subtle deterministic noise (no wild swings)
    const noise = Math.sin((i + seed) * 0.7) * b * 0.012 + Math.sin((i + seed) * 1.9) * b * 0.006
    return { i, v: Math.max(trend + noise, b * 0.1) }
  })
}

// ── Wallet panel ─────────────────────────────────────────────────────────
function WalletPanel({ wallets, onRefresh }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await api.createWallet({ name: name.trim() })
      track('wallet_created', {
        wallet_name: name.trim(),
        wallet_count: (wallets?.length || 0) + 1,
      })
      setName(''); onRefresh()
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
function DataPanel({ onRefresh }) {
  const { t } = useLanguage()
  const [code, setCode]     = useState('')
  const [copied, setCopied] = useState(false)
  const [msg, setMsg]       = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy]     = useState(false)

  async function doExport() {
    setBusy(true)
    try {
      const result = await api.exportCode()
      if (result) { setCode(result); setMsg('') }
      else setMsg('Export failed.')
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
    setMsg('Imported! Refreshing…'); setCode(''); setPreview(null)
    onRefresh(); setTimeout(() => setMsg(''), 2500)
  }

  return (
    <div className="dvx-panel">
      <p className="dvx-data-hint">
        Your data is stored as a short backup code (WLZ format). Export it to save or transfer to another device. Paste a code to restore.
      </p>

      <button className="dvx-btn dvx-btn-primary dvx-btn-full" onClick={doExport} disabled={busy}>
        {Ico.export} {t('generateBackup')}
      </button>

      {code && (
        <div className="dvx-code-box">
          <div className="dvx-code-text">{code}</div>
          <button className="dvx-code-copy" onClick={copyCode}>
            {copied ? <>{Ico.check} Copied!</> : <>{Ico.copy} Copy</>}
          </button>
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
    </div>
  )
}

// ── Summary stat card ─────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div className="dvx-stat-card glass-card">
      <span className="dvx-stat-label">{label}</span>
      <span className="dvx-stat-value" style={color ? { color } : {}}>{value}</span>
      {sub && <span className="dvx-stat-sub">{sub}</span>}
    </div>
  )
}

// ── Portfolio Heatmap ─────────────────────────────────────────────────────
function PortfolioHeatmap({ enriched, prices, totalValue }) {
  const cells = enriched
    .filter(h => h.value > 0)
    .map(h => {
      const chg = prices[h.coin_id]?.usd_24h_change ?? 0
      const sizePct = totalValue > 0 ? (h.value / totalValue) * 100 : 0
      const intensity = Math.min(Math.abs(chg) / 20, 1)
      const gRgb = getComputedStyle(document.documentElement).getPropertyValue('--g-rgb').trim() || '52,211,153'
      const color = chg >= 0
        ? `rgba(${gRgb},${0.15 + intensity * 0.65})`
        : `rgba(248,113,113,${0.15 + intensity * 0.65})`
      return { ...h, chg, sizePct, color }
    })
    .sort((a, b) => b.sizePct - a.sizePct)

  if (!cells.length) return null

  return (
    <div className="glass-card heatmap-card">
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700 }}>🗺️ Portfolio Heatmap</h3>
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
        <span style={{ color:'rgba(255,255,255,0.3)' }}>Darker = bigger move</span>
        <span style={{ color:'rgba(var(--g-rgb),0.9)' }}>■ Gaining</span>
      </div>
    </div>
  )
}

// ── Empty portfolio state ─────────────────────────────────────────────────
function ConstellationMap() {
  const canvasRef = useRef(null)
  const NODES = [
    { symbol:'BTC',  coinId:'bitcoin',  color:'#f7931a', x:0.50, y:0.14 },
    { symbol:'ETH',  coinId:'ethereum', color:'#627eea', x:0.82, y:0.38 },
    { symbol:'GOLD', color:'#ffd700', x:0.68, y:0.80, iconBg:'linear-gradient(135deg,#7a5c00,#c8960c)', svg:'gold' },
    { symbol:'SLVR', color:'#c0c8d8', x:0.18, y:0.72, iconBg:'linear-gradient(135deg,#4a4a4a,#9aa0ac)', svg:'silver' },
    { symbol:'AAPL', color:'#a2aaad',   x:0.12, y:0.32, logo:'https://logo.clearbit.com/apple.com', logoBg:'#000' },
    { symbol:'NVDA', color:'#76b900',   x:0.62, y:0.10, logo:'https://logo.clearbit.com/nvidia.com', logoBg:'#000' },
    { symbol:'USD',  color:'#22c55e', x:0.88, y:0.64, svg:'usd' },
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

    function getColor() {
      return getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#34d399'
    }
    function getRgb() {
      return getComputedStyle(document.documentElement).getPropertyValue('--g-rgb').trim() || '52,211,153'
    }

    function draw() {
      t += 0.016
      ctx.clearRect(0, 0, w, h)

      const col = getColor()
      const rgb = getRgb()

      // Twinkle stars
      for (const s of STARS) {
        const alpha = 0.15 + 0.5 * (0.5 + 0.5 * Math.sin(s.phase + t * s.speed * 60))
        ctx.beginPath()
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${alpha})`
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
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2); ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    draw()
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <div style={{ position:'relative', width:'100%', height:260, margin:'0 auto 1.5rem' }}>
      <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} aria-hidden="true" />
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

function EmptyPortfolio({ onAddTrade, navigate, loaded }) {
  if (!loaded) return null

  // Inject keyframes once
  if (typeof document !== 'undefined' && !document.getElementById('ep-kf')) {
    const s = document.createElement('style')
    s.id = 'ep-kf'
    s.textContent = `
      @keyframes ep-shimmer{ 0%{background-position:200% center} 100%{background-position:-200% center} }
      @keyframes ep-bounce { 0%,100%{transform:translateY(0) scale(1)} 40%{transform:translateY(-6px) scale(1.04)} 60%{transform:translateY(-3px) scale(1.02)} }
      @keyframes ep-node-pulse { 0%,100%{transform:scale(1);box-shadow:0 0 14px currentColor} 50%{transform:scale(1.12);box-shadow:0 0 22px currentColor} }
    `
    document.head.appendChild(s)
  }

  return (
    <div style={{ textAlign:'center', padding:'2rem 1rem 1.5rem', position:'relative', overflow:'hidden', marginTop:'0.5rem' }}>

      {/* Constellation star map */}
      <ConstellationMap />

      {/* Headline */}
      <div style={{ fontWeight:800, fontSize:'1.25rem', color:'#fff', marginBottom:'0.5rem', lineHeight:1.3 }}>
        Start your first trade
      </div>
      <div style={{ fontSize:'0.875rem', color:'rgba(255,255,255,0.45)', marginBottom:'2rem', lineHeight:1.65 }}>
        Track crypto, stocks &amp; metals.<br/>Unlock AI signals, risk scores &amp; live charts.
      </div>

      {/* Primary CTA */}
      <button onClick={onAddTrade} style={{
        display:'inline-flex', alignItems:'center', gap:'0.5rem',
        padding:'0.85rem 2rem', borderRadius:'50px', border:'none', cursor:'pointer',
        fontSize:'0.95rem', fontWeight:800, color:'#000',
        background:'linear-gradient(90deg,var(--g),#60a5fa,#a78bfa,var(--g))',
        backgroundSize:'300% 100%',
        animation:'ep-shimmer 3s linear infinite, ep-bounce 2.8s ease-in-out infinite',
        boxShadow:'0 4px 24px rgba(var(--g-rgb),0.35)',
        marginBottom:'1.25rem',
      }}>
        <span style={{ fontSize:'1.1rem' }}>➕</span> Add a trade
      </button>

      {/* Secondary actions */}
      <div style={{ display:'flex', gap:'0.6rem', justifyContent:'center', flexWrap:'wrap', marginBottom:'1.25rem' }}>
        {[
          { icon:'🔍', label:'Browse market', action:() => navigate('/market'), color:'#60a5fa' },
          { icon:'🐋', label:'Watch whales',  action:() => navigate('/whales'),  color:'#a78bfa' },
        ].map(s => (
          <button key={s.label} onClick={s.action} style={{
            display:'inline-flex', alignItems:'center', gap:'0.4rem',
            padding:'0.55rem 1.1rem', borderRadius:'50px',
            background:'rgba(255,255,255,0.05)',
            border:`1px solid ${s.color}33`,
            color:s.color, fontWeight:700, fontSize:'0.82rem', cursor:'pointer',
            transition:'background 0.15s',
          }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.2)' }}>
        Your data stays on your device — no account needed
      </div>
    </div>
  )
}

// ── Tools Tab (AI + Risk Scanner + Wallet Eval) ──────────────────────────
function ToolsTab({ enriched, prices, transactions, totalValue, isDemo, pricesLoading, coinTargets }) {
  const [tool, setTool] = useState('ai')
  const subTabs = [
    { id: 'ai',     label: 'AI Analysis' },
    { id: 'risk',   label: 'Risk Scanner' },
    { id: 'budget', label: 'Risk Budget' },
    { id: 'eval',   label: 'Eval' },
  ]
  return (
    <div>
      <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', background:'rgba(255,255,255,0.04)', borderRadius:'12px', padding:'0.3rem' }}>
        {subTabs.map(s => (
          <button key={s.id} onClick={() => setTool(s.id)} style={{
            flex:1, padding:'0.45rem', borderRadius:'9px', border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.8rem',
            background: tool === s.id ? 'rgba(var(--g-rgb),0.18)' : 'none',
            color: tool === s.id ? 'var(--g)' : 'rgba(255,255,255,0.5)',
            transition:'all 0.15s',
          }}>{s.label}</button>
        ))}
      </div>
      {tool === 'ai'     && <AIPanel enriched={enriched} prices={prices} transactions={transactions} totalValue={totalValue} isDemo={isDemo} pricesLoading={pricesLoading} />}
      {tool === 'risk'   && <Suspense fallback={<TabFallback />}><RiskScanner enriched={isDemo ? [] : enriched} /></Suspense>}
      {tool === 'budget' && <Suspense fallback={<TabFallback />}><RiskBudget enriched={isDemo ? [] : enriched} totalValue={totalValue} /></Suspense>}
      {tool === 'eval'   && <WalletEvalTab enriched={isDemo ? [] : enriched} totalValue={totalValue} targets={Object.entries(coinTargets).map(([coin_id, v]) => ({ coin_id, ...v }))} />}
    </div>
  )
}

// ── Targets Tab ──────────────────────────────────────────────────────────
function TargetsTab({ enriched, targetsAnalysis, coinTargets, prices, onTargetsChange }) {
  const navigate = useNavigate()
  const [adding, setAdding] = useState({}) // coinId → { price, qty }

  async function saveTarget(coinId, priceVal, qtyVal) {
    const p = parseFloat(priceVal)
    const q = qtyVal ? parseFloat(qtyVal) : null
    if (!p || p <= 0) return
    await api.addCoinTarget(coinId, { price: p, quantity: q })
    track('goal_set', { coin_id: coinId, target_price: p })
    setAdding(prev => { const n = { ...prev }; delete n[coinId]; return n })
    onTargetsChange()
  }

  async function removeTarget(coinId, targetId) {
    await api.removeCoinTargetItem(coinId, targetId)
    track('target_deleted', { coin_id: coinId })
    onTargetsChange()
  }

  // Summary stats
  const { totalTargets, totalReached, totalPotentialProceeds, chartData, rows } = targetsAnalysis

  return (
    <div className="dvx-targets-page">
      {/* Summary cards */}
      <div className="dvx-stats-row">
        <StatCard label="Total Targets" value={totalTargets} />
        <StatCard label="Reached" value={totalReached} color={totalReached > 0 ? 'var(--g)' : undefined} />
        <StatCard label="Potential Proceeds"
          value={`$${totalPotentialProceeds >= 1000 ? (totalPotentialProceeds/1000).toFixed(1)+'k' : fmt(totalPotentialProceeds)}`}
          color="var(--g)" />
        <StatCard label="Assets Planned" value={rows.length} />
      </div>

      {/* Proceeds chart */}
      {chartData.length > 0 && (
        <div className="glass-card">
          <h3 style={{ margin:'0 0 0.75rem' }}>Projected Proceeds by Target</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ left:0, right:0, top:4, bottom:24 }}>
              <CartesianGrid stroke="rgba(var(--g-rgb),0.07)" vertical={false}/>
              <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.4)', fontSize:10 }}
                axisLine={false} tickLine={false} angle={-30} textAnchor="end"/>
              <YAxis tick={{ fill:'rgba(255,255,255,0.38)', fontSize:10 }} axisLine={false}
                tickLine={false} tickFormatter={v => `$${v>=1000?(v/1000).toFixed(0)+'k':v}`} width={50}/>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`$${fmt(v)}`, 'Proceeds']}/>
              <Bar dataKey="proceeds" radius={[6,6,0,0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.reached ? 'var(--g)' : '#3b82f6'} fillOpacity={d.reached ? 1 : 0.7}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', gap:'1rem', fontSize:'0.72rem', color:'rgba(255,255,255,0.45)', marginTop:'0.5rem' }}>
            <span><span style={{ color:'var(--g)' }}>■</span> Reached</span>
            <span><span style={{ color:'#3b82f6' }}>■</span> Pending</span>
          </div>
        </div>
      )}

      {/* All holdings — show target state + add form for each */}
      {enriched.length === 0 ? (
        <div className="glass-card" style={{ textAlign:'center', padding:'2.5rem 1.5rem' }}>
          <div style={{ fontSize:'2rem', marginBottom:'0.75rem', opacity:0.4 }}>{Ico.target}</div>
          <p style={{ color:'rgba(255,255,255,0.5)', marginBottom:'1rem' }}>Add holdings first to set price targets.</p>
          <button className="dvx-btn dvx-btn-primary" onClick={() => navigate('/transactions')}>Add Trade</button>
        </div>
      ) : (
        enriched.map(h => {
          const plan = coinTargets[h.coin_id]?.targets || []
          const currentPrice = h.price
          const isAdding = !!adding[h.coin_id]
          const addState = adding[h.coin_id] || {}

          return (
            <div key={h.coin_id} className="glass-card dvx-target-card">
              {/* Holding header */}
              <div className="dvx-target-header">
                <div className="dvx-target-coin" style={{ cursor:'pointer' }}
                  onClick={() => navigate(`/asset/${encodeURIComponent(h.coin_id)}`)}>
                  <CoinLogo coinId={h.coin_id} symbol={h.coin_symbol} image={h.coin_image} size={36} className="dvx-holding-icon" />
                  <div>
                    <strong style={{ color:'#fff' }}>{h.coin_symbol?.toUpperCase()}</strong>
                    <div className="muted" style={{ fontSize:'0.72rem' }}>
                      {currentPrice > 0 ? `$${fmt(currentPrice)}` : '—'} · {Number(h.amount).toLocaleString(undefined, { maximumFractionDigits:6 })} held
                      {h.value > 0 && ` · $${fmt(h.value)}`}
                    </div>
                  </div>
                </div>
                <button
                  className="dvx-btn dvx-btn-primary"
                  style={{ padding:'0.35rem 0.8rem', fontSize:'0.75rem', borderRadius:8 }}
                  onClick={() => setAdding(prev => prev[h.coin_id] ? (({ [h.coin_id]: _, ...rest }) => rest)(prev) : { ...prev, [h.coin_id]: { price:'', qty:'' } })}>
                  {isAdding ? 'Cancel' : '+ Target'}
                </button>
              </div>

              {/* Inline add-target form */}
              {isAdding && (
                <div style={{ display:'flex', gap:'0.5rem', alignItems:'flex-end', marginBottom:'0.75rem', flexWrap:'wrap' }}>
                  <div style={{ flex:'1 1 100px' }}>
                    <div style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.4)', marginBottom:'3px' }}>Target Price ($)</div>
                    <input
                      type="number" placeholder="e.g. 75000" min="0" step="any"
                      value={addState.price || ''}
                      onChange={e => setAdding(prev => ({ ...prev, [h.coin_id]: { ...prev[h.coin_id], price: e.target.value } }))}
                      style={{ width:'100%', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(var(--g-rgb),0.3)', borderRadius:8, padding:'0.45rem 0.6rem', color:'#fff', fontSize:'0.85rem' }}
                    />
                  </div>
                  <div style={{ flex:'1 1 100px' }}>
                    <div style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.4)', marginBottom:'3px' }}>Qty to Sell (optional)</div>
                    <input
                      type="number" placeholder={`All (${h.amount.toFixed(4)})`} min="0" step="any"
                      value={addState.qty || ''}
                      onChange={e => setAdding(prev => ({ ...prev, [h.coin_id]: { ...prev[h.coin_id], qty: e.target.value } }))}
                      style={{ width:'100%', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(var(--g-rgb),0.3)', borderRadius:8, padding:'0.45rem 0.6rem', color:'#fff', fontSize:'0.85rem' }}
                    />
                  </div>
                  <button
                    className="dvx-btn dvx-btn-primary"
                    style={{ padding:'0.45rem 1rem', borderRadius:8, whiteSpace:'nowrap' }}
                    onClick={() => saveTarget(h.coin_id, addState.price, addState.qty)}>
                    Save
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
                        <span className="dvx-target-val" style={{ color:'var(--g)' }}>${fmt(proceeds)}</span>
                      </div>
                      <div className="dvx-target-cell">
                        <span className="dvx-target-lbl">Distance</span>
                        <span className="dvx-target-val" style={{ color: reached ? 'var(--g)' : gainVsNow > 0 ? '#fff' : '#f87171' }}>
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
                  </div>
                )
              })}

              {/* Empty state per holding */}
              {plan.length === 0 && !isAdding && (
                <div style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.3)', padding:'0.25rem 0 0.1rem' }}>
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

// ── Main Dashboard ────────────────────────────────────────────────────────
function AlertsSection({ enriched, prices, isDemo }) {
  const [alertTab, setAlertTab] = useState('smart')
  return (
    <div>
      <div className="sa-alert-tabs">
        <button className={`sa-alert-tab ${alertTab === 'smart' ? 'active' : ''}`} onClick={() => setAlertTab('smart')}>
          ⚡ Smart Alerts
        </button>
        <button className={`sa-alert-tab ${alertTab === 'price' ? 'active' : ''}`} onClick={() => setAlertTab('price')}>
          🔔 Price Alerts
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
  const { t } = useLanguage()
  const [portfolio, setPortfolio]         = useState([])
  const [prices, setPrices]               = useState({})
  const [coinImages, setCoinImages]       = useState({})
  const [transactions, setTransactions]   = useState([])
  const [wallets, setWallets]             = useState([])
  const [coinTargets, setCoinTargets]     = useState({})
  const [loaded, setLoaded]               = useState(false)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [activeTab, setActiveTab]         = useState(location.state?.tab || 'overview')
  const [showAllHoldings, setShowAllHoldings] = useState(false)
  const [showBreakEven, setShowBreakEven]     = useState(false)
  const [goalValue, setGoalValue]             = useState(() => { try { return parseFloat(localStorage.getItem('wl_goal') || '0') || 0 } catch { return 0 } })
  const [editingGoal, setEditingGoal]         = useState(false)
  const [goalInput, setGoalInput]             = useState('')
  const [sheetOpen, setSheetOpen]         = useState(false)
  const [sheetType, setSheetType]         = useState('buy')
  const openSheet = useCallback((t, source = 'dashboard') => { setSheetType(t); setSheetOpen(true); track('trade_sheet_open', { type: t, source }) }, [])

  // ── Timed nudge toast (fires after 20s if no trade sheet opened) ──────────
  const [nudgeVisible, setNudgeVisible] = useState(false)
  useEffect(() => {
    if (sheetOpen || transactions.length > 0) { setNudgeVisible(false); return }
    const t = setTimeout(() => {
      if (!sheetOpen && transactions.length === 0) { setNudgeVisible(true); track('trade_nudge_shown') }
    }, 20000)
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
  const { theme, setTheme } = useTheme()
  const [hidden, setHidden]               = useState(false)
  const tickerStart = useRef(null)
  const [tickerValue, setTickerValue] = useState(0)
  const [displayCurrency, setDisplayCurrency] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wl_settings') || '{}').displayCurrency || 'USD' } catch { return 'USD' }
  })
  const [fxRates, setFxRates] = useState({})
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const currencyBtnRef = useRef(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    api.getFiatRates().then(r => setFxRates(r || {})).catch(() => {})
  }, [])

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
  }, [activeTab])

  async function loadAll() {
    const [p, txs, ws, ct] = await Promise.all([
      api.getPortfolio(), api.getTransactions(), api.getWallets(), api.getCoinTargets(),
    ])
    setPortfolio(p); setTransactions(txs); setWallets(ws); setCoinTargets(ct || {})
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

  useEffect(() => {
    let intervalId = null

    function startPolling() {
      if (intervalId) return
      intervalId = setInterval(loadAll, 60_000)
    }

    function stopPolling() {
      clearInterval(intervalId)
      intervalId = null
    }

    function handleVisibility() {
      if (document.hidden) {
        stopPolling()
      } else {
        loadAll()
        startPolling()
      }
    }

    loadAll()
    if (!document.hidden) startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const { enriched, totalValue, totalInvested, totalPnL, totalPnLPct, isDemo, pricesFailed } = useMemo(() => {
    const raw = portfolio.map(h => {
      const price   = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value   = h.amount * price
      const pnl     = value - h.total_invested
      const pnlPct  = h.total_invested > 0 ? (pnl / h.total_invested) * 100 : 0
      const coin_image = h.coin_image || coinImages[h.coin_id] || ''
      return { ...h, coin_image, price, value, pnl, pnlPct }
    }).sort((a, b) => (b.value || b.total_invested) - (a.value || a.total_invested))

    const hasPortfolio = raw.length > 0
    const hasPrices    = raw.some(h => h.value > 0)

    if (!hasPortfolio && loaded) {
      return { enriched: [], totalValue: 0, totalInvested: 0,
        totalPnL: 0, totalPnLPct: 0, isDemo: false, pricesFailed: false }
    }

    const tv  = hasPrices ? raw.reduce((s, h) => s + h.value, 0) : raw.reduce((s, h) => s + h.total_invested, 0)
    const ti  = raw.reduce((s, h) => s + h.total_invested, 0)
    const pnl = hasPrices ? tv - ti : 0
    return {
      enriched: raw, totalValue: tv, totalInvested: ti,
      totalPnL: pnl, totalPnLPct: hasPrices && ti > 0 ? (pnl / ti) * 100 : 0,
      isDemo: false, pricesFailed: hasPortfolio && !hasPrices && loaded && !pricesLoading,
    }
  }, [portfolio, prices, coinImages, loaded, pricesLoading])

  // Count-up animation
  useEffect(() => {
    if (!loaded) return
    if (tickerStart.current === totalValue) return
    tickerStart.current = totalValue
    const t0 = performance.now(), dur = 1400, from = 0, to = totalValue
    let raf = 0
    const step = now => {
      const ease = 1 - Math.pow(1 - Math.min(1, (now - t0) / dur), 3)
      setTickerValue(from + (to - from) * ease)
      if (ease < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [loaded, totalValue])

  useEffect(() => {
    if (loaded && totalValue > 0) saveSnapshot(totalValue, totalInvested)
  }, [loaded, totalValue])

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

  const [perfTf, setPerfTf] = useState('30D')
  const perfSeries = useMemo(() => buildPerfSeries(totalValue, perfTf), [totalValue, perfTf])
  const perfHasRealData = useMemo(() => {
    const days = { '4H': 0, '1D': 1, '7D': 7, '30D': 30 }[perfTf] || 30
    return hasRealData(days)
  }, [perfTf, perfSeries])
  const perfChange = useMemo(() => {
    if (!perfSeries.length) return { abs: 0, pct: 0 }
    const first = perfSeries[0]?.v || 0
    const last  = perfSeries[perfSeries.length - 1]?.v || 0
    const abs   = last - first
    const pct   = first > 0 ? (abs / first) * 100 : 0
    return { abs, pct }
  }, [perfSeries])
  const [perfHover, setPerfHover] = useState(null)

  const allocData = useMemo(() => {
    if (!enriched.length) return []
    const items = enriched
      .map(h => ({ name: h.coin_symbol?.toUpperCase(), value: h.value > 0 ? h.value : h.total_invested }))
      .filter(d => d.value > 0)
    const total = items.reduce((s, d) => s + d.value, 0)
    return items.map(d => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }))
  }, [enriched])

  const pnlData = useMemo(() => {
    if (pricesFailed || !enriched.some(h => h.pnl !== 0)) return []
    return enriched.slice(0, 8).map(h => ({
      name: h.coin_symbol?.toUpperCase(),
      pnl: parseFloat((h.pnl || 0).toFixed(2)),
    }))
  }, [enriched, pricesFailed])

  const recentTxs       = useMemo(() => transactions.slice(0, 8), [transactions])
  const displayHoldings = showAllHoldings ? enriched : enriched.slice(0, 6)

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
      const plan = coinTargets[h.coin_id]?.targets || []
      if (!plan.length) continue
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

    return { rows, totalPotentialProceeds, totalReached, chartData, totalTargets: rows.reduce((s, r) => s + r.targets.length, 0) }
  }, [enriched, coinTargets])

  const tabs = [
    { id: 'overview', label: t('overview'), icon: Ico.overview },
    { id: 'tools',    label: 'Analysis',    icon: Ico.ai },
    { id: 'alerts',   label: 'Alerts',      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
    { id: 'targets',  label: t('targets'),  icon: Ico.target },
    { id: 'manage',   label: 'Manage',      icon: Ico.wallet },
  ]

  // Map legacy tab names from location.state to new names
  const normalizeTab = (id) => {
    if (id === 'ai' || id === 'risk' || id === 'eval') return 'tools'
    if (id === 'wallets' || id === 'data') return 'manage'
    return id
  }

  return (
    <div className="dvx">
      {/* ── Theme strip — top of page ── */}
      <div className="theme-strip">
        <span className="theme-strip-heading">🎨 Theme</span>
        {THEMES.map(th => (
          <button
            key={th.id}
            className={`theme-strip-btn ${theme === th.id ? 'theme-strip-active' : ''}`}
            onClick={() => { setTheme(th.id); track('theme_changed', { theme: th.id }) }}
            title={th.name}
          >
            <span className="theme-strip-icon" style={{
              background: `radial-gradient(circle at 35% 35%, ${th.light}, ${th.swatch})`,
              boxShadow: theme === th.id ? `0 0 14px ${th.swatch}88` : 'none',
              overflow: 'hidden', padding: th.logo ? 0 : undefined,
            }}>
              {th.logo
                ? <img src={th.logo} alt={th.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : th.icon}
            </span>
            <span className="theme-strip-label">{th.name}</span>
            {theme === th.id && <span className="theme-strip-dot" />}
          </button>
        ))}
      </div>

      {/* Tab nav — 5 tabs */}
      <div className="dvx-tabs">
        {tabs.map(tab => (
          <button key={tab.id} className={`dvx-tab ${activeTab === tab.id ? 'dvx-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}>
            <span className="dvx-tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {activeTab === 'overview' && (
        <>
          {/* Empty state for new users */}
          {!loaded || enriched.length === 0 ? (
            <EmptyPortfolio onAddTrade={() => openSheet('buy', 'empty_state')} navigate={navigate} loaded={loaded} />
          ) : null}

          {/* Live news ticker */}
          <NewsTicker />

          {/* Hero + stats — only shown when portfolio has holdings */}
          {enriched.length > 0 && <div className="dvx-hero glass-card lens-pulse">
            <p className="dvx-hero-label">
              {pricesFailed ? t('investedValue') : pricesLoading ? t('loadingPrices') : t('totalPortfolioValue')}
              {isDemo && <span className="dvx-badge-demo">DEMO</span>}
              {pricesFailed && <span className="dvx-badge-warn">PRICES OFFLINE</span>}
              {pricesLoading && <span className="dvx-badge-info">LIVE</span>}
              <button className="dvx-eye-btn" onClick={() => { setHidden(h => { track('hide_values_toggle', { hidden: !h }); return !h }) }} title={hidden ? 'Show values' : 'Hide values'}>
                {hidden
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </p>
            <h2 className={`dvx-hero-value ${hidden ? 'dvx-hidden-val' : ''}`}>
              {hidden ? '••••••' : (() => {
                const usdVal = loaded ? tickerValue : 0
                if (displayCurrency === 'BTC') {
                  const btcPrice = prices['bitcoin']?.usd || prices['bitcoin']?.price
                  return btcPrice ? `₿ ${(usdVal / btcPrice).toFixed(6)}` : `$${fmt(usdVal)}`
                }
                const fiat = POPULAR_FIAT.find(f => f.code === displayCurrency)
                const rate = fxRates[displayCurrency] || (displayCurrency === 'USD' ? 1 : null)
                return rate ? `${fiat?.symbol || displayCurrency} ${fmt(usdVal * rate)}` : `$${fmt(usdVal)}`
              })()}
            </h2>
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
                    setDropdownPos({ top: r.bottom + 6, left: r.left })
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
                  <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowCurrencyPicker(false)} />
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
            </div>
            {!pricesFailed && totalPnL !== 0 && (
              <p className={`dvx-hero-change ${totalPnL >= 0 ? 'up' : 'dn'} ${hidden ? 'dvx-hidden-val' : ''}`}>
                {hidden ? '••••• (••••%)' : `${totalPnL >= 0 ? '↑' : '↓'} $${fmt(Math.abs(totalPnL))} (${pct(totalPnLPct)}) ${t('allTime')}`}
              </p>
            )}
            {!isDemo && totalValue > 0 && (
              <button className="dvx-weekly-btn" onClick={() => { setWeeklyOpen(true); track('weekly_report_open') }} title="Weekly Report">
                📅
              </button>
            )}
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
              <StatCard label={t('invested')}    value={hidden ? '••••' : `$${fmt(totalInvested)}`} />
              <StatCard label={t('pnl')}         value={hidden ? '••••' : `${totalPnL >= 0 ? '+' : ''}$${fmt(Math.abs(totalPnL))}`}
                color={totalPnL >= 0 ? 'var(--g)' : '#f87171'}
                sub={hidden ? undefined : (totalPnLPct !== 0 ? pct(totalPnLPct) : undefined)} />
              <StatCard label={t('assets')}      value={enriched.length} />
              <StatCard label={t('tradesCount')} value={transactions.length} />
            </div>
          )}

          {/* Quick Trade nudge — shown for portfolio holders */}
          {enriched.length > 0 && (
            <div ref={quickStripRef} style={{
              display: 'flex', gap: '0.6rem', margin: '0.5rem 0',
            }}>
              <button onClick={() => openSheet('buy', 'quick_strip')} style={{
                flex: 1, padding: '0.75rem', borderRadius: '14px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(var(--g-rgb),0.22), rgba(var(--g-rgb),0.10))',
                color: 'var(--g)', fontWeight: 800, fontSize: '0.9rem',
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
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: '0.82rem',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
                whiteSpace: 'nowrap',
              }}>
                History
              </button>
            </div>
          )}

          {/* Tips & quotes banner */}
          <TradeTips />

          {/* Partner exchange strip */}
          <ExchangePartners compact source="dashboard" />

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

          {/* Portfolio Heatmap */}
          {!isDemo && enriched.length >= 2 && !pricesFailed && (
            <PortfolioHeatmap enriched={enriched} prices={prices} totalValue={totalValue} />
          )}

          {/* Top Movers */}
          {!isDemo && enriched.length >= 2 && !pricesFailed && (
            <div className="glass-card dvx-movers-card">
              <h3 style={{ margin:'0 0 0.75rem' }}>📈 Today's Movers</h3>
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
                          <span style={{ color:'var(--g)' }}>+{chg.toFixed(2)}%</span>
                        </div>
                        <div className="dvx-mover-impact" style={{ color:'var(--g)' }}>
                          +${fmt(h.value * chg / 100)}
                        </div>
                      </div>
                    )
                  })}
              </div>
              <div className="dvx-movers-divider" />
              <div className="dvx-movers-row">
                {[...enriched]
                  .filter(h => prices[h.coin_id]?.usd_24h_change != null)
                  .sort((a, b) => (prices[a.coin_id]?.usd_24h_change ?? 0) - (prices[b.coin_id]?.usd_24h_change ?? 0))
                  .slice(0, 3)
                  .map(h => {
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

          {/* Performance chart — full width, above the grid */}
          {enriched.length > 0 && <div className="glass-card perf-card">
            {/* Header: value + change */}
            <div style={{ marginBottom:'1rem' }}>
              <div style={{ fontSize:'0.72rem', fontWeight:600, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.3rem' }}>
                Portfolio Value
              </div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:'0.75rem', flexWrap:'wrap' }}>
                <span style={{ fontSize:'1.75rem', fontWeight:800, color:'white', letterSpacing:'-0.03em', lineHeight:1 }}>
                  ${fmt(perfHover != null ? perfHover : totalValue)}
                </span>
                <div style={{ display:'flex', alignItems:'center', gap:'0.35rem', paddingBottom:'0.15rem' }}>
                  <span style={{
                    fontSize:'0.85rem', fontWeight:700,
                    color: perfChange.pct >= 0 ? 'var(--g)' : '#f87171',
                    background: perfChange.pct >= 0 ? 'rgba(var(--g-rgb),0.12)' : 'rgba(248,113,113,0.12)',
                    borderRadius:6, padding:'0.15rem 0.5rem',
                  }}>
                    {perfChange.pct >= 0 ? '▲' : '▼'} {Math.abs(perfChange.pct).toFixed(2)}%
                  </span>
                  <span style={{ fontSize:'0.8rem', color: perfChange.abs >= 0 ? 'var(--g)' : '#f87171', fontWeight:600 }}>
                    {perfChange.abs >= 0 ? '+' : ''}${fmt(Math.abs(perfChange.abs))}
                  </span>
                  <span style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.3)' }}>{perfTf}</span>
                </div>
              </div>
            </div>

            {/* Timeframe pills */}
            <div style={{ display:'flex', gap:'0.3rem', marginBottom:'0.75rem' }}>
              {TIMEFRAMES.map(tf => (
                <button key={tf.id} onClick={() => { setPerfTf(tf.id); track('perf_timeframe_switch', { timeframe: tf.id }) }}
                  style={{
                    padding:'0.25rem 0.65rem', borderRadius:20, border:'none', cursor:'pointer',
                    fontSize:'0.75rem', fontWeight:700,
                    background: perfTf === tf.id ? (perfChange.pct >= 0 ? 'var(--g)' : '#f87171') : 'rgba(255,255,255,0.07)',
                    color: perfTf === tf.id ? '#000' : 'rgba(255,255,255,0.5)',
                    transition:'all 0.15s',
                  }}>
                  {tf.label}
                </button>
              ))}
              <span style={{ marginLeft:'auto', fontSize:'0.65rem', color: perfHasRealData ? 'var(--g)' : 'rgba(255,255,255,0.25)', alignSelf:'center' }}>
                {perfHasRealData ? '● live' : '○ simulated'}
              </span>
            </div>

            {/* Chart */}
            {(() => {
              const up = perfChange.pct >= 0
              const strokeColor = up ? 'var(--g)' : '#f87171'
              const gradId = up ? 'pg-up' : 'pg-dn'
              return (
                <ResponsiveContainer key={perfTf} width="100%" height={200}>
                  <AreaChart data={perfSeries} margin={{ left:0, right:0, top:8, bottom:0 }}
                    onMouseMove={s => { if (s?.activePayload?.[0]) setPerfHover(s.activePayload[0].value) }}
                    onMouseLeave={() => setPerfHover(null)}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35}/>
                        <stop offset="85%" stopColor={strokeColor} stopOpacity={0.03}/>
                        <stop offset="100%" stopColor={strokeColor} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background:'#0d1f14', border:'1px solid rgba(var(--g-rgb),0.25)', borderRadius:10, padding:'0.5rem 0.85rem', boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}
                      itemStyle={{ color:'white', fontWeight:700, fontSize:'0.9rem' }}
                      labelStyle={{ display:'none' }}
                      formatter={v => [`$${fmt(v)}`, '']}
                      cursor={{ stroke: strokeColor, strokeWidth:1, strokeDasharray:'4 3', opacity:0.5 }}
                    />
                    <Area type="monotoneX" dataKey="v" stroke={strokeColor} strokeWidth={2}
                      fill={`url(#${gradId})`} dot={false} activeDot={{ r:5, fill:strokeColor, stroke:'#0d1f14', strokeWidth:2 }}/>
                  </AreaChart>
                </ResponsiveContainer>
              )
            })()}
          </div>}

          {/* Main grid */}
          <div className="dvx-grid">
            {/* Left column */}
            <div className="dvx-col-main">

              {/* P&L bar chart */}
              {pnlData.length > 0 && (
                <div className="glass-card">
                  <h3 style={{ margin:'0 0 0.75rem' }}>Profit / Loss by Asset</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={pnlData} margin={{ left:0, right:0, top:4, bottom:0 }}>
                      <CartesianGrid stroke="rgba(var(--g-rgb),0.07)" vertical={false}/>
                      <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.45)', fontSize:11 }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fill:'rgba(255,255,255,0.38)', fontSize:10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => fmtN(v)} width={50}/>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`$${fmt(v)}`, 'P&L']}/>
                      <Bar dataKey="pnl" radius={[6,6,0,0]}>
                        {pnlData.map((d, i) => (
                          <Cell key={i} fill={d.pnl >= 0 ? 'var(--g)' : '#f87171'} fillOpacity={0.85}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Net Worth History (30-day from transactions) */}
              {!isDemo && transactions.length > 0 && (() => {
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
                      <h3 style={{ margin:0 }}>💰 Net Worth History</h3>
                      <span className="muted" style={{ fontSize:'0.72rem' }}>30-day invested capital</span>
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={points} margin={{ left:0, right:0, top:4, bottom:0 }}>
                        <defs>
                          <linearGradient id="nwg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4}/>
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`$${fmt(v)}`, 'Invested']} labelFormatter={l => `Day ${l}`} cursor={{ stroke:'rgba(59,130,246,0.3)' }}/>
                        <Area type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={2} fill="url(#nwg)" dot={false}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}

              {/* Targets near strike — compact overview widget */}
              {targetsAnalysis.rows.length > 0 && (
                <div className="glass-card">
                  <div style={CHART_HDR_STYLE}>
                    <h3 style={{ margin:0 }}>{t('sellTargets')}</h3>
                    <button className="dvx-show-more" style={{ width:'auto', margin:0, padding:'0.3rem 0.75rem', fontSize:'0.72rem' }}
                      onClick={() => setActiveTab('targets')}>
                      {t('viewAll')}
                    </button>
                  </div>
                  <div className="dvx-targets-mini">
                    {targetsAnalysis.rows.flatMap(r => r.targets).slice(0, 5).map(tgt => (
                      <div key={tgt.id} className={`dvx-target-mini-row ${tgt.reached ? 'dvx-target-reached' : ''}`}>
                        <span className="dvx-target-mini-sym">{tgt.coinSymbol?.toUpperCase()}</span>
                        <span className="dvx-target-mini-price">${fmt(tgt.price)}</span>
                        <div className="dvx-target-bar-bg" style={{ flex:1, margin:'0 0.5rem' }}>
                          <div className="dvx-target-bar-fill" style={{ width:`${tgt.progress}%`, background: tgt.reached ? 'var(--g)' : 'linear-gradient(90deg,#3b82f6,var(--g))' }}/>
                        </div>
                        <span style={{ fontSize:'0.7rem', color: tgt.reached ? 'var(--g)' : 'rgba(255,255,255,0.45)', minWidth:'2.5rem', textAlign:'right' }}>
                          {tgt.reached ? '✓' : `${tgt.progress.toFixed(0)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent transactions */}
              <div className="glass-card">
                <h3>{t('recentTransactions')}</h3>
                {recentTxs.length === 0
                  ? <p className="muted">{t('noTransactions')}</p>
                  : <ul className="dvx-tx-list">
                    {recentTxs.map(tx => {
                      const isBuy = tx.type === 'buy' || tx.type === 'deposit'
                      return (
                        <li key={tx.id} className="dvx-tx-item holo-card-v2">
                          <span className="dvx-tx-icon" style={{ color: isBuy ? 'var(--g)' : '#f87171' }}>
                            {isBuy ? Ico.buy : Ico.sell}
                          </span>
                          <div className="dvx-tx-meta">
                            <strong>{isBuy ? t('bought') : t('sold')} {tx.coin_symbol?.toUpperCase()}</strong>
                            <span className="muted">{tx.amount} @ ${fmt(tx.price_per_unit || 0)}</span>
                          </div>
                          <span className="dvx-tx-amt">${fmt((tx.amount || 0) * (tx.price_per_unit || 0))}</span>
                        </li>
                      )
                    })}
                  </ul>
                }
              </div>
            </div>

            {/* Right column */}
            <div className="dvx-col-side">
              {/* Allocation donut */}
              <div className="glass-card">
                <h3>{pricesFailed ? t('allocationInvested') : t('allocation')}</h3>
                {allocData.length === 0
                  ? <p className="muted">{t('noHoldings')}</p>
                  : <>
                    <ResponsiveContainer width="100%" height={190}>
                      <PieChart>
                        <Pie data={allocData} dataKey="value" cx="50%" cy="50%"
                          innerRadius="60%" outerRadius="88%" stroke="none" paddingAngle={2}>
                          {allocData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]}/>)}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`$${fmt(v)}`, n]}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="dvx-legend">
                      {allocData.map((d, i) => (
                        <li key={d.name} className="dvx-legend-item">
                          <span className="dvx-legend-dot" style={{ background: PALETTE[i % PALETTE.length] }}/>
                          <span className="dvx-legend-name">{d.name}</span>
                          <span className="dvx-legend-val">{d.pct.toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  </>
                }
              </div>

              {/* Goal Tracker */}
              <div className="glass-card dvx-goal-card">
                <div style={CHART_HDR_STYLE}>
                  <h3 style={{ margin:0 }}>🎯 Portfolio Goal</h3>
                  <button className="dvx-show-more" style={{ width:'auto', margin:0, padding:'0.3rem 0.75rem', fontSize:'0.72rem' }}
                    onClick={() => { setGoalInput(goalValue > 0 ? goalValue.toString() : ''); setEditingGoal(true) }}>
                    {goalValue > 0 ? 'Edit' : 'Set Goal'}
                  </button>
                </div>
                {editingGoal ? (
                  <div className="dvx-goal-edit">
                    <input
                      className="dvx-goal-input"
                      type="number"
                      placeholder="e.g. 100000"
                      value={goalInput}
                      onChange={e => setGoalInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const v = parseFloat(goalInput) || 0
                          setGoalValue(v)
                          localStorage.setItem('wl_goal', v.toString())
                          setEditingGoal(false)
                        }
                        if (e.key === 'Escape') setEditingGoal(false)
                      }}
                      autoFocus
                    />
                    <button className="dvx-goal-save" onClick={() => {
                      const v = parseFloat(goalInput) || 0
                      setGoalValue(v)
                      localStorage.setItem('wl_goal', v.toString())
                      setEditingGoal(false)
                      track('goal_set', {
                        goal_usd: Math.round(v),
                        current_usd: Math.round(totalValue),
                        progress_pct: v > 0 ? Math.round((totalValue / v) * 100) : 0,
                        gap_usd: Math.round(Math.max(0, v - totalValue)),
                      })
                    }}>Save</button>
                  </div>
                ) : goalValue > 0 ? (() => {
                  const progress = Math.min(100, (totalValue / goalValue) * 100)
                  const remaining = Math.max(0, goalValue - totalValue)
                  const reached = totalValue >= goalValue
                  return (
                    <div className="dvx-goal-body">
                      <div className="dvx-goal-nums">
                        <span className="dvx-goal-current">${fmt(totalValue)}</span>
                        <span className="muted"> / ${fmt(goalValue)}</span>
                      </div>
                      <div className="dvx-goal-bar-track">
                        <div className="dvx-goal-bar-fill" style={{ width:`${progress}%`, background: reached ? 'var(--g)' : 'linear-gradient(90deg,#3b82f6,var(--g))' }} />
                      </div>
                      <div className="dvx-goal-footer">
                        <span style={{ color: reached ? 'var(--g)' : 'rgba(255,255,255,0.5)', fontSize:'0.75rem' }}>
                          {reached ? '🎉 Goal reached!' : `$${fmt(remaining)} to go · ${progress.toFixed(1)}%`}
                        </span>
                      </div>
                    </div>
                  )
                })() : (
                  <p className="muted" style={{ fontSize:'0.82rem', margin:'0.5rem 0 0' }}>Set a target portfolio value to track your progress.</p>
                )}
              </div>

              {/* Stale price warning */}
              {staleAssets.length > 0 && (
                <div style={{ background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'12px', padding:'0.65rem 1rem', display:'flex', gap:'0.6rem', alignItems:'flex-start', marginBottom:'0.5rem' }}>
                  <span style={{ fontSize:'1rem', flexShrink:0 }}>⚠️</span>
                  <div style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.7)', lineHeight:1.5 }}>
                    <strong style={{ color:'#f59e0b' }}>Stale prices:</strong>{' '}
                    {staleAssets.map(h => h.coin_symbol?.toUpperCase()).join(', ')} — prices are over 7 days old.
                    Update them via Add Trade to keep your portfolio value accurate.
                  </div>
                </div>
              )}

              {/* All holdings */}
              <div className="glass-card">
                <div style={CHART_HDR_STYLE}>
                  <h3 style={{ margin:0 }}>Holdings ({enriched.length})</h3>
                  <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                    {pricesFailed && <span className="dvx-badge-warn" style={{ fontSize:'0.6rem' }}>INVESTED</span>}
                    <button
                      className={`dvx-breakeven-toggle ${showBreakEven ? 'active' : ''}`}
                      onClick={() => setShowBreakEven(v => !v)}
                      title="Toggle break-even view"
                    >
                      ⚖ Break-Even
                    </button>
                  </div>
                </div>
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
                        return CATEGORY_ORDER.filter(cat => grouped[cat]?.length > 0).map(cat => (
                          <div key={cat}>
                            <div style={{ fontSize:'0.75rem', fontWeight:700, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.07em', padding:'0.5rem 0 0.25rem' }}>
                              {CATEGORY_LABELS[cat]}
                            </div>
                            <ul className="dvx-holdings" style={{ margin:0 }}>
                              {grouped[cat].map(h => {
                                const displayValue  = h.value > 0 ? h.value : h.total_invested
                                const hasPnl        = h.pnl !== 0 && !pricesFailed
                                const breakEvenPrice = h.amount > 0 ? h.total_invested / h.amount : 0
                                const beDistance     = h.price > 0 && breakEvenPrice > 0
                                  ? ((h.price - breakEvenPrice) / breakEvenPrice) * 100 : 0
                                const bePct = h.price > 0 && breakEvenPrice > 0
                                  ? Math.min(100, (h.price / breakEvenPrice) * 100) : 0
                                return (
                                  <li key={h.coin_id} className="dvx-holding holo-card-v2"
                                    onClick={() => { if (!isDemo) { track('asset_click', { asset_id: h.coin_id, symbol: h.coin_symbol }); navigate(`/asset/${encodeURIComponent(h.coin_id)}`) } }}>
                                    <CoinLogo image={h.coin_image} symbol={h.coin_symbol} coinId={h.coin_id} size={36} className="dvx-holding-icon" />
                                    <div className="dvx-holding-meta">
                                      <strong>{h.coin_symbol?.toUpperCase()}</strong>
                                      {showBreakEven ? (
                                        <span className="muted" style={{ fontSize:'0.72rem' }}>
                                          Break-even: <span style={{ color: beDistance >= 0 ? 'var(--g)' : '#f87171', fontWeight:700 }}>
                                            ${fmt(breakEvenPrice)}
                                          </span>
                                          {h.price > 0 && <span style={{ color: beDistance >= 0 ? 'var(--g)' : '#f87171' }}>
                                            {' '}{beDistance >= 0 ? '↑ ' : '↓ '}{Math.abs(beDistance).toFixed(1)}% {beDistance >= 0 ? 'above' : 'below'}
                                          </span>}
                                        </span>
                                      ) : (
                                        <span className="muted">
                                          {h.price > 0 ? `$${fmt(h.price)}` : `inv $${fmt(h.total_invested)}`}
                                          {' · '}{Number(h.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} units
                                        </span>
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
                                    <div style={TEXT_RIGHT_STYLE}>
                                      <div className="dvx-holding-val">${fmt(displayValue)}</div>
                                      {!showBreakEven && hasPnl && (
                                        <div style={{ fontSize:'0.68rem', color: h.pnl >= 0 ? 'var(--g)' : '#f87171', marginTop:'0.1rem' }}>
                                          {h.pnl >= 0 ? '+' : ''}${fmt(h.pnl)} ({pct(h.pnlPct)})
                                        </div>
                                      )}
                                    </div>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ))
                      })()}
                    </div>
                    {enriched.length > 6 && (
                      <button className="dvx-show-more" onClick={() => setShowAllHoldings(v => !v)}>
                        {showAllHoldings ? '▲ Show less' : `▼ Show all ${enriched.length} assets`}
                      </button>
                    )}
                  </>
                }
              </div>

              {/* Exchange partners strip below holdings */}
              <ExchangePartners compact source="holdings" />
            </div>
          </div>
        </>
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
      {activeTab === 'tools' && (
        <ToolsTab
          enriched={enriched}
          prices={prices}
          transactions={transactions}
          totalValue={totalValue}
          isDemo={isDemo}
          pricesLoading={pricesLoading}
          coinTargets={coinTargets}
        />
      )}

      {/* ══ ALERTS (Price + Smart) ══ */}
      {activeTab === 'alerts' && (
        <AlertsSection enriched={enriched} prices={prices} isDemo={isDemo} />
      )}

      {/* ══ MANAGE (Wallets + Backup) ══ */}
      {activeTab === 'manage' && (
        <div className="dvx-form-page">
          <div className="glass-card dvx-form-card">
            <h3>{t('walletsTitle')(wallets.length)}</h3>
            <WalletPanel wallets={wallets} onRefresh={loadAll} />
          </div>
          <div className="glass-card dvx-form-card">
            <h3>{t('backupTitle')}</h3>
            <DataPanel onRefresh={loadAll} />
          </div>
        </div>
      )}

      {/* ══ TRADE BOTTOM SHEET ══ */}
      <TradeSheet
        open={sheetOpen}
        type={sheetType}
        onClose={() => setSheetOpen(false)}
        wallets={wallets}
        onDone={loadAll}
        holdings={enriched}
      />

      {/* ── Floating trade FAB ── */}
      {!sheetOpen && (
        <button
          onClick={() => openSheet('buy', 'fab')}
          title="Add a trade"
          style={{
            position: 'fixed', bottom: '80px', left: '16px', zIndex: 9000,
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg,var(--g),var(--gd))',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(var(--g-rgb),0.55), 0 0 0 0 rgba(var(--g-rgb),0.4)',
            animation: 'fab-pulse 2.5s ease-in-out infinite',
            color: '#000',
          }}
          aria-label="Add a trade"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      )}
      {/* ── Nudge toast — appears after 20s idle ── */}
      {nudgeVisible && !sheetOpen && (
        <div style={{
          position: 'fixed', bottom: '148px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9001, display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: 'rgba(20,21,30,0.97)', border: '1px solid rgba(var(--g-rgb),0.3)',
          borderRadius: '50px', padding: '0.6rem 1rem 0.6rem 0.75rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          animation: 'slideUpFade 0.3s ease',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: '1rem' }}>📊</span>
          <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Log your latest trade</span>
          <button onClick={() => { setNudgeVisible(false); openSheet('buy', 'nudge_toast') }} style={{
            padding: '0.35rem 0.85rem', borderRadius: '50px', border: 'none', cursor: 'pointer',
            background: 'var(--g)', color: '#000', fontWeight: 800, fontSize: '0.8rem',
          }}>Buy</button>
          <button onClick={() => { setNudgeVisible(false); openSheet('sell', 'nudge_toast') }} style={{
            padding: '0.35rem 0.85rem', borderRadius: '50px', border: 'none', cursor: 'pointer',
            background: 'rgba(248,113,113,0.15)', color: '#f87171', fontWeight: 800, fontSize: '0.8rem',
            border: '1px solid rgba(248,113,113,0.3)',
          }}>Sell</button>
          <button onClick={() => setNudgeVisible(false)} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
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
        <ShareCard
          totalValue={totalValue}
          totalPnL={totalPnL}
          totalPnLPct={totalPnLPct}
          topHoldings={enriched.slice(0, 4)}
          todayPnL={enriched.reduce((s, h) => s + (h.value * (h.pct24h || 0) / 100), 0)}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}
