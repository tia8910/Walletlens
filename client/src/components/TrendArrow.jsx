import { memo } from 'react'
import { useLanguage } from '../LanguageContext'
import { trendLabelKey } from '../assetTrend'

/**
 * The trend marker that sits beside a holding.
 *
 * Presentational only. The direction is decided in assetTrend.js, which is
 * where the argument about what counts as a trend belongs and where it is
 * tested. This draws what it is handed.
 *
 * Strength changes how emphatic the mark is, never what it claims. A weekly
 * move that just cleared the noise band renders faint and single; a decisive
 * one renders solid and doubled. That way a screen of holdings is scannable
 * by weight, and the eye lands on the two that are actually moving instead of
 * on whichever row happens to be near the top.
 *
 * A flat reading draws a dash rather than nothing, because an empty cell
 * reads as missing data and a dash reads as an answer.
 */
const STRONG = 0.55

const TrendArrow = memo(function TrendArrow({ trend, className = '' }) {
  const { t } = useLanguage()
  if (!trend) return null

  const { dir, strength, basis, pct, diverging } = trend
  const strong = strength >= STRONG

  // The window is part of the claim, so it goes in the tooltip next to the
  // number rather than being left for the user to assume.
  const window = basis === '7d' ? t('trendBasis7d') : t('trendBasis24h')
  const signed = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  const title = diverging
    ? `${t(trendLabelKey(dir))} · ${window} ${signed} · ${t('trendCooling')}`
    : `${t(trendLabelKey(dir))} · ${window} ${signed}`

  if (dir === 'flat') {
    return (
      <span className={`wl-trend wl-trend--flat ${className}`} title={title} aria-label={title}>
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </svg>
      </span>
    )
  }

  return (
    <span
      className={`wl-trend wl-trend--${dir}${strong ? ' wl-trend--strong' : ''}${diverging ? ' wl-trend--diverging' : ''} ${className}`}
      // Opacity carries the rest of the strength, so two arrows of the same
      // shape still separate by conviction.
      style={{ '--wl-trend-weight': 0.55 + strength * 0.45 }}
      title={title}
      aria-label={title}
    >
      <svg viewBox="0 0 10 12" width="10" height="12" aria-hidden="true">
        <path
          className="wl-trend-chev wl-trend-chev--lead"
          d="M1.4 6.4 5 2.8l3.6 3.6"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
        {strong && (
          <path
            className="wl-trend-chev wl-trend-chev--trail"
            d="M1.4 10 5 6.4 8.6 10"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"
          />
        )}
      </svg>
    </span>
  )
})

/**
 * The 7-day line, drawn from market.json's thinned series.
 *
 * Coloured by the trend's direction rather than by first-versus-last price,
 * so the line, the arrow and the word all agree. A line that ended higher
 * than it started but sat inside the flat band would otherwise be drawn green
 * next to the word "Flat".
 */
function TrendSpark({ points, dir, width = 54, height = 16 }) {
  if (!Array.isArray(points) || points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const stepX = width / (points.length - 1)
  const d = points
    .map((v, i) => `${i ? 'L' : 'M'}${(i * stepX).toFixed(1)} ${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(' ')
  return (
    <svg className={`wl-trend-spark wl-trend-spark--${dir}`} viewBox={`0 0 ${width} ${height}`}
      width={width} height={height} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${width} ${height} L0 ${height} Z`} className="wl-trend-spark-fill" />
      <path d={d} className="wl-trend-spark-line" fill="none" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Arrow, word and line together.
 *
 * The arrow alone tested badly: beside a red profit-and-loss pill measuring
 * something else entirely, a bare green chevron reads as a contradiction
 * rather than as a different fact. The word removes the ambiguity and the
 * line shows the shape the word is describing.
 */
export const TrendBadge = memo(function TrendBadge({ trend, points }) {
  const { t } = useLanguage()
  if (!trend) return null
  const { dir, basis, pct, diverging } = trend
  const signed = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  const window = basis === '7d' ? t('trendBasis7d') : t('trendBasis24h')

  return (
    <span className={`wl-trend-badge wl-trend-badge--${dir}`}>
      <em>{t('trendChip')}</em>
      <b>
        <TrendArrow trend={trend} />
        {t(trendLabelKey(dir))}
        <span className="wl-trend-window">{window} {signed}</span>
      </b>
      {dir !== 'flat' && <TrendSpark points={points} dir={dir} />}
      {diverging && <span className="wl-trend-cooling" title={t('trendCooling')}>·</span>}
    </span>
  )
})

export default TrendArrow
