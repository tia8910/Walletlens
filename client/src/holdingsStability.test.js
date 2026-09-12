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
