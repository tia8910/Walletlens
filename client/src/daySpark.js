// The line beside each holding, made to agree with the numbers around it.
//
// THE BUG: the row printed the 24 h change but drew the market file's 7-day
// line, which also stopped at whatever price the file held when it was last
// built. Arweave read +6.32% beside a falling red line, Ethereum −2.67%
// beside a rising green one. Now the line is the last 24 hours, it ends at
// the price the row shows, and its colour follows the change printed next
// to it.

/** Of a 28-point 7-day line, the last five points cover about a day. */
const DAY_TAIL = 5

/**
 * The series to draw: the day's prices ending at the live price.
 * Falls back to the last day of the 7-day line, and to nothing at all
 * rather than a line that covers a different window.
 */
export function daySeries(day, livePrice, spark7d) {
  const lp = Number(livePrice)
  const gap = (v) => (lp > 0 ? Math.abs(v[v.length - 1] / lp - 1) : 0)
  // A series that ends far from the live price is another source's quote
  // (or another token): it is not drawn. One a little off is drawn as it is,
  // since joining the two would draw a final jump that never happened; only
  // a close one is carried on to the live price.
  const finish = (v) => {
    const g = gap(v)
    if (g >= MAX_GAP) return null
    return lp > 0 && g < JOIN_GAP ? [...v, lp] : v
  }
  if (Array.isArray(day) && day.length > 3) {
    const v = finish(day)
    if (v) return v
  }
  if (Array.isArray(spark7d) && spark7d.length > DAY_TAIL) return finish(spark7d.slice(-DAY_TAIL))
  return null
}

/** Close enough to the live price to end the line on it. */
const JOIN_GAP = 0.01

/** How far a series may end from the live price and still be drawn into it. */
const MAX_GAP = 0.03

/** Cash has no line to draw. */
export const hasDayLine = (h) => !!h?.coin_id && h.category !== 'fiat' && !/^(fiat:|bond:|other:)/.test(h.coin_id)
