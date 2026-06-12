import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'
import { BUCKET_TYPES, BUCKET_COLORS, loadBuckets, saveBuckets, newBucket } from '../data/visionStorage'
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
function holdingCategory(h) {
  const c = (h?.category || '').toLowerCase()
  if (c.includes('stock')) return 'stocks'
  if (c.includes('metal')) return 'metals'
  if (c.includes('real'))  return 'real_estate'
  if (c.includes('cash') || c.includes('fiat')) return 'cash'
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
  crypto:      { label: 'Crypto',      icon: '₿',  color: '#f7931a' },
  stocks:      { label: 'Stocks',      icon: '📊', color: '#0ea5e9' },
  metals:      { label: 'Metals',      icon: '🥇', color: '#f59e0b' },
  cash:        { label: 'Cash',        icon: '💵', color: '#10b981' },
  real_estate: { label: 'Real Estate', icon: '🏠', color: '#8b5cf6' },
}

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
  const hasPlan = bucket.linkedAssets?.length || bucket.manualAmount > 0 ||
    bucket.categories?.length || bucket.monthlyContribution > 0
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

  // Monthly contribution → time-to-goal projection
  const target = bucket.isRest ? null
    : bucket.targetPct != null ? (totalNW * bucket.targetPct / 100)
    : bucket.targetAmount
  if (bucket.monthlyContribution > 0) {
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
                {CATEGORIES[s.key]?.icon} {CATEGORIES[s.key]?.label || s.key}
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
function BucketCard({ bucket, currentValue, totalNW, holdings, prices, onEdit, onDelete }) {
  const type = BUCKET_TYPES[bucket.type] || BUCKET_TYPES.hold
  const target = bucket.isRest
    ? (totalNW - currentValue)
    : bucket.targetPct != null
    ? (totalNW * bucket.targetPct / 100)
    : bucket.targetAmount

  const progress = pct(currentValue, target)
  const nwShare = pct(currentValue, totalNW)

  // ETA to target from monthly contribution (goal-progress projection)
  const eta = etaLabel(monthsToTarget(currentValue, target, bucket.monthlyContribution))

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
    <div className="vp-card" style={{ borderLeft: `3px solid ${bucket.color}` }}>
      <div className="vp-card-head">
        <span className="vp-type-icon">{type.icon}</span>
        <div className="vp-card-title">
          <strong>{bucket.name || type.label}</strong>
          <span className="vp-type-label">{type.label}</span>
        </div>
        <div className="vp-card-actions">
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
              {c.icon} {c.label} {c.pct}%
            </span>
          ))}
        </div>
      ) : plannedCats.length > 0 && (
        <div className="vp-cat-badges">
          {plannedCats.map(k => (
            <span key={k} className="vp-cat-badge vp-cat-badge-planned" style={{ borderColor: CATEGORIES[k]?.color, color: CATEGORIES[k]?.color }}>
              {CATEGORIES[k]?.icon} {CATEGORIES[k]?.label || k}
            </span>
          ))}
        </div>
      )}

      {bucket.notes && <p className="vp-notes">{bucket.notes}</p>}

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
          <button className="vp-btn-icon" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="vp-modal-body">
          <label className="vp-field">
            <span>Name</span>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder={BUCKET_TYPES[form.type]?.label} className="vp-input" />
          </label>

          <label className="vp-field">
            <span>Type</span>
            <select value={form.type} onChange={e => set('type', e.target.value)} className="vp-input">
              {Object.entries(BUCKET_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label} — {v.desc}</option>
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
                  {v.icon} {v.label}
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
                        {CATEGORIES[cat]?.icon} {CATEGORIES[cat]?.label || cat}
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
                        {CATEGORIES[cat]?.icon} {CATEGORIES[cat]?.label || cat}
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
export default function Vision() {
  const navigate = useNavigate()
  const [buckets, setBuckets] = useState(loadBuckets)
  const [holdings, setHoldings] = useState([])
  const [prices, setPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => { track('vision_view') }, [])

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

  const totalMonthly = buckets.reduce((s, b) => s + (b.monthlyWithdrawal || 0), 0)
  const totalRunwayMonths = totalMonthly > 0 ? Math.floor(totalNW / totalMonthly) : null

  // Monthly cash-flow plan across all buckets
  const monthlyIn  = buckets.reduce((s, b) => s + (b.monthlyContribution || 0), 0)
  const monthlyOut = totalMonthly
  const monthlyNet = monthlyIn - monthlyOut

  return (
    <div className="page vp-page">
      <div className="vp-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div className="vp-header-text">
          <h1>🗺️ Portfolio Vision</h1>
          <p>Plan every dollar — buckets, goals, and withdrawal runway in one view.</p>
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

          {/* ── Category breakdown ── */}
          {holdings.length > 0 && <CategoryBreakdown holdings={holdings} prices={prices} />}

          {/* ── Chart + buckets ── */}
          {buckets.length === 0 ? (
            <div className="vp-empty">
              <div className="vp-empty-icon">🗂️</div>
              <h2>No buckets yet</h2>
              <p>Create your first bucket to start planning your portfolio vision.</p>
              <button className="vp-btn-primary vp-add-first" onClick={() => setEditTarget('new')}>
                + Add First Bucket
              </button>
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
                  {buckets.map(b => (
                    <BucketCard key={b.id} bucket={b}
                      currentValue={bucketCurrentValue(b)}
                      totalNW={effectiveNW}
                      holdings={holdings}
                      prices={prices}
                      onEdit={setEditTarget}
                      onDelete={setDeleteId}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <button className="vp-btn-add" onClick={() => setEditTarget('new')}>
            + Add Bucket
          </button>
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
