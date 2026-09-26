import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handOffSplash, MIN_SPLASH_MS } from './bootSplash'

// The splash's exit, and the parts of index.html it depends on.

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8')

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = '<div id="root"><div class="wlboot sg"><div class="sg-in"></div></div></div>'
})
afterEach(() => { vi.useRealTimers() })

describe('handing the splash off to the app', () => {
  it('lays a copy over the page that the boot watchdog will not mistake for a failed boot', () => {
    const copy = handOffSplash({ now: () => 5000 })
    expect(copy.parentNode).toBe(document.body)
    expect(copy.classList.contains('wlboot')).toBe(false)
    expect(copy.classList.contains('sg')).toBe(true)
    expect(document.querySelectorAll('.wlboot')).toHaveLength(1)   // only the one React will replace
    expect(copy.style.pointerEvents).toBe('none')
  })

  it('opens at once on a slow load, and removes itself', () => {
    const copy = handOffSplash({ now: () => 5000 })
    vi.advanceTimersByTime(0)
    expect(copy.classList.contains('sg-out')).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(copy.isConnected).toBe(false)
  })

  it('lets the lens finish forming on a very fast load', () => {
    const copy = handOffSplash({ now: () => 300 })
    vi.advanceTimersByTime(MIN_SPLASH_MS - 300 - 1)
    expect(copy.classList.contains('sg-out')).toBe(false)
    vi.advanceTimersByTime(1)
    expect(copy.classList.contains('sg-out')).toBe(true)
  })

  it('does nothing when there is no splash', () => {
    document.body.innerHTML = '<div id="root"></div>'
    expect(handOffSplash()).toBeNull()
  })
})

describe('the splash in index.html', () => {
  it('keeps the class the boot watchdog looks for', () => {
    expect(html).toMatch(/<div class="wlboot sg"/)
    expect(html).toMatch(/document\.querySelector\('\.wlboot'\)/)
  })

  it('carries no status or privacy text, only the brand', () => {
    const splash = html.slice(html.indexOf('<div class="wlboot sg"'), html.indexOf('<script type="module" src="/src/main.jsx"'))
    const text = splash.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    expect(text).toBe('WalletLenslive TRACK · ANALYZE · GROW')
  })

  it('has a still version for reduced motion and an exit for the copy', () => {
    expect(html).toMatch(/@media \(prefers-reduced-motion:reduce\)/)
    expect(html).toMatch(/\.sg\.sg-out \.sg-in\{animation:sg-iris/)
  })
})
