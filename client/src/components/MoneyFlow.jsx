import { useLanguage } from '../LanguageContext'
import {
  useMoneyFlow, flowFor, flowStatus, FLOW_TONE, FLOW_LABEL_KEY, fmtUsdShort,
} from '../moneyFlow'
import './MoneyFlow.css'

// Smart money flow, as a badge on a holding row and as a card on the asset
// page and in Technical Analysis. Both read the one shared hourly index, so a
// portfolio of twenty coins is still one request.

function FlowGlyph({ tone, size = 11 }) {
  if (tone === 'flat') {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  // Two stacked chevrons: money moving, not a price arrow.
  const d = tone === 'up' ? 'M3 7.5 6 4.5l3 3M3 10.5 6 7.5l3 3' : 'M3 1.5 6 4.5l3-3M3 4.5 6 7.5l3-3'
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="mf-glyph">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A compact pill beside a holding. Renders nothing for an untracked token. */
export function MoneyFlowBadge({ symbol }) {
  const { t } = useLanguage()
  const index = useMoneyFlow()
  const f = flowFor(index, symbol)
  const status = flowStatus(f)
  if (!status) return null
  const tone = FLOW_TONE[status]
  return (
    <span
      className={`mf-badge mf-${tone}${status.startsWith('strong') ? ' mf-strong' : ''}`}
      title={`${t('mfTitle')} · 24h ${fmtUsdShort(f.netflow, true)}`}
      aria-label={`${t('mfTitle')}: ${t(FLOW_LABEL_KEY[status])} ${fmtUsdShort(f.netflow, true)}`}
    >
      <FlowGlyph tone={tone} size={10} />
      {tone === 'flat' ? t('mfFlat') : fmtUsdShort(f.netflow)}
    </span>
  )
}

function FlowBar({ label, value, max }) {
  const ok = Number.isFinite(value)
  const pct = ok && max > 0 ? Math.min(50, (Math.abs(value) / max) * 50) : 0
  const tone = !ok || value === 0 ? 'flat' : value > 0 ? 'up' : 'dn'
  return (
    <div className={`mf-row mf-${tone}`}>
      <span className="mf-row-lbl">{label}</span>
      <span className="mf-track" aria-hidden="true">
        <span className="mf-axis" />
        <span className="mf-fill" style={value >= 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }} />
      </span>
      <span className="mf-row-val">{ok ? fmtUsdShort(value, true) : '—'}</span>
    </div>
  )
}

function timeOf(iso) {
  const d = new Date(iso || '')
  return Number.isFinite(d.getTime())
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null
}

/** The full reading: status, 24h / 7d / 30d netflow and wallet count. */
export function MoneyFlowCard({ symbol, className = '' }) {
  const { t } = useLanguage()
  const index = useMoneyFlow()
  const f = flowFor(index, symbol)
  const status = flowStatus(f)
  const sym = String(symbol || '').toUpperCase()

  const head = (
    <div className="mf-head">
      <span className="mf-title">{t('mfTitle')}</span>
      <span className="mf-src">Nansen</span>
    </div>
  )

  if (!status) {
    return (
      <section className={`mf-card mf-empty ${className}`}>
        {head}
        <p className="mf-note">{index ? t('mfNoData').replace('{sym}', sym) : t('mfLoading')}</p>
      </section>
    )
  }

  const tone = FLOW_TONE[status]
  const vals = [f.netflow, f.netflow7d, f.netflow30d].filter(Number.isFinite).map(Math.abs)
  const max = vals.length ? Math.max(...vals) : 0
  const at = timeOf(f.updated)

  return (
    <section className={`mf-card mf-${tone}${status.startsWith('strong') ? ' mf-strong' : ''} ${className}`}>
      {head}
      <div className="mf-status">
        <span className="mf-orb" aria-hidden="true"><FlowGlyph tone={tone} size={18} /></span>
        <div className="mf-status-txt">
          <b>{t(FLOW_LABEL_KEY[status])}</b>
          <small>{t(`${FLOW_LABEL_KEY[status]}Desc`).replace('{sym}', sym)}</small>
        </div>
        <span className="mf-big">{fmtUsdShort(f.netflow, true)}<small>24h</small></span>
      </div>
      <div className="mf-rows">
        <FlowBar label="24h" value={f.netflow} max={max} />
        <FlowBar label="7d" value={f.netflow7d} max={max} />
        <FlowBar label="30d" value={f.netflow30d} max={max} />
      </div>
      <div className="mf-foot">
        {Number.isFinite(f.traders) && f.traders > 0 && (
          <span>{t('mfWallets').replace('{n}', Math.round(f.traders))}</span>
        )}
        <span>{at ? t('mfUpdated').replace('{t}', at) : t('mfHourly')}</span>
      </div>
    </section>
  )
}
