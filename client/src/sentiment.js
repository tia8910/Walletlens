// What the market is actually doing, and what the news is saying about it.
//
// The ticker used to label the market from headline keywords alone: count
// bullish words, subtract bearish ones, and call anything below −1 BEARISH.
// That produced a red BEARISH badge on a day Bitcoin was up 8.9% with 68% of
// the top 100 green — two lines under a greeting that said "green on the
// board". Two parts were wrong.
//
// 1. It matched substrings, so "bank" counted as "ban", "airdrop" as "drop",
//    and "hacking" as "hack". Finance headlines are full of banks; every one
//    of them silently voted bearish. The false positives all sat on the
//    bearish side, so the bias only ever ran one way.
//
// 2. Headlines are not the market. The news is gloomiest exactly when prices
//    are recovering, and a badge that contradicts the chart beside it teaches
//    people to ignore it.
//
// So price leads and tone follows: real 24h data decides the label, and the
// headline score can shade it but never overrule a market that is clearly
// moving. Pure functions, because the alternative is a rule nobody can test
// that quietly tells thousands of people the wrong thing about their money.

// ── Headline tone ───────────────────────────────────────────────────────────

export const BULLISH_KW = [
  'bullish', 'surge', 'rally', 'adoption', 'institutional', 'etf', 'approval',
  'milestone', 'record high', 'all-time', 'growth', 'rises', 'soars',
  'breakout', 'recovery', 'outperform', 'upgrade', 'inflows', 'accumulate',
]

// Dropped from the old list: `regulation`, `concern`, `warning`, `correction`
// and `decline`. They are ordinary finance vocabulary that appears in neutral
// and bullish stories alike — `regulation` alone fired three times in a feed
// that was, on the numbers, strongly up.
export const BEARISH_KW = [
  'bearish', 'crash', 'hack', 'ban', 'sell-off', 'liquidation', 'dump',
  'plunge', 'outflows', 'exploit', 'lawsuit', 'seizure', 'freeze', 'slump',
]

// Inflections only. The false positives were asymmetric, which is what makes
// this fixable: "airdrop" extended `drop` at the FRONT, and "bank"/"banker"
// extended `ban` with letters that are not an English inflection. Genuine hits
// — hacked, hacking, plunges, liquidations — are all ordinary suffixes. So the
// front is sealed and only inflectional endings are allowed through.
const SUFFIX = '(?:s|es|d|ed|ing|er|ers|ned|ning|ped|ping)?'

/** Whole words plus inflections. Hyphens count as word characters, so `sell-off` still matches as one token. */
function mentions(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z-])${escaped}${SUFFIX}([^a-z-]|$)`, 'i').test(text)
}

/**
 * Net tone of a set of articles, normalised to roughly −1..1.
 *
 * Normalising matters: the raw count scaled with however many articles the
 * feed happened to hold, so a fixed threshold meant something different every
 * time the feed grew.
 */
export function headlineTone(articles, limit = 30) {
  const list = Array.isArray(articles) ? articles.slice(0, limit) : []
  if (!list.length) return 0
  let net = 0
  for (const a of list) {
    const text = `${a?.title || ''} ${a?.description || ''}`
    net += BULLISH_KW.filter(w => mentions(text, w)).length
    net -= BEARISH_KW.filter(w => mentions(text, w)).length
  }
  // One decisive word per article is a strong feed; clamp there.
  return clamp(net / list.length, -1, 1)
}

// ── What prices are doing ───────────────────────────────────────────────────

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }

// Stablecoins are a fifth of the top 100 by value and never move, so they
// diluted every reading towards neutral and, at +0.01%, counted as "up".
const STABLE_IDS = new Set([
  'tether', 'usd-coin', 'dai', 'first-digital-usd', 'ethena-usde', 'usds', 'paypal-usd',
  'true-usd', 'frax', 'binance-usd', 'usdd', 'gemini-dollar', 'paxos-standard', 'liquity-usd',
  'euro-coin', 'stasis-eurs', 'ripple-usd', 'global-dollar', 'usual-usd', 'falcon-finance',
])
function isStable(c) {
  if (STABLE_IDS.has(c?.id)) return true
  const p = Number(c?.current_price)
  const d = Math.abs(Number(c?.price_change_percentage_24h))
  const w = Math.abs(Number(c?.price_change_percentage_7d_in_currency))
  // Pegged by behaviour: a dollar price that barely moved all week.
  return p > 0.97 && p < 1.03 && d < 0.5 && (!Number.isFinite(w) || w < 1)
}

// How big a move has to be to count as decisive. Crypto's ordinary daily
// swing is about 3%, so a 1% dip is noise, not a bear market.
const DAY_FULL = 5
const WEEK_FULL = 12
/** A coin only counts as up or down for breadth when it moved this much. */
const BREADTH_MIN = 1

/**
 * What the market did, as plain numbers: the whole market's move weighted by
 * size (so a $1 trillion coin outweighs a $1 billion one), over the day and
 * the week, and how many coins rose.
 */
export function marketStats(coins, top = 100) {
  const list = (Array.isArray(coins) ? coins : [])
    .slice(0, top)
    .filter(c => Number.isFinite(c?.price_change_percentage_24h) && !isStable(c))
  if (!list.length) return null
  const weight = (c) => (Number(c.market_cap) > 0 ? Number(c.market_cap) : 1)
  const avg = (key) => {
    let sum = 0, wsum = 0
    for (const c of list) {
      const v = Number(c[key])
      if (!Number.isFinite(v)) continue
      sum += v * weight(c); wsum += weight(c)
    }
    return wsum > 0 ? sum / wsum : null
  }
  return {
    day: avg('price_change_percentage_24h'),
    week: avg('price_change_percentage_7d_in_currency'),
    up: list.filter(c => c.price_change_percentage_24h > 0).length,
    rising: list.filter(c => c.price_change_percentage_24h >= BREADTH_MIN).length,
    falling: list.filter(c => c.price_change_percentage_24h <= -BREADTH_MIN).length,
    n: list.length,
  }
}

/**
 * Market direction, −1..1.
 *
 * Today's size-weighted move leads, the week's trend steadies it so one red
 * afternoon in a strong week does not flip the badge, and breadth (coins that
 * really moved, up minus down) keeps one giant from deciding alone.
 */
export function marketDirection(coins, top = 100) {
  const st = marketStats(coins, top)
  if (!st || st.day === null) return null
  const day = clamp(st.day / DAY_FULL, -1, 1)
  const breadth = (st.rising - st.falling) / st.n
  if (st.week === null) return clamp(day * 0.7 + breadth * 0.3, -1, 1)
  const week = clamp(st.week / WEEK_FULL, -1, 1)
  return clamp(day * 0.5 + week * 0.3 + breadth * 0.2, -1, 1)
}

// ── The label ───────────────────────────────────────────────────────────────

/** Below this in either direction the market is not saying anything worth a badge. */
export const MOOD_THRESHOLD = 0.15

/**
 * The full reading: the label, how strong it is, and the numbers behind it.
 *
 * Weighted 75/25 towards prices, which is what makes the badge agree with
 * the chart next to it. With no market data the tone carries it alone, so
 * the ticker still works if market.json fails to load.
 *
 * @returns {{ mood: 'bullish'|'bearish'|'neutral', strength: 'slight'|'normal'|'strong'|null, score: number, stats: object|null }}
 */
export function moodReading({ articles, coins } = {}) {
  const tone = headlineTone(articles)
  const direction = marketDirection(coins)
  const score = direction === null ? tone : direction * 0.75 + tone * 0.25
  const mood = score > MOOD_THRESHOLD ? 'bullish' : score < -MOOD_THRESHOLD ? 'bearish' : 'neutral'
  const a = Math.abs(score)
  const strength = mood === 'neutral' ? null : a < 0.35 ? 'slight' : a < 0.65 ? 'normal' : 'strong'
  return { mood, strength, score, stats: marketStats(coins) }
}

/** @returns {'bullish'|'bearish'|'neutral'} */
export function marketMood(input = {}) {
  return moodReading(input).mood
}
