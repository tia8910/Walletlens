import { GOLD_ID, SILVER_ID, COPPER_ID, PLATINUM_ID, STOCK_PREFIX, FIAT_PREFIX } from './assets'

// ── What the ticker shows, per onboarding interest ──────────────────────────
//
// InterestPicker writes the chosen asset classes to `wl_interests`. Until now
// nothing but the dashboard quick-add chips read it, and the ticker showed the
// top 12 crypto by market cap to everyone — including the people who told us
// on their first run that they track gold and index funds.
//
// Deliberately a fixed, curated list per class rather than "the top N in this
// class". A ticker is glanceable furniture: it wants the handful of names a
// person recognises, and a stable set so the strip does not reshuffle between
// refreshes.
//
// Classes with no live feed are absent on purpose. Real estate and bonds have
// no quote in this app — every holding is valued manually — so there is
// nothing to scroll, and inventing a proxy index would be showing someone a
// number that is not theirs.
const S = t => `${STOCK_PREFIX}${t}`

export const INTEREST_TICKER_IDS = {
  // Crypto is a placeholder here, not the list that ships. When crypto is
  // among the interests the strip is filled from the live top-of-market
  // ranking instead, so it follows the market rather than a list that goes
  // stale the moment the top ten reshuffles. These are the fallback for a
  // cold market feed, which is the only time a fixed list is the right answer.
  crypto:      ['bitcoin', 'ethereum', 'solana', 'ripple', 'binancecoin',
                'cardano', 'dogecoin', 'avalanche-2', 'chainlink', 'polkadot'],
  stablecoins: ['tether'],
  // The large caps people recognise without looking them up. Not an index:
  // a ticker is read at a glance, and a symbol nobody knows is furniture.
  stocks:      [S('aapl'), S('msft'), S('nvda'), S('tsla'), S('amzn'), S('googl'),
                S('meta'), S('brk-b'), S('jpm'), S('v'), S('wmt'), S('xom')],
  etfs:        [S('spy'), S('qqq'), S('voo'), S('vti'), S('iwm'), S('dia')],
  gold:        [GOLD_ID],
  silver:      [SILVER_ID],
  commodities: [COPPER_ID, PLATINUM_ID],
  cash:        [`${FIAT_PREFIX}eur`, `${FIAT_PREFIX}gbp`, `${FIAT_PREFIX}jpy`],
  // realestate and bonds: priced by hand in this app, so no feed to show.
}

// A ceiling on the strip. Interests are multi-select, and getPrices batches
// per class, so the cost is roughly one request per class present rather than
// per symbol: the limit is about how long a row stays worth swiping, not about
// bandwidth. Forty is roughly a minute of scrolling and well past where anyone
// keeps looking.
export const MAX_TICKER_IDS = 40

// How many live top-of-market coins the crypto class contributes before the
// other chosen classes get their turn. Without a cap of its own, crypto would
// take the whole budget and someone who picked crypto and gold would have to
// swipe past every coin to reach the gold.
export const MAX_LIVE_CRYPTO = 20

// Interleave rather than concatenate. Picking crypto and gold and getting five
// coins before the gold is a strip most people never scroll far enough to see
// the gold in. Round-robin puts one of each class up front.
export function tickerIdsFor(interests) {
  const lists = (Array.isArray(interests) ? interests : [])
    .map(i => INTEREST_TICKER_IDS[i])
    .filter(Boolean)
  if (!lists.length) return []

  const out = []
  for (let depth = 0; out.length < MAX_TICKER_IDS; depth++) {
    let added = false
    for (const list of lists) {
      if (depth >= list.length) continue
      if (out.length >= MAX_TICKER_IDS) break
      if (!out.includes(list[depth])) { out.push(list[depth]); added = true }
    }
    if (!added) break          // every list exhausted
  }
  return out
}

// The short label a ticker row shows. The quote carries a symbol for crypto
// and metals; a stock id does not, so it falls back to the ticker in the id.
const METAL_LABELS = {
  [GOLD_ID]: 'GOLD', [SILVER_ID]: 'SILVER',
  [COPPER_ID]: 'COPPER', [PLATINUM_ID]: 'PLATINUM',
}
export function tickerLabel(id, quote) {
  if (METAL_LABELS[id]) return METAL_LABELS[id]
  if (id.startsWith(STOCK_PREFIX)) return id.slice(STOCK_PREFIX.length).toUpperCase()
  if (id.startsWith(FIAT_PREFIX)) return id.slice(FIAT_PREFIX.length).toUpperCase()
  return (quote?.symbol || id).toUpperCase()
}
