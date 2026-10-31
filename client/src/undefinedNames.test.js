import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Two handlers named variables that did not exist in their scope. Both threw
// a ReferenceError the moment they ran, and neither had a test that ran them.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('handlers only use names in their own scope', () => {
  it('the dashboard reloads on wl:portfolio-updated without touching the polling clock', () => {
    // lastLoadAll belongs to the polling effect. Assigning it from the event
    // listener threw before loadAll ran, so a trade did not refresh the
    // dashboard until the next five-minute poll.
    const src = read('pages/Dashboard.jsx')
    const handler = src.match(/const onPortfolioUpdated = \(\) => \{([^}]*)\}/)
    expect(handler).not.toBeNull()
    expect(handler[1]).not.toMatch(/lastLoadAll/)
    expect(handler[1]).toMatch(/loadAllRef\.current\?\.\(\)/)
  })

  it('the correlation matrix Retry runs the real loader', () => {
    const src = read('components/CorrelationMatrix.jsx')
    expect(src).not.toMatch(/_cache = null; compute\(\)/)
    expect(src).toMatch(/_cache = null; computeRef\.current\?\.\(\)/)
  })
})
