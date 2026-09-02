import { memo } from 'react'
import { categorizeAsset, CATEGORY_COLOR, getAssetCategoryBadge } from '../data/assets'
import { isStablecoin } from '../stablecoins'
import { bindLongPress, consumeLongPress } from './LongPressMenu'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import CoinLogo from './CoinLogo'
import Icon from './Icon'

const pct = n => { const v = Number(n); if (!isFinite(v)) return '0.00%'; return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` }

// One row in the portfolio holdings list. Memoized so a Dashboard re-render
// (a modal opening, a tour step, an unrelated tab change) doesn't force every
// holding to reconcile — only rows whose own props actually changed re-render.
function HoldingRow({
  h, isDupTicker, isDemo, pricesFailed, showBreakEven,
  isSelected, hasSelection, isActionsOpen,
  cv, navigate, showLp, onToggleSelect, onToggleActions,
}) {
  const { t } = useLanguage()
  const displayValue  = h.value > 0 ? h.value : h.total_invested
  const isStable      = categorizeAsset(h) === 'cash' || isStablecoin(h.coin_id, h.coin_symbol)
  const isCryptoOnly  = !isStable && categorizeAsset(h) === 'crypto'
  const hasPnl        = h.pnl !== 0 && !pricesFailed && !isStable
  const breakEvenPrice = h.amount > 0 ? h.total_invested / h.amount : 0
  const beDistance     = h.price > 0 && breakEvenPrice > 0
    ? ((h.price - breakEvenPrice) / breakEvenPrice) * 100 : 0
  const bePct = h.price > 0 && breakEvenPrice > 0
    ? Math.min(100, (h.price / breakEvenPrice) * 100) : 0
  const isDimmed = hasSelection && !isSelected
  const holdingLpItems = isDemo ? [] : [
    { icon: '📊', label: 'Technical Analysis', onClick: () => navigate('/technicals') },
    { icon: '🎯', label: 'Set Sell Target', onClick: () => navigate('/dashboard', { state: { tab: 'targets' } }) },
    { icon: '🔔', label: 'Set Price Alert', onClick: () => navigate('/dashboard', { state: { tab: 'alerts' } }) },
    { icon: '📈', label: 'Portfolio Analysis', onClick: () => navigate('/dashboard', { state: { tab: 'tools', tool: 'ai' } }) },
    { divider: true },
    { icon: '📋', label: 'Copy Details', onClick: () => { try { navigator.clipboard?.writeText(h.coin_symbol?.toUpperCase() + ' — ' + cv(h.value) + ' (' + pct(h.pnlPct) + ' P&L)'); } catch {} } },
  ]

  return (
    <li key={h.coin_id} className={`dvx-holding holo-card-v2${isSelected ? ' selected' : ''}`}
      style={{ opacity: isDimmed ? 0.3 : 1, transition: 'opacity 0.15s', '--row-col': CATEGORY_COLOR[categorizeAsset(h)] || 'var(--g)' }}
      {...(holdingLpItems.length ? bindLongPress((x, y) => showLp(x, y, holdingLpItems)) : {})}
      onClick={() => { if (consumeLongPress()) return; if (!isDemo) { track('asset_click'); navigate(`/asset/${encodeURIComponent(h.coin_id)}`) } }}>
      <input
        type="checkbox"
        checked={isSelected}
        onClick={e => e.stopPropagation()}
        onChange={() => onToggleSelect(h.coin_id)}
        style={{ flexShrink:0, width:'16px', height:'16px', marginRight:'0.5rem', cursor:'pointer', accentColor:'var(--g)' }}
      />
      <CoinLogo image={h.coin_image} symbol={h.coin_symbol} coinId={h.coin_id} size={36} className="dvx-holding-icon" />
      <div className="dvx-holding-body">
        <div className="dvx-holding-line1">
          <div className="dvx-holding-meta">
            <strong>{h.coin_symbol?.toUpperCase()}</strong>
            {isStable && <span className="dvx-stable-badge">{t('dsStable')}</span>}
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
            {t('dsBreakEvenAt')} <span style={{ color: beDistance >= 0 ? 'var(--g-ink)' : '#f87171', fontWeight:700 }}>
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
              return <span className="dvx-hstat"><em>{t('wtPrice')}</em><b style={{ color: priceColor }}>{cv(h.price)}</b></span>
            })() : <span className="dvx-hstat"><em>{t('invested')}</em><b>{cv(h.total_invested)}</b></span>}
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
      {!isDemo && (<>
        <button
          className={`dvx-ha-toggle${isActionsOpen ? ' open' : ''}`}
          aria-label={t('atAssetActions')} title={t('atActions')}
          aria-expanded={isActionsOpen}
          onClick={e => { e.stopPropagation(); onToggleActions(h.coin_id) }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
        </button>
        <div className={`dvx-holding-actions${isActionsOpen ? ' open' : ''}`} onClick={e => e.stopPropagation()}>
          {!isStable && (
            <button className="dvx-ha-btn"
              onClick={() => navigate('/dashboard', { state: { tab: 'targets' } })}>
              <Icon name="target" size={13} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />{t('dsSetTarget')}
            </button>
          )}
          <button className="dvx-ha-btn"
            onClick={() => navigate('/vision', { state: { linkAsset: h.coin_id } })}>
            <Icon name="map" size={13} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />{t('dsSetVision')}
          </button>
          {isCryptoOnly && (
            <button className="dvx-ha-btn"
              onClick={() => navigate('/technicals')}>
              <Icon name="ruler" size={13} style={{ verticalAlign:'-2px', marginInlineEnd:'0.4em' }} />{t('dashTechnicals')}
            </button>
          )}
          {isCryptoOnly && (
            <button className="dvx-ha-btn"
              onClick={() => navigate('/dashboard', { state: { tab: 'tools', tool: 'ta' } })}>
              <Icon name="sparkles" size={13} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />{t('dsMagicScore')}
            </button>
          )}
          {!isStable && (
            <button className="dvx-ha-btn"
              onClick={() => navigate('/dashboard', { state: { tab: 'tools', tool: 'risk' } })}>
              <Icon name="search" size={13} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />{t('dsRiskScan')}
            </button>
          )}
        </div>
      </>)}
    </li>
  )
}

export default memo(HoldingRow)
