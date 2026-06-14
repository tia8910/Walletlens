// ── Holdings export: Excel (.xlsx) and PDF (print) ───────────────────────
// Excel uses the already-bundled `xlsx` package (dynamic import so it never
// hits the main bundle on first load). PDF uses a print-friendly HTML page
// opened in a new window — zero extra dependencies, works on mobile too.

function formatNum(n, decimals = 2) {
  if (!Number.isFinite(n)) return 0
  return Number(n.toFixed(decimals))
}

function rows(holdings, totalValue, currency = 'USD') {
  return holdings.map((h, i) => ({
    '#': i + 1,
    Symbol:    (h.coin_symbol || '').toUpperCase(),
    Name:      h.coin_name || h.coin_symbol || '',
    Amount:    formatNum(h.amount, 6),
    [`Price (${currency})`]: formatNum(h.price),
    [`Value (${currency})`]: formatNum(h.value),
    [`Invested (${currency})`]: formatNum(h.total_invested || 0),
    [`P&L (${currency})`]: formatNum(h.pnl || 0),
    'P&L %': formatNum(h.pnlPct || 0),
    'Allocation %': totalValue > 0 ? formatNum((h.value / totalValue) * 100) : 0,
    '24h %': formatNum(h.pct24h || 0),
  }))
}

export async function exportToExcel(holdings, totalValue, currency = 'USD') {
  const XLSX = (await import('xlsx')).default ?? (await import('xlsx'))
  const data = rows(holdings, totalValue, currency)

  const ws = XLSX.utils.json_to_sheet(data)

  // Column widths
  ws['!cols'] = [
    { wch: 4 }, { wch: 8 }, { wch: 18 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
  ]

  // Summary row at the bottom
  const totalInvested = holdings.reduce((s, h) => s + (h.total_invested || 0), 0)
  const totalPnL      = holdings.reduce((s, h) => s + (h.pnl || 0), 0)
  XLSX.utils.sheet_add_aoa(ws, [[
    '', 'TOTAL', '', '', '',
    formatNum(totalValue), formatNum(totalInvested), formatNum(totalPnL),
    totalInvested > 0 ? formatNum((totalPnL / totalInvested) * 100) : 0,
    100, '',
  ]], { origin: -1 })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Holdings')

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `walletlens-holdings-${date}.xlsx`)
}

export function exportToPDF(holdings, totalValue, totalPnL, totalPnLPct, currency = 'USD') {
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const fmt = (n, d = 2) => Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'
  const pnlColor = totalPnL >= 0 ? '#10b981' : '#f87171'

  const tableRows = holdings.map((h, i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td>${(h.coin_symbol || '').toUpperCase()}</td>
      <td class="name">${h.coin_name || ''}</td>
      <td class="num">${fmt(h.amount, 4)}</td>
      <td class="num">${fmt(h.price)}</td>
      <td class="num">${fmt(h.value)}</td>
      <td class="num">${fmt(h.total_invested || 0)}</td>
      <td class="num" style="color:${(h.pnl || 0) >= 0 ? '#10b981' : '#f87171'}">${(h.pnl || 0) >= 0 ? '+' : ''}${fmt(h.pnl || 0)}</td>
      <td class="num" style="color:${(h.pnlPct || 0) >= 0 ? '#10b981' : '#f87171'}">${(h.pnlPct || 0) >= 0 ? '+' : ''}${fmt(h.pnlPct || 0)}%</td>
      <td class="num">${totalValue > 0 ? fmt((h.value / totalValue) * 100) : '0.00'}%</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>WalletLens Holdings — ${date}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #0f172a; background: #fff; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #10b981; padding-bottom: 12px; }
  .brand { font-size: 20px; font-weight: 800; color: #10b981; letter-spacing: -0.03em; }
  .brand span { color: #0f172a; }
  .date { color: #64748b; font-size: 10px; margin-top: 3px; }
  .summary { display: flex; gap: 24px; margin-bottom: 20px; }
  .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; }
  .stat-label { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
  .stat-value { font-size: 18px; font-weight: 800; color: #0f172a; }
  .stat-value.green { color: #10b981; }
  .stat-value.red { color: #f87171; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  th { background: #0f172a; color: #fff; padding: 7px 8px; text-align: left; font-weight: 700; font-size: 9.5px; letter-spacing: 0.04em; text-transform: uppercase; }
  th.num, td.num { text-align: right; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
  td.name { color: #64748b; font-size: 9.5px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  tr.even td { background: #f8fafc; }
  tfoot td { font-weight: 800; background: #f1f5f9; border-top: 2px solid #0f172a; }
  .footer { margin-top: 16px; text-align: center; color: #94a3b8; font-size: 9px; }
  @media print { body { padding: 0; } @page { margin: 12mm 10mm; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="brand">Wallet<span>Lens</span></div>
    <div class="date">Holdings report · ${date} · ${currency}</div>
  </div>
  <div style="text-align:right; color:#64748b; font-size:9px;">${holdings.length} asset${holdings.length !== 1 ? 's' : ''}</div>
</div>
<div class="summary">
  <div class="stat">
    <div class="stat-label">Total Value</div>
    <div class="stat-value">${currency} ${fmt(totalValue)}</div>
  </div>
  <div class="stat">
    <div class="stat-label">All-Time P&L</div>
    <div class="stat-value ${totalPnL >= 0 ? 'green' : 'red'}">${totalPnL >= 0 ? '+' : ''}${currency} ${fmt(totalPnL)} (${fmt(totalPnLPct)}%)</div>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th>Symbol</th><th>Name</th><th class="num">Amount</th>
      <th class="num">Price</th><th class="num">Value</th>
      <th class="num">Invested</th><th class="num">P&L</th>
      <th class="num">P&L %</th><th class="num">Alloc.</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
  <tfoot>
    <tr>
      <td colspan="4"><strong>TOTAL</strong></td>
      <td class="num">${fmt(totalValue)}</td>
      <td class="num">${fmt(holdings.reduce((s, h) => s + (h.total_invested || 0), 0))}</td>
      <td class="num" style="color:${pnlColor}">${totalPnL >= 0 ? '+' : ''}${fmt(totalPnL)}</td>
      <td class="num" style="color:${pnlColor}">${totalPnL >= 0 ? '+' : ''}${fmt(totalPnLPct)}%</td>
      <td class="num">100%</td>
    </tr>
  </tfoot>
</table>
<div class="footer">Generated by WalletLens · walletlens.live · All data is private and stored locally on your device.</div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}
