// ── Holdings export: Excel (.xlsx) and PDF ──────────────────────────────────
// Both are built on the device (xlsx and jsPDF, each loaded only when its
// button is tapped) and saved with fileOut's saveFile, which works in the
// Android app as well as in a browser.

import { saveFile } from './fileOut'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

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

  // Saved through fileOut, not XLSX.writeFile: writeFile clicks a download
  // link, which the Android app's WebView ignores without a word, so the
  // Excel button did nothing there. saveFile hands the bytes to the app,
  // which puts the file in Downloads; in a browser it downloads as before.
  const date = new Date().toISOString().slice(0, 10)
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return saveFile(new Blob([bytes], { type: XLSX_MIME }), `walletlens-holdings-${date}.xlsx`)
}

// ── PDF ─────────────────────────────────────────────────────────────────────
// A real PDF file, drawn with jsPDF and saved like the Excel file.
//
// It used to be an HTML page written into window.open('') and printed. The
// Android app's WebView opens no windows and cannot print, so the PDF button
// did nothing there. jsPDF is loaded only when someone taps PDF.

export const PDF_MIME = 'application/pdf'

// The built-in PDF fonts cover Latin-1 only. Anything else (an Arabic coin
// name, an emoji) would print as garbage, so it is dropped, and a name with
// nothing left falls back to the ticker.
export const pdfText = (v) => String(v ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '').replace(/\s+/g, ' ').trim()

const GREEN = [22, 163, 74], RED = [220, 38, 38], INK = [15, 23, 42], SUB = [100, 116, 139], LINE = [226, 232, 240]

// The WalletLens magnifier, drawn with the same geometry as Logo.jsx (64 unit box).
function drawLogo(doc, x, y, size) {
  const k = size / 64, P = (v) => v * k
  doc.setDrawColor(...GREEN); doc.setFillColor(...GREEN)
  doc.setLineWidth(P(5.5)); doc.setLineCap('round')
  doc.circle(x + P(27), y + P(25), P(19), 'S')
  doc.line(x + P(13.5), y + P(39), x + P(4), y + P(55))
  doc.setFillColor(74, 222, 128); doc.circle(x + P(40.5), y + P(11.5), P(3.8), 'F')
  doc.setFillColor(...GREEN)
  for (const [bx, by, bh] of [[14.5, 26.5, 7.5], [21.5, 21, 13], [28.5, 15.5, 18.5]]) doc.roundedRect(x + P(bx), y + P(by), P(5), P(bh), P(1.2), P(1.2), 'F')
}

export async function buildHoldingsPdf(holdings, totalValue, totalPnL, totalPnLPct, currency = 'USD', when = new Date()) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), M = 12
  const fmt = (n, d = 2) => Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-'
  // A price under a dollar keeps its significant digits: 0.03954, not 0.04.
  const price = (n) => !Number.isFinite(n) ? '-' : Math.abs(n) >= 1 || n === 0 ? fmt(n) : n.toLocaleString('en-US', { maximumSignificantDigits: 4 })
  const signed = (n, d = 2, suffix = '') => `${(n || 0) >= 0 ? '+' : ''}${fmt(n || 0, d)}${suffix}`
  const date = when.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
  const invested = holdings.reduce((s, h) => s + (h.total_invested || 0), 0)

  // Header: logo, name, date; the asset count on the right; a green rule.
  drawLogo(doc, M, 10, 13)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...GREEN); doc.text('Wallet', M + 16, 17)
  doc.setTextColor(...INK); doc.text('Lens', M + 16 + doc.getTextWidth('Wallet'), 17)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...SUB)
  doc.text(`Holdings report  ·  ${date}  ·  ${pdfText(currency)}`, M + 16, 22.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...INK)
  doc.text(String(holdings.length), W - M, 16, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...SUB)
  doc.text(holdings.length === 1 ? 'asset' : 'assets', W - M, 21, { align: 'right' })
  doc.setDrawColor(16, 185, 129); doc.setLineWidth(0.6); doc.line(M, 27, W - M, 27)

  // Summary: total value and all-time P&L.
  const stat = (x, label, value, color) => {
    doc.setFillColor(248, 250, 252); doc.setDrawColor(...LINE); doc.setLineWidth(0.3)
    doc.roundedRect(x, 31, 80, 17, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...SUB); doc.text(label.toUpperCase(), x + 4, 36.5)
    doc.setFontSize(13); doc.setTextColor(...color); doc.text(value, x + 4, 44)
  }
  stat(M, 'Total value', `${pdfText(currency)} ${fmt(totalValue)}`, INK)
  stat(M + 86, 'All-time P&L', `${signed(totalPnL)} (${signed(totalPnLPct, 2, '%')})`, (totalPnL || 0) >= 0 ? GREEN : RED)

  const pnlCols = [6, 7]
  autoTable(doc, {
    startY: 53,
    margin: { left: M, right: M },
    head: [['Symbol', 'Name', 'Amount', 'Price', 'Value', 'Invested', 'P&L', 'P&L %', 'Alloc.']],
    body: holdings.map(h => {
      const sym = pdfText((h.coin_symbol || '').toUpperCase())
      return [sym, pdfText(h.coin_name) || sym, fmt(h.amount, 4), price(h.price), fmt(h.value), fmt(h.total_invested || 0),
        signed(h.pnl), signed(h.pnlPct, 2, '%'), `${totalValue > 0 ? fmt((h.value / totalValue) * 100) : '0.00'}%`]
    }),
    foot: [['TOTAL', '', '', '', fmt(totalValue), fmt(invested), signed(totalPnL), signed(totalPnLPct, 2, '%'), '100%']],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: INK, lineColor: LINE },
    headStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { textColor: SUB, cellWidth: 52 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
    didParseCell: (c) => {
      if (c.section === 'head' && c.column.index >= 2) c.cell.styles.halign = 'right'
      if (c.section === 'foot' && c.column.index >= 2) c.cell.styles.halign = 'right'
      if ((c.section === 'body' || c.section === 'foot') && pnlCols.includes(c.column.index)) {
        c.cell.styles.textColor = String(c.cell.raw).startsWith('-') ? RED : GREEN
      }
    },
    // Footer on every page.
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight()
      doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, H - 12, W - M, H - 12)
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GREEN)
      const tail = '  ·  walletlens.live  ·  Your data is private and stored locally on your device.'
      const total = doc.getTextWidth('WalletLens') + (doc.setFont('helvetica', 'normal'), doc.getTextWidth(tail))
      const x0 = (W - total) / 2
      doc.setFont('helvetica', 'bold'); doc.text('WalletLens', x0, H - 7)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184); doc.text(tail, x0 + doc.getTextWidth('WalletLens') + 0.1, H - 7)
    },
  })
  return doc.output('blob')
}

export async function exportToPDF(holdings, totalValue, totalPnL, totalPnLPct, currency = 'USD') {
  const blob = await buildHoldingsPdf(holdings, totalValue, totalPnL, totalPnLPct, currency)
  const date = new Date().toISOString().slice(0, 10)
  return saveFile(blob, `walletlens-holdings-${date}.pdf`)
}
