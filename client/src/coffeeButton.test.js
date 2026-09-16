import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The support launcher is its own control, not part of the assistant.
//
// The first cut stacked it above the chat launcher and had AssistantChat set
// an attribute on <html> so the coffee button could hide itself while the
// panel was open. That is two components knowing about each other for a
// cosmetic reason, and it put an ask on top of the one button people came to
// press. Separate corner, no coupling — and these tests keep it that way.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/CoffeeButton.jsx'), 'utf8')
const chat = readFileSync(join(here, 'components/AssistantChat.jsx'), 'utf8')
const css = readFileSync(join(here, 'index.css'), 'utf8')
const app = readFileSync(join(here, 'App.jsx'), 'utf8')

describe('it is independent of the assistant', () => {
  it('does not reach into the chat component', () => {
    expect(src).not.toMatch(/wlc-/)
    expect(src).not.toMatch(/AssistantChat/)
  })

  it('leaves the chat component with nothing to say about it', () => {
    expect(chat).not.toMatch(/wlbmc|coffee|Coffee/)
  })

  it('starts in the opposite corner, so neither can cover the other', () => {
    const block = css.slice(css.indexOf('.wlbmc-fab {'))
    expect(block).toMatch(/bottom: 1\.25rem; left: 1\.25rem;/)
    // The assistant launcher is bottom-right.
    expect(css).toMatch(/\.wlc-fab \{[\s\S]*?bottom: 1\.25rem; right: 1\.25rem;/)
  })

  it('mirrors in RTL, where the assistant moves to the left', () => {
    expect(css).toMatch(/\[dir="rtl"\] \.wlbmc-fab \{ left: auto; right: 1\.25rem; \}/)
    expect(css).toMatch(/\[dir="rtl"\] \.wlc-fab \{ right: auto; left: 1\.25rem; \}/)
  })

  it('is mounted alongside the assistant, not inside it', () => {
    expect(app).toContain("const CoffeeButton = lazy(() => import('./components/CoffeeButton'))")
    expect(app).toContain('<CoffeeButton />')
  })
})

describe('what it links to', () => {
  it('points at the project page', () => {
    expect(src).toContain("const SUPPORT_URL = 'https://buymeacoffee.com/Walletlens'")
  })

  it('opens out of the app safely', () => {
    // target=_blank without noopener hands the opened page a window.opener
    // reference back into the app.
    expect(src).toContain('target="_blank"')
    expect(src).toContain('rel="noopener noreferrer"')
  })

  it('is a link, so keyboard and open-in-new-tab both work', () => {
    // A <button> with an onClick would take all of that away for no gain.
    expect(src).toMatch(/<a\s/)
    expect(src).not.toMatch(/window\.open\(/)
  })
})

describe('dragging', () => {
  it('remembers where it was dropped', () => {
    expect(src).toContain("const POS_KEY = 'wl_coffee_fab_pos'")
    expect(src).toContain('localStorage.setItem(POS_KEY, JSON.stringify(p))')
    // Its own key: moving one launcher must not move the other.
    expect(src).not.toContain('wl_assistant_fab_pos')
  })

  it('does not navigate when the pointer actually moved', () => {
    // click fires after pointerup, so a drag that ends over the button would
    // otherwise leave the app for buymeacoffee.com.
    expect(src).toMatch(/if \(drag\.current\.moved\) \{ e\.preventDefault\(\)/)
  })

  it('needs a real drag before it moves at all', () => {
    // Without a threshold, the jitter in a tap on a touchscreen reads as a
    // drag and the tap stops opening the link.
    expect(src).toContain('const DRAG_THRESHOLD = 6')
  })

  it('stays on screen', () => {
    expect(src).toMatch(/function clampPos/)
    // A remembered position is viewport pixels: a rotation can put it outside.
    expect(src).toContain("window.addEventListener('orientationchange', onResize)")
  })

  it('can be dragged on touch without scrolling the page', () => {
    const block = css.slice(css.indexOf('.wlbmc-fab {'))
    expect(block.slice(0, 700)).toContain('touch-action: none')
  })

  it('leaves the context menu alone', () => {
    // Swallowing a right-click would take away "open link in new tab".
    expect(src).toContain('if (e.button !== 0) return')
  })
})

describe('the label', () => {
  it('comes from the dictionary, not a hardcoded string', () => {
    expect(src).toContain("t('coffeeSupport')")
    expect(src).toContain('aria-label={label}')
  })
})
