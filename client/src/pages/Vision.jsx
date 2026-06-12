import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'
import { BUCKET_TYPES, BUCKET_COLORS, loadBuckets, saveBuckets, newBucket } from '../data/visionStorage'
import { track } from '../analytics'

const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtSmall = (n) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
const pct = (a, b) => b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0

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
    <svg viewBox={`0 0 ${cx * 2} ${cy * 2}`} width="160" height="160" aria-hidden="true">
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

// ── Bucket card ───────────────────────────────────────────────────────
function BucketCard({ bucket, currentValue, totalNW, onEdit, onDelete }) {
  const type = BUCKET_TYPES[bucket.type] || BUCKET_TYPES.hold
  const target = bucket.isRest
    ? (totalNW - currentValue)   // rest = unallocated
    : bucket.targetPct != null
    ? (totalNW * bucket.targetPct / 100)
    : bucket.targetAmount

  const progress = pct(currentValue, target)
  const nwShare = pct(currentValue, totalNW)

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
        <span className="vp-nwshare">{nwShare}% of NW</span>
        <Runway value={currentValue} monthly={bucket.monthlyWithdrawal} />
      </div>

      {target != null && target > 0 && (
        <div className="vp-bar-wrap">
          <div className="vp-bar" style={{ width: `${progress}%`, background: bucket.color }} />
          <span className="vp-bar-pct">{progress}%</span>
        </div>
      )}

      {bucket.notes && <p className="vp-notes">{bucket.notes}</p>}
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
    linkedAssets: bucket.linkedAssets || [],
    notes: bucket.notes || '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleAsset = (id) => set('linkedAssets', form.linkedAssets.includes(id) ? form.linkedAssets.filter(x => x !== id) : [...form.linkedAssets, id])

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

          <label className="vp-field">
            <span>Monthly Withdrawal <span style={{ opacity: .5, fontWeight: 400 }}>(optional, for runway)</span></span>
            <input type="number" min="0" value={form.monthlyWithdrawal} onChange={e => set('monthlyWithdrawal', e.target.value)}
              placeholder="e.g. 500" className="vp-input" />
          </label>

          {holdings.length > 0 && (
            <div className="vp-field">
              <span>Link assets <span style={{ opacity: .5, fontWeight: 400 }}>(for live current value)</span></span>
              <div className="vp-assets-list">
                {holdings.map(h => {
                  const px = prices[h.coin_id]?.usd || 0
                  const val = h.amount * px
                  return (
                    <label key={h.coin_id} className="vp-asset-check">
                      <input type="checkbox" checked={form.linkedAssets.includes(h.coin_id)} onChange={() => toggleAsset(h.coin_id)} />
                      <span>{h.symbol?.toUpperCase() || h.name}</span>
                      <span style={{ marginInlineStart: 'auto', opacity: .6, fontSize: '.78rem' }}>{fmtSmall(val)}</span>
                    </label>
                  )
                })}
              </div>
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
  const [editTarget, setEditTarget] = useState(null)  // null | 'new' | bucket object
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

  const totalNW = holdings.reduce((s, h) => {
    const px = prices[h.coin_id]?.usd || 0
    return s + (h.amount || 0) * px
  }, 0)

  const getBucketValue = useCallback((bucket) => {
    if (!bucket.linkedAssets?.length) return null
    return bucket.linkedAssets.reduce((s, id) => {
      const h = holdings.find(x => x.coin_id === id)
      const px = prices[id]?.usd || 0
      return s + (h ? (h.amount || 0) * px : 0)
    }, 0)
  }, [holdings, prices])

  const allocatedValue = buckets
    .filter(b => !b.isRest)
    .reduce((s, b) => s + (getBucketValue(b) || 0), 0)

  const restValue = totalNW - allocatedValue

  function bucketCurrentValue(b) {
    if (b.isRest) return restValue >= 0 ? restValue : 0
    const linked = getBucketValue(b)
    return linked != null ? linked : 0
  }

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
            <div className="vp-layout">
              <div className="vp-chart-col">
                <DonutChart slices={donutSlices} total={totalAllocated || 1} />
                <div className="vp-legend">
                  {buckets.map(b => (
                    <div key={b.id} className="vp-legend-row">
                      <span className="vp-legend-dot" style={{ background: b.color }} />
                      <span className="vp-legend-name">{b.name || BUCKET_TYPES[b.type]?.label}</span>
                      <span className="vp-legend-pct">{pct(bucketCurrentValue(b), totalNW)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="vp-cards-col">
                {buckets.map(b => (
                  <BucketCard key={b.id} bucket={b}
                    currentValue={bucketCurrentValue(b)}
                    totalNW={totalNW}
                    onEdit={setEditTarget}
                    onDelete={setDeleteId}
                  />
                ))}
              </div>
            </div>
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
