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

/**
 * Market direction from the top coins' own 24h numbers, −1..1.
 *
 * Breadth (how many are up) and Bitcoin (how far it moved) are blended so
 * neither alone decides: a day where Bitcoin jumps while everything else
 * bleeds is not a bull market, and a day where most coins tick up while
 * Bitcoin drops 8% is not either.
 */
export function marketDirection(coins, top = 100) {
  const list = (Array.isArray(coins) ? coins : [])
    .slice(0, top)
    .filter(c => Number.isFinite(c?.price_change_percentage_24h))
  if (!list.length) return null

  const up = list.filter(c => c.price_change_percentage_24h > 0).length
  const breadth = (up / list.length - 0.5) * 2      // all down −1 … all up +1

  const btc = list.find(c => c?.id === 'bitcoin')
  // A 5% day is decisive either way; beyond that the label does not get truer.
  const lead = btc ? clamp(btc.price_change_percentage_24h / 5, -1, 1) : breadth

  return clamp(breadth * 0.5 + lead * 0.5, -1, 1)
}

// ── The label ───────────────────────────────────────────────────────────────

/** Below this in either direction the market is not saying anything worth a badge. */
export const MOOD_THRESHOLD = 0.15

/**
 * Combine what prices did with what the news said.
 *
 * Weighted 70/30 towards prices, which is what makes the badge agree with the
 * chart next to it. With no market data the tone carries it alone, so the
 * ticker still works if market.json fails to load.
 *
 * @returns {'bullish'|'bearish'|'neutral'}
 */
export function marketMood({ articles, coins } = {}) {
  const tone = headlineTone(articles)
  const direction = marketDirection(coins)
  const score = direction === null ? tone : direction * 0.7 + tone * 0.3
  if (score > MOOD_THRESHOLD) return 'bullish'
  if (score < -MOOD_THRESHOLD) return 'bearish'
  return 'neutral'
}
