// The WalletLens Market Index — a cross-asset risk-appetite score.
//
// WHAT CHANGED AND WHY
// This score used to read crypto only: breadth, momentum and large-cap
// leadership across the top 250 coins. The page around it already fetched
// equity indices, metals, forex and commodities and printed them in boards
// underneath — so the headline said "All markets, one page" while the number
// under it had never looked at a single one of them. A reader citing "49/100"
// was citing a crypto figure wearing a cross-asset label.
//
// THE MODEL IS RISK APPETITE, NOT "HOW MUCH IS GREEN"
// That distinction is the whole design. Averaging percent-green across asset
// classes is wrong, because green means opposite things in different ones:
// gold ripping is money running FROM risk, and a strong dollar tightens
// conditions for every risk asset on earth. A naive average would read a
// flight to safety as a healthy market.
//
// So every pillar contributes in the direction that means investors are TAKING
// risk. Gold up pushes the score down. The dollar strengthening pushes it down.
// A high VIX pushes it down. That is defensible in one line each, which matters
// for a page whose pitch is "free to cite".
//
// PILLARS
//   Crypto      30%  breadth of the top 100 + momentum of the top 50
//   Equities    30%  breadth of the world's major indices + their average move
//   Volatility  20%  the VIX level, plus gold read as a safe-haven bid
//   Macro       20%  dollar weakness, plus copper and oil as growth demand
//
// MISSING DATA RENORMALISES, IT DOES NOT ZERO
// The non-crypto quotes come from Stooq through public CORS proxies, which
// fail often and without warning. A missing pillar must not be scored zero —
// that would read a proxy outage as a market crash. Weights are renormalised
// across whatever pillars actually have data, and the result reports which
// ones were live so the page can say so rather than quietly showing a number
// built on less than it claims.

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

/**
 * Map a value onto 0–100 between two reference points.
 *
 * `lo` and `hi` may be given in either order, and reversing them inverts the
 * scale. That is not a convenience — it is how the risk-off signals are
 * expressed: `range(vix, 35, 12)` reads a calm VIX as 100 and a panicked one
 * as 0, in the same shape as every other pillar, with no scattered `100 - x`
 * to lose track of.
 */
export function range(v, lo, hi) {
  if (!Number.isFinite(v) || lo === hi) return null
  return clamp(((v - lo) / (hi - lo)) * 100, 0, 100)
}

/** Average of the finite numbers only; null when there are none. */
export function avg(list) {
  const ns = list.filter(Number.isFinite)
  if (!ns.length) return null
  return ns.reduce((s, n) => s + n, 0) / ns.length
}

const ch24 = c => c.price_change_percentage_24h ?? c.price_change_percentage_24h_in_currency ?? 0

// Symbols each pillar reads, by the lowercase Stooq ticker the fetch returns.
export const EQUITY_SYMS = ['^spx', '^ndq', '^dji', '^rut', '^ukx', '^dax', '^nkx']
export const GROWTH_SYMS = ['cl.f', 'bz.f', 'hg.f']       // WTI, Brent, copper
// Pairs quoted with the dollar on the RIGHT: a rise is the dollar weakening.
export const USD_QUOTE_SYMS = ['eurusd', 'gbpusd', 'audusd']
// Pairs quoted with the dollar on the LEFT: a rise is the dollar strengthening,
// so these enter the average negated.
export const USD_BASE_SYMS = ['usdjpy', 'usdcad']

export const WEIGHTS = { crypto: 0.30, equities: 0.30, volatility: 0.20, macro: 0.20 }

const pct = (markets, sym) => {
  const v = markets?.[sym]?.change
  return Number.isFinite(v) ? v : null
}

/**
 * Crypto participation. Unchanged in spirit from the original index — the two
 * signals that carried it are still the two that matter — but folded into one
 * pillar so it can sit beside the others rather than being the whole score.
 *
 * Large-cap leadership is gone as a separate input. With only ten members it
 * moved in 10-point steps, which made the headline number jump for reasons no
 * reader could see; its information is already inside breadth.
 */
export function cryptoPillar(snapshot) {
  if (!snapshot?.length) return null
  const byCap = [...snapshot].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
  const top100 = byCap.slice(0, 100)
  const top50 = byCap.slice(0, 50)
  if (!top100.length) return null

  const breadth = (top100.filter(c => ch24(c) > 0).length / top100.length) * 100
  const avgMom = top50.reduce((s, c) => s + ch24(c), 0) / top50.length
  // ±8% a day is a big but ordinary session for the crypto majors.
  const momentum = range(avgMom, -8, 8)

  return {
    value: 0.6 * breadth + 0.4 * momentum,
    detail: { breadth, momentum, avgMom },
  }
}

/**
 * Equity participation across the major indices.
 *
 * The VIX is deliberately NOT counted here even though it is fetched with the
 * rest: it is a fear gauge, not an index whose rise is good news, and letting
 * it into a breadth count would mean a panic bid for protection reading as
 * broad strength. It belongs to the volatility pillar, inverted.
 */
export function equitiesPillar(markets) {
  const moves = EQUITY_SYMS.map(s => pct(markets, s)).filter(Number.isFinite)
  if (!moves.length) return null

  const breadth = (moves.filter(m => m > 0).length / moves.length) * 100
  // ±2% is the equivalent big-but-ordinary day for a broad equity index —
  // a quarter of the crypto band, which is roughly the volatility ratio.
  const momentum = range(avg(moves), -2, 2)

  return {
    value: 0.5 * breadth + 0.5 * momentum,
    detail: { breadth, momentum, avgMove: avg(moves), covered: moves.length },
  }
}

/**
 * How much the market is paying for safety.
 *
 * The VIX enters as a LEVEL, not a daily change, because the level is the
 * reading everyone already knows how to interpret: low teens is calm, 35 is a
 * genuine scare. A percentage change would score a jump from 12 to 14 — still
 * a placid tape — as a collapse.
 *
 * Gold enters inverted, as a safe-haven bid. This is the pillar most likely to
 * be argued with, and the argument is worth stating: gold also rises on dollar
 * weakness and on inflation, neither of which is a flight from risk. It is
 * weighted below the VIX for exactly that reason, and it is a corroborating
 * signal here rather than a verdict on gold itself.
 */
export function volatilityPillar(markets) {
  const vixLevel = markets?.['^vix']?.close
  const gold = pct(markets, 'xauusd')

  const calm = range(vixLevel, 35, 12)             // 12 → 100, 35 → 0
  const havenCalm = range(gold, 1.5, -1.5)         // gold +1.5% → 0

  if (calm == null && havenCalm == null) return null
  if (calm == null) return { value: havenCalm, detail: { havenCalm, gold } }
  if (havenCalm == null) return { value: calm, detail: { calm, vixLevel } }

  return {
    value: 0.6 * calm + 0.4 * havenCalm,
    detail: { calm, havenCalm, vixLevel, gold },
  }
}

/**
 * The macro backdrop: the price of money, and demand for the stuff of growth.
 *
 * Dollar weakness scores high. A strengthening dollar tightens financial
 * conditions worldwide and drains risk assets regardless of what those assets
 * are doing on their own — it is the single most reliable cross-asset signal
 * on this page, which is why the sign convention is spelled out at the symbol
 * lists rather than buried here.
 *
 * Copper and oil stand in for industrial demand. Oil is imperfect (a supply
 * shock lifts it while hurting growth) so it shares the sub-pillar with copper,
 * which has no comparable confound.
 */
export function macroPillar(markets) {
  const dollarMoves = [
    ...USD_QUOTE_SYMS.map(s => pct(markets, s)),
    ...USD_BASE_SYMS.map(s => { const v = pct(markets, s); return Number.isFinite(v) ? -v : null }),
  ].filter(Number.isFinite)

  const growthMoves = GROWTH_SYMS.map(s => pct(markets, s)).filter(Number.isFinite)

  // ±0.8% is a decisive day for a major pair; ±3% for oil and copper.
  const dollarWeakness = dollarMoves.length ? range(avg(dollarMoves), -0.8, 0.8) : null
  const growth = growthMoves.length ? range(avg(growthMoves), -3, 3) : null

  if (dollarWeakness == null && growth == null) return null
  if (dollarWeakness == null) return { value: growth, detail: { growth } }
  if (growth == null) return { value: dollarWeakness, detail: { dollarWeakness } }

  return {
    value: 0.5 * dollarWeakness + 0.5 * growth,
    detail: { dollarWeakness, growth },
  }
}

/**
 * The published score.
 *
 * @param snapshot  the crypto market snapshot (top 250 by cap)
 * @param markets   Stooq quotes keyed by lowercase symbol, or null
 */
export function computeIndex(snapshot, markets) {
  const pillars = {
    crypto: cryptoPillar(snapshot),
    equities: equitiesPillar(markets),
    volatility: volatilityPillar(markets),
    macro: macroPillar(markets),
  }

  const live = Object.keys(WEIGHTS).filter(k => pillars[k] && Number.isFinite(pillars[k].value))
  if (!live.length) return null

  // Renormalised over what is actually present. A pillar whose data source is
  // down contributes nothing and costs nothing — the alternative, scoring it
  // zero, would turn a CORS proxy outage into a reported market crash.
  const totalWeight = live.reduce((s, k) => s + WEIGHTS[k], 0)
  const score = Math.round(
    live.reduce((s, k) => s + WEIGHTS[k] * pillars[k].value, 0) / totalWeight
  )

  const byCap = snapshot?.length
    ? [...snapshot].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
    : []
  const top100 = byCap.slice(0, 100)
  const gainers = top100.filter(c => ch24(c) > 0).length
  const totalMcap = byCap.reduce((s, c) => s + (c.market_cap || 0), 0)
  const btc = byCap.find(c => (c.symbol || '').toLowerCase() === 'btc')

  return {
    score,
    pillars,
    live,
    // What share of the intended model this score was actually built from.
    // Printed on the page: a number from one pillar out of four is a different
    // claim from one built on all of them, and the reader is owed the
    // difference rather than being shown the same confident circle either way.
    coverage: totalWeight,
    scores: {
      crypto: pillars.crypto ? Math.round(pillars.crypto.value) : null,
      equities: pillars.equities ? Math.round(pillars.equities.value) : null,
      volatility: pillars.volatility ? Math.round(pillars.volatility.value) : null,
      macro: pillars.macro ? Math.round(pillars.macro.value) : null,
    },
    avgMom: pillars.crypto?.detail.avgMom ?? null,
    totalMcap,
    btcDom: btc && totalMcap > 0 ? (btc.market_cap / totalMcap) * 100 : null,
    gainers,
    losers: top100.length - gainers,
    coins: byCap,
  }
}

/**
 * The verdict text.
 *
 * The five labels are unchanged. People have been citing this index by label
 * since it launched, and renaming the bands under a score that already means
 * something new would silently invalidate every citation already in print. The
 * NOTES are rewritten, because those did describe crypto and now must not.
 */
export function band(score) {
  if (score >= 75) return {
    label: 'Overheated', color: '#fbbf24',
    note: 'Broad risk-taking across asset classes — historically a time for caution, not chasing.',
  }
  if (score >= 56) return {
    label: 'Constructive', color: '#10b981',
    note: 'Money is moving into risk in most markets, with volatility contained.',
  }
  if (score >= 45) return {
    label: 'Neutral', color: '#94a3b8',
    note: 'Mixed signals across asset classes — no clear directional edge right now.',
  }
  if (score >= 25) return {
    label: 'Caution', color: '#fb923c',
    note: 'Risk appetite is fading — defensive assets are being bid over growth.',
  }
  return {
    label: 'Extreme Caution', color: '#f87171',
    note: 'Broad flight from risk — volatility elevated and safe havens leading.',
  }
}
