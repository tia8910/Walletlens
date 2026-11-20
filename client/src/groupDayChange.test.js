import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// A user read the Stocks and ETFs group totals as "not updating" while the
// rows moved: the header showed only the group's share, rounded, which barely
// changes. It now shows the group's own move today, like each row does.
const here = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(here, f), 'utf8')

describe('holdings group header', () => {
  it('computes each category\'s move today from its holdings', () => {
    const dash = read('pages/Dashboard.jsx')
    expect(dash).toMatch(/dayBefore\[cat\] = \(dayBefore\[cat\] \|\| 0\) \+ h\.value \/ \(1 \+ ch \/ 100\)/)
    expect(dash).toMatch(/dayPct: dayBefore\[cat\] > 0 \? \(\(dayNow\[cat\] - dayBefore\[cat\]\) \/ dayBefore\[cat\]\) \* 100 : null/)
  })
  it('shows it coloured beside the group total', () => {
    expect(read('components/NlHoldings.jsx')).toMatch(/g\.dayPct != null && !pricesFailed && <em className=\{g\.dayPct >= 0 \? 'up' : 'down'\}>\{pctTxt\(g\.dayPct\)\}<\/em>/)
  })
  it('weights by value: +10% on $1,000 and -10% on $9,000 is about -8.3%', () => {
    const rows = [{ value: 1000, ch: 10 }, { value: 9000, ch: -10 }]
    const now = rows.reduce((s, r) => s + r.value, 0)
    const before = rows.reduce((s, r) => s + r.value / (1 + r.ch / 100), 0)
    expect(((now - before) / before) * 100).toBeCloseTo(-8.33, 1)
  })
})
