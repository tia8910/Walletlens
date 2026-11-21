import { describe, it, expect, beforeEach } from 'vitest'
import { shouldRenderHomeFallback, _resetHomeHop, HOME_HOP } from './homeHop'

function memStorage() {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }
}

describe('home hop guard', () => {
  beforeEach(() => _resetHomeHop())

  it('hops once on a fresh load and sets the flag', () => {
    const s = memStorage()
    expect(shouldRenderHomeFallback(false, s)).toBe(false)
    expect(s.getItem(HOME_HOP)).toBe('1')
  })

  it('gives the same answer however many times a page load asks (Suspense retries)', () => {
    const s = memStorage()
    const first = shouldRenderHomeFallback(false, s)
    for (let i = 0; i < 5; i++) expect(shouldRenderHomeFallback(false, s)).toBe(first)
    expect(s.getItem(HOME_HOP)).toBe('1')
  })

  it('renders the fallback on the load after a hop, and keeps rendering it', () => {
    const s = memStorage()
    s.setItem(HOME_HOP, '1')
    expect(shouldRenderHomeFallback(false, s)).toBe(true)
    // A retry after the flag was consumed must not hop again: that was the loop.
    expect(shouldRenderHomeFallback(false, s)).toBe(true)
    expect(s.getItem(HOME_HOP)).toBe(null)
  })

  it('never hops in dev or without storage', () => {
    expect(shouldRenderHomeFallback(true, memStorage())).toBe(true)
    _resetHomeHop()
    expect(shouldRenderHomeFallback(false, { getItem() { throw new Error('blocked') } })).toBe(true)
  })
})
