import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The assistant bubble floats over content. It steps aside while someone
// scrolls down to read, and comes back when they scroll up or stop.
const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/AssistantChat.jsx'), 'utf8')
const css = readFileSync(join(here, 'index.css'), 'utf8')

describe('assistant bubble', () => {
  it('steps aside on a scroll down, and returns on a scroll up or after a pause', () => {
    expect(src).toMatch(/setAway\(dy > 0 && y > 80\)/)
    expect(src).toMatch(/idle = setTimeout\(\(\) => setAway\(false\), 1200\)/)
  })
  it('follows the page scroll only, never the ticker scrolling sideways', () => {
    expect(src).toMatch(/window\.addEventListener\('scroll', onScroll, \{ passive: true \}\)/)
    expect(src).not.toMatch(/addEventListener\('scroll', onScroll, \{ passive: true, capture: true \}\)/)
  })
  it('never hides while the chat is open, and takes no taps while away', () => {
    expect(src).toMatch(/away && !open \? 'wlc-fab-away' : ''/)
    expect(css).toMatch(/\.wlc-fab\.wlc-fab-away \{[^}]*pointer-events: none/)
  })
})
