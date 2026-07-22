import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api'
import { BUCKET_TYPES, BUCKET_COLORS, loadBuckets, saveBuckets, newBucket } from '../data/visionStorage'
import { getVisionAdvice } from '../visionAdviceAi'
import { isStablecoin } from '../stablecoins'
import Icon from '../components/Icon'
import { track } from '../analytics'

const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtSmall = (n) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
const pct = (a, b) => b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0

function getAssetCategory(coinId) {
  if (!coinId) return 'crypto'
  if (coinId.startsWith('metal:')) return 'metals'
  if (coinId.startsWith('stock:')) return 'stocks'
  if (coinId.startsWith('real:'))  return 'real_estate'
  if (coinId.startsWith('cash:') || coinId.startsWith('fiat:')) return 'cash'
  return 'crypto'
}

// Category for a holding — prefer the explicit category stored on the
// transaction/holding, fall back to coin_id prefix parsing.
// Stablecoins are detected by id/symbol and treated as their own category
// (cash-equivalent) rather than volatile crypto — regardless of any "crypto"
// tag the user may have applied.
function holdingCategory(h) {
  const c = (h?.category || '').toLowerCase()
  if (c.includes('stock')) return 'stocks'
  if (c.includes('metal')) return 'metals'
  if (c.includes('real'))  return 'real_estate'
  if (c.includes('cash') || c.includes('fiat')) return 'cash'
  if (isStablecoin(h?.coin_id, h?.coin_symbol || h?.symbol)) return 'stablecoins'
  if (c === 'crypto') return 'crypto'
  return getAssetCategory(h?.coin_id)
}

// Live unit price for a holding — matches Dashboard's lookup (.usd then .price).
function unitPrice(prices, id) {
  return prices[id]?.usd ?? prices[id]?.price ?? 0
}

// Current value of a holding. Uses live price × amount when available, else
// falls back to cost basis (total_invested) — exactly what the Dashboard shows
// so Vision never reads $0 when live prices haven't loaded (stocks/metals/etc.).
function holdingValue(prices, h) {
  if (!h) return 0
  const live = (h.amount || 0) * unitPrice(prices, h.coin_id)
  return live > 0 ? live : (h.total_invested || 0)
}

const CATEGORIES = {
  crypto:      { label: 'Crypto',       icon: 'coins',  color: '#f7931a' },
  stablecoins: { label: 'Stablecoins',  icon: 'bank', color: '#64748b' },
  stocks:      { label: 'Stocks',       icon: 'bar-chart', color: '#0ea5e9' },
  metals:      { label: 'Metals',       icon: 'award', color: '#f59e0b' },
  cash:        { label: 'Cash',         icon: 'banknote', color: '#10b981' },
  real_estate: { label: 'Real Estate',  icon: 'home', color: '#8b5cf6' },
}

const GOAL_TEMPLATES = [
  { icon: 'shield', label: 'Emergency Fund', type: 'emergency', targetPct: 10, categories: ['cash', 'stablecoins'], notes: '3–6 months expenses in liquid assets' },
  { icon: 'lock', label: 'Retirement Hold', type: 'hold', categories: ['crypto', 'stocks'], notes: 'Long-term growth — do not sell early' },
  { icon: 'home', label: 'Down Payment', type: 'invest', targetAmount: 50000, targetMonths: 36, categories: ['stablecoins', 'cash'] },
  { icon: 'trend-up', label: 'Growth Fund', type: 'invest', targetPct: 30, categories: ['crypto', 'stocks', 'metals'] },
  { icon: 'banknote', label: 'Income Plan', type: 'withdrawal', categories: ['stablecoins', 'cash'], notes: 'Drawdown for living expenses' },
]

// ── Donut chart (pure SVG) ────────────────────────────────────────────
function DonutChart({ slices, total, cx = 80, cy = 80, r = 64, stroke = 20 }) {
  const circ = 2 * Math.PI * r
  let offset = 0
  const arcs = slices.map((s) => {
    const len = total > 0 ? (s.value / total) * circ : 0
    const arc = { ...s, dash: len, gap: circ - len, offset }
    offset += len
    return arc
  })
  return (
    <svg viewBox={`0 0 ${cx * 2} ${cy * 2}`} width={cx * 2} height={cy * 2} aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={stroke} />
      {arcs.map((a, i) => a.dash > 0 && (
        <circle key={i} cx={cx} cy={cy} r={r}
          fill="none"
          stroke={a.color}
          strokeWidth={stroke}
          strokeDasharray={`${a.dash} ${circ}`}
          strokeDashoffset={-a.offset + circ / 4}
          strokeLinecap="butt"
          style={{ transition: 'stroke-dasharray .4s ease' }}
        />
      ))}
    </svg>
  )
}

// ── Runway badge ─────────────────────────────────────────────────────
function Runway({ value, monthly }) {
  if (!monthly || monthly <= 0 || !value) return null
  const months = Math.floor(value / monthly)
  const y = Math.floor(months / 12)
  const m = months % 12
  const label = y > 0 ? `${y}y ${m}m runway` : `${m}m runway`
  return <span className="vp-runway">{label}</span>
}

// Months needed to reach `target` from `current` at `monthly` contribution.
function monthsToTarget(current, target, monthly) {
  if (!target || !monthly || monthly <= 0 || target <= current) return null
  return Math.ceil((target - current) / monthly)
}

function etaLabel(months) {
  if (months == null) return null
  const y = Math.floor(months / 12)
  const m = months % 12
  const span = y > 0 ? `${y}y ${m}m` : `${m}m`
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  const when = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return `${span} to goal · ${when}`
}

// ── Smart analysis per bucket ─────────────────────────────────────────
function BucketAnalysis({ bucket, currentValue, totalNW, holdings, prices }) {
  const insights = []

  // Nothing to value yet AND no plan set — prompt the user.
  const target = bucket.isRest ? null
    : bucket.targetPct != null ? (totalNW * bucket.targetPct / 100)
    : bucket.targetAmount
  const hasPlan = bucket.linkedAssets?.length || bucket.manualAmount > 0 ||
    bucket.categories?.length || bucket.monthlyContribution > 0 ||
    bucket.monthlyWithdrawal > 0 || bucket.targetMonths > 0 || target > 0
  if (!bucket.isRest && currentValue <= 0 && !hasPlan) {
    insights.push({ level: 'info', msg: 'Set a current amount, link assets, or pick a category to start tracking' })
    return (
      <div className="vp-analysis">
        {insights.map((ins, i) => (
          <div key={i} className={`vp-analysis-item vp-analysis-${ins.level}`}>
            <span className="vp-analysis-dot" />
            <span>{ins.msg}</span>
          </div>
        ))}
      </div>
    )
  }

  // Goal timeframe — user-chosen number of months to reach the target
  if (bucket.targetMonths > 0 && target > 0 && currentValue < target) {
    const need = (target - currentValue) / bucket.targetMonths
    const monthLbl = `${bucket.targetMonths} month${bucket.targetMonths !== 1 ? 's' : ''}`
    if (bucket.monthlyContribution > 0) {
      if (bucket.monthlyContribution >= need * 0.99)
        insights.push({ level: 'ok', msg: `${fmt(bucket.monthlyContribution)}/mo covers your ${monthLbl} goal (needs ${fmt(need)}/mo) ✓` })
      else
        insights.push({ level: 'warn', msg: `Short for your ${monthLbl} goal — save ${fmt(need)}/mo (you're adding ${fmt(bucket.monthlyContribution)}/mo, ${fmt(need - bucket.monthlyContribution)} more needed)` })
    } else {
      insights.push({ level: 'info', msg: `To reach ${fmt(target)} in ${monthLbl}, save ${fmt(need)}/mo` })
    }
  }

  // Withdrawal funding target over the chosen timeframe
  if (bucket.targetMonths > 0 && bucket.monthlyWithdrawal > 0 && !(target > 0)) {
    const needed = bucket.monthlyWithdrawal * bucket.targetMonths
    const gap = needed - currentValue
    if (gap > 0)
      insights.push({ level: 'info', msg: `Funding ${fmt(bucket.monthlyWithdrawal)}/mo for ${bucket.targetMonths} months needs ${fmt(needed)} — ${fmt(gap)} to go` })
    else
      insights.push({ level: 'ok', msg: `Fully funded for ${bucket.targetMonths} months of ${fmt(bucket.monthlyWithdrawal)}/mo withdrawals ✓` })
  }

  // Monthly contribution → time-to-goal projection
  if (bucket.monthlyContribution > 0 && !(bucket.targetMonths > 0)) {
    const m = monthsToTarget(currentValue, target, bucket.monthlyContribution)
    if (m != null) {
      const yearly = bucket.monthlyContribution * 12
      insights.push({ level: 'ok', msg: `Adding ${fmt(bucket.monthlyContribution)}/mo (${fmt(yearly)}/yr) → on track to hit ${fmt(target)} in ${m === 1 ? '1 month' : m + ' months'}` })
    } else if (target && currentValue >= target) {
      insights.push({ level: 'ok', msg: `Target reached — you can pause the ${fmt(bucket.monthlyContribution)}/mo contribution ✓` })
    } else {
      insights.push({ level: 'info', msg: `Contributing ${fmt(bucket.monthlyContribution)}/mo (${fmt(bucket.monthlyContribution * 12)}/yr)` })
    }
  }

  // Runway health
  if (bucket.monthlyWithdrawal && bucket.monthlyWithdrawal > 0 && currentValue > 0) {
    const months = Math.floor(currentValue / bucket.monthlyWithdrawal)
    if (bucket.type === 'emergency') {
      if (months < 3)
        insights.push({ level: 'warn', msg: `Only ${months}m emergency runway — aim for 3–6 months minimum` })
      else if (months < 6)
        insights.push({ level: 'info', msg: `${months}m emergency runway — healthy, building to 6 months is ideal` })
      else
        insights.push({ level: 'ok', msg: `${months}m emergency runway — solid safety net ✓` })
    } else if (bucket.type === 'withdrawal') {
      if (months < 12)
        insights.push({ level: 'warn', msg: `Only ${months}m withdrawal runway — below 12-month minimum` })
      else if (months < 24)
        insights.push({ level: 'info', msg: `${months}m withdrawal runway — consider building to 24+ months` })
      else
        insights.push({ level: 'ok', msg: `${months}m withdrawal runway — well-funded ✓` })
    }
  }

  // Concentration analysis
  if (currentValue > 0 && bucket.linkedAssets?.length) {
    let maxVal = 0, maxName = ''
    for (const id of bucket.linkedAssets) {
      const h = holdings.find(x => x.coin_id === id)
      if (!h) continue
      const val = holdingValue(prices, h)
      if (val > maxVal) {
        maxVal = val
        maxName = h.coin_symbol?.toUpperCase() || h.symbol?.toUpperCase() || h.coin_name || h.name || id
      }
    }
    const concPct = Math.round((maxVal / currentValue) * 100)
    if (concPct >= 80 && bucket.linkedAssets.length > 1) {
      insights.push({ level: 'warn', msg: `${maxName} is ${concPct}% of this bucket — highly concentrated` })
    }
  }

  // Category risk analysis — emergency fund should not be heavy crypto
  if (bucket.type === 'emergency' && currentValue > 0 && bucket.linkedAssets?.length) {
    const cryptoVal = bucket.linkedAssets.reduce((s, id) => {
      const h = holdings.find(x => x.coin_id === id)
      if (!h || holdingCategory(h) !== 'crypto') return s
      return s + holdingValue(prices, h)
    }, 0)
    const cryptoPct = Math.round((cryptoVal / currentValue) * 100)
    if (cryptoPct > 50) {
      insights.push({ level: 'warn', msg: `${cryptoPct}% in crypto — emergency funds should be in stable, liquid assets` })
    }
  }

  // Hold bucket — suggest diversification advice
  if (bucket.type === 'hold' && bucket.linkedAssets?.length === 1) {
    const cat = getAssetCategory(bucket.linkedAssets[0])
    if (cat === 'crypto') {
      insights.push({ level: 'info', msg: 'Single crypto asset — high growth potential but volatile; consider diversifying' })
    }
  }

  // Investment bucket — check category mix
  if (bucket.type === 'invest' && currentValue > 0 && bucket.linkedAssets?.length) {
    const catCounts = {}
    for (const id of bucket.linkedAssets) {
      const cat = getAssetCategory(id)
      catCounts[cat] = (catCounts[cat] || 0) + 1
    }
    if (Object.keys(catCounts).length === 1) {
      const onlyCat = Object.keys(catCounts)[0]
      insights.push({ level: 'info', msg: `All assets in ${CATEGORIES[onlyCat]?.label || onlyCat} — mixing asset classes reduces risk` })
    }
  }

  // NW share advice
  if (currentValue > 0 && totalNW > 0) {
    const share = Math.round((currentValue / totalNW) * 100)
    if (bucket.type === 'hold' && share > 65) {
      insights.push({ level: 'info', msg: `${share}% of net worth in this bucket — large position, ensure it aligns with your risk tolerance` })
    }
    if (bucket.type === 'emergency' && share > 30) {
      insights.push({ level: 'info', msg: `${share}% of NW as emergency fund — consider deploying excess into growth buckets` })
    }
  }

  // Target gap
  if (!bucket.isRest && bucket.targetAmount && currentValue < bucket.targetAmount * 0.5) {
    const gap = bucket.targetAmount - currentValue
    insights.push({ level: 'warn', msg: `${pct(currentValue, bucket.targetAmount)}% funded — ${fmt(gap)} gap to target` })
  }

  if (!insights.length) return null

  return (
    <div className="vp-analysis">
      {insights.map((ins, i) => (
        <div key={i} className={`vp-analysis-item vp-analysis-${ins.level}`}>
          <span className="vp-analysis-dot" />
          <span>{ins.msg}</span>
        </div>
      ))}
    </div>
  )
}

// ── Category breakdown ────────────────────────────────────────────────
function CategoryBreakdown({ holdings, prices }) {
  const cats = {}
  let total = 0
  for (const h of holdings) {
    const cat = holdingCategory(h)
    const val = holdingValue(prices, h)
    cats[cat] = (cats[cat] || 0) + val
    total += val
  }
  if (total === 0) return null

  const slices = Object.entries(cats)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ color: CATEGORIES[k]?.color || '#888', value: v, key: k }))

  return (
    <div className="vp-cat-breakdown">
      <h3 className="vp-section-title">Portfolio by Asset Class</h3>
      <div className="vp-cat-layout">
        <DonutChart slices={slices} total={total} cx={54} cy={54} r={40} stroke={15} />
        <div className="vp-cat-rows">
          {slices.map(s => (
            <div key={s.key} className="vp-cat-row">
              <span className="vp-cat-dot" style={{ background: s.color }} />
              <span className="vp-cat-name">
                <Icon name={CATEGORIES[s.key]?.icon} size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{CATEGORIES[s.key]?.label || s.key}
              </span>
              <span className="vp-cat-val">{fmt(s.value)}</span>
              <span className="vp-cat-pct">{pct(s.value, total)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Bucket card ───────────────────────────────────────────────────────
function BucketCard({ bucket, currentValue, totalNW, holdings, prices, onEdit, onDelete, onToggleComplete }) {
  const type = BUCKET_TYPES[bucket.type] || BUCKET_TYPES.hold
  const target = bucket.isRest
    ? (totalNW - currentValue)
    : bucket.targetPct != null
    ? (totalNW * bucket.targetPct / 100)
    : bucket.targetAmount

  const progress = pct(currentValue, target)
  const nwShare = pct(currentValue, totalNW)

  const isGoalMet = target != null && target > 0 && currentValue >= target
  const isDone = bucket.completed || isGoalMet

  // ETA to target — chosen timeframe if set, else projected from contribution
  const eta = bucket.targetMonths > 0
    ? etaLabel(bucket.targetMonths)
    : etaLabel(monthsToTarget(currentValue, target, bucket.monthlyContribution))

  // Planned (manual) asset-class focus — works without any linked holdings
  const plannedCats = bucket.categories || []

  // Live category composition badges (from linked holdings)
  const catBreakdown = useMemo(() => {
    if (!bucket.linkedAssets?.length) return []
    const cats = {}
    let total = 0
    for (const id of bucket.linkedAssets) {
      const h = holdings.find(x => x.coin_id === id)
      if (!h) continue
      const val = holdingValue(prices, h)
      const cat = holdingCategory(h)
      cats[cat] = (cats[cat] || 0) + val
      total += val
    }
    if (total === 0) return []
    return Object.entries(cats)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ key: k, pct: Math.round((v / total) * 100), color: CATEGORIES[k]?.color || '#888', label: CATEGORIES[k]?.label || k, icon: CATEGORIES[k]?.icon }))
  }, [bucket.linkedAssets, holdings, prices])

  return (
    <div className={`vp-card${bucket.completed ? ' vp-card--done' : ''}`} style={{ borderLeft: `3px solid ${bucket.color}` }}>
      <div className="vp-card-head">
        <span className="vp-drag-handle" title="Drag to reorder">⠿</span>
        <span className="vp-type-icon"><Icon name={type.icon} size={16} /></span>
        <div className="vp-card-title">
          <strong>{bucket.name || type.label}</strong>
          <span className="vp-type-label">{type.label}</span>
          {bucket.completed && <span className="vp-done-badge">✓ Done</span>}
        </div>
        <div className="vp-card-actions">
          {bucket.completed && (
            <button className="vp-btn-icon" onClick={() => onToggleComplete(bucket.id)} title="Restore">
              ↩
            </button>
          )}
          <button className="vp-btn-icon" onClick={() => onEdit(bucket)} title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button className="vp-btn-icon vp-btn-del" onClick={() => onDelete(bucket.id)} title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>

      <div className="vp-card-values">
        <span className="vp-val">{fmt(currentValue)}</span>
        {target != null && <span className="vp-target">/ {fmt(target)}</span>}
        {nwShare > 0 && <span className="vp-nwshare">{nwShare}% of NW</span>}
        <Runway value={currentValue} monthly={bucket.monthlyWithdrawal} />
      </div>

      {target != null && target > 0 && (
        <div className="vp-bar-wrap">
          <div className="vp-bar" style={{ width: `${progress}%`, background: bucket.color }} />
          <span className="vp-bar-pct">{progress}%</span>
        </div>
      )}

      {(bucket.monthlyContribution > 0 || eta) && (
        <div className="vp-contrib">
          {bucket.monthlyContribution > 0 && (
            <span className="vp-contrib-amt">+{fmt(bucket.monthlyContribution)}/mo</span>
          )}
          {eta && <span className="vp-eta">{eta}</span>}
        </div>
      )}

      {catBreakdown.length > 0 ? (
        <div className="vp-cat-badges">
          {catBreakdown.map(c => (
            <span key={c.key} className="vp-cat-badge" style={{ borderColor: c.color, color: c.color }}>
              <Icon name={c.icon} size={12} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{c.label} {c.pct}%
            </span>
          ))}
        </div>
      ) : plannedCats.length > 0 && (
        <div className="vp-cat-badges">
          {plannedCats.map(k => (
            <span key={k} className="vp-cat-badge vp-cat-badge-planned" style={{ borderColor: CATEGORIES[k]?.color, color: CATEGORIES[k]?.color }}>
              <Icon name={CATEGORIES[k]?.icon} size={12} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{CATEGORIES[k]?.label || k}
            </span>
          ))}
        </div>
      )}

      {bucket.notes && <p className="vp-notes">{bucket.notes}</p>}

      {isGoalMet && !bucket.completed && (
        <div className="vp-goal-met">
          <span>✓ Goal reached!</span>
          <button className="vp-goal-met-btn" onClick={e => { e.stopPropagation(); onToggleComplete(bucket.id) }}>Archive</button>
        </div>
      )}

      <BucketAnalysis
        bucket={bucket}
        currentValue={currentValue}
        totalNW={totalNW}
        holdings={holdings}
        prices={prices}
      />
    </div>
  )
}

// ── Add / Edit modal ──────────────────────────────────────────────────
function BucketModal({ bucket, holdings, prices, totalNW, onSave, onClose }) {
  const isNew = !bucket.id
  const [form, setForm] = useState({
    name: bucket.name || '',
    type: bucket.type || 'hold',
    color: bucket.color || BUCKET_COLORS[0],
    targetMode: bucket.isRest ? 'rest' : bucket.targetPct != null ? 'pct' : bucket.targetAmount != null ? 'fixed' : 'none',
    targetAmount: bucket.targetAmount ?? '',
    targetPct: bucket.targetPct ?? '',
    monthlyWithdrawal: bucket.monthlyWithdrawal ?? '',
    monthlyContribution: bucket.monthlyContribution ?? '',
    targetMonths: bucket.targetMonths ?? '',
    manualAmount: bucket.manualAmount ?? '',
    categories: bucket.categories || [],
    linkedAssets: bucket.linkedAssets || [],
    notes: bucket.notes || '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleAsset = (id) =>
    set('linkedAssets', form.linkedAssets.includes(id)
      ? form.linkedAssets.filter(x => x !== id)
      : [...form.linkedAssets, id])

  const togglePlanCategory = (cat) =>
    set('categories', form.categories.includes(cat)
      ? form.categories.filter(x => x !== cat)
      : [...form.categories, cat])

  // Group holdings by category for quick-select
  const holdingsByCategory = useMemo(() => {
    const groups = {}
    for (const h of holdings) {
      const cat = holdingCategory(h)
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(h)
    }
    return groups
  }, [holdings])

  const availableCategories = useMemo(() =>
    Object.keys(holdingsByCategory).filter(k => holdingsByCategory[k].length > 0),
    [holdingsByCategory])

  function toggleCategory(cat) {
    const catIds = (holdingsByCategory[cat] || []).map(h => h.coin_id)
    const allSelected = catIds.every(id => form.linkedAssets.includes(id))
    if (allSelected) {
      set('linkedAssets', form.linkedAssets.filter(id => !catIds.includes(id)))
    } else {
      set('linkedAssets', [...new Set([...form.linkedAssets, ...catIds])])
    }
  }

  function catState(cat) {
    const catIds = (holdingsByCategory[cat] || []).map(h => h.coin_id)
    if (!catIds.length) return 'empty'
    if (catIds.every(id => form.linkedAssets.includes(id))) return 'full'
    if (catIds.some(id => form.linkedAssets.includes(id))) return 'partial'
    return 'none'
  }

  function handleSave() {
    const out = {
      ...bucket,
      name: form.name.trim() || BUCKET_TYPES[form.type]?.label,
      type: form.type,
      color: form.color,
      isRest: form.targetMode === 'rest',
      targetAmount: form.targetMode === 'fixed' && form.targetAmount ? parseFloat(form.targetAmount) : null,
      targetPct: form.targetMode === 'pct' && form.targetPct ? parseFloat(form.targetPct) : null,
      monthlyWithdrawal: form.monthlyWithdrawal ? parseFloat(form.monthlyWithdrawal) : null,
      monthlyContribution: form.monthlyContribution ? parseFloat(form.monthlyContribution) : null,
      targetMonths: form.targetMonths ? Math.round(parseFloat(form.targetMonths)) : null,
      manualAmount: form.manualAmount ? parseFloat(form.manualAmount) : null,
      categories: form.categories,
      linkedAssets: form.linkedAssets,
      notes: form.notes.trim(),
    }
    onSave(out)
  }

  return (
    <div className="vp-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="vp-modal">
        <div className="vp-modal-head">
          <h3>{isNew ? 'Add Bucket' : 'Edit Bucket'}</h3>
          <button className="wlm-close" onClick={onClose} aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
          </button>
        </div>

        <div className="vp-modal-body">
          {isNew && (
            <div className="vp-field">
              <span>Start from template <span style={{opacity:.5,fontWeight:400}}>(optional)</span></span>
              <div className="vp-templates">
                {GOAL_TEMPLATES.map((tpl, i) => (
                  <button key={i} type="button" className="vp-tpl-btn"
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        name: f.name || tpl.label,
                        type: tpl.type,
                        targetMode: tpl.targetPct != null ? 'pct' : tpl.targetAmount ? 'fixed' : 'none',
                        targetAmount: tpl.targetAmount ?? '',
                        targetPct: tpl.targetPct ?? '',
                        targetMonths: tpl.targetMonths ?? '',
                        categories: tpl.categories || [],
                        notes: f.notes || tpl.notes || '',
                      }))
                    }}>
                    <Icon name={tpl.icon} size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{tpl.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="vp-field">
            <span>Name</span>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder={BUCKET_TYPES[form.type]?.label} className="vp-input" />
          </label>

          <label className="vp-field">
            <span>Type</span>
            <select value={form.type} onChange={e => set('type', e.target.value)} className="vp-input">
              {Object.entries(BUCKET_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label} — {v.desc}</option>
              ))}
            </select>
          </label>

          <div className="vp-field">
            <span>Color</span>
            <div className="vp-colors">
              {BUCKET_COLORS.map(c => (
                <button key={c} className={`vp-color-swatch${form.color === c ? ' active' : ''}`}
                  style={{ background: c }} onClick={() => set('color', c)} />
              ))}
            </div>
          </div>

          <div className="vp-field">
            <span>Target</span>
            <div className="vp-radios">
              {[['none','No target'],['fixed','Fixed $'],['pct','% of net worth'],['rest','Remaining (auto)']].map(([v, l]) => (
                <label key={v} className="vp-radio">
                  <input type="radio" name="tmode" checked={form.targetMode === v} onChange={() => set('targetMode', v)} />
                  {l}
                </label>
              ))}
            </div>
            {form.targetMode === 'fixed' && (
              <input type="number" min="0" value={form.targetAmount} onChange={e => set('targetAmount', e.target.value)}
                placeholder="e.g. 20000" className="vp-input" style={{ marginTop: '6px' }} />
            )}
            {form.targetMode === 'pct' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <input type="number" min="0" max="100" value={form.targetPct} onChange={e => set('targetPct', e.target.value)}
                  placeholder="e.g. 50" className="vp-input" />
                <span style={{ opacity: .6, fontSize: '.8rem' }}>% = {form.targetPct ? fmt(totalNW * form.targetPct / 100) : '—'}</span>
              </div>
            )}
          </div>

          <div className="vp-field-row">
            <label className="vp-field">
              <span>Monthly Contribution <span style={{ opacity: .5, fontWeight: 400 }}>(adding)</span></span>
              <input type="number" min="0" value={form.monthlyContribution} onChange={e => set('monthlyContribution', e.target.value)}
                placeholder="e.g. 300" className="vp-input" />
            </label>
            <label className="vp-field">
              <span>Monthly Withdrawal <span style={{ opacity: .5, fontWeight: 400 }}>(drawing)</span></span>
              <input type="number" min="0" value={form.monthlyWithdrawal} onChange={e => set('monthlyWithdrawal', e.target.value)}
                placeholder="e.g. 500" className="vp-input" />
            </label>
          </div>

          {/* Goal timeframe — user chooses how many months to reach the target */}
          <label className="vp-field">
            <span>Reach goal in <span style={{ opacity: .5, fontWeight: 400 }}>(months)</span></span>
            <input type="number" min="1" step="1" value={form.targetMonths} onChange={e => set('targetMonths', e.target.value)}
              placeholder="e.g. 24" className="vp-input" />
            {(() => {
              const tgt = form.targetMode === 'fixed' ? parseFloat(form.targetAmount)
                : form.targetMode === 'pct' ? (totalNW * parseFloat(form.targetPct) / 100)
                : NaN
              const cur = form.linkedAssets.length
                ? form.linkedAssets.reduce((s, id) => s + holdingValue(prices, holdings.find(x => x.coin_id === id)), 0)
                : (parseFloat(form.manualAmount) || 0)
              const months = parseInt(form.targetMonths, 10)
              if (months > 0 && isFinite(tgt) && tgt > cur) {
                const need = (tgt - cur) / months
                return <span className="vp-field-hint">Save <strong>{fmt(need)}/mo</strong> to reach {fmt(tgt)} in {months} month{months !== 1 ? 's' : ''}</span>
              }
              if (months > 0 && parseFloat(form.monthlyWithdrawal) > 0) {
                const need = parseFloat(form.monthlyWithdrawal) * months
                return <span className="vp-field-hint">Needs <strong>{fmt(need)}</strong> to fund {fmt(parseFloat(form.monthlyWithdrawal))}/mo for {months} months</span>
              }
              return null
            })()}
          </label>

          {/* Plan by asset category — always available, no portfolio required */}
          <div className="vp-field">
            <span>Plan by category <span style={{ opacity: .5, fontWeight: 400 }}>(what this bucket holds)</span></span>
            <div className="vp-cat-btns">
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <button
                  key={k}
                  className={`vp-cat-btn${form.categories.includes(k) ? ' active' : ''}`}
                  style={{ '--cat-color': v.color }}
                  onClick={() => togglePlanCategory(k)}
                >
                  <Icon name={v.icon} size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Manual current amount — for planning when assets aren't linked */}
          {form.linkedAssets.length === 0 && (
            <label className="vp-field">
              <span>Current amount <span style={{ opacity: .5, fontWeight: 400 }}>(manual, if not linking assets)</span></span>
              <input type="number" min="0" value={form.manualAmount} onChange={e => set('manualAmount', e.target.value)}
                placeholder="e.g. 5000" className="vp-input" />
            </label>
          )}

          {holdings.length > 0 && (
            <div className="vp-field">
              <span>Link assets <span style={{ opacity: .5, fontWeight: 400 }}>(select by category or individually)</span></span>

              {(() => {
                const suggestedCats = ({
                  emergency: ['cash', 'stablecoins'],
                  withdrawal: ['cash', 'stablecoins'],
                  hold: ['crypto', 'stocks', 'metals'],
                  invest: ['crypto', 'stocks'],
                  rest: [],
                }[form.type]) || []
                const suggestableIds = suggestedCats.flatMap(cat => (holdingsByCategory[cat] || []).map(h => h.coin_id)).filter(Boolean)
                return form.linkedAssets.length === 0 && suggestableIds.length > 0 ? (
                  <div className="vp-autolink-tip">
                    <span><Icon name="lightbulb" size={14} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />Auto-link {suggestedCats.map(c => CATEGORIES[c]?.label).filter(Boolean).join(' & ')} assets?</span>
                    <button type="button" className="vp-autolink-btn"
                      onClick={() => set('linkedAssets', suggestableIds)}>
                      Link {suggestableIds.length} asset{suggestableIds.length !== 1 ? 's' : ''}
                    </button>
                  </div>
                ) : null
              })()}

              {availableCategories.length > 1 && (
                <div className="vp-cat-btns">
                  {availableCategories.map(cat => {
                    const state = catState(cat)
                    return (
                      <button
                        key={cat}
                        className={`vp-cat-btn${state === 'full' ? ' active' : state === 'partial' ? ' partial' : ''}`}
                        style={{ '--cat-color': CATEGORIES[cat]?.color || '#888' }}
                        onClick={() => toggleCategory(cat)}
                        title={`Toggle all ${CATEGORIES[cat]?.label || cat} assets`}
                      >
                        <Icon name={CATEGORIES[cat]?.icon} size={12} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{CATEGORIES[cat]?.label || cat}
                        {state === 'partial' && <span className="vp-cat-btn-dot">•</span>}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="vp-assets-list">
                {availableCategories.map(cat => (
                  <div key={cat}>
                    {availableCategories.length > 1 && (
                      <div className="vp-asset-group-label" style={{ color: CATEGORIES[cat]?.color }}>
                        <Icon name={CATEGORIES[cat]?.icon} size={12} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{CATEGORIES[cat]?.label || cat}
                      </div>
                    )}
                    {holdingsByCategory[cat].map(h => {
                      const val = holdingValue(prices, h)
                      return (
                        <label key={h.coin_id} className="vp-asset-check">
                          <input type="checkbox" checked={form.linkedAssets.includes(h.coin_id)} onChange={() => toggleAsset(h.coin_id)} />
                          <span>{h.coin_symbol?.toUpperCase() || h.symbol?.toUpperCase() || h.coin_name || h.name}</span>
                          <span style={{ marginInlineStart: 'auto', opacity: .6, fontSize: '.78rem' }}>{fmtSmall(val)}</span>
                        </label>
                      )
                    })}
                  </div>
                ))}
              </div>

              {form.linkedAssets.length > 0 && (
                <div className="vp-linked-summary">
                  {form.linkedAssets.length} asset{form.linkedAssets.length !== 1 ? 's' : ''} selected
                  {' · '}
                  {fmt(form.linkedAssets.reduce((s, id) => {
                    const h = holdings.find(x => x.coin_id === id)
                    return s + holdingValue(prices, h)
                  }, 0))} current value
                </div>
              )}
            </div>
          )}

          <label className="vp-field">
            <span>Notes <span style={{ opacity: .5, fontWeight: 400 }}>(optional)</span></span>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="e.g. BTC long term hold, don't sell before 2027" className="vp-input vp-textarea" />
          </label>
        </div>

        <div className="vp-modal-foot">
          <button className="vp-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="vp-btn-primary" onClick={handleSave}>
            {isNew ? 'Add Bucket' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
// ── "How Goals work" explainer (dismissible, remembered on-device) ────────
function VisionExplainer() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('wl_vision_explained') !== '1' } catch { return true }
  })
  if (!open) return null
  const dismiss = () => {
    setOpen(false)
    try { localStorage.setItem('wl_vision_explained', '1') } catch {}
  }
  const STEPS = [
    { icon: 'folder', title: 'Buckets = purposes', desc: 'Split your net worth into goals — emergency fund, growth, a house deposit — instead of one undifferentiated pile.' },
    { icon: 'target', title: 'Set a target & timeframe', desc: 'Give a bucket a dollar or % goal and a deadline; WalletLens shows how far off you are and the pace needed.' },
    { icon: 'banknote', title: 'Runway & income', desc: 'Add monthly contributions or withdrawals to see funding progress and how many months a bucket can pay out.' },
    { icon: 'sparkles', title: 'Auto-generate', desc: 'Tap Auto-plan and WalletLens builds a starter plan grouped by what you actually hold — then you fine-tune.' },
  ]
  return (
    <div className="vp-explain">
      <button className="vp-explain-x" onClick={dismiss} aria-label="Dismiss">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
      </button>
      <div className="vp-explain-head">
        <Icon name="map" size={16} />
        <b>How Goals work</b>
      </div>
      <div className="vp-explain-grid">
        {STEPS.map((s, i) => (
          <div key={i} className="vp-explain-step">
            <span className="vp-explain-ico"><Icon name={s.icon} size={15} /></span>
            <div>
              <span className="vp-explain-t">{s.title}</span>
              <span className="vp-explain-d">{s.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Vision() {
  const navigate = useNavigate()
  const location = useLocation()
  const [buckets, setBuckets] = useState(loadBuckets)
  const [holdings, setHoldings] = useState([])
  const [prices, setPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [advice, setAdvice] = useState(null)
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [adviceError, setAdviceError] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  useEffect(() => { track('vision_view') }, [])

  // Auto-open bucket modal pre-linked to an asset if arriving from Dashboard
  useEffect(() => {
    const coinId = location.state?.linkAsset
    if (!coinId || !holdings.length) return
    const h = holdings.find(x => x.coin_id === coinId)
    if (h) setEditTarget({ linkedAssets: [coinId] })
  }, [location.state?.linkAsset, holdings.length > 0])

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const portfolio = (await api.getPortfolio()) || []
        if (!alive) return
        setHoldings(portfolio)
        const ids = portfolio.map(h => h.coin_id).filter(Boolean).join(',')
        if (ids) {
          const px = await api.getPrices(ids).catch(() => ({}))
          if (alive) setPrices(px || {})
        }
      } catch {}
      if (alive) setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [])

  // Live net worth — uses the same value rule as the Dashboard (live price,
  // falling back to cost basis) so Vision never shows $0 when prices lag.
  const totalNW = holdings.reduce((s, h) => s + holdingValue(prices, h), 0)

  const getBucketValue = useCallback((bucket) => {
    if (!bucket.linkedAssets?.length) return null
    return bucket.linkedAssets.reduce((s, id) => {
      const h = holdings.find(x => x.coin_id === id)
      return s + holdingValue(prices, h)
    }, 0)
  }, [holdings, prices])

  // A bucket's value: linked live assets if any, else the manual amount.
  function bucketBaseValue(b) {
    const linked = getBucketValue(b)
    if (linked != null) return linked
    return b.manualAmount || 0
  }

  const allocatedValue = buckets
    .filter(b => !b.isRest)
    .reduce((s, b) => s + bucketBaseValue(b), 0)

  const restValue = totalNW - allocatedValue

  function bucketCurrentValue(b) {
    if (b.isRest) return restValue >= 0 ? restValue : 0
    return bucketBaseValue(b)
  }

  // Percentages fall back to the sum of bucket values when there are no live
  // holdings, so a manual-only plan still shows meaningful shares (not 0%).
  const effectiveNW = totalNW > 0 ? totalNW
    : buckets.filter(b => !b.isRest).reduce((s, b) => s + bucketBaseValue(b), 0)

  const donutSlices = buckets.length > 0
    ? buckets.map(b => ({ color: b.color, value: bucketCurrentValue(b) })).filter(s => s.value > 0)
    : []

  const totalAllocated = donutSlices.reduce((s, x) => s + x.value, 0)

  function save(updated) {
    saveBuckets(updated)
    setBuckets(updated)
  }

  function handleSaveBucket(bucket) {
    if (!bucket.id) {
      const nb = newBucket(bucket)
      save([...buckets, nb])
      track('vision_bucket_add', { type: nb.type })
    } else {
      save(buckets.map(b => b.id === bucket.id ? bucket : b))
      track('vision_bucket_edit', { type: bucket.type })
    }
    setEditTarget(null)
  }

  function handleDelete(id) {
    save(buckets.filter(b => b.id !== id))
    setDeleteId(null)
    track('vision_bucket_delete')
  }

  function handleToggleComplete(id) {
    save(buckets.map(b => b.id === id
      ? { ...b, completed: !b.completed, completedAt: b.completed ? null : new Date().toISOString() }
      : b))
  }

  // ── Auto-generate a starter plan from the user's real portfolio ──────────
  // Groups holdings by asset class, creates a linked bucket per class present
  // (plus an emergency fund and an "everything else" bucket), so a one-tap plan
  // reflects what they actually own. Falls back to a generic 3-bucket plan when
  // there are no holdings yet.
  function autoGeneratePlan() {
    const cat = { crypto: [], stocks: [], metals: [], cash: [], stable: [] }
    for (const h of holdings) {
      if (!h.coin_id) continue
      if (isStablecoin(h.coin_id, h.coin_symbol)) { cat.stable.push(h.coin_id); continue }
      const c = holdingCategory(h)
      ;(cat[c] || cat.crypto).push(h.coin_id)
    }

    const existingNames = new Set(buckets.map(b => (b.name || '').toLowerCase()))
    const hasRest = buckets.some(b => b.isRest)
    const generated = []
    const add = (o) => {
      if (existingNames.has((o.name || '').toLowerCase())) return
      generated.push(newBucket(o))
    }

    const safe = [...cat.cash, ...cat.stable]
    if (safe.length) add({
      name: 'Emergency Fund', type: 'emergency', targetPct: 10,
      categories: ['cash', 'stablecoins'], linkedAssets: safe,
      notes: 'Keep 3–6 months of expenses liquid so a crisis never forces you to sell investments at the wrong time.',
    })
    if (cat.crypto.length) add({
      name: 'Crypto Growth', type: 'invest', targetPct: 40,
      categories: ['crypto'], linkedAssets: cat.crypto,
      notes: 'Your long-term crypto upside. Set sell targets in the Targets tab and take profits into strength.',
    })
    if (cat.stocks.length) add({
      name: 'Stocks', type: 'hold',
      categories: ['stocks'], linkedAssets: cat.stocks,
      notes: 'Equity compounding — hold through volatility and rebalance about once a year.',
    })
    if (cat.metals.length) add({
      name: 'Gold & Metals', type: 'hold',
      categories: ['metals'], linkedAssets: cat.metals,
      notes: 'Inflation hedge and ballast that steadies the portfolio when risk assets fall.',
    })

    // Generic starter plan when the user has no holdings to link yet.
    if (generated.length === 0 && buckets.length === 0) {
      add({ name: 'Emergency Fund', type: 'emergency', targetPct: 10, categories: ['cash', 'stablecoins'], notes: '3–6 months of expenses kept liquid.' })
      add({ name: 'Growth Fund', type: 'invest', targetPct: 40, categories: ['crypto', 'stocks', 'metals'], notes: 'Your long-term wealth engine — where most compounding happens.' })
      add({ name: 'Long-term Hold', type: 'hold', categories: ['crypto', 'stocks'], notes: "Core positions you won't touch for years." })
    }

    if (!hasRest) add({ name: 'Everything Else', type: 'rest', isRest: true, notes: 'Anything not yet assigned to a plan above shows up here automatically.' })

    if (!generated.length) return
    save([...buckets, ...generated])
    track('vision_autogen', { created: generated.length, had: buckets.length })
  }

  const totalMonthly = buckets.reduce((s, b) => s + (b.monthlyWithdrawal || 0), 0)
  const totalRunwayMonths = totalMonthly > 0 ? Math.floor(totalNW / totalMonthly) : null

  // Monthly cash-flow plan across all buckets
  const monthlyIn  = buckets.reduce((s, b) => s + (b.monthlyContribution || 0), 0)
  const monthlyOut = totalMonthly
  const monthlyNet = monthlyIn - monthlyOut

  function bucketTarget(b) {
    if (b.isRest) return null
    if (b.targetPct != null) return effectiveNW * b.targetPct / 100
    return b.targetAmount ?? null
  }

  async function requestAdvice() {
    setAdviceLoading(true)
    setAdviceError(false)
    track('vision_ai_advice')

    // Asset-class mix (rounded, no raw transactions leave the device)
    const catMap = {}
    let catTotal = 0
    for (const h of holdings) {
      const v = holdingValue(prices, h)
      const c = holdingCategory(h)
      catMap[c] = (catMap[c] || 0) + v
      catTotal += v
    }
    const categories = Object.entries(catMap)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ name: CATEGORIES[k]?.label || k, value: Math.round(v), pct: pct(v, catTotal) }))

    const payload = {
      netWorth: Math.round(totalNW),
      currency: 'USD',
      categories,
      monthly: { in: Math.round(monthlyIn), out: Math.round(monthlyOut), net: Math.round(monthlyNet) },
      buckets: buckets.map(b => {
        const cv = bucketCurrentValue(b)
        return {
          name: b.name || BUCKET_TYPES[b.type]?.label,
          type: b.type,
          current: Math.round(cv),
          target: bucketTarget(b) != null ? Math.round(bucketTarget(b)) : null,
          targetMonths: b.targetMonths || null,
          monthlyContribution: b.monthlyContribution || null,
          monthlyWithdrawal: b.monthlyWithdrawal || null,
          categories: (b.categories || []).map(k => CATEGORIES[k]?.label || k),
          pctOfNW: pct(cv, effectiveNW),
        }
      }),
    }

    const result = await getVisionAdvice(payload)
    if (result) setAdvice(result)
    else setAdviceError(true)
    setAdviceLoading(false)
  }

  return (
    <div className="page vp-page">
      <div className="vp-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div className="vp-header-text">
          <h1 style={{ display:'inline-flex', alignItems:'center', gap:'0.4rem' }}><Icon name="map" size={22} />Goals</h1>
          <p>Plan every dollar — buckets, goals, and withdrawal runway in one view.</p>
        </div>
        <div className="vp-header-actions">
          {buckets.length > 0 && (
            <button className="vp-autogen-btn" onClick={autoGeneratePlan} title="Fill in any missing buckets from your portfolio">
              <Icon name="sparkles" size={14} style={{ verticalAlign: '-2px', marginRight: '0.35em' }} />
              Auto-plan
            </button>
          )}
          <button className="vp-export-btn" onClick={() => window.print()} title="Export / Print plan">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Export PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="vp-loading">Loading portfolio…</div>
      ) : (
        <>
          {/* ── Summary bar ── */}
          <div className="vp-summary">
            <div className="vp-stat">
              <span className="vp-stat-label">Total Net Worth</span>
              <span className="vp-stat-val">{fmt(totalNW)}</span>
            </div>
            <div className="vp-stat">
              <span className="vp-stat-label">Allocated</span>
              <span className="vp-stat-val">{fmt(allocatedValue)}</span>
            </div>
            <div className="vp-stat">
              <span className="vp-stat-label">Unallocated</span>
              <span className="vp-stat-val" style={{ color: restValue < 0 ? '#ef4444' : undefined }}>{fmt(restValue)}</span>
            </div>
            {totalRunwayMonths != null && (
              <div className="vp-stat">
                <span className="vp-stat-label">Total Runway</span>
                <span className="vp-stat-val">{Math.floor(totalRunwayMonths / 12)}y {totalRunwayMonths % 12}m</span>
              </div>
            )}
          </div>

          {/* ── Monthly plan ── */}
          {(monthlyIn > 0 || monthlyOut > 0) && (
            <div className="vp-summary vp-summary-monthly">
              <div className="vp-stat">
                <span className="vp-stat-label">Monthly In</span>
                <span className="vp-stat-val" style={{ color: '#10b981' }}>+{fmt(monthlyIn)}</span>
              </div>
              <div className="vp-stat">
                <span className="vp-stat-label">Monthly Out</span>
                <span className="vp-stat-val" style={{ color: monthlyOut > 0 ? '#ef4444' : undefined }}>{monthlyOut > 0 ? '−' : ''}{fmt(monthlyOut)}</span>
              </div>
              <div className="vp-stat">
                <span className="vp-stat-label">Net / Month</span>
                <span className="vp-stat-val" style={{ color: monthlyNet >= 0 ? '#10b981' : '#ef4444' }}>{monthlyNet >= 0 ? '+' : '−'}{fmt(Math.abs(monthlyNet))}</span>
              </div>
              <div className="vp-stat">
                <span className="vp-stat-label">Net / Year</span>
                <span className="vp-stat-val" style={{ color: monthlyNet >= 0 ? '#10b981' : '#ef4444' }}>{monthlyNet >= 0 ? '+' : '−'}{fmt(Math.abs(monthlyNet) * 12)}</span>
              </div>
            </div>
          )}

          {/* ── How it works explainer ── */}
          <VisionExplainer />

          {/* ── Category breakdown ── */}
          {holdings.length > 0 && <CategoryBreakdown holdings={holdings} prices={prices} />}

          {/* ── Chart + buckets ── */}
          {buckets.length === 0 ? (
            <div className="vp-empty">
              <div className="vp-empty-icon"><Icon name="map" size={30} /></div>
              <h2>Build your plan in one tap</h2>
              <p>Buckets split your net worth into purposes — an emergency fund, long-term growth, a house deposit — so you can see if every dollar is pulling its weight.</p>
              {holdings.length > 0 && (
                <p className="vp-empty-tip">
                  You have {holdings.length} holding{holdings.length !== 1 ? 's' : ''} worth {fmt(totalNW)}. Auto-generate a starter plan grouped by what you actually own, then fine-tune it.
                </p>
              )}
              <div className="vp-empty-actions">
                <button className="vp-btn-primary vp-autogen-primary" onClick={autoGeneratePlan}>
                  <Icon name="sparkles" size={15} style={{ verticalAlign: '-2px', marginRight: '0.4em' }} />
                  Auto-generate my plan
                </button>
                <button className="vp-btn-ghost vp-add-first" onClick={() => setEditTarget('new')}>
                  + Add manually
                </button>
              </div>
            </div>
          ) : (
            <>
              <h3 className="vp-section-title">Your Buckets</h3>
              <div className="vp-layout">
                <div className="vp-chart-col">
                  <DonutChart slices={donutSlices} total={totalAllocated || 1} />
                  <div className="vp-legend">
                    {buckets.map(b => (
                      <div key={b.id} className="vp-legend-row">
                        <span className="vp-legend-dot" style={{ background: b.color }} />
                        <span className="vp-legend-name">{b.name || BUCKET_TYPES[b.type]?.label}</span>
                        <span className="vp-legend-pct">{pct(bucketCurrentValue(b), effectiveNW)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="vp-cards-col">
                  {buckets.map((b, idx) => (
                    <div
                      key={b.id}
                      draggable
                      onDragStart={() => setDragging(idx)}
                      onDragOver={e => { e.preventDefault(); setDragOver(idx) }}
                      onDrop={() => {
                        if (dragging == null || dragging === idx) return
                        const next = [...buckets]
                        const [item] = next.splice(dragging, 1)
                        next.splice(idx, 0, item)
                        save(next)
                        setDragging(null)
                        setDragOver(null)
                      }}
                      onDragEnd={() => { setDragging(null); setDragOver(null) }}
                      className={`vp-drag-wrap${dragOver === idx && dragging !== idx ? ' vp-drag-over' : ''}`}
                      style={{ opacity: dragging === idx ? 0.4 : 1 }}
                    >
                      <BucketCard key={b.id} bucket={b}
                        currentValue={bucketCurrentValue(b)}
                        totalNW={effectiveNW}
                        holdings={holdings}
                        prices={prices}
                        onEdit={setEditTarget}
                        onDelete={setDeleteId}
                        onToggleComplete={handleToggleComplete}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <button className="vp-btn-add" onClick={() => setEditTarget('new')}>
            + Add Bucket
          </button>

          {/* ── Advisor ── */}
          {buckets.length > 0 && (
            <div className="vp-ai">
              <div className="vp-ai-head">
                <h3 className="vp-ai-title"><Icon name="sparkles" size={15} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Plan Advisor</h3>
                <button className="vp-ai-btn" onClick={requestAdvice} disabled={adviceLoading}>
                  {adviceLoading ? 'Analyzing…' : advice ? 'Refresh advice' : 'Get AI advice'}
                </button>
              </div>

              {!advice && !adviceLoading && !adviceError && (
                <p className="vp-ai-empty">Get personalized advice on your goals, diversification, emergency cover, and funding pace — based on your actual buckets and asset mix.</p>
              )}
              {adviceError && (
                <p className="vp-ai-empty vp-ai-err">Couldn't reach the advisor right now. Please try again in a moment.</p>
              )}

              {advice && (
                <div className="vp-ai-body">
                  {advice.headline && (
                    <div className="vp-ai-headline">
                      {advice.score != null && (
                        <span className="vp-ai-score" style={{ '--s': advice.score, color: advice.score >= 70 ? '#10b981' : advice.score >= 40 ? '#f59e0b' : '#ef4444' }}>
                          {advice.score}<small>/100</small>
                        </span>
                      )}
                      <span className="vp-ai-headline-text">{advice.headline}</span>
                    </div>
                  )}

                  {advice.insights.length > 0 && (
                    <div className="vp-ai-insights">
                      {advice.insights.map((ins, i) => (
                        <div key={i} className={`vp-ai-insight vp-ai-${ins.level}`}>
                          <span className="vp-ai-ins-dot" />
                          <div>
                            {ins.title && <strong>{ins.title}</strong>}
                            {ins.detail && <span>{ins.detail}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {advice.actions.length > 0 && (
                    <div className="vp-ai-actions">
                      <span className="vp-ai-actions-label">Next steps</span>
                      <ol>
                        {advice.actions.map((a, i) => <li key={i}>{a}</li>)}
                      </ol>
                    </div>
                  )}

                  <p className="vp-ai-disclaimer">AI-generated education, not individualized financial advice.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modal ── */}
      {editTarget && (
        <BucketModal
          bucket={editTarget === 'new' ? {} : editTarget}
          holdings={holdings}
          prices={prices}
          totalNW={totalNW}
          onSave={handleSaveBucket}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div className="vp-modal-backdrop" onClick={() => setDeleteId(null)}>
          <div className="vp-modal vp-modal-sm" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px' }}>Delete bucket?</h3>
            <p style={{ opacity: .7, margin: '0 0 20px' }}>This cannot be undone. Assets will not be deleted.</p>
            <div className="vp-modal-foot">
              <button className="vp-btn-ghost" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="vp-btn-danger" onClick={() => handleDelete(deleteId)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
