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

export default TrendArrow
