import { useMemo, useState, useEffect, useRef, memo } from 'react'
import { useLanguage } from '../LanguageContext'
import Icon from './Icon'
import { assetClass, categorizeAsset } from '../data/assets'

const CAT_COLORS = {
  crypto: '#00c9a7',
  metals: '#e8b825',
  stocks: '#3b82f6',
  realestate: '#a78bfa',
  cash:   '#64748b',
}

function pctColor(pct) {
  if (pct == null || !isFinite(pct)) return 'var(--surface-2)'
  if (pct > 8)   return '#16a34a'
  if (pct > 3)   return '#22c55e'
  if (pct > 0.5) return '#86efac'
  if (pct > -0.5)return '#94a3b8'
  if (pct > -3)  return '#fdba74'
  if (pct > -8)  return '#fb923c'
  return '#ef4444'
}

function pctBg(pct) {
  if (pct == null || !isFinite(pct)) return 'var(--surface-2)'
  if (pct > 8)   return '#16a34a22'
  if (pct > 3)   return '#22c55e1a'
  if (pct > 0.5) return '#86efac15'
  if (pct > -0.5)return '#94a3b818'
  if (pct > -3)  return '#fdba7418'
  if (pct > -8)  return '#fb923c18'
  return '#ef444418'
}

/**
 * Squarified treemap layout — sizes each tile proportional to its value.
 * Returns array of { x, y, w, h } in a 0..1 normalised space.
 */
function squarify(items, x, y, w, h) {
  if (!items.length) return []
  const total = items.reduce((s, it) => s + it.value, 0)
  if (total <= 0) return items.map(() => ({ x, y, w, h: 0 }))

  const result = []
  let remaining = [...items]
  let cx = x, cy = y, cw = w, ch = h

  while (remaining.length > 0) {
    const remTotal = remaining.reduce((s, it) => s + it.value, 0)
    const isWide = cw >= ch
    const side = isWide ? ch : cw

    let row = [remaining[0]]
    let rowArea = (remaining[0].value / remTotal) * cw * ch

    function worstRatio(rowItems, rowArea_) {
      const rowLen = rowArea_ / side
      let worst = 0
      let acc = 0
      for (const it of rowItems) {
        const frac = it.value / remTotal
        const itemLen = (frac * cw * ch) / rowLen
        const r = Math.max(rowLen / itemLen, itemLen / rowLen)
        if (r > worst) worst = r
      }
      return worst
    }

    for (let i = 1; i < remaining.length; i++) {
      const newRow = [...row, remaining[i]]
      const newArea = rowArea + (remaining[i].value / remTotal) * cw * ch
      if (worstRatio(newRow, newArea) <= worstRatio(row, rowArea)) {
        row = newRow
        rowArea = newArea
      } else {
        break
      }
    }

    const rowFrac = row.reduce((s, it) => s + it.value, 0) / remTotal
    const rowLen = rowArea / side

    let offset = 0
    for (const it of row) {
      const frac = it.value / remTotal
      const itemLen = (frac * cw * ch) / rowLen
      if (isWide) {
        result.push({ ...it, x: cx, y: cy + offset, w: rowLen, h: itemLen })
      } else {
        result.push({ ...it, x: cx + offset, y: cy, w: itemLen, h: rowLen })
      }
      offset += itemLen
    }

    if (isWide) {
      cx += rowLen
      cw -= rowLen
    } else {
      cy += rowLen
      ch -= rowLen
    }
    remaining = remaining.filter(it => !row.includes(it))
  }

  return result
}

function formatVal(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

function PortfolioHeatmap({ enriched, prices, totalValue }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(true)
  const [hovered, setHovered] = useState(null)
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ w: 340, h: 260 })

  useEffect(() => {
    if (!open || !containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width
        if (w > 0) setDims({ w, h: Math.max(220, Math.min(w * 0.72, 340)) })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const tiles = useMemo(() => {
    if (!enriched?.length || !totalValue) return []
    const items = enriched.map(h => {
      const chg = prices?.[h.coin_id]?.usd_24h_change ?? null
      const cat = categorizeAsset(h)
      return {
        coin_id:   h.coin_id,
        symbol:    (h.coin_symbol || '').toUpperCase(),
        name:      h.coin_name || h.coin_symbol || '',
        value:     h.value || 0,
        price:     h.price || 0,
        change:    chg,
        category:  cat,
        invested:  h.total_invested || 0,
        pnl:       h.pnl || 0,
      }
    }).filter(it => it.value > 0)
      .sort((a, b) => b.value - a.value)

    const laid = squarify(items, 0, 0, 1, 1)
    return laid
  }, [enriched, prices, totalValue])

  const upCount   = tiles.filter(t => (t.change ?? 0) > 0.5).length
  const downCount = tiles.filter(t => (t.change ?? 0) < -0.5).length

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--border)',
      borderRadius: '1rem',
      overflow: 'hidden',
      marginTop: '1rem',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1.1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5em' }}>
          <Icon name="grid" size={16} style={{ color: 'var(--g)' }} />
          Portfolio Heatmap
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 1.1rem 1.1rem' }}>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span style={{ color: '#22c55e' }}>
              <Icon name="trend-up" size={12} style={{ verticalAlign: '-1px', marginRight: '0.25em' }} />
              {upCount} up
            </span>
            <span style={{ color: '#ef4444' }}>
              <Icon name="trend-down" size={12} style={{ verticalAlign: '-1px', marginRight: '0.25em' }} />
              {downCount} down
            </span>
            <span>{tiles.length} assets</span>
          </div>

          {/* Treemap */}
          <div
            ref={containerRef}
            style={{
              position: 'relative',
              width: '100%',
              height: dims.h,
              borderRadius: '0.75rem',
              overflow: 'hidden',
              background: 'var(--surface-2)',
            }}
          >
            {tiles.map((tile, i) => {
              const left   = tile.x * dims.w
              const top    = tile.y * dims.h
              const width  = tile.w * dims.w
              const height = tile.h * dims.h
              const color  = pctColor(tile.change)
              const bg     = pctBg(tile.change)
              const isHovered = hovered === i
              const showLabel = width > 48 && height > 30
              const showPct   = width > 60 && height > 42
              const showName  = width > 80 && height > 55
              const sign = tile.change != null && tile.change >= 0 ? '+' : ''

              return (
                <div
                  key={tile.coin_id + '-' + i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    position: 'absolute',
                    left, top, width, height,
                    background: bg,
                    border: `1.5px solid ${isHovered ? color : color + '55'}`,
                    borderRadius: '0.4rem',
                    cursor: 'pointer',
                    transition: 'all 0.4s cubic-bezier(.4,0,.2,1)',
                    transform: isHovered ? 'scale(1.03)' : 'scale(1)',
                    zIndex: isHovered ? 10 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.25rem',
                    overflow: 'hidden',
                    boxShadow: isHovered ? `0 4px 16px ${color}33` : 'none',
                  }}
                >
                  {showLabel && (
                    <div style={{
                      fontWeight: 700,
                      fontSize: width > 100 ? '0.85rem' : '0.72rem',
                      color,
                      lineHeight: 1.1,
                      textAlign: 'center',
                      letterSpacing: '0.02em',
                      transition: 'color 0.3s',
                    }}>
                      {tile.symbol}
                    </div>
                  )}
                  {showPct && (
                    <div style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color,
                      marginTop: '0.15rem',
                      opacity: 0.85,
                    }}>
                      {sign}{tile.change != null ? tile.change.toFixed(1) : '—'}%
                    </div>
                  )}
                  {showName && (
                    <div style={{
                      fontSize: '0.58rem',
                      color: 'var(--text-muted)',
                      marginTop: '0.1rem',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}>
                      {formatVal(tile.value)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Hover tooltip */}
          {hovered != null && tiles[hovered] && (
            <div style={{
              marginTop: '0.6rem',
              padding: '0.65rem 0.85rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '0.6rem',
              fontSize: '0.78rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.6rem 1.2rem',
              alignItems: 'center',
              animation: 'fadeIn 0.15s ease',
            }}>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.85rem' }}>
                {tiles[hovered].symbol}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                ${tiles[hovered].price.toLocaleString(undefined, { maximumFractionDigits: tiles[hovered].price < 1 ? 4 : 2 })}
              </span>
              <span style={{ color: pctColor(tiles[hovered].change), fontWeight: 600 }}>
                {tiles[hovered].change != null ? `${tiles[hovered].change >= 0 ? '+' : ''}${tiles[hovered].change.toFixed(2)}%` : '—'}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                Value: {formatVal(tiles[hovered].value)}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                {tiles[hovered].pnl >= 0 ? '+' : ''}{formatVal(tiles[hovered].pnl)} P&L
              </span>
              <span style={{
                fontSize: '0.65rem',
                padding: '0.15rem 0.45rem',
                borderRadius: '0.3rem',
                background: (CAT_COLORS[tiles[hovered].category] || '#666') + '22',
                color: CAT_COLORS[tiles[hovered].category] || '#666',
                fontWeight: 600,
              }}>
                {tiles[hovered].category}
              </span>
            </div>
          )}

          {/* Category legend */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.6rem',
            marginTop: '0.65rem', fontSize: '0.7rem', color: 'var(--text-muted)',
          }}>
            {Object.entries(CAT_COLORS).map(([cat, col]) => {
              const has = tiles.some(t => t.category === cat)
              if (!has) return null
              return (
                <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.3em' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: col, display: 'inline-block' }} />
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(PortfolioHeatmap)
