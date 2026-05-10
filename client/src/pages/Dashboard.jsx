import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { api } from '../api'
import TradeSheet from '../components/TradeSheet'
import ShareCard from '../components/ShareCard'

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
  { id: 'mega',  label: 'Mega Cap',  min: 100e9,  color: '#34d399', emoji: '🐋' },
  { id: 'large', label: 'Large Cap', min: 10e9,   color: '#3b82f6', emoji: '🔵' },
  { id: 'mid',   label: 'Mid Cap',   min: 1e9,    color: '#f59e0b', emoji: '🟡' },
  { id: 'small', label: 'Small Cap', min: 100e6,  color: '#f87171', emoji: '🔴' },
  { id: 'micro', label: 'Micro Cap', min: 0,      color: '#8b5cf6', emoji: '💜' },
]

// Known mega/large-cap IDs to classify without needing live market cap data
const KNOWN_MEGA = new Set(['bitcoin','ethereum'])
const KNOWN_LARGE = new Set(['solana','binancecoin','xrp','cardano','dogecoin','avalanche-2','polkadot','chainlink','polygon','litecoin','tron','shiba-inu'])

function classifyMcTier(coinId, marketCap) {
  if (marketCap > 0) {
    return MC_TIERS.find(t => marketCap >= t.min) || MC_TIERS[MC_TIERS.length - 1]
  }
  if (KNOWN_MEGA.has(coinId))  return MC_TIERS[0]
  if (KNOWN_LARGE.has(coinId)) return MC_TIERS[1]
  return MC_TIERS[3]
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
  const tierSet = new Set(enriched.map(h => classifyMcTier(h.coin_id, h.market_cap || 0).id))
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

  const gradeColor = health >= 72 ? '#34d399' : health >= 55 ? '#f59e0b' : '#f87171'

  // Market cap breakdown
  const mcBreakdown = MC_TIERS.map(tier => {
    const assets = enriched.filter(h => classifyMcTier(h.coin_id, h.market_cap || 0).id === tier.id)
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

  const hasMetals = enriched.some(h => h.coin_id === 'metal:xau' || h.coin_id === 'metal:xag')
  const hasStocks = enriched.some(h => (h.coin_id || '').startsWith('stock:'))
  if (!hasMetals && !hasStocks) insights.push({ type: 'info', text: 'Portfolio is 100% crypto — adding gold/silver or stocks could hedge volatility.' })

  if (tierSet.size >= 3) insights.push({ type: 'good', text: `Well-diversified across ${tierSet.size} market-cap tiers — balanced risk profile.` })
  else if (!tierSet.has('mid') && !tierSet.has('small')) insights.push({ type: 'info', text: 'Holding mainly large/mega-cap assets — mid/small-cap exposure could boost upside.' })

  // Indicators
  const riskLevel = hhiNorm > 0.6 ? 'High' : hhiNorm > 0.3 ? 'Medium' : 'Low'
  const riskColor = hhiNorm > 0.6 ? '#f87171' : hhiNorm > 0.3 ? '#f59e0b' : '#34d399'

  const buyCount = transactions.filter(t => t.type === 'buy').length
  const sellCount = transactions.filter(t => t.type === 'sell').length
  const tradeRatio = buyCount + sellCount > 0 ? buyCount / (buyCount + sellCount) : 0.5
  const sentiment = tradeRatio > 0.65 ? 'Accumulating' : tradeRatio < 0.35 ? 'Distributing' : 'Balanced'
  const sentimentColor = tradeRatio > 0.65 ? '#34d399' : tradeRatio < 0.35 ? '#f87171' : '#f59e0b'

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
    fearGreed >= 45 ? '#34d399' :
    fearGreed >= 25 ? '#3b82f6' : '#8b5cf6'

  // ── Stress test scenarios ─────────────────────────────────────────────────
  const stressScenarios = [
    { label: 'Mild Dip',   pct: -10, color: '#f59e0b', icon: '📉' },
    { label: 'Correction', pct: -30, color: '#f87171', icon: '🩸' },
    { label: 'Bear Market',pct: -60, color: '#8b5cf6', icon: '🐻' },
    { label: 'Bull +50%',  pct: +50, color: '#34d399', icon: '🚀' },
    { label: 'Moon +200%', pct: +200,color: '#ffd700', icon: '🌕' },
  ]

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
function AIPanel({ enriched, prices, transactions, totalValue, isDemo }) {
  const ai = useMemo(
    () => computeAI(enriched, prices, transactions, totalValue),
    [enriched, prices, transactions, totalValue]
  )

  if (!ai) return (
    <div className="ai-empty glass-card">
      <div className="ai-empty-icon">🤖</div>
      <p>Add holdings to unlock AI portfolio analysis.</p>
    </div>
  )

  return (
    <div className="ai-wrap">
      {isDemo && <div className="dvx-badge-demo" style={{marginBottom:'0.75rem',display:'inline-block'}}>DEMO DATA</div>}

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
            <div className="ai-grade-label">Portfolio Grade</div>
          </div>
        </div>
        <div className="ai-health-bars">
          {[
            { label: 'Diversification', val: ai.concentrationScore, color: '#34d399' },
            { label: 'Momentum',        val: ai.momentumScore,      color: '#3b82f6' },
            { label: 'P&L Health',      val: ai.pnlHealth,          color: '#f59e0b' },
            { label: 'Cap Spread',      val: ai.tierScore,          color: '#8b5cf6' },
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
          <div className="ai-ind-label">Risk Level</div>
          <div className="ai-ind-val" style={{color: ai.riskColor}}>{ai.riskLevel}</div>
          <div className="ai-ind-sub">HHI {ai.hhi.toFixed(2)}</div>
        </div>
        <div className="ai-ind-card glass-card">
          <div className="ai-ind-label">24h Momentum</div>
          <div className="ai-ind-val" style={{color: ai.momentum >= 0 ? '#34d399' : '#f87171'}}>
            {ai.momentum >= 0 ? '+' : ''}{ai.momentum.toFixed(2)}%
          </div>
          <div className="ai-ind-sub">weighted avg</div>
        </div>
        <div className="ai-ind-card glass-card">
          <div className="ai-ind-label">Sentiment</div>
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
        <h4 className="ai-section-title">Market Cap Distribution</h4>
        <div className="ai-mc-bar-track">
          {ai.mcBreakdown.map(t => (
            <div key={t.id} className="ai-mc-seg" style={{ width: `${t.pct}%`, background: t.color }}
              title={`${t.label}: ${t.pct.toFixed(1)}%`} />
          ))}
        </div>
        <div className="ai-mc-legend">
          {ai.mcBreakdown.map(t => (
            <div key={t.id} className="ai-mc-item">
              <span className="ai-mc-dot" style={{background: t.color}} />
              <div className="ai-mc-info">
                <span className="ai-mc-name">{t.emoji} {t.label}</span>
                <span className="ai-mc-assets">{t.assets.map(a => a.coin_symbol?.toUpperCase()).join(', ')}</span>
              </div>
              <span className="ai-mc-pct" style={{color: t.color}}>{t.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Insights */}
      <div className="glass-card ai-insights-card">
        <h4 className="ai-section-title">🤖 AI Insights</h4>
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
        <h4 className="ai-section-title">Portfolio Radar</h4>
        <AIRadar scores={{
          Diversity:    ai.concentrationScore,
          Momentum:     ai.momentumScore,
          'P&L':        ai.pnlHealth,
          'Cap Spread': ai.tierScore,
          'Asset Count':ai.assetScore,
        }} />
      </div>

      {/* ── Fear & Greed Meter ── */}
      <div className="glass-card ai-fg-card">
        <h4 className="ai-section-title">Portfolio Fear &amp; Greed</h4>
        <FearGreedGauge value={ai.fearGreed} label={ai.fgLabel} color={ai.fgColor} />
        <p className="ai-fg-desc">
          Derived from momentum, P&amp;L bias, trade sentiment &amp; concentration — specific to <em>your</em> portfolio.
        </p>
      </div>

      {/* ── Today's P&L ── */}
      <div className="glass-card ai-today-card">
        <h4 className="ai-section-title">Today's Performance (24h)</h4>
        <div className="ai-today-main" style={{ color: ai.todayPnL >= 0 ? '#34d399' : '#f87171' }}>
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
                    background: chg >= 0 ? '#34d399' : '#f87171',
                    marginLeft: chg < 0 ? 'auto' : undefined,
                  }} />
                </div>
                <span className="ai-today-chg" style={{ color: chg >= 0 ? '#34d399' : '#f87171' }}>
                  {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                </span>
                <span className="ai-today-pnl" style={{ color: dayPnL >= 0 ? '#34d399' : '#f87171' }}>
                  {dayPnL >= 0 ? '+' : ''}${Math.abs(dayPnL).toFixed(0)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Stress Test ── */}
      <div className="glass-card ai-stress-card">
        <h4 className="ai-section-title">Stress Test Scenarios</h4>
        <div className="ai-stress-grid">
          {ai.stressScenarios.map(s => {
            const newVal = totalValue * (1 + s.pct / 100)
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
        <h4 className="ai-section-title">Entry Quality Analysis</h4>
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
                    background: h.priceDiff >= 0 ? '#34d399' : '#f87171',
                  }} />
                </div>
              </div>
              <span className="ai-entry-score" style={{ color: h.priceDiff >= 0 ? '#34d399' : '#f87171' }}>
                {h.priceDiff >= 0 ? '+' : ''}{h.priceDiff.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Rebalance Planner ── */}
      <div className="glass-card ai-rebal-card">
        <h4 className="ai-section-title">Rebalance Planner</h4>
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
                    <div className="ai-rebal-bar-fill" style={{ width: `${Math.min(h.targetW, 100)}%`, background: '#34d399' }} />
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
    { label: 'Neutral',      color: '#34d399', from: 40, to: 60 },
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
function AIRadar({ scores }) {
  const labels = Object.keys(scores)
  const vals   = Object.values(scores)
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
          fill="none" stroke="rgba(52,211,153,0.1)" strokeWidth="1" />
      ))}
      {/* Axis lines */}
      {labels.map((_, i) => {
        const [x, y] = point(i, 100)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(52,211,153,0.12)" strokeWidth="1" />
      })}
      {/* Data polygon */}
      <polygon points={polygon} fill="rgba(52,211,153,0.15)" stroke="#34d399" strokeWidth="2" />
      {/* Data points */}
      {vals.map((v, i) => {
        const [x, y] = point(i, v)
        return <circle key={i} cx={x} cy={y} r="4" fill="#34d399" />
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
const PALETTE = ['#34d399','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#22d3ee','#f87171','#64748b','#10b981','#a78bfa']

function buildPerfSeries(base) {
  const pts = 30, start = (base || 1) * 0.82
  let prev = start
  return Array.from({ length: pts }, (_, i) => {
    const t = i / (pts - 1)
    const target = start + (base - start) * t
    prev = prev + (target - prev) * 0.55 + (Math.random() - 0.5) * ((base || 1) * 0.014)
    return { i, v: Math.max(prev, 0) }
  }).concat([{ i: pts - 1, v: base || 1 }]).slice(0, pts)
}

// ── Wallet panel ─────────────────────────────────────────────────────────
function WalletPanel({ wallets, onRefresh }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try { await api.createWallet({ name: name.trim() }); setName(''); onRefresh() }
    finally { setBusy(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this wallet and all its transactions?')) return
    await api.deleteWallet(id); onRefresh()
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
      await api.addTransaction({
        wallet_id: walletId, type,
        coin_id: coin.toLowerCase().replace(/\s+/g, '-'),
        coin_symbol: symbol.toUpperCase(), coin_name: coin,
        amount: parseFloat(amount), price_per_unit: parseFloat(price),
        date, category: 'crypto',
      })
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
        {Ico.export} Generate Backup Code
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

// ── Main Dashboard ────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [portfolio, setPortfolio]         = useState([])
  const [prices, setPrices]               = useState({})
  const [transactions, setTransactions]   = useState([])
  const [wallets, setWallets]             = useState([])
  const [coinTargets, setCoinTargets]     = useState({})
  const [loaded, setLoaded]               = useState(false)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [activeTab, setActiveTab]         = useState(location.state?.tab || 'overview')
  const [showAllHoldings, setShowAllHoldings] = useState(false)
  const [sheetOpen, setSheetOpen]         = useState(false)
  const [sheetType, setSheetType]         = useState('buy')
  const openSheet = useCallback((t) => { setSheetType(t); setSheetOpen(true) }, [])
  const [shareOpen, setShareOpen]         = useState(false)
  const tickerStart = useRef(null)
  const [tickerValue, setTickerValue] = useState(0)

  useEffect(() => {
    if (location.state?.tab) setActiveTab(location.state.tab)
  }, [location.state?.tab])

  async function loadAll() {
    const [p, txs, ws, ct] = await Promise.all([
      api.getPortfolio(), api.getTransactions(), api.getWallets(), api.getCoinTargets(),
    ])
    setPortfolio(p); setTransactions(txs); setWallets(ws); setCoinTargets(ct || {})
    if (p.length) {
      setPricesLoading(true)
      try {
        const px = await api.getPrices(p.map(h => h.coin_id).join(','))
        setPrices(px || {})
      } catch {}
      setPricesLoading(false)
    }
    setLoaded(true)
  }

  useEffect(() => { loadAll(); const t = setInterval(loadAll, 60_000); return () => clearInterval(t) }, [])

  const { enriched, totalValue, totalInvested, totalPnL, totalPnLPct, isDemo, pricesFailed } = useMemo(() => {
    const raw = portfolio.map(h => {
      const price   = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value   = h.amount * price
      const pnl     = value - h.total_invested
      const pnlPct  = h.total_invested > 0 ? (pnl / h.total_invested) * 100 : 0
      return { ...h, price, value, pnl, pnlPct }
    }).sort((a, b) => (b.value || b.total_invested) - (a.value || a.total_invested))

    const hasPortfolio = raw.length > 0
    const hasPrices    = raw.some(h => h.value > 0)

    if (!hasPortfolio && loaded) {
      const demoEnriched = DEMO.holdings.map(h => ({
        ...h, pnl: h.value - h.total_invested,
        pnlPct: ((h.value - h.total_invested) / h.total_invested) * 100,
      }))
      return { enriched: demoEnriched, totalValue: DEMO.totalValue, totalInvested: DEMO.totalInvested,
        totalPnL: DEMO.totalPnL, totalPnLPct: DEMO.totalPnLPct, isDemo: true, pricesFailed: false }
    }

    const tv  = hasPrices ? raw.reduce((s, h) => s + h.value, 0) : raw.reduce((s, h) => s + h.total_invested, 0)
    const ti  = raw.reduce((s, h) => s + h.total_invested, 0)
    const pnl = hasPrices ? tv - ti : 0
    return {
      enriched: raw, totalValue: tv, totalInvested: ti,
      totalPnL: pnl, totalPnLPct: hasPrices && ti > 0 ? (pnl / ti) * 100 : 0,
      isDemo: false, pricesFailed: hasPortfolio && !hasPrices && loaded && !pricesLoading,
    }
  }, [portfolio, prices, loaded, pricesLoading])

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

  const perfSeries = useMemo(() => buildPerfSeries(totalValue), [totalValue])

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

  const recentTxs       = useMemo(() => (transactions.length ? transactions : DEMO.transactions).slice(0, 8), [transactions])
  const displayHoldings = showAllHoldings ? enriched : enriched.slice(0, 6)

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
    { id: 'overview', label: 'Overview', icon: Ico.overview },
    { id: 'ai',       label: 'AI',       icon: Ico.ai },
    { id: 'buy',      label: 'Buy',      icon: Ico.buy,    sheet: 'buy' },
    { id: 'sell',     label: 'Sell',     icon: Ico.sell,   sheet: 'sell' },
    { id: 'targets',  label: 'Targets',  icon: Ico.target },
    { id: 'wallets',  label: 'Wallets',  icon: Ico.wallet },
    { id: 'data',     label: 'Backup',   icon: Ico.data },
  ]

  const tooltipStyle = {
    background: 'rgba(6,14,10,0.97)', border: '1px solid rgba(52,211,153,0.4)',
    borderRadius: 10, fontSize: '0.76rem', color: '#fff',
  }

  return (
    <div className="dvx">
      {/* Tab nav */}
      <div className="dvx-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`dvx-tab ${!t.sheet && activeTab === t.id ? 'dvx-tab-active' : ''}`}
            onClick={() => t.sheet ? openSheet(t.sheet) : setActiveTab(t.id)}>
            <span className="dvx-tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {activeTab === 'overview' && (
        <>
          {/* Hero */}
          <div className="dvx-hero glass-card lens-pulse">
            <p className="dvx-hero-label">
              {pricesFailed ? 'INVESTED VALUE' : pricesLoading ? 'LOADING PRICES…' : 'TOTAL PORTFOLIO VALUE'}
              {isDemo && <span className="dvx-badge-demo">DEMO</span>}
              {pricesFailed && <span className="dvx-badge-warn">PRICES OFFLINE</span>}
              {pricesLoading && <span className="dvx-badge-info">LIVE</span>}
            </p>
            <h2 className="dvx-hero-value">${fmt(loaded ? tickerValue : 0)}</h2>
            {!pricesFailed && totalPnL !== 0 && (
              <p className={`dvx-hero-change ${totalPnL >= 0 ? 'up' : 'dn'}`}>
                {totalPnL >= 0 ? '↑' : '↓'} ${fmt(Math.abs(totalPnL))} ({pct(totalPnLPct)}) all time
              </p>
            )}
            {!isDemo && totalValue > 0 && (
              <button className="dvx-share-btn" onClick={() => setShareOpen(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share Gains
              </button>
            )}
            {isDemo && (
              <div className="dvx-hero-actions">
                <button className="dvx-hero-cta" onClick={() => setActiveTab('wallets')}>Create Wallet</button>
                <button className="dvx-hero-cta dvx-hero-cta-buy" onClick={() => openSheet('buy')}>Add Trade</button>
              </div>
            )}
          </div>

          {/* Stats row */}
          {!isDemo && (
            <div className="dvx-stats-row">
              <StatCard label="Invested"  value={`$${fmt(totalInvested)}`} />
              <StatCard label="P&L"       value={`${totalPnL >= 0 ? '+' : ''}$${fmt(Math.abs(totalPnL))}`}
                color={totalPnL >= 0 ? '#34d399' : '#f87171'}
                sub={totalPnLPct !== 0 ? pct(totalPnLPct) : undefined} />
              <StatCard label="Assets"    value={enriched.length} />
              <StatCard label="Trades"    value={transactions.length} />
            </div>
          )}

          {/* Quick actions */}
          <div className="dvx-quick-grid">
            <button className="dvx-quick-card dvx-quick-buy holo-card-v2" onClick={() => openSheet('buy')}>
              <span className="dvx-quick-icon">{Ico.buy}</span>
              <strong>Buy</strong>
              <span>Record a purchase</span>
            </button>
            <button className="dvx-quick-card dvx-quick-sell holo-card-v2" onClick={() => openSheet('sell')}>
              <span className="dvx-quick-icon">{Ico.sell}</span>
              <strong>Sell</strong>
              <span>Record a sale</span>
            </button>
            <button className="dvx-quick-card holo-card-v2" onClick={() => setActiveTab('wallets')}>
              <span className="dvx-quick-icon">{Ico.wallet}</span>
              <strong>Wallets</strong>
              <span>{wallets.length} wallet{wallets.length !== 1 ? 's' : ''}</span>
            </button>
            <button className="dvx-quick-card holo-card-v2" onClick={() => navigate('/transactions')}>
              <span className="dvx-quick-icon">{Ico.history}</span>
              <strong>History</strong>
              <span>{transactions.length} trades</span>
            </button>
          </div>

          {/* Main grid */}
          <div className="dvx-grid">
            {/* Left column */}
            <div className="dvx-col-main">
              {/* Performance chart */}
              <div className="glass-card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                  <h3 style={{ margin:0 }}>30-Day Performance</h3>
                  <span className="muted" style={{ fontSize:'0.72rem' }}>simulated trend</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={perfSeries} margin={{ left:0, right:0, top:4, bottom:0 }}>
                    <defs>
                      <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.45}/>
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${fmt(v)}`, 'Value']}
                      labelFormatter={() => ''} cursor={{ stroke:'rgba(52,211,153,0.25)' }}/>
                    <Area type="monotone" dataKey="v" stroke="#34d399" strokeWidth={2.5} fill="url(#pg)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* P&L bar chart */}
              {pnlData.length > 0 && (
                <div className="glass-card">
                  <h3 style={{ margin:'0 0 0.75rem' }}>Profit / Loss by Asset</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={pnlData} margin={{ left:0, right:0, top:4, bottom:0 }}>
                      <CartesianGrid stroke="rgba(52,211,153,0.07)" vertical={false}/>
                      <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.45)', fontSize:11 }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fill:'rgba(255,255,255,0.38)', fontSize:10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => fmtN(v)} width={50}/>
                      <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${fmt(v)}`, 'P&L']}/>
                      <Bar dataKey="pnl" radius={[6,6,0,0]}>
                        {pnlData.map((d, i) => (
                          <Cell key={i} fill={d.pnl >= 0 ? '#34d399' : '#f87171'} fillOpacity={0.85}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Targets near strike — compact overview widget */}
              {targetsAnalysis.rows.length > 0 && (
                <div className="glass-card">
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                    <h3 style={{ margin:0 }}>Sell Targets</h3>
                    <button className="dvx-show-more" style={{ width:'auto', margin:0, padding:'0.3rem 0.75rem', fontSize:'0.72rem' }}
                      onClick={() => setActiveTab('targets')}>
                      View all →
                    </button>
                  </div>
                  <div className="dvx-targets-mini">
                    {targetsAnalysis.rows.flatMap(r => r.targets).slice(0, 5).map(t => (
                      <div key={t.id} className={`dvx-target-mini-row ${t.reached ? 'dvx-target-reached' : ''}`}>
                        <span className="dvx-target-mini-sym">{t.coinSymbol?.toUpperCase()}</span>
                        <span className="dvx-target-mini-price">${fmt(t.price)}</span>
                        <div className="dvx-target-bar-bg" style={{ flex:1, margin:'0 0.5rem' }}>
                          <div className="dvx-target-bar-fill" style={{ width:`${t.progress}%`, background: t.reached ? '#34d399' : 'linear-gradient(90deg,#3b82f6,#34d399)' }}/>
                        </div>
                        <span style={{ fontSize:'0.7rem', color: t.reached ? '#34d399' : 'rgba(255,255,255,0.45)', minWidth:'2.5rem', textAlign:'right' }}>
                          {t.reached ? '✓' : `${t.progress.toFixed(0)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent transactions */}
              <div className="glass-card">
                <h3>Recent Transactions</h3>
                {recentTxs.length === 0
                  ? <p className="muted">No transactions yet.</p>
                  : <ul className="dvx-tx-list">
                    {recentTxs.map(t => {
                      const isBuy = t.type === 'buy' || t.type === 'deposit'
                      return (
                        <li key={t.id} className="dvx-tx-item holo-card-v2">
                          <span className="dvx-tx-icon" style={{ color: isBuy ? '#34d399' : '#f87171' }}>
                            {isBuy ? Ico.buy : Ico.sell}
                          </span>
                          <div className="dvx-tx-meta">
                            <strong>{isBuy ? 'Bought' : 'Sold'} {t.coin_symbol?.toUpperCase()}</strong>
                            <span className="muted">{t.amount} @ ${fmt(t.price_per_unit || 0)}</span>
                          </div>
                          <span className="dvx-tx-amt">${fmt((t.amount || 0) * (t.price_per_unit || 0))}</span>
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
                <h3>{pricesFailed ? 'Allocation (invested)' : 'Allocation'}</h3>
                {allocData.length === 0
                  ? <p className="muted">No holdings.</p>
                  : <>
                    <ResponsiveContainer width="100%" height={190}>
                      <PieChart>
                        <Pie data={allocData} dataKey="value" cx="50%" cy="50%"
                          innerRadius="60%" outerRadius="88%" stroke="none" paddingAngle={2}>
                          {allocData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]}/>)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`$${fmt(v)}`, n]}/>
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

              {/* All holdings */}
              <div className="glass-card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                  <h3 style={{ margin:0 }}>Holdings ({enriched.length})</h3>
                  {pricesFailed && <span className="dvx-badge-warn" style={{ fontSize:'0.6rem' }}>INVESTED</span>}
                </div>
                {enriched.length === 0
                  ? <p className="muted">Nothing yet.</p>
                  : <>
                    <ul className="dvx-holdings">
                      {displayHoldings.map((h, i) => {
                        const displayValue = h.value > 0 ? h.value : h.total_invested
                        const hasPnl = h.pnl !== 0 && !pricesFailed
                        return (
                          <li key={h.coin_id} className="dvx-holding holo-card-v2"
                            onClick={() => !isDemo && navigate(`/asset/${encodeURIComponent(h.coin_id)}`)}>
                            <div className="dvx-holding-icon" style={{ background: PALETTE[i % PALETTE.length] + '22', color: PALETTE[i % PALETTE.length] }}>
                              {h.coin_symbol?.slice(0, 3).toUpperCase()}
                            </div>
                            <div className="dvx-holding-meta">
                              <strong>{h.coin_symbol?.toUpperCase()}</strong>
                              <span className="muted">
                                {h.price > 0 ? `$${fmt(h.price)}` : `inv $${fmt(h.total_invested)}`}
                                {' · '}{Number(h.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} units
                              </span>
                            </div>
                            <div style={{ textAlign:'right', flexShrink:0 }}>
                              <div className="dvx-holding-val">${fmt(displayValue)}</div>
                              {hasPnl && (
                                <div style={{ fontSize:'0.68rem', color: h.pnl >= 0 ? '#34d399' : '#f87171', marginTop:'0.1rem' }}>
                                  {h.pnl >= 0 ? '+' : ''}${fmt(h.pnl)} ({pct(h.pnlPct)})
                                </div>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                    {enriched.length > 6 && (
                      <button className="dvx-show-more" onClick={() => setShowAllHoldings(v => !v)}>
                        {showAllHoldings ? '▲ Show less' : `▼ Show all ${enriched.length} assets`}
                      </button>
                    )}
                  </>
                }
              </div>
            </div>
          </div>
        </>
      )}


      {/* ══ SELL TARGETS ══ */}
      {activeTab === 'targets' && (
        <div className="dvx-targets-page">
          {/* Summary cards */}
          <div className="dvx-stats-row">
            <StatCard label="Total Targets"    value={targetsAnalysis.totalTargets} />
            <StatCard label="Targets Reached"  value={targetsAnalysis.totalReached}
              color={targetsAnalysis.totalReached > 0 ? '#34d399' : undefined} />
            <StatCard label="Potential Proceeds"
              value={`$${targetsAnalysis.totalPotentialProceeds >= 1000
                ? (targetsAnalysis.totalPotentialProceeds/1000).toFixed(1)+'k'
                : fmt(targetsAnalysis.totalPotentialProceeds)}`}
              color="#34d399" />
            <StatCard label="Assets Planned"   value={targetsAnalysis.rows.length} />
          </div>

          {/* Proceeds bar chart */}
          {targetsAnalysis.chartData.length > 0 && (
            <div className="glass-card">
              <h3 style={{ margin:'0 0 0.75rem' }}>Projected Proceeds by Target</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={targetsAnalysis.chartData} margin={{ left:0, right:0, top:4, bottom:24 }}>
                  <CartesianGrid stroke="rgba(52,211,153,0.07)" vertical={false}/>
                  <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.4)', fontSize:10 }}
                    axisLine={false} tickLine={false} angle={-30} textAnchor="end"/>
                  <YAxis tick={{ fill:'rgba(255,255,255,0.38)', fontSize:10 }} axisLine={false}
                    tickLine={false} tickFormatter={v => `$${v>=1000?(v/1000).toFixed(0)+'k':v}`} width={50}/>
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${fmt(v)}`, 'Proceeds']}/>
                  <Bar dataKey="proceeds" radius={[6,6,0,0]}>
                    {targetsAnalysis.chartData.map((d, i) => (
                      <Cell key={i} fill={d.reached ? '#34d399' : '#3b82f6'} fillOpacity={d.reached ? 1 : 0.7}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display:'flex', gap:'1rem', fontSize:'0.72rem', color:'rgba(255,255,255,0.45)', marginTop:'0.5rem' }}>
                <span><span style={{ color:'#34d399' }}>■</span> Reached</span>
                <span><span style={{ color:'#3b82f6' }}>■</span> Pending</span>
              </div>
            </div>
          )}

          {/* Per-asset target rows */}
          {targetsAnalysis.rows.length === 0 ? (
            <div className="glass-card" style={{ textAlign:'center', padding:'2.5rem 1.5rem' }}>
              <div style={{ fontSize:'2rem', marginBottom:'0.75rem', opacity:0.4 }}>{Ico.target}</div>
              <p style={{ color:'rgba(255,255,255,0.5)', marginBottom:'1rem' }}>
                No sell targets set yet. Add price targets on any asset to plan your exits.
              </p>
              <button className="dvx-btn dvx-btn-primary" onClick={() => navigate('/market')}>
                Browse Assets
              </button>
            </div>
          ) : (
            targetsAnalysis.rows.map(r => (
              <div key={r.coinId} className="glass-card dvx-target-card">
                <div className="dvx-target-header">
                  <div className="dvx-target-coin">
                    <div className="dvx-holding-icon" style={{ background:'rgba(52,211,153,0.12)', color:'#34d399', width:36, height:36, fontSize:'0.7rem' }}>
                      {r.coinSymbol?.slice(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <strong style={{ color:'#fff' }}>{r.coinSymbol?.toUpperCase()}</strong>
                      <div className="muted" style={{ fontSize:'0.72rem' }}>
                        Current: {r.currentPrice > 0 ? `$${fmt(r.currentPrice)}` : '—'} · Holding: {Number(r.amount).toLocaleString(undefined, { maximumFractionDigits:6 })}
                      </div>
                    </div>
                  </div>
                  <button className="dvx-btn dvx-btn-primary"
                    style={{ padding:'0.35rem 0.8rem', fontSize:'0.75rem', borderRadius:8 }}
                    onClick={() => navigate(`/asset/${encodeURIComponent(r.coinId)}`)}>
                    Manage
                  </button>
                </div>

                {r.targets.map((t, ti) => (
                  <div key={t.id} className={`dvx-target-row ${t.reached ? 'dvx-target-reached' : ''}`}>
                    <div className="dvx-target-row-top">
                      <div className="dvx-target-cell">
                        <span className="dvx-target-lbl">Target Price</span>
                        <span className="dvx-target-val">${fmt(t.price)}</span>
                      </div>
                      <div className="dvx-target-cell">
                        <span className="dvx-target-lbl">Qty to Sell</span>
                        <span className="dvx-target-val">
                          {t.quantity == null ? `All (${r.amount.toFixed(4)})` : t.sellQty.toFixed(4)}
                        </span>
                      </div>
                      <div className="dvx-target-cell">
                        <span className="dvx-target-lbl">Proceeds</span>
                        <span className="dvx-target-val" style={{ color:'#34d399' }}>${fmt(t.proceeds)}</span>
                      </div>
                      <div className="dvx-target-cell">
                        <span className="dvx-target-lbl">Distance</span>
                        <span className="dvx-target-val" style={{ color: t.reached ? '#34d399' : t.gainVsNow > 0 ? '#fff' : '#f87171' }}>
                          {t.reached ? '✓ Reached' : `${t.gainVsNow >= 0 ? '+' : ''}${t.gainVsNow.toFixed(1)}%`}
                        </span>
                      </div>
                    </div>
                    <div className="dvx-target-bar-wrap">
                      <div className="dvx-target-bar-bg">
                        <div className="dvx-target-bar-fill"
                          style={{ width:`${t.progress}%`, background: t.reached ? '#34d399' : 'linear-gradient(90deg,#3b82f6,#34d399)' }}/>
                      </div>
                      <span className="dvx-target-bar-pct">{t.progress.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* ══ AI ANALYSIS ══ */}
      {activeTab === 'ai' && (
        <AIPanel
          enriched={enriched}
          prices={prices}
          transactions={transactions}
          totalValue={totalValue}
          isDemo={isDemo}
        />
      )}

      {/* ══ WALLETS ══ */}
      {activeTab === 'wallets' && (
        <div className="dvx-form-page">
          <div className="glass-card dvx-form-card">
            <h3>Wallets ({wallets.length})</h3>
            <WalletPanel wallets={wallets} onRefresh={loadAll} />
          </div>
          <button className="dvx-back" onClick={() => setActiveTab('overview')}>← Back</button>
        </div>
      )}

      {/* ══ DATA / BACKUP ══ */}
      {activeTab === 'data' && (
        <div className="dvx-form-page">
          <div className="glass-card dvx-form-card">
            <h3>Backup & Restore</h3>
            <DataPanel onRefresh={loadAll} />
          </div>
          <button className="dvx-back" onClick={() => setActiveTab('overview')}>← Back</button>
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
