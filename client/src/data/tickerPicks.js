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
export const INTEREST_TICKER_IDS = {
  crypto:      ['bitcoin', 'ethereum', 'solana', 'ripple', 'binancecoin'],
  stablecoins: ['tether'],
  stocks:      [`${STOCK_PREFIX}aapl`, `${STOCK_PREFIX}msft`, `${STOCK_PREFIX}nvda`, `${STOCK_PREFIX}tsla`],
  etfs:        [`${STOCK_PREFIX}spy`, `${STOCK_PREFIX}qqq`, `${STOCK_PREFIX}voo`],
  gold:        [GOLD_ID],
  silver:      [SILVER_ID],
  commodities: [COPPER_ID, PLATINUM_ID],
  cash:        [`${FIAT_PREFIX}eur`, `${FIAT_PREFIX}gbp`],
  // realestate and bonds: priced by hand in this app, so no feed to show.
}

// A ceiling on the strip, because interests are multi-select and someone who
// taps everything would otherwise fan out a request per class on a 60s loop.
// getPrices batches per class, so the cost is roughly one request per class
// present, not per symbol.
export const MAX_TICKER_IDS = 14

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
