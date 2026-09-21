import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// A price below a dollar is a different problem from an amount of money.
//
// STONKBROKER rendered as $0.01 on its own asset page, and so would a token at
// $0.0051 and one at $0.0149 — three different assets, one displayed price.
// Anything under half a cent rendered as $0.00, which reads as worthless
// rather than small.
//
// Significant digits instead of decimal places, so precision follows
// magnitude: $0.0087 keeps its digits, $0.00000234 keeps its own, and a
// $75,964 bitcoin is not padded with zeroes. PricePage already worked this way.

const here = dirname(fileURLToPath(import.meta.url))
const detail = readFileSync(join(here, 'pages/AssetDetail.jsx'), 'utf8')
const dash = readFileSync(join(here, 'pages/Dashboard.jsx'), 'utf8')

// The rule under test, as both files implement it.
const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPrice = (n) => {
  const v = Number(n)
  if (!isFinite(v) || v === 0) return '0.00'
  if (Math.abs(v) >= 1) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v.toLocaleString('en-US', { maximumSignificantDigits: 6 })
}

describe('sub-dollar prices keep their digits', () => {
  it('stops collapsing distinct prices into $0.01', () => {
    expect(fmtPrice(0.0087)).toBe('0.0087')
    expect(fmtPrice(0.0149)).toBe('0.0149')
    expect(fmtPrice(0.0051)).toBe('0.0051')
    // The old rule made all three of those the same string.
    expect(new Set([fmt(0.0087), fmt(0.0149), fmt(0.0051)]).size).toBe(1)
  })

  it('stops rendering a small price as nothing', () => {
    // $0.00 reads as worthless rather than small, which for a memecoin is the
    // difference between a holding and a mistake.
    expect(fmt(0.00000234)).toBe('0.00')
    expect(fmtPrice(0.00000234)).toBe('0.00000234')
  })

  it('leaves money alone at a dollar and above', () => {
    expect(fmtPrice(75964.23)).toBe('75,964.23')
    expect(fmtPrice(2.5)).toBe('2.50')
    expect(fmtPrice(1)).toBe('1.00')
  })

  it('handles zero and junk without printing NaN', () => {
    expect(fmtPrice(0)).toBe('0.00')
    expect(fmtPrice(null)).toBe('0.00')
    expect(fmtPrice(undefined)).toBe('0.00')
    expect(fmtPrice('abc')).toBe('0.00')
  })

  it('keeps negatives signed', () => {
    expect(fmtPrice(-0.0087)).toBe('-0.0087')
  })
})

describe('prices and amounts stay separate', () => {
  it('uses the price formatter for per-unit figures on the asset page', () => {
    for (const call of ['fmtPrice(price)', 'fmtPrice(coin.high24)', 'fmtPrice(coin.low24)',
      'fmtPrice(coin.ath)', 'fmtPrice(avgBuy)', 'fmtPrice(tg.price)']) {
      expect(detail, `${call} missing`).toContain(call)
    }
    // The chart tooltip reads the same series as the headline number.
    expect(detail).toContain("'$' + fmtPrice(val)")
  })

  it('leaves dollar amounts on two decimals', () => {
    // A holding's value, a P&L and proceeds are money, and money has cents.
    expect(detail).toContain('${fmt(value)}')
    expect(detail).toMatch(/\{fmt\(pnl\)\}/)
    expect(detail).toContain('${fmt(proceeds)}')
  })

  it('fixes the same defect on the dashboard holdings row', () => {
    // cvPub formats the market price beside each holding, and had the bug too.
    expect(dash).toMatch(/const fmtPx = n => \{/)
    expect(dash).toMatch(/\$\{curConv\.sym\}\$\{sp\}\$\{fmtPx\(Math\.abs\(v\)\)\}/)
  })

  it('does not collide with the quantity formatter already there', () => {
    // Dashboard already had an fmtAmt for quantities; redeclaring it failed
    // the build rather than the tests.
    expect((dash.match(/const fmtAmt = /g) || [])).toHaveLength(1)
    expect((dash.match(/const fmtPx = /g) || [])).toHaveLength(1)
  })
})
