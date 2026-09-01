// The WalletLens Alpha score — how a whole portfolio is doing, not its crypto.
//
// WHAT WAS WRONG
// The score read crypto and nothing else, and not by choice at the scoring
// layer: the page stripped every `stock:`, `metal:` and `fiat:` id out of the
// portfolio BEFORE it fetched prices, so those holdings arrived with no price,
// were dropped for having none, and never reached the score at all. api's
// getPrices() has routed stocks to Stooq and metals to a spot feed the whole
// time — the filter was throwing away support that already existed.
//
// The consequence people actually saw was Diversification. It scored
// `(1 - largestWeight) * 20`, computed over the surviving holdings — so a
// portfolio of AAPL, MSFT and one bitcoin position collapsed to bitcoin alone,
// largest weight 1.0, and the page told a diversified investor their
// diversification was 0/20. A portfolio holding no crypto at all got no score
// whatsoever, because the id list came back empty and the loader returned
// early.
//
// WHAT THIS DOES INSTEAD
// Every holding the app can price is scored, and two things become
// asset-class aware rather than merely including more rows:
//
//   • Momentum is judged against the move that is NORMAL for what you hold.
//     ±20% in a day is an ordinary crypto session and an extraordinary equity
//     one; scoring both on the crypto band would rate a fine day for a stock
//     portfolio as barely positive. The band is blended by value weight.
//
//   • Diversification counts asset classes, not just tickers. Thirty
//     altcoins are one bet wearing thirty names, and the old measure — which
//     only ever looked at the largest single weight — called that excellent.
//     Half the points now come from spread ACROSS classes, so an all-crypto
//     portfolio cannot score above half however many coins are in it.

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

/** 0–1 position of `v` between two reference points; reversible, clamped. */
function unit(v, lo, hi) {
  if (!Number.isFinite(v) || lo === hi) return 0
  return clamp((v - lo) / (hi - lo), 0, 1)
}

/**
 * Which asset class an id belongs to.
 *
 * The prefixes are the app's own storage convention, matched here rather than
 * imported because api.js keeps them as internal constants. `xstock:` is a
 * tokenised equity — it trades as a CoinGecko token, but what it tracks is a
 * share, and for both the momentum band and the class count that is what
 * matters.
 */
export function assetClass(id = '') {
  if (id.startsWith('stock:') || id.startsWith('xstock:')) return 'equity'
  if (id.startsWith('metal:')) return 'metal'
  if (id.startsWith('fiat:') || id.startsWith('cash:')) return 'cash'
  if (id.startsWith('bond:')) return 'bond'
  if (id.startsWith('real:')) return 'realestate'
  if (id.startsWith('other:')) return 'other'
  return 'crypto'
}

/**
 * The move that counts as a big-but-ordinary day, per class, in percent.
 *
 * These set what "good momentum" means, so they are the most opinionated
 * numbers in the file. They are deliberately generous rather than precise:
 * the point is that the classes differ by roughly the right multiple, not
 * that 6% is exactly an equity's 95th percentile.
 */
export const MOVE_BAND = {
  crypto: 20,
  equity: 6,
  metal: 4,
  realestate: 3,
  bond: 2,
  other: 3,
  cash: 1,
}

/**
 * The verdict for a total.
 *
 * Exported so the thresholds can be tested at their boundaries. Inlined in the
 * scorer they were only reachable by constructing a portfolio that happened to
 * land on 79 and another on 80, which no test did — so the bands were
 * effectively unchecked.
 *
 * The key is a key, not a word: it renders through t() in the caller. This
 * module has no hook to call it from and must stay language-independent.
 */
export function gradeFor(total) {
  if (total >= 80) return { gradeKey: 'axGradeStrong',  color: 'var(--g)' }
  if (total >= 60) return { gradeKey: 'axGradeGood',    color: '#60a5fa' }
  if (total >= 40) return { gradeKey: 'axGradeNeutral', color: '#f59e0b' }
  if (total >= 20) return { gradeKey: 'axGradeWeak',    color: '#f87171' }
  return             { gradeKey: 'axGradePoor',    color: '#f87171' }
}

/** Herfindahl "effective count": how many holdings a mix really behaves like. */
export function effectiveCount(weights) {
  const hhi = weights.reduce((s, w) => s + w * w, 0)
  return hhi > 0 ? 1 / hhi : 0
}

/**
 * Score a portfolio 0–100.
 *
 * @param enriched holdings already carrying { coin_id, value, pnlPct }
 * @param prices   the price map, read for `usd_24h_change`
 */
export function calcAlphaScore(enriched, prices = {}) {
  if (!enriched?.length) return null
  const totalValue = enriched.reduce((s, h) => s + (h.value || 0), 0)
  if (totalValue <= 0) return null

  const weights = enriched.map(h => (h.value || 0) / totalValue)
  const classes = enriched.map(h => assetClass(h.coin_id))
  const chg = h => prices[h.coin_id]?.usd_24h_change ?? 0

  // ── Momentum (0-30) ─────────────────────────────────────────────────────
  // Weighted 24h move, judged against a band blended from what is actually
  // held. A floor of 1% keeps an all-cash portfolio from dividing by nothing.
  const momentum = enriched.reduce((s, h, i) => s + chg(h) * weights[i], 0)
  const band = Math.max(1, enriched.reduce(
    (s, h, i) => s + (MOVE_BAND[classes[i]] ?? MOVE_BAND.other) * weights[i], 0))
  const momentumScore = Math.round(unit(momentum, -band, band) * 30)

  // ── P&L health (0-30) ───────────────────────────────────────────────────
  // Value-weighted share of the portfolio sitting in profit. Class-agnostic
  // by nature: profit is profit whatever it was made on.
  const inProfitWeight = enriched.reduce(
    (s, h, i) => s + ((h.pnlPct || 0) > 0 ? weights[i] : 0), 0)
  const pnlScore = Math.round(inProfitWeight * 30)

  // ── Diversification (0-20) ──────────────────────────────────────────────
  // Half for spreading across holdings, half for spreading across classes.
  // The split is the whole point: thirty altcoins are one bet wearing thirty
  // names, and the old measure scored that as perfectly diversified.
  const classWeights = {}
  enriched.forEach((h, i) => {
    classWeights[classes[i]] = (classWeights[classes[i]] || 0) + weights[i]
  })
  const mix = Object.entries(classWeights)
    .map(([name, weight]) => ({ name, weight }))
    .sort((a, b) => b.weight - a.weight)

  // 1 holding → 0, 8 or more equally-sized → full marks.
  const holdingSpread = unit(effectiveCount(weights), 1, 8) * 10
  // 1 class → 0, 3 balanced classes → full marks. Three is the target
  // deliberately: it is reachable by an ordinary person holding some crypto,
  // some shares and some metal, and does not demand a bond sleeve to score.
  const classSpread = unit(effectiveCount(mix.map(m => m.weight)), 1, 3) * 10
  const divScore = Math.round(holdingSpread + classSpread)

  // ── Opportunity (0-20) ──────────────────────────────────────────────────
  // Holdings moving up today that have not already run away from their entry.
  const upCount = enriched.filter(h => chg(h) > 0 && (h.pnlPct || 0) < 100).length
  const oppScore = Math.round((upCount / enriched.length) * 20)

  const total = momentumScore + pnlScore + divScore + oppScore
  const { gradeKey, color } = gradeFor(total)

  return {
    total, gradeKey, color,
    momentum, momentumScore, pnlScore, divScore, oppScore,
    // What the score was built from, so the page can show it rather than
    // leaving the reader to assume it is all crypto — which, for a long time,
    // it was.
    mix,
    band,
    holdingSpread: Math.round(holdingSpread),
    classSpread: Math.round(classSpread),
    priced: enriched.length,
  }
}
