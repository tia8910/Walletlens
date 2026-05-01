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

// Aggregate transactions into holdings rows compatible with getPortfolio's
// existing shape. Pure (no localStorage) — useful for tests and for
// reconstructing snapshots.
export function aggregatePortfolio(transactions) {
  const holdings = {}
  for (const tx of (transactions || [])) {
    if (!holdings[tx.coin_id]) {
      holdings[tx.coin_id] = {
        coin_id: tx.coin_id,
        coin_symbol: tx.coin_symbol,
        coin_name: tx.coin_name || '',
        coin_image: tx.coin_image || '',
        category: tx.category || 'crypto',
        amount: 0,
        total_invested: 0,
      }
    }
    if (tx.coin_name) holdings[tx.coin_id].coin_name = tx.coin_name
    if (tx.coin_image) holdings[tx.coin_id].coin_image = tx.coin_image
    if (tx.category) holdings[tx.coin_id].category = tx.category

    const total = Number(tx.total_cost) || 0
    if (tx.type === 'buy' || tx.type === 'deposit') {
      holdings[tx.coin_id].amount += Number(tx.amount) || 0
      holdings[tx.coin_id].total_invested += total
    } else if (tx.type === 'sell' || tx.type === 'withdraw') {
      holdings[tx.coin_id].amount -= Number(tx.amount) || 0
      holdings[tx.coin_id].total_invested -= total
    }
  }
  return Object.values(holdings).filter(h => h.amount > 0.00000001)
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
