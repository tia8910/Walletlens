import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ASSET_CATEGORIES } from '../api'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

const COLORS = ['#6366f1', '#8b5cf6', '#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#fb923c', '#e879f9', '#a78bfa', '#06b6d4']

function fmt(n) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Portfolio AI Analysis Engine ───
function generatePortfolioAnalysis(enriched, totalValue, totalInvested, coinTargets) {
  if (enriched.length === 0) return null

  const totalPnL = totalValue - totalInvested
  const pnlPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  // Diversification score (Herfindahl-Hirschman Index based)
  const allocations = enriched.map(h => h.allocation / 100)
  const hhi = allocations.reduce((sum, a) => sum + a * a, 0)
  const maxHhi = 1 // all in one coin
  const minHhi = 1 / enriched.length // perfectly equal
  const diversificationScore = enriched.length === 1 ? 10 :
    Math.round(((maxHhi - hhi) / (maxHhi - minHhi)) * 100)

  // Risk assessment
  const avgVolatility = enriched.reduce((sum, h) => sum + Math.abs(h.change24h), 0) / enriched.length
  const maxDrop = Math.min(...enriched.map(h => h.change24h))
  const topHeavy = enriched[0]?.allocation > 60

  let riskLevel, riskColor, riskIcon
  if (avgVolatility > 8 || topHeavy) {
    riskLevel = 'High Risk'; riskColor = '#ef4444'; riskIcon = '🔴'
  } else if (avgVolatility > 4 || diversificationScore < 40) {
    riskLevel = 'Medium Risk'; riskColor = '#f59e0b'; riskIcon = '🟡'
  } else {
    riskLevel = 'Low Risk'; riskColor = '#10b981'; riskIcon = '🟢'
  }

  // Market momentum (weighted by allocation)
  const weightedChange24h = enriched.reduce((sum, h) => sum + (h.change24h * h.allocation / 100), 0)
  let momentumLabel, momentumColor
  if (weightedChange24h > 3) { momentumLabel = 'Strong Up'; momentumColor = '#10b981' }
  else if (weightedChange24h > 0.5) { momentumLabel = 'Uptrend'; momentumColor = '#34d399' }
  else if (weightedChange24h > -0.5) { momentumLabel = 'Sideways'; momentumColor = '#f59e0b' }
  else if (weightedChange24h > -3) { momentumLabel = 'Downtrend'; momentumColor = '#f97316' }
  else { momentumLabel = 'Strong Down'; momentumColor = '#ef4444' }

  // Portfolio health score
  let healthScore = 50
  if (pnlPct > 20) healthScore += 15; else if (pnlPct > 5) healthScore += 8; else if (pnlPct < -20) healthScore -= 15; else if (pnlPct < -5) healthScore -= 8
  healthScore += Math.round(diversificationScore * 0.2)
  if (weightedChange24h > 2) healthScore += 8; else if (weightedChange24h < -2) healthScore -= 8
  const profitableCoins = enriched.filter(h => h.pnl > 0).length
  healthScore += Math.round((profitableCoins / enriched.length) * 15)
  healthScore = Math.max(0, Math.min(100, healthScore))

  let healthLabel, healthColor
  if (healthScore >= 75) { healthLabel = 'Excellent'; healthColor = '#10b981' }
  else if (healthScore >= 55) { healthLabel = 'Good'; healthColor = '#34d399' }
  else if (healthScore >= 40) { healthLabel = 'Fair'; healthColor = '#f59e0b' }
  else { healthLabel = 'Needs Attention'; healthColor = '#ef4444' }

  // Generate insights
  const insights = []

  // Diversification insights
  if (enriched.length === 1) {
    insights.push({ icon: '⚠️', text: 'Single asset portfolio — consider diversifying to reduce risk', type: 'warning' })
  } else if (topHeavy) {
    insights.push({ icon: '📊', text: `${enriched[0].coin_symbol.toUpperCase()} is ${enriched[0].allocation.toFixed(0)}% of portfolio — heavy concentration`, type: 'warning' })
  } else if (diversificationScore > 70) {
    insights.push({ icon: '✅', text: 'Well diversified portfolio across multiple assets', type: 'positive' })
  }

  // P&L insights
  if (pnlPct > 30) {
    insights.push({ icon: '🎉', text: `Portfolio up ${pnlPct.toFixed(1)}% — consider taking partial profits`, type: 'positive' })
  } else if (pnlPct < -20) {
    insights.push({ icon: '💡', text: `Portfolio down ${Math.abs(pnlPct).toFixed(1)}% — could be a DCA opportunity`, type: 'info' })
  }

  // Momentum insights
  const bigWinners = enriched.filter(h => h.change24h > 5)
  const bigLosers = enriched.filter(h => h.change24h < -5)
  if (bigWinners.length > 0) {
    const names = bigWinners.map(h => h.coin_symbol.toUpperCase()).join(', ')
    insights.push({ icon: '🚀', text: `${names} surging today — strong momentum`, type: 'positive' })
  }
  if (bigLosers.length > 0) {
    const names = bigLosers.map(h => h.coin_symbol.toUpperCase()).join(', ')
    insights.push({ icon: '📉', text: `${names} dropping today — watch for support levels`, type: 'warning' })
  }

  // Target insights
  const targetsSet = enriched.filter(h => h.targetPrice)
  const nearTarget = targetsSet.filter(h => h.targetPricePct >= 80 && h.targetPricePct < 100)
  const hitTarget = targetsSet.filter(h => h.targetPricePct >= 100)
  if (hitTarget.length > 0) {
    insights.push({ icon: '🎯', text: `${hitTarget.map(h => h.coin_symbol.toUpperCase()).join(', ')} hit price target! Consider exit strategy`, type: 'positive' })
  } else if (nearTarget.length > 0) {
    insights.push({ icon: '🔔', text: `${nearTarget.map(h => h.coin_symbol.toUpperCase()).join(', ')} approaching price target (80%+)`, type: 'info' })
  }

  // Unrealized gains insight
  const unrealizedGains = enriched.filter(h => h.pnlPct > 50)
  if (unrealizedGains.length > 0) {
    const names = unrealizedGains.map(h => `${h.coin_symbol.toUpperCase()} (+${h.pnlPct.toFixed(0)}%)`).join(', ')
    insights.push({ icon: '💰', text: `Strong unrealized gains: ${names}`, type: 'positive' })
  }

  return {
    diversificationScore, riskLevel, riskColor, riskIcon,
    momentumLabel, momentumColor, weightedChange24h,
    healthScore, healthLabel, healthColor,
    insights: insights.slice(0, 4),
    profitableCoins, totalCoins: enriched.length,
    avgVolatility,
  }
}

// ─── Price Alarm System ───
function getAlarmState() {
  try {
    return JSON.parse(localStorage.getItem('crypto_tracker_alarm_state') || '{}')
  } catch { return {} }
}

function setAlarmDismissed(coinId) {
  const state = getAlarmState()
  state[coinId] = { dismissed: true, time: Date.now() }
  localStorage.setItem('crypto_tracker_alarm_state', JSON.stringify(state))
}

function clearAlarmDismissed(coinId) {
  const state = getAlarmState()
  delete state[coinId]
  localStorage.setItem('crypto_tracker_alarm_state', JSON.stringify(state))
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

function sendBrowserNotification(title, body, icon) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon, badge: icon })
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [wallets, setWallets] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [prices, setPrices] = useState({})
  const [coinImages, setCoinImages] = useState({})
  const [newWallet, setNewWallet] = useState('')
  const [loading, setLoading] = useState(true)
  const [showWallets, setShowWallets] = useState(false)
  const [coinTargets, setCoinTargets] = useState({})
  const [editingTarget, setEditingTarget] = useState(null)
  const [targetInput, setTargetInput] = useState('')
  const [targetQtyInput, setTargetQtyInput] = useState('')
  const [expandedPlans, setExpandedPlans] = useState({})
  const [alarms, setAlarms] = useState([])
  const [showAnalysis, setShowAnalysis] = useState(true)
  const [showDataPanel, setShowDataPanel] = useState(false)
  const [importStatus, setImportStatus] = useState(null)
  const [exportCode, setExportCode] = useState('')
  const [importCode, setImportCode] = useState('')
  const [importPreview, setImportPreview] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [editingPrice, setEditingPrice] = useState(null)
  const [priceInput, setPriceInput] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  useEffect(() => {
    requestNotificationPermission()
    loadData()
    const interval = setInterval(refreshPrices, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Check for price target alarms
  const checkAlarms = useCallback((portfolioData, priceData, targets) => {
    const alarmState = getAlarmState()
    const newAlarms = []

    for (const h of portfolioData) {
      const plan = targets[h.coin_id]
      const price = priceData[h.coin_id]?.usd
      if (!plan?.targets?.length || !price) continue

      // Find the most relevant target: lowest-price unhit target, or highest-price hit target
      const unhit = plan.targets.filter(t => price < t.price).sort((a, b) => a.price - b.price)
      const hit = plan.targets.filter(t => price >= t.price).sort((a, b) => b.price - a.price)
      const t = hit[0] || unhit[0]
      if (!t) continue
      const targetPrice = t.price
      const pct = (price / targetPrice) * 100

      if (alarmState[h.coin_id]?.dismissed && pct >= 95) continue
      if (alarmState[h.coin_id]?.dismissed && pct < 95) clearAlarmDismissed(h.coin_id)

      if (pct >= 100) {
        newAlarms.push({
          coinId: h.coin_id, symbol: h.coin_symbol.toUpperCase(), image: h.coin_image,
          price, targetPrice, pct, type: 'hit',
        })
      } else if (pct >= 90) {
        newAlarms.push({
          coinId: h.coin_id, symbol: h.coin_symbol.toUpperCase(), image: h.coin_image,
          price, targetPrice, pct, type: 'near',
        })
      }
    }

    // Send browser notifications for new "hit" alarms
    for (const alarm of newAlarms) {
      if (alarm.type === 'hit' && !alarmState[alarm.coinId]?.notified) {
        sendBrowserNotification(
          `🎯 ${alarm.symbol} Target Hit!`,
          `${alarm.symbol} reached $${fmt(alarm.price)} (target: $${fmt(alarm.targetPrice)})`,
          coinImages[alarm.coinId] || ''
        )
        const state = getAlarmState()
        state[alarm.coinId] = { ...state[alarm.coinId], notified: true, time: Date.now() }
        localStorage.setItem('crypto_tracker_alarm_state', JSON.stringify(state))
      }
    }

    setAlarms(newAlarms)
  }, [coinImages])

  function handleExport() {
    const code = api.exportCode()
    if (code) {
      setExportCode(code)
      setImportCode('')
      setImportPreview(null)
    }
  }

  async function copyToClipboard(text) {
    if (!text) return false
    // Modern Clipboard API
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch (e) { /* fall through */ }
    // Legacy fallback for older browsers / non-secure contexts
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      ta.setAttribute('readonly', '')
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch (e) {
      return false
    }
  }

  async function handleCopyExport() {
    const ok = await copyToClipboard(exportCode)
    setCopyStatus(ok ? 'copied' : 'failed')
    setTimeout(() => setCopyStatus(''), 2000)
  }

  function handlePreviewImport() {
    if (!importCode.trim()) {
      setImportStatus('error')
      setTimeout(() => setImportStatus(null), 2500)
      return
    }
    const result = api.previewImportCode(importCode.trim())
    if (result.success) {
      setImportPreview(result.summary)
      setImportStatus(null)
    } else {
      setImportPreview(null)
      setImportStatus('error')
      setTimeout(() => setImportStatus(null), 3000)
    }
  }

  function handleConfirmImport() {
    const result = api.importCode(importCode.trim())
    if (result.success) {
      setImportStatus('success')
      setTimeout(() => window.location.reload(), 400)
    } else {
      setImportPreview(null)
      setImportStatus('error')
      setTimeout(() => setImportStatus(null), 3000)
    }
  }

  function handleCancelImport() {
    setImportPreview(null)
  }

  async function handleUpdateManualPrice(coinId) {
    const val = parseFloat(priceInput)
    if (!val || val <= 0) return
    api.setManualPrice(coinId, val)
    setEditingPrice(null)
    setPriceInput('')
    loadData()
  }

  async function loadData() {
    setLoading(true)
    try {
      await api.ensureWallet()
      const [w, p, ct] = await Promise.all([api.getWallets(), api.getPortfolio(), api.getCoinTargets()])
      setWallets(w)
      setPortfolio(p)
      setCoinTargets(ct)
      if (p.length > 0) {
        const ids = p.map(h => h.coin_id).join(',')
        const [pr, imgs] = await Promise.all([api.getPrices(ids), api.getCoinImages(ids)])
        setPrices(pr)
        setCoinImages(imgs)
        checkAlarms(p, pr, ct)
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  async function refreshPrices() {
    if (portfolio.length === 0) return
    const ids = portfolio.map(h => h.coin_id).join(',')
    const pr = await api.getPrices(ids)
    setPrices(pr)
    checkAlarms(portfolio, pr, coinTargets)
  }

  async function handleCreateWallet(e) {
    e.preventDefault()
    if (!newWallet.trim()) return
    await api.createWallet({ name: newWallet.trim() })
    setNewWallet('')
    loadData()
  }

  async function handleDeleteWallet(id) {
    await api.deleteWallet(id)
    loadData()
  }

  async function handleAddCoinTarget(coinId, availableQty) {
    const price = parseFloat(targetInput)
    if (!price || price <= 0) return
    let quantity = null
    if (targetQtyInput && targetQtyInput.trim() !== '') {
      const q = parseFloat(targetQtyInput)
      if (!q || q <= 0) return
      quantity = q
    }
    await api.addCoinTarget(coinId, { price, quantity })
    clearAlarmDismissed(coinId)
    setEditingTarget(null)
    setTargetInput('')
    setTargetQtyInput('')
    setExpandedPlans(prev => ({ ...prev, [coinId]: true }))
    loadData()
  }

  async function handleRemoveTargetItem(coinId, targetId) {
    await api.removeCoinTargetItem(coinId, targetId)
    clearAlarmDismissed(coinId)
    loadData()
  }

  async function handleRemoveCoinTarget(coinId) {
    await api.removeCoinTarget(coinId)
    clearAlarmDismissed(coinId)
    loadData()
  }

  function dismissAlarm(coinId) {
    setAlarmDismissed(coinId)
    setAlarms(prev => prev.filter(a => a.coinId !== coinId))
  }

  const totalValue = portfolio.reduce((sum, h) => sum + h.amount * (prices[h.coin_id]?.usd || 0), 0)
  const totalInvested = portfolio.reduce((sum, h) => sum + h.total_invested, 0)
  const totalPnL = totalValue - totalInvested
  const pnlPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  const enriched = portfolio.map(h => {
    const price = prices[h.coin_id]?.usd || 0
    const change24h = prices[h.coin_id]?.usd_24h_change || 0
    const amount = h.amount || 0
    const invested = h.total_invested || 0
    const value = amount * price
    const pnl = value - invested
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0
    const allocation = totalValue > 0 ? (value / totalValue) * 100 : 0
    const avgBuy = amount > 0 ? invested / amount : 0
    const image = coinImages[h.coin_id] || h.coin_image || ''
    const symbol = h.coin_symbol || h.coin_id || '??'

    // Multi-target sell plan
    const plan = coinTargets[h.coin_id]
    const rawTargets = plan?.targets || []
    // Sort by price ascending, then enrich each target
    const sortedTargets = [...rawTargets].sort((a, b) => a.price - b.price)
    const totalAllocatedExplicit = sortedTargets.reduce((s, t) => s + (t.quantity ?? 0), 0)
    const hasSellAllTarget = sortedTargets.some(t => t.quantity === null || t.quantity === undefined)
    const remainingQty = hasSellAllTarget ? 0 : Math.max(0, amount - totalAllocatedExplicit)
    const overAllocated = !hasSellAllTarget && totalAllocatedExplicit > amount

    const enrichedTargets = sortedTargets.map(t => {
      const qty = t.quantity ?? amount
      const proceeds = qty * t.price
      const progressPct = price > 0 ? Math.min((price / t.price) * 100, 100) : 0
      const hit = price >= t.price
      return { ...t, qty, proceeds, progressPct, hit, sellAll: t.quantity === null || t.quantity === undefined }
    })

    const planTotalProceeds = enrichedTargets.reduce((s, t) => s + t.proceeds, 0) + (remainingQty * price)
    const planInvestedCovered = amount > 0 ? (invested * enrichedTargets.reduce((s, t) => s + t.qty, 0)) / amount : 0

    // For analysis / alarms: use next unhit target (or highest hit)
    const nextUnhit = enrichedTargets.find(t => !t.hit)
    const lastHit = [...enrichedTargets].reverse().find(t => t.hit)
    const primary = lastHit || nextUnhit || null
    const targetPrice = primary ? primary.price : null
    const targetValue = primary ? amount * primary.price : null
    const targetPricePct = primary && price > 0 ? Math.min((price / primary.price) * 100, 100) : null

    return {
      ...h, coin_symbol: symbol, amount, total_invested: invested,
      price, change24h, value, pnl, pnlPct, allocation, avgBuy, image,
      plan: enrichedTargets, planRemainingQty: remainingQty, planOverAllocated: overAllocated,
      planTotalProceeds, planInvestedCovered,
      targetPrice, targetValue, targetPricePct,
    }
  }).sort((a, b) => b.value - a.value)

  const totalProjectedValue = enriched_raw => enriched_raw.reduce((sum, h) => {
    if (h.plan && h.plan.length > 0) return sum + h.planTotalProceeds
    return sum + h.value
  }, 0)

  const projectedTotal = totalProjectedValue(enriched)
  const hasAnyTarget = Object.keys(coinTargets).length > 0

  // Group holdings by category for the dashboard split
  const enrichedByCategory = {}
  for (const h of enriched) {
    const cat = h.category || 'crypto'
    if (!enrichedByCategory[cat]) {
      enrichedByCategory[cat] = { items: [], total: 0, invested: 0 }
    }
    enrichedByCategory[cat].items.push(h)
    enrichedByCategory[cat].total += h.value
    enrichedByCategory[cat].invested += h.total_invested
  }
  const categoryList = Object.entries(enrichedByCategory).map(([key, v]) => {
    const meta = ASSET_CATEGORIES[key] || { key, label: key, icon: '◈', color: '#a78bfa' }
    return {
      key, label: meta.label, icon: meta.icon, color: meta.color,
      items: v.items, total: v.total, invested: v.invested,
      pct: totalValue > 0 ? (v.total / totalValue) * 100 : 0,
      pnl: v.total - v.invested,
      pnlPct: v.invested > 0 ? ((v.total - v.invested) / v.invested) * 100 : 0,
    }
  }).sort((a, b) => b.total - a.total)

  const filteredCategories = categoryFilter === 'all'
    ? categoryList
    : categoryList.filter(c => c.key === categoryFilter)

  // Pie chart: category-level allocation
  const chartData = categoryList.filter(c => c.total > 0).map(c => ({
    name: c.label, value: c.total, color: c.color,
  }))

  // Portfolio AI Analysis
  let analysis = null
  try { analysis = generatePortfolioAnalysis(enriched, totalValue, totalInvested, coinTargets) } catch (e) { console.error('Analysis error:', e) }

  return (
    <div className="page">
      {/* ─── Price Target Alarms ─── */}
      {alarms.length > 0 && (
        <div className="alarm-container">
          {alarms.map(alarm => (
            <div key={alarm.coinId} className={`alarm-toast ${alarm.type}`}>
              <div className="alarm-icon-wrap">
                {alarm.type === 'hit' ? (
                  <div className="alarm-ring">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                  </div>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                )}
              </div>
              <div className="alarm-content">
                <div className="alarm-title">
                  {alarm.type === 'hit'
                    ? `🎯 ${alarm.symbol} Target Hit!`
                    : `⚡ ${alarm.symbol} Approaching Target`
                  }
                </div>
                <div className="alarm-detail">
                  Price: ${fmt(alarm.price)} / Target: ${fmt(alarm.targetPrice)} ({alarm.pct.toFixed(1)}%)
                </div>
              </div>
              <button className="alarm-dismiss" onClick={() => dismissAlarm(alarm.coinId)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hero card */}
      <div className="hero-card">
        <div className="hero-label">Total Portfolio Value</div>
        <div className="hero-value">${fmt(totalValue)}</div>
        <div className="hero-row">
          <div className={`hero-pnl ${totalPnL >= 0 ? 'positive' : 'negative'}`}>
            {totalPnL >= 0 ? '+' : ''}{fmt(totalPnL)} ({pnlPercent.toFixed(2)}%)
          </div>
          <div className="hero-invested">Invested: ${fmt(totalInvested)}</div>
        </div>

        {hasAnyTarget && (
          <div className="target-section">
            <div className="target-header">
              <span className="target-label">If targets hit</span>
              <span className="target-pct">${fmt(projectedTotal)}</span>
            </div>
            <div className="target-bar">
              <div className="target-fill" style={{ width: `${Math.min((totalValue / projectedTotal) * 100, 100)}%` }} />
            </div>
            <div className="target-footer">
              <span className="muted">Projected gain: +${fmt(projectedTotal - totalInvested)}</span>
            </div>
          </div>
        )}

        {chartData.length > 0 && (
          <div className="hero-chart">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} strokeWidth={0}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.color || COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              {chartData.map((d, i) => (
                <div key={d.name} className="legend-item">
                  <span className="legend-dot" style={{ background: d.color || COLORS[i % COLORS.length] }} />
                  <span>{d.name}</span>
                  <span className="muted">{totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Portfolio AI Analysis ─── */}
      {analysis && (
        <div className="portfolio-ai">
          <div className="portfolio-ai-header" onClick={() => setShowAnalysis(!showAnalysis)}>
            <div className="portfolio-ai-title">
              <span className="ai-badge">AI</span>
              <span>Portfolio Analysis</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showAnalysis ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          {showAnalysis && (
            <div className="portfolio-ai-body">
              {/* Score cards row */}
              <div className="ai-score-cards">
                <div className="ai-score-card">
                  <div className="ai-score-ring" style={{ '--score': analysis.healthScore, '--color': analysis.healthColor }}>
                    <svg viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke="var(--bg4)" strokeWidth="3" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke={analysis.healthColor} strokeWidth="3"
                        strokeDasharray={`${analysis.healthScore}, 100`}
                        strokeLinecap="round" />
                    </svg>
                    <span className="ai-score-value">{analysis.healthScore}</span>
                  </div>
                  <span className="ai-score-label">Health</span>
                  <span className="ai-score-desc" style={{ color: analysis.healthColor }}>{analysis.healthLabel}</span>
                </div>

                <div className="ai-score-card">
                  <div className="ai-score-ring" style={{ '--score': analysis.diversificationScore, '--color': analysis.diversificationScore > 60 ? '#10b981' : analysis.diversificationScore > 30 ? '#f59e0b' : '#ef4444' }}>
                    <svg viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke="var(--bg4)" strokeWidth="3" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke={analysis.diversificationScore > 60 ? '#10b981' : analysis.diversificationScore > 30 ? '#f59e0b' : '#ef4444'} strokeWidth="3"
                        strokeDasharray={`${analysis.diversificationScore}, 100`}
                        strokeLinecap="round" />
                    </svg>
                    <span className="ai-score-value">{analysis.diversificationScore}</span>
                  </div>
                  <span className="ai-score-label">Diversity</span>
                  <span className="ai-score-desc">{analysis.diversificationScore > 60 ? 'Good' : analysis.diversificationScore > 30 ? 'Fair' : 'Low'}</span>
                </div>

                <div className="ai-score-card">
                  <div className="ai-info-block">
                    <span className="ai-info-icon">{analysis.riskIcon}</span>
                    <span className="ai-info-value" style={{ color: analysis.riskColor }}>{analysis.riskLevel}</span>
                  </div>
                  <span className="ai-score-label">Risk</span>
                  <span className="ai-score-desc muted">{analysis.avgVolatility.toFixed(1)}% avg vol</span>
                </div>

                <div className="ai-score-card">
                  <div className="ai-info-block">
                    <span className="ai-info-value" style={{ color: analysis.momentumColor, fontSize: '1rem' }}>
                      {analysis.weightedChange24h >= 0 ? '↑' : '↓'} {Math.abs(analysis.weightedChange24h).toFixed(2)}%
                    </span>
                  </div>
                  <span className="ai-score-label">Momentum</span>
                  <span className="ai-score-desc" style={{ color: analysis.momentumColor }}>{analysis.momentumLabel}</span>
                </div>
              </div>

              {/* Win/loss ratio */}
              <div className="ai-winloss">
                <div className="ai-winloss-bar">
                  <div className="ai-win-fill" style={{ width: `${(analysis.profitableCoins / analysis.totalCoins) * 100}%` }} />
                </div>
                <div className="ai-winloss-labels">
                  <span className="positive">{analysis.profitableCoins} profitable</span>
                  <span className="negative">{analysis.totalCoins - analysis.profitableCoins} losing</span>
                </div>
              </div>

              {/* AI Insights */}
              {analysis.insights.length > 0 && (
                <div className="ai-insights">
                  {analysis.insights.map((ins, i) => (
                    <div key={i} className={`ai-insight ${ins.type}`}>
                      <span className="ai-insight-icon">{ins.icon}</span>
                      <span>{ins.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="quick-actions">
        <button className="action-btn buy-btn" onClick={() => navigate('/transactions', { state: { openAdd: true, type: 'buy' } })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Buy
        </button>
        <button className="action-btn sell-btn" onClick={() => navigate('/transactions', { state: { openAdd: true, type: 'sell' } })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Sell
        </button>
        <button className="action-btn wallet-btn" onClick={() => setShowWallets(!showWallets)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
          Wallets
        </button>
        <button className="action-btn data-btn" onClick={() => setShowDataPanel(!showDataPanel)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Data
        </button>
      </div>

      {/* Wallet manager */}
      {showWallets && (
        <div className="card">
          <h3>Wallets</h3>
          <form onSubmit={handleCreateWallet} className="inline-form">
            <input type="text" value={newWallet} onChange={e => setNewWallet(e.target.value)} placeholder="New wallet name..." />
            <button type="submit">Add</button>
          </form>
          {wallets.length === 0 ? <p className="muted">Create a wallet to start tracking.</p> : (
            <div className="wallet-list">
              {wallets.map(w => (
                <div key={w.id} className="wallet-item">
                  <span>{w.name}</span>
                  <button className="btn-danger btn-sm" onClick={() => handleDeleteWallet(w.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Data Import/Export */}
      {showDataPanel && (
        <div className="card data-card">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '0.4rem' }}>
              <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            Backup & Restore
          </h3>
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            Copy your backup code to transfer data, or paste a code to restore.
          </p>
          <div className="data-actions">
            <button className="data-export-btn" onClick={handleExport}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Get Backup Code
            </button>
            <button className="data-import-btn" onClick={handlePreviewImport}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Restore from Code
            </button>
          </div>
          {exportCode && (
            <div className="code-block">
              <label className="code-label">Your Backup Code</label>
              <textarea
                className="code-textarea"
                readOnly
                value={exportCode}
                onFocus={e => e.target.select()}
              />
              <div className="code-actions">
                <button type="button" className="copy-btn" onClick={handleCopyExport}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Copy failed' : 'Copy Code'}
                </button>
                <button type="button" className="btn-ghost-dark" onClick={() => setExportCode('')}>Close</button>
              </div>
            </div>
          )}
          <div className="code-block">
            <label className="code-label">Paste Code to Restore</label>
            <textarea className="code-textarea" value={importCode} onChange={e => { setImportCode(e.target.value); setImportPreview(null); }} placeholder="Paste your backup code here..." />
            {!importPreview && (
              <button type="button" className="preview-btn" onClick={handlePreviewImport} disabled={!importCode.trim()}>
                Preview Import
              </button>
            )}
          </div>
          {importPreview && (
            <div className="import-preview">
              <div className="import-preview-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Restoring will replace your current data
              </div>
              <div className="import-preview-stats">
                <div><strong>{importPreview.wallets}</strong><span>wallets</span></div>
                <div><strong>{importPreview.transactions}</strong><span>transactions</span></div>
                <div><strong>{importPreview.exchanges}</strong><span>exchanges</span></div>
                <div><strong>{importPreview.targets}</strong><span>targets</span></div>
                <div><strong>{importPreview.manualPrices}</strong><span>manual prices</span></div>
              </div>
              {Object.keys(importPreview.byCategory || {}).length > 0 && (
                <div className="import-preview-cats">
                  {Object.entries(importPreview.byCategory).map(([cat, count]) => (
                    <span key={cat} className="import-preview-chip" style={{ background: `${ASSET_CATEGORIES[cat]?.color || '#6366f1'}22`, color: ASSET_CATEGORIES[cat]?.color || '#6366f1' }}>
                      {ASSET_CATEGORIES[cat]?.icon} {ASSET_CATEGORIES[cat]?.label || cat}: {count}
                    </span>
                  ))}
                </div>
              )}
              <div className="import-preview-actions">
                <button type="button" className="confirm-btn" onClick={handleConfirmImport}>Confirm Import</button>
                <button type="button" className="btn-ghost-dark" onClick={handleCancelImport}>Cancel</button>
              </div>
            </div>
          )}
          {importStatus === 'error' && (
            <div className="import-status error">Invalid backup code. Please check and try again.</div>
          )}
          {importStatus === 'success' && (
            <div className="import-status success">Import successful! Reloading...</div>
          )}
        </div>
      )}

      {/* Holdings — split by category */}
      <div className="section-header">
        <h3>Holdings</h3>
        <span className="muted">{enriched.length} asset{enriched.length !== 1 ? 's' : ''} · {categoryList.length} categor{categoryList.length !== 1 ? 'ies' : 'y'}</span>
      </div>

      {enriched.length > 0 && (
        <div className="cat-filter">
          <button
            className={`cat-pill ${categoryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            All · {enriched.length}
          </button>
          {categoryList.map(c => (
            <button
              key={c.key}
              className={`cat-pill ${categoryFilter === c.key ? 'active' : ''}`}
              style={categoryFilter === c.key
                ? { background: c.color, color: '#fff', borderColor: c.color }
                : { color: c.color, borderColor: `${c.color}55` }}
              onClick={() => setCategoryFilter(c.key)}
            >
              <span>{c.icon}</span> {c.label} · {c.items.length}
            </button>
          ))}
        </div>
      )}

      {loading ? <div className="card"><p className="muted">Loading...</p></div> : enriched.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#9670;</div>
          <p>No holdings yet</p>
          <p className="muted">Add a wallet and record your first transaction</p>
          <button onClick={() => { if (wallets.length === 0) setShowWallets(true); else navigate('/transactions', { state: { openAdd: true } }); }}>
            {wallets.length === 0 ? 'Create Wallet' : 'Add Transaction'}
          </button>
        </div>
      ) : (
        <div className="categories">
          {filteredCategories.map(cat => (
            <div key={cat.key} className="category-section" style={{ '--cat-color': cat.color }}>
              <div className="category-section-header">
                <div className="cat-title">
                  <span className="cat-icon-lg">{cat.icon}</span>
                  <div className="cat-title-text">
                    <strong>{cat.label}</strong>
                    <span className="muted">{cat.items.length} asset{cat.items.length !== 1 ? 's' : ''} · {cat.pct.toFixed(1)}% of portfolio</span>
                  </div>
                </div>
                <div className="cat-total">
                  <strong>${fmt(cat.total)}</strong>
                  <span className={cat.pnl >= 0 ? 'positive' : 'negative'}>
                    {cat.pnl >= 0 ? '+' : ''}${fmt(cat.pnl)} ({cat.pnlPct.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div className="cat-bar"><div className="cat-bar-fill" style={{ width: `${cat.pct}%`, background: cat.color }} /></div>
              <div className="coin-cards">
                {cat.items.map((h, i) => (
                  <div
                    key={h.coin_id}
                    className="coin-card"
                    onClick={() => { if (h.category === 'crypto' || !h.category) navigate(`/asset/${h.coin_id}`) }}
                    style={{ cursor: (h.category === 'crypto' || !h.category) ? 'pointer' : 'default' }}
                  >
              <div className="coin-header">
                {h.image ? (
                  <img src={h.image} alt="" width={40} height={40} className="coin-logo" />
                ) : (
                  <div className="coin-icon" style={{ background: COLORS[i % COLORS.length] + '22', color: COLORS[i % COLORS.length] }}>
                    {h.coin_symbol.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="coin-name">
                  <div className="coin-name-row">
                    <strong>{h.coin_symbol.toUpperCase()}</strong>
                    {h.category && h.category !== 'crypto' && (
                      <span
                        className="category-badge"
                        style={{ background: `${ASSET_CATEGORIES[h.category]?.color || '#6366f1'}22`, color: ASSET_CATEGORIES[h.category]?.color || '#6366f1' }}
                      >
                        {ASSET_CATEGORIES[h.category]?.icon} {ASSET_CATEGORIES[h.category]?.label}
                      </span>
                    )}
                  </div>
                  <span className="muted">${fmt(h.price)}</span>
                </div>
                <div className="coin-value-col">
                  <strong>${fmt(h.value)}</strong>
                  <span className="muted">{h.allocation.toFixed(1)}% of portfolio</span>
                </div>
              </div>
              <div className="coin-details">
                <div className="detail">
                  <span className="detail-label">Holdings</span>
                  <span>{h.amount.toFixed(6)}</span>
                </div>
                <div className="detail">
                  <span className="detail-label">Avg Buy</span>
                  <span>${fmt(h.avgBuy)}</span>
                </div>
                <div className="detail">
                  <span className="detail-label">P&L</span>
                  <span className={h.pnl >= 0 ? 'positive' : 'negative'}>
                    {h.pnl >= 0 ? '+' : ''}{fmt(h.pnl)} ({h.pnlPct.toFixed(1)}%)
                  </span>
                </div>
                <div className="detail">
                  <span className="detail-label">24h</span>
                  <span className={h.change24h >= 0 ? 'positive' : 'negative'}>
                    {h.change24h >= 0 ? '+' : ''}{h.change24h.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Manual price update for non-crypto assets */}
              {h.category && h.category !== 'crypto' && (
                <div className="manual-price-edit" onClick={e => e.stopPropagation()}>
                  {editingPrice === h.coin_id ? (
                    <form
                      className="coin-target-form"
                      onSubmit={e => { e.preventDefault(); handleUpdateManualPrice(h.coin_id); }}
                    >
                      <input
                        type="number"
                        step="any"
                        value={priceInput}
                        onChange={e => setPriceInput(e.target.value)}
                        placeholder={`Current: $${fmt(h.price)}`}
                        autoFocus
                      />
                      <button type="submit" className="btn-sm">Update</button>
                      <button type="button" className="btn-sm btn-ghost-dark" onClick={() => { setEditingPrice(null); setPriceInput(''); }}>X</button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn-update-price"
                      onClick={() => { setEditingPrice(h.coin_id); setPriceInput(String(h.price || '')); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      Update current price
                    </button>
                  )}
                </div>
              )}

              {/* Multi-target Sell Plan */}
              <div className="sell-plan" onClick={e => e.stopPropagation()}>
                {h.plan.length > 0 && (
                  <>
                    <div className="sell-plan-header">
                      <div className="sell-plan-title">
                        <span className="sell-plan-icon">🎯</span>
                        <span>Sell Plan · {h.plan.length} target{h.plan.length !== 1 ? 's' : ''}</span>
                      </div>
                      <button
                        className="btn-link-dark"
                        onClick={() => setExpandedPlans(prev => ({ ...prev, [h.coin_id]: !prev[h.coin_id] }))}
                      >
                        {expandedPlans[h.coin_id] ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    {expandedPlans[h.coin_id] && (
                      <div className="sell-plan-items">
                        {h.plan.map((t, ti) => (
                          <div key={t.id} className={`sell-plan-item ${t.hit ? 'hit' : ''}`}>
                            <div className="sell-plan-item-top">
                              <div className="sell-plan-item-desc">
                                <span className="sell-plan-qty">
                                  {t.sellAll ? `All ${h.amount.toFixed(6)}` : t.qty.toFixed(6)}
                                </span>
                                <span className="sell-plan-at">@</span>
                                <strong>${fmt(t.price)}</strong>
                              </div>
                              <div className="sell-plan-item-right">
                                <span className={`sell-plan-pct ${t.hit ? 'positive' : ''}`}>
                                  {t.progressPct.toFixed(1)}%
                                </span>
                                <button
                                  type="button"
                                  className="btn-ghost-dark sell-plan-remove"
                                  onClick={() => handleRemoveTargetItem(h.coin_id, t.id)}
                                  title="Remove target"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                            <div className="sell-plan-bar">
                              <div
                                className="sell-plan-fill"
                                style={{
                                  width: `${t.progressPct}%`,
                                  background: t.hit ? 'var(--green)' : COLORS[(i + ti) % COLORS.length],
                                }}
                              />
                            </div>
                            <div className="sell-plan-item-meta">
                              <span className="muted">Proceeds: ${fmt(t.proceeds)}</span>
                              {t.hit ? (
                                <span className="positive">Hit!</span>
                              ) : (
                                <span className="muted">${fmt(t.price - h.price)} to go</span>
                              )}
                            </div>
                          </div>
                        ))}

                        <div className="sell-plan-summary">
                          <div className="sell-plan-summary-row">
                            <span className="muted">Allocated</span>
                            <span>
                              {h.plan.some(t => t.sellAll)
                                ? `All ${h.amount.toFixed(6)}`
                                : `${h.plan.reduce((s, t) => s + t.qty, 0).toFixed(6)} / ${h.amount.toFixed(6)}`}
                            </span>
                          </div>
                          {!h.plan.some(t => t.sellAll) && (
                            <div className="sell-plan-summary-row">
                              <span className="muted">Remaining</span>
                              <span className={h.planOverAllocated ? 'negative' : ''}>
                                {h.planOverAllocated
                                  ? `Over-allocated by ${(h.plan.reduce((s, t) => s + t.qty, 0) - h.amount).toFixed(6)}`
                                  : h.planRemainingQty.toFixed(6)}
                              </span>
                            </div>
                          )}
                          <div className="sell-plan-summary-row total">
                            <span>Total projected proceeds</span>
                            <strong>${fmt(h.planTotalProceeds)}</strong>
                          </div>
                          <div className="sell-plan-summary-row">
                            <span className="muted">vs. invested ${fmt(h.total_invested)}</span>
                            <strong className={h.planTotalProceeds - h.total_invested >= 0 ? 'positive' : 'negative'}>
                              {h.planTotalProceeds - h.total_invested >= 0 ? '+' : ''}${fmt(h.planTotalProceeds - h.total_invested)}
                              {h.total_invested > 0 && (
                                <> ({((h.planTotalProceeds - h.total_invested) / h.total_invested * 100).toFixed(1)}%)</>
                              )}
                            </strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {editingTarget === h.coin_id ? (
                  <form
                    className="sell-plan-add"
                    onSubmit={e => { e.preventDefault(); handleAddCoinTarget(h.coin_id, h.planRemainingQty); }}
                  >
                    <div className="sell-plan-add-inputs">
                      <div className="sell-plan-field">
                        <label>Target price ($)</label>
                        <input
                          type="number"
                          step="any"
                          value={targetInput}
                          onChange={e => setTargetInput(e.target.value)}
                          placeholder={`now $${fmt(h.price)}`}
                          autoFocus
                        />
                      </div>
                      <div className="sell-plan-field">
                        <label>
                          Quantity to sell
                          {h.plan.length > 0 && !h.plan.some(t => t.sellAll) && h.planRemainingQty > 0 && (
                            <button
                              type="button"
                              className="btn-max"
                              onClick={() => setTargetQtyInput(String(h.planRemainingQty))}
                            >
                              Max {h.planRemainingQty.toFixed(4)}
                            </button>
                          )}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={targetQtyInput}
                          onChange={e => setTargetQtyInput(e.target.value)}
                          placeholder={h.plan.length === 0 ? `Leave blank for all ${h.amount.toFixed(4)}` : `up to ${h.planRemainingQty.toFixed(4)}`}
                        />
                      </div>
                    </div>
                    {targetInput && targetQtyInput && (
                      <div className="sell-plan-preview">
                        <span className="muted">Preview proceeds</span>
                        <strong>${fmt(parseFloat(targetInput) * parseFloat(targetQtyInput))}</strong>
                      </div>
                    )}
                    <div className="sell-plan-add-actions">
                      <button type="submit" className="btn-add-target">Add target</button>
                      <button
                        type="button"
                        className="btn-ghost-dark"
                        onClick={() => { setEditingTarget(null); setTargetInput(''); setTargetQtyInput(''); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    className="btn-set-target"
                    onClick={() => {
                      setEditingTarget(h.coin_id); setTargetInput(''); setTargetQtyInput('');
                      setExpandedPlans(prev => ({ ...prev, [h.coin_id]: true }));
                    }}
                  >
                    + {h.plan.length === 0 ? 'Set a sell target' : 'Add another target'}
                  </button>
                )}
              </div>

              <div className="alloc-bar">
                <div className="alloc-fill" style={{ width: `${h.allocation}%`, background: cat.color }} />
              </div>
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
