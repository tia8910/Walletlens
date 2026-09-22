import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Sector Rotation Heatmap sat on "Loading…" indefinitely on a deployment
// where the price pipeline was otherwise healthy — the ticker two elements
// above it was showing live quotes for most of the same coins.
//
// Two separate faults, and the second is what made the first permanent.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/SectorHeatmap.jsx'), 'utf8')

describe('the spinner can always end', () => {
  it('clears loading in a finally, not only on success', () => {
    // setLoading(false) used to live inside the .then, and fetchSectors had no
    // catch of its own. Anything thrown outside its inner try blocks left the
    // panel reading "Loading…" with no error, no Retry button and no way back:
    // a spinner outliving the request that started it.
    expect(src).toMatch(/\.finally\(\(\) => \{ if \(live\) setLoading\(false\) \}\)/)
    expect(src).toMatch(/\.catch\(\(\) => \{ if \(live\) setError/)
  })

  it('does not set state after the panel has gone', () => {
    // Every tier is a chain of six- and seven-second timeouts, so the panel can
    // be collapsed, or the dashboard unmounted, long before it finishes.
    expect(src).toMatch(/return \(\) => \{ live = false \}/)
  })
})

describe('where it gets its numbers', () => {
  it('asks the shared market snapshot before any third-party proxy', () => {
    // Every other tier is a third-party host behind a public CORS proxy. On a
    // network where those are slow or blocked, the heatmap worked through
    // ~20s of them and gave up — while market.json, served from our own
    // origin, already held the 7d change for most of these coins, and the
    // dashboard had usually loaded it before this component mounted.
    const snapshotAt = src.indexOf('getWhaleMarketSnapshot')
    const proxyAt = src.indexOf('PROXIES.map')
    expect(snapshotAt).toBeGreaterThan(-1)
    expect(proxyAt).toBeGreaterThan(-1)
    expect(snapshotAt).toBeLessThan(proxyAt)
  })

  it('keeps the proxy ladder as a fallback rather than replacing it', () => {
    // The snapshot is the top 250 by market cap, and a few of these sit
    // outside it. Losing the fallbacks would trade one blank panel for another.
    expect(src).toContain('min-api.cryptocompare.com')
    expect(src).toContain('api.binance.com/api/v3/klines')
  })

  it('ignores a snapshot that covers too few of the sectors', () => {
    // buildSectorResult averages whatever it is handed, so a snapshot matching
    // two coins would draw a confident heatmap out of nothing.
    expect(src).toContain('MIN_COVERAGE')
    expect(src).toMatch(/length >= MIN_COVERAGE/)
  })
})
