// Pure portfolio math — testable without React, network, or storage.

// Net-balance fold over a transactions array. Returns
//   { [coin_id]: { amount, symbol, category } }
// Used by previewImportCode for the diff view, by the import preview
// chips, and by getPortfolio's aggregation.
export function foldBalances(transactions) {
  const out = {}
  for (const tx of (transactions || [])) {
    const id = String(tx.coin_id || '')
    if (!id) continue
    const amt = Number(tx.amount) || 0
    if (!out[id]) out[id] = { amount: 0, symbol: tx.coin_symbol, category: tx.category }
    if (tx.type === 'buy' || tx.type === 'deposit') out[id].amount += amt
    else if (tx.type === 'sell' || tx.type === 'withdraw') out[id].amount -= amt
    if (tx.coin_symbol) out[id].symbol = tx.coin_symbol
  }
  return out
}

// Diff two transaction lists into added / removed / changed at the
// holdings level. Used by previewImportCode.
export function diffHoldings(currentTxs, incomingTxs) {
  const a = foldBalances(currentTxs)
  const b = foldBalances(incomingTxs)
  const allIds = new Set([...Object.keys(a), ...Object.keys(b)])
  const added = [], removed = [], changed = []
  for (const id of allIds) {
    const aa = a[id]?.amount || 0
    const bb = b[id]?.amount || 0
    if (aa < 1e-9 && bb > 1e-9) added.push({ coin_id: id, symbol: b[id].symbol, amount: bb })
    else if (aa > 1e-9 && bb < 1e-9) removed.push({ coin_id: id, symbol: a[id].symbol, amount: aa })
    else if (Math.abs(aa - bb) > 1e-9) changed.push({ coin_id: id, symbol: b[id]?.symbol || a[id]?.symbol, from: aa, to: bb })
  }
  return { added, removed, changed, hasChanges: added.length + removed.length + changed.length > 0 }
}
