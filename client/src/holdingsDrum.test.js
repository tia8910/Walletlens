import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drumFaces, frontFace, drumTicker, drumWidth } from './components/HoldingsDrum'

// The balance card's three logos and "+N" became a drum that rolls through
// every holding with today's move.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')
const hs = (n) => Array.from({ length: n }, (_, i) => ({ coin_id: `c${i}`, coin_symbol: `C${i}`, pct24h: i - 2 }))

describe('the holdings drum', () => {
  it('shows every holding, each a button that opens it', () => {
    expect(drumFaces(hs(4))).toHaveLength(4)
    expect(drumFaces(hs(25))).toHaveLength(25)
    expect(drumFaces([null, { coin_symbol: 'X' }])).toHaveLength(0)
    const src = read('components/HoldingsDrum.jsx')
    expect(src).toMatch(/onClick=\{open\(f\)\}/)
    expect(src).toMatch(/onAsset\?\.\(f\)/)
    expect(read('components/HomeTop.jsx')).toMatch(/onAsset=\{onAsset\}/)
  })
  it('shows every ticker in full, and widens to fit the longest', () => {
    expect(drumTicker({ coin_symbol: 'COMI.CA' })).toBe('COMI.CA')
    expect(drumTicker({ coin_symbol: 'aapl' })).toBe('AAPL')
    expect(drumTicker({ coin_symbol: 'STONKBROKER' })).toBe('STONKBROKER')
    expect(drumWidth([{ coin_symbol: 'ETH' }])).toBe(116)
    expect(drumWidth([{ coin_symbol: 'COMI.CA' }])).toBe(120)
    expect(drumWidth([{ coin_symbol: 'STONKBROKER' }])).toBe(152)
    expect(drumWidth([{ coin_symbol: 'US TREASURY 10Y' }])).toBe(160)
    expect(read('v3.css')).not.toMatch(/\.nl-drum-face b \{[^}]*text-overflow/)
  })
  it('spins by drag and does not open a holding at the end of a drag', () => {
    const src = read('components/HoldingsDrum.jsx')
    expect(src).toMatch(/angle\.current = d\.a - \(dy \/ FACE_H\) \* step/)
    expect(src).toMatch(/if \(box\.current\?\.dataset\.dragged\)/)
  })
  it('knows which face is in front, to stop square on it', () => {
    expect(frontFace(0, 6)).toBe(0)
    expect(frontFace(61, 6)).toBe(1)
    expect(frontFace(359, 6)).toBe(0)
    expect(frontFace(-60, 6)).toBe(5)
  })
  it('replaces the old logo stack on the balance card', () => {
    const top = read('components/HomeTop.jsx')
    expect(top).toMatch(/<HoldingsDrum holdings=\{enriched\} label=\{t\('nlHoldings'\)\} onAsset=\{onAsset\} \/>/)
    expect(top).not.toMatch(/className="nl-stack"/)
  })
  it('rests off screen and respects reduced motion', () => {
    const src = read('components/HoldingsDrum.jsx')
    expect(src).toMatch(/visible && !document\.hidden && idle/)
    expect(src).toMatch(/prefers-reduced-motion: reduce/)
  })
})
