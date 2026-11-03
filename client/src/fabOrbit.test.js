import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The add button's asset orbit: four chips circling the plus.
const here = dirname(fileURLToPath(import.meta.url))
const nav = readFileSync(join(here, 'components/BottomNav.jsx'), 'utf8')
const css = readFileSync(join(here, 'v3.css'), 'utf8')

describe('add button asset orbit', () => {
  it('is decoration: hidden from screen readers and never takes a tap', () => {
    expect(nav).toMatch(/<span className="wl-fab-orbit" aria-hidden="true">/)
    expect(css).toMatch(/\.wl-fab-orbit \{[^}]*pointer-events: none/)
  })
  it('keeps every chip upright by turning it back against the ring', () => {
    expect(css).toMatch(/\.wl-orb \{[^}]*animation: wl-orbit 14s linear infinite reverse/)
    expect(css).toMatch(/\.wl-fab-orbit \{[^}]*animation: wl-orbit 14s linear infinite;/)
  })
  it('stands still for people who ask for less motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*html\.wl-v3 \.wl-fab-orbit, html\.wl-v3 \.wl-orb \{ animation: none; \}/)
  })
})
