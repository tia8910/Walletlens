import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Signals tab carries the alarm settings and the signal and goal alerts,
// the same panel as Alerts > Signals & goals.
const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'pages/Technicals.jsx'), 'utf8')

describe('Signals page', () => {
  it('shows Signals & goals under the chart, loaded on demand', () => {
    expect(src).toMatch(/const ProAlerts = lazy\(\(\) => import\('\.\.\/components\/ProAlerts'\)\)/)
    expect(src).toMatch(/<ProAlerts enriched=\{enriched\} prices=\{prices\} \/>/)
    expect(src.indexOf('<TechChartPanel')).toBeLessThan(src.indexOf('<ProAlerts'))
  })
})
