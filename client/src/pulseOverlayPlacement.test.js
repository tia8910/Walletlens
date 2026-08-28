import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// THE BUG: <PulseOverlay> was rendered inside `{activeTab === 'overview' && (`.
//
// The event that drives it is detected from prices, in an effect that does not
// depend on the active tab — and the active tab is restored from sessionStorage
// on reload. So a user whose last tab was Backup would refresh, fire a pulse,
// hear the held sound on their next tap, and never see the animation. The
// effect existed and was unreachable from five of the six tabs, which is
// exactly "it just makes a sound and the explode doesn't work".

const SRC = dirname(fileURLToPath(import.meta.url))
const dash = readFileSync(join(SRC, 'pages', 'Dashboard.jsx'), 'utf8')

describe('the pulse overlay is reachable from every tab', () => {
  it('is rendered exactly once', () => {
    const uses = dash.match(/<PulseOverlay\b/g) || []
    expect(uses).toHaveLength(1)
  })

  it('is not inside a tab conditional', () => {
    const at = dash.indexOf('<PulseOverlay')
    expect(at).toBeGreaterThan(-1)

    // Every tab block opens with `{activeTab === '...' && (`. If the last one
    // opened before the overlay has not been closed by the time we reach it,
    // the overlay is inside it. Counting brace depth is brittle here; the
    // reliable signal is that the overlay sits above the FIRST tab block.
    const firstTabBlock = dash.search(/\{activeTab === '/)
    expect(firstTabBlock).toBeGreaterThan(-1)
    expect(at, 'the overlay must be mounted before any tab block opens').toBeLessThan(firstTabBlock)
  })

  it('sits alongside the other always-on chrome', () => {
    // NewsTicker is the established "renders on every tab" element; the
    // overlay belongs in the same region.
    const overlay = dash.indexOf('<PulseOverlay')
    const ticker = dash.indexOf('<NewsTicker />')
    expect(ticker).toBeGreaterThan(-1)
    expect(Math.abs(overlay - ticker)).toBeLessThan(900)
  })

  it('still clears its event when the animation finishes', () => {
    expect(dash).toMatch(/<PulseOverlay event=\{pulseEvent\} onDone=\{\(\) => setPulseEvent\(null\)\} \/>/)
  })
})
