import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Holdings appearing and disappearing.
//
// api.getPrices fans out per asset class, each with its own timeout and
// upstream: crypto in one batch, stocks in a batch plus a request per ticker
// the batch missed, metals, fiat. A tick where any one of those is slow or
// rate-limited resolves with a SUBSET. Both call sites ASSIGNED that subset,
// so every id missing from it lost its price, valued at 0, and fell to the
// bottom of a list sorted by value — which reads as the row vanishing.

const here = dirname(fileURLToPath(import.meta.url))
const dash = readFileSync(join(here, 'pages/Dashboard.jsx'), 'utf8')

describe('a known price is never lost', () => {
  it('merges every quote into the ones already held', () => {
    expect(dash).toMatch(/setPrices\(prev => \{/)
    expect(dash).toMatch(/changed \? \{ \.\.\.prev, \.\.\.next \} : prev/)
  })

  it('never assigns a response straight over the map', () => {
    // The two call sites that caused this. Any new one has to go through
    // mergePrices as well.
    for (const m of dash.matchAll(/setPrices\(([^)]*)\)/g)) {
      expect(m[1].trim(), `setPrices(${m[1]}) bypasses the merge`).toMatch(/^prev =>/)
    }
  })

  it('ignores an empty response rather than treating it as "no prices"', () => {
    const fn = dash.slice(dash.indexOf('const mergePrices'))
    const body = fn.slice(0, fn.indexOf('\n  }, []'))
    expect(body).toMatch(/if \(!keys\.length\) return/)
  })

  it('keeps the same object when nothing moved, so a no-op tick re-renders nothing', () => {
    const fn = dash.slice(dash.indexOf('const mergePrices'))
    expect(fn.slice(0, fn.indexOf('\n  }, []'))).toMatch(/let changed = false/)
  })

  it('paints from the cache before the network call returns', () => {
    // getCachedPrices is synchronous and holds the last quote for every id
    // already seen, so a row opens with a value instead of a zero.
    expect(dash).toMatch(/mergePrices\(api\.getCachedPrices\(allIds\)\)/)
    const load = dash.slice(dash.indexOf('mergePrices(api.getCachedPrices(allIds))'))
    expect(load.indexOf('mergePrices(api.getCachedPrices')).toBeLessThan(load.indexOf('await api.getPrices'))
  })
})

describe('the order a holding sits in', () => {
  it('does not mutate the memoised array it sorts', () => {
    expect(dash).toMatch(/\(assetsByCat\[cat\] \|\| \[\]\)\.slice\(\)\.sort\(/)
  })

  it('breaks a tie on something stable, not on argument order', () => {
    const sort = dash.slice(dash.indexOf('(assetsByCat[cat] || []).slice().sort('))
    expect(sort.slice(0, 320)).toMatch(/localeCompare/)
  })
})

describe('the collapsed holdings list', () => {
  const win = dash.slice(dash.indexOf('const PREVIEW_ROWS'), dash.indexOf('// Holdings grouped by category'))

  it('shows a normal portfolio outright, with no window at all', () => {
    // Six was low enough that most portfolios had something just outside it,
    // and the list is sorted by value: a holding near the boundary crossed it
    // whenever a quote moved, so it appeared and disappeared on the refresh.
    expect(win).toMatch(/const PREVIEW_ROWS = 12/)
    expect(win).toMatch(/if \(filteredHoldings\.length <= PREVIEW_ROWS\) return filteredHoldings/)
  })

  it('pins which holdings the window shows, so a price cannot swap one out', () => {
    expect(win).toMatch(/previewRef\.current = \{ key, ids:/)
    expect(win).toMatch(/filteredHoldings\.filter\(h => keep\.has\(h\.coin_id\)\)/)
  })

  it('keys the pin on the set of holdings, the sort and the filter, never on a value', () => {
    const key = win.slice(win.indexOf('const key ='), win.indexOf('\n    if (previewRef'))
    expect(key).toMatch(/map\(h => h\.coin_id\)\.sort\(\)/)
    expect(key).toMatch(/holdingsSort/)
    expect(key).not.toMatch(/h\.value(?!\s*>\s*0)/)
  })

  it('re-chooses the window once prices land, rather than freezing an unpriced order', () => {
    // The first pass runs before any quote arrives, when every value is 0 and
    // the order is arbitrary. Pinning that would freeze the wrong twelve.
    expect(win).toMatch(/const priced = filteredHoldings\.some\(h => h\.value > 0\)/)
    expect(win).toMatch(/#\$\{priced\}/)
  })

  it('never renders an empty list because the pin went stale', () => {
    expect(win).toMatch(/pinned\.length \? pinned : filteredHoldings\.slice\(0, PREVIEW_ROWS\)/)
  })

  it('still lets the user open the whole list', () => {
    expect(win).toMatch(/if \(showAllHoldings \|\| isHoldingsFiltered\) return filteredHoldings/)
  })
})
