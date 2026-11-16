import { describe, it, expect, afterEach, vi } from 'vitest'
import { exportToExcel, XLSX_MIME, exportToPDF, buildHoldingsPdf, PDF_MIME, pdfText } from './exportHoldings'

// The Holdings card's Excel button did nothing in the Android app: the file
// was handed to XLSX.writeFile, which clicks a download link, and the app's
// WebView ignores those without a word. It now goes through fileOut's
// saveFile, which gives the bytes to the app to put in Downloads.

const holdings = [
  { coin_symbol: 'eth', coin_name: 'Ethereum', amount: 1.375959, price: 1849.79, value: 2545.23, total_invested: 2400, pnl: 145.23, pnlPct: 6.05, pct24h: 2.65 },
  { coin_symbol: 'apt', coin_name: 'Aptos', amount: 2000, price: 0.4665, value: 933, total_invested: 1000, pnl: -67, pnlPct: -6.7, pct24h: 4.18 },
]

afterEach(() => { delete window.AndroidBridge; vi.restoreAllMocks() })

describe('Excel export', () => {
  it('in the Android app, hands a real .xlsx to the app to save', async () => {
    const saveFile = vi.fn(() => true)
    window.AndroidBridge = { saveFile, shareFile: vi.fn() }
    expect(await exportToExcel(holdings, 3478.23, 'USD')).toBe(true)
    expect(saveFile).toHaveBeenCalledTimes(1)
    const [name, mime, b64] = saveFile.mock.calls[0]
    expect(name).toMatch(/^walletlens-holdings-\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(mime).toBe(XLSX_MIME)
    expect(b64.startsWith('UEsD')).toBe(true)                     // a zip: what an .xlsx is
    expect(atob(b64).length).toBeGreaterThan(1000)
  })

  it('in a browser, still downloads the file', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    URL.createObjectURL ||= () => 'blob:x'
    URL.revokeObjectURL ||= () => {}
    expect(await exportToExcel(holdings, 3478.23, 'USD')).toBe(true)
    expect(click).toHaveBeenCalledTimes(1)
  })
})

describe('PDF export', () => {
  it('in the Android app, hands a real PDF to the app to save', async () => {
    // It was a print window: the app's WebView opens no windows and cannot print.
    const saveFile = vi.fn(() => true)
    window.AndroidBridge = { saveFile, shareFile: vi.fn() }
    const open = vi.spyOn(window, 'open')
    expect(await exportToPDF(holdings, 3478.23, 78.23, 2.3, 'USD')).toBe(true)
    expect(open).not.toHaveBeenCalled()
    const [name, mime, b64] = saveFile.mock.calls[0]
    expect(name).toMatch(/^walletlens-holdings-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(mime).toBe(PDF_MIME)
    expect(atob(b64).startsWith('%PDF-')).toBe(true)
  })

  it('carries every holding, the totals and the brand', async () => {
    const blob = await buildHoldingsPdf(holdings, 3478.23, 78.23, 2.3, 'USD', new Date('2026-11-16T12:00:00Z'))
    const text = await blob.text()
    for (const s of ['ETH', 'Ethereum', 'APT', 'Aptos', '2,545.23', '933.00', '3,478.23', 'TOTAL', 'WalletLens', 'November 16, 2026', '0.4665']) expect(text).toContain(s)
  })

  it('keeps names to what the PDF fonts can draw', () => {
    expect(pdfText('Aptos')).toBe('Aptos')
    expect(pdfText('سهم البنك')).toBe('')
    expect(pdfText('Café 🚀 Coin')).toBe('Café Coin')
  })
})

