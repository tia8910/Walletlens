/**
 * Trend direction for one holding.
 *
 * A 24-hour move is not a trend. Bitcoin can be down 3% on the day inside a
 * month of steady gains, and calling that a downtrend next to someone's
 * position would be worse than showing nothing: it reads as a signal and it
 * is noise. So the direction is taken from the longest window available, and
 * the label says which window it used.
 *
 *   7 days   for crypto in market.json's top 250, which already carries
 *            price_change_percentage_7d_in_currency
 *   24 hours for everything else: stocks, metals, and coins outside that set
 *
 * The 24h read keeps a wider flat band, because a single day needs to move
 * further before it means anything. Both bands exist so that a holding
 * drifting by a fraction of a percent shows a dash rather than an arrow, and
 * a portfolio of stablecoins does not light up like a trading terminal.
 */

/** Past this, a 7-day move counts as a direction rather than drift. */
export const FLAT_BAND_7D = 2

/** The 24h band is wider: one day of noise should not read as a trend. */
export const FLAT_BAND_24H = 1.5

/** Move at which an arrow is drawn at full strength. */
const FULL_7D = 15
const FULL_24H = 8

const clamp01 = (n) => Math.max(0, Math.min(1, n))

/**
 * @param {{ pct24h?: number, pct7d?: number|null }} windows
 * @returns {{ dir: 'up'|'down'|'flat', strength: number, basis: '7d'|'24h', pct: number, diverging: boolean }}
 *
 * `strength` is 0..1 and drives how emphatic the arrow is, not what it says.
 * `diverging` marks a 7-day direction that the last day contradicts, which is
 * what a rally cooling off looks like before it shows up in the weekly number.
 */
export function trendFor({ pct24h, pct7d } = {}) {
  const d24 = Number.isFinite(pct24h) ? pct24h : 0
  const has7 = Number.isFinite(pct7d)

  const basis = has7 ? '7d' : '24h'
  const pct = has7 ? pct7d : d24
  const band = has7 ? FLAT_BAND_7D : FLAT_BAND_24H
  const full = has7 ? FULL_7D : FULL_24H

  let dir = 'flat'
  if (pct > band) dir = 'up'
  else if (pct < -band) dir = 'down'

  // A flat reading is still a reading. Give it zero strength so nothing
  // downstream has to special-case it to avoid drawing an emphatic nothing.
  const strength = dir === 'flat' ? 0 : clamp01((Math.abs(pct) - band) / (full - band))

  // Only meaningful when both windows exist and both cleared their own noise.
  const diverging = has7 && dir !== 'flat'
    && Math.abs(d24) > FLAT_BAND_24H
    && Math.sign(d24) !== Math.sign(pct)

  return { dir, strength, basis, pct, diverging }
}

/** i18n key for the direction, so the row never hardcodes English. */
export function trendLabelKey(dir) {
  if (dir === 'up') return 'trendUp'
  if (dir === 'down') return 'trendDown'
  return 'trendFlat'
}

/**
 * Build the 7-day lookup the dashboard passes in.
 *
 * Keyed by CoinGecko id, which is what a crypto holding's coin_id already is.
 * Anything not in the top 250 is simply absent, and trendFor falls back to
 * 24h for it rather than guessing.
 */
export function sevenDayMap(marketCoins) {
  const out = {}
  if (!Array.isArray(marketCoins)) return out
  for (const c of marketCoins) {
    const v = c?.price_change_percentage_7d_in_currency
    if (c?.id && Number.isFinite(v)) out[c.id] = v
  }
  return out
}
