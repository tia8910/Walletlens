import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drumFaces, frontFace, DRUM_MAX } from './components/HoldingsDrum'

// The balance card's three logos and "+N" became a drum that rolls through
// every holding with today's move.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')
const hs = (n) => Array.from({ length: n }, (_, i) => ({ coin_id: `c${i}`, coin_symbol: `C${i}`, pct24h: i - 2 }))

describe('the holdings drum', () => {
  it('shows every holding, up to a limit, then "+N" for the rest', () => {
    expect(drumFaces(hs(4))).toHaveLength(4)
    const many = drumFaces(hs(15))
    expect(many).toHaveLength(DRUM_MAX)
    expect(many[DRUM_MAX - 1]).toEqual({ more: 15 - (DRUM_MAX - 1) })
    expect(drumFaces([null, { coin_symbol: 'X' }])).toHaveLength(0)
  })
  it('knows which face is in front, to stop square on it', () => {
    expect(frontFace(0, 6)).toBe(0)
    expect(frontFace(61, 6)).toBe(1)
    expect(frontFace(359, 6)).toBe(0)
    expect(frontFace(-60, 6)).toBe(5)
  })
  it('replaces the old logo stack on the balance card', () => {
    const top = read('components/HomeTop.jsx')
    expect(top).toMatch(/<HoldingsDrum holdings=\{enriched\} label=\{t\('nlHoldings'\)\} \/>/)
    expect(top).not.toMatch(/className="nl-stack"/)
  })
  it('rests off screen and respects reduced motion', () => {
    const src = read('components/HoldingsDrum.jsx')
    expect(src).toMatch(/visible && !document\.hidden && !pausedRef\.current/)
    expect(src).toMatch(/prefers-reduced-motion: reduce/)
    expect(src).toMatch(/aria-pressed=\{paused\}/)
  })
})
