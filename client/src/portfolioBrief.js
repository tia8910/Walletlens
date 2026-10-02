// The day in one sentence: "Your portfolio is up +2.6% today. 2 winners and
// 1 loser. BTC leads at +3.7%. AAPL trails at -0.8%."
//
// Returned split rather than joined. The opening clause is the one that
// carries the verdict and the only part that takes the status colour; the
// new look's mood banner already says it in its title, so it shows `rest`.
export function briefParts(enriched, totalValue, dayPct, t) {
  if (!enriched?.length || totalValue <= 0) return null
  const parts = []
  const pctStr = (dayPct >= 0 ? '+' : '') + dayPct.toFixed(1) + '%'
  parts.push(t('dsSummaryStatus')(pctStr, dayPct >= 0))

  let winners = 0, losers = 0
  let topSym = '', topChg = -Infinity
  let worstSym = '', worstChg = Infinity
  for (const h of enriched) {
    const chg = h.pct24h ?? 0
    if (chg > 0.01) winners++
    else if (chg < -0.01) losers++
    if (chg > topChg) { topChg = chg; topSym = h.coin_symbol?.toUpperCase() }
    if (chg < worstChg) { worstChg = chg; worstSym = h.coin_symbol?.toUpperCase() }
  }
  const counts = []
  if (winners) counts.push(t('dsSummaryWinners')(winners))
  if (losers) counts.push(t('dsSummaryLosers')(losers))
  if (counts.length) parts.push(counts.join(t('dsSummaryAnd')()))
  if (topChg > 0.01) parts.push(t('dsSummaryLeads')(topSym, topChg.toFixed(1)))
  if (worstChg < -0.01 && worstSym !== topSym) parts.push(t('dsSummaryTrails')(worstSym, worstChg.toFixed(1)))

  return { head: parts[0] + '.', rest: parts.slice(1).join('. ') + (parts.length > 1 ? '.' : '') }
}
