import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The support button: a filled amber disc in the header, beside the settings
// gear, linking to the project's Buy Me a Coffee page.
//
// It has been through two shapes that were wrong. A floating draggable circle
// put an ask on top of the screen people came to use. Flattening it to a line
// icon for the header fixed that and broke something else: it then looked like
// one more piece of navigation. The disc is what marks it as the one control
// in that row that asks for something rather than doing something, so these
// tests pin the fill, not just the position.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/CoffeeButton.jsx'), 'utf8')
const chat = readFileSync(join(here, 'components/AssistantChat.jsx'), 'utf8')
const css = readFileSync(join(here, 'index.css'), 'utf8')
const app = readFileSync(join(here, 'App.jsx'), 'utf8')

const block = css.slice(css.indexOf('.wl-coffee-btn {'), css.indexOf('.wl-coffee-btn:active'))

describe('how it looks', () => {
  it('keeps the filled amber disc', () => {
    expect(block).toContain('background: linear-gradient(135deg, #ffdd00, #ffc700)')
    expect(block).toContain('border-radius: 50%')
    expect(block).toContain('color: #1f1400')
  })

  it('does not borrow the transparent header-icon style', () => {
    // .wl-topbar-x is the line-icon treatment the gear and stats use. Wearing
    // it made this read as navigation.
    expect(src).not.toMatch(/className="[^"]*wl-topbar-x/)
  })

  it('matches the size of the controls beside it', () => {
    expect(block).toContain('width: 34px; height: 34px')
    expect(css).toMatch(/\.wl-topbar-x \{[\s\S]*?width: 34px; height: 34px;/)
  })

  it('keeps the same cup drawing it has always had', () => {
    expect(src).toContain('M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5Z')
    expect(src).toContain('M17 11h1.5a2.5 2.5 0 0 1 0 5H17')
  })
})

describe('where it sits', () => {
  it('is rendered in the header, next to the settings gear', () => {
    expect(app).toMatch(/<CoffeeButton \/>\s*\n\s*<button\s*\n\s*className="wl-topbar-x wl-topbar-gear"/)
  })

  it('is imported directly, not lazily', () => {
    // A lazy chunk would pop into the header a beat after everything else.
    expect(app).toContain("import CoffeeButton from './components/CoffeeButton'")
    expect(app).not.toMatch(/lazy\(\(\) => import\('\.\/components\/CoffeeButton'\)\)/)
  })

  it('no longer floats over the app', () => {
    expect(css).not.toContain('wlbmc-fab')
    expect(src).not.toMatch(/position: fixed|onPointerDown/i)
  })

  it('stays clear of the assistant, which is a separate control', () => {
    expect(src).not.toMatch(/wlc-|AssistantChat/)
    expect(chat).not.toMatch(/wlbmc|coffee|Coffee/)
  })
})

describe('what it does', () => {
  it('points at the project page', () => {
    expect(src).toContain("const SUPPORT_URL = 'https://buymeacoffee.com/Walletlens'")
  })

  it('opens out of the app safely', () => {
    expect(src).toContain('target="_blank"')
    expect(src).toContain('rel="noopener noreferrer"')
  })

  it('is a link, so keyboard and open-in-new-tab both work', () => {
    expect(src).toMatch(/<a\s/)
    expect(src).not.toMatch(/window\.open\(/)
  })

  it('does nothing but link — no dismiss, no stored state', () => {
    expect(src).not.toMatch(/localStorage|useState|wl-coffee-x/)
    expect(css).not.toContain('.wl-coffee-x')
  })

  it('takes its label from the dictionary', () => {
    expect(src).toContain("t('coffeeSupport')")
    expect(src).toContain('aria-label={t(')
  })
})
