import { describe, it, expect } from 'vitest'
import { squarify } from './pages/Dashboard'

// The heatmap tiles its whole box: no holes beside big tiles, nothing outside.

describe('heatmap treemap', () => {
  const weights = [41.5, 26.2, 12.7, 6, 5, 4.6, 4]
  const rects = squarify(weights.map(weight => ({ weight })), 0, 0, 360, 260)

  it('fills the box exactly, with areas in proportion', () => {
    const total = rects.reduce((s, r) => s + r.w * r.h, 0)
    expect(total).toBeCloseTo(360 * 260, 3)
    const sum = weights.reduce((a, b) => a + b, 0)
    rects.forEach((r, i) => expect(r.w * r.h).toBeCloseTo((weights[i] / sum) * 360 * 260, 3))
  })

  it('keeps every tile inside the box', () => {
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-6)
      expect(r.y).toBeGreaterThanOrEqual(-1e-6)
      expect(r.x + r.w).toBeLessThanOrEqual(360 + 1e-6)
      expect(r.y + r.h).toBeLessThanOrEqual(260 + 1e-6)
    }
  })
})
