import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { niceStep, fitLevels, spread } from './components/SignalChart'

describe('chart layout', () => {
  it('uses round price steps', () => {
    expect(niceStep(1000)).toBe(250)
    expect(niceStep(0.37)).toBeCloseTo(0.1)
    expect(niceStep(4300 - 3900)).toBe(100)
  })

  it('pins a far-away target to the edge instead of squashing the candles', () => {
    // Gold: candles 4,100–5,000, TP3 at 3,031 used to stretch the scale to it.
    const f = fitLevels(4100, 5000, [{ label: 'TP1', v: 4028 }, { label: 'TP3', v: 3031 }, { label: 'SL', v: 4900 }])
    expect(f.lo).toBe(4028)
    expect(f.pinned.map(p => p.label)).toEqual(['TP3'])
    expect(f.pinned[0].edge).toBe('bottom')
  })

  it('spreads tags apart so they never overlap', () => {
    const ys = spread([100, 104, 106, 200], 13, 0, 300)
    const sorted = [...ys].sort((a, b) => a - b)
    for (let k = 1; k < sorted.length; k++) expect(sorted[k] - sorted[k - 1]).toBeGreaterThanOrEqual(13)
    expect(ys[3]).toBe(200)
  })

  it('keeps spread tags inside the chart', () => {
    const ys = spread([295, 298, 299], 13, 0, 300)
    expect(Math.max(...ys)).toBeLessThanOrEqual(300)
  })
})

describe('chart label colours', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'v2.css'), 'utf8')
  it('writes every label in white', () => {
    expect(css).toMatch(/\.sc-cross text \{ fill: #fff;/)
    expect(css).toMatch(/\.sc-sig text \{ fill: #fff;/)
    expect(css).toMatch(/\.sc-level text \{ fill: #fff;/)
  })
  it('puts white text on the dark tag fills, not the light line colours', () => {
    // White on the dark theme's line green (#34d399) is 1.9:1.
    for (const sel of ['sc-cross rect', 'sc-sig.is-buy path, html.wl-v2 .sc-sig.is-buy rect', 'sc-level.is-tp rect', 'sc-level.is-entry rect']) {
      const rule = css.slice(css.indexOf(`.${sel}`)).split('}')[0]
      expect(rule).toMatch(/var\(--sc-tag-/)
    }
  })
})
