import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sessionOpen } from './data/markets'

// Egyptian (and Gulf) prices come from a free, delayed source. What can be
// done for free is not adding delay of our own: while a local exchange is in
// session its quotes are re-asked every 20 s and edge-cached for 15 s, and the
// asset page says when the quote is from.

const at = (iso) => new Date(iso).getTime()
const read = (p) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), p), 'utf8')

describe('sessionOpen', () => {
  it('knows the EGX session, Sunday to Thursday 10:00 to 14:30 Cairo', () => {
    // 2026-10-25 is a Sunday. Cairo is UTC+3 in October 2026 (summer time).
    expect(sessionOpen('ETEL.CA', at('2026-10-25T08:00:00Z'))).toBe(true)   // 11:00
    expect(sessionOpen('ETEL.CA', at('2026-10-25T06:30:00Z'))).toBe(false)  // 09:30
    expect(sessionOpen('ETEL.CA', at('2026-10-25T11:45:00Z'))).toBe(false)  // 14:45
    expect(sessionOpen('ETEL.CA', at('2026-10-23T08:00:00Z'))).toBe(false)  // Friday
  })

  it('knows the UAE trades Monday to Friday', () => {
    expect(sessionOpen('EMAAR.AE', at('2026-10-23T08:00:00Z'))).toBe(true)  // Friday 12:00 Dubai
    expect(sessionOpen('EMAAR.AE', at('2026-10-25T08:00:00Z'))).toBe(false) // Sunday
  })

  it('treats US tickers and unknown suffixes as not local', () => {
    expect(sessionOpen('AAPL', at('2026-10-25T08:00:00Z'))).toBe(false)
    expect(sessionOpen('BRK.B', at('2026-10-25T08:00:00Z'))).toBe(false)
  })
})

describe('the fresher path', () => {
  it('re-asks an open local listing after 20 s instead of 2 min', () => {
    const api = read('api.js')
    expect(api).toMatch(/const LIVE_INTL_MS = 20_000/)
    expect(api).toMatch(/intlStale\(t, now\)\)/)
  })

  it('keeps the edge cache short while a requested market is open', () => {
    const fn = read('../../functions/api/stocks.js')
    expect(fn).toMatch(/import \{ sessionOpen \} from '\.\.\/\.\.\/client\/src\/data\/markets\.js'/)
    expect(fn).toMatch(/live \? LIVE_CACHE_SECONDS : CACHE_SECONDS/)
    expect(fn).toMatch(/as_of: q\.asOf/)
  })

  it('shows on the asset page when the quote is from', () => {
    const page = read('pages/AssetDetail.jsx')
    expect(page).toMatch(/className="ac-asof"/)
    expect(page).toMatch(/setInterval\(tick, 20_000\)/)
  })
})
