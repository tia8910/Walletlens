import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The support button lives in the header, beside the settings gear, and can be
// closed for good.
//
// It was a floating draggable circle first. That put an ask on top of the
// screen people came to use, and it had no way to say no. Both are fixed by
// where it now sits and by the dismiss.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/CoffeeButton.jsx'), 'utf8')
const chat = readFileSync(join(here, 'components/AssistantChat.jsx'), 'utf8')
const css = readFileSync(join(here, 'index.css'), 'utf8')
const app = readFileSync(join(here, 'App.jsx'), 'utf8')

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
    expect(src).not.toMatch(/position: fixed|pointerdown|onPointerDown/i)
  })

  it('borrows the header button size rather than inventing one', () => {
    expect(src).toContain('className="wl-topbar-x wl-coffee-btn"')
    expect(css).toMatch(/\.wl-topbar-x \{[\s\S]*?width: 34px; height: 34px;/)
  })

  it('stays clear of the assistant, which is a separate control', () => {
    expect(src).not.toMatch(/wlc-|AssistantChat/)
    expect(chat).not.toMatch(/wlbmc|coffee|Coffee/)
  })
})

describe('closing it', () => {
  it('has a dismiss that is its own button, not the link', () => {
    // A close that shares a hit area with a payment link is a trap.
    expect(src).toMatch(/<button\s+type="button"\s+className="wl-coffee-x"/)
    expect(src).toContain('onClick={dismiss}')
  })

  it('stays closed on the next visit', () => {
    expect(src).toContain("const HIDE_KEY = 'wl_coffee_hidden'")
    expect(src).toContain("localStorage.setItem(HIDE_KEY, '1')")
    expect(src).toContain('if (hidden) return null')
  })

  it('shows the button when storage cannot be read', () => {
    // Failing the other way hides it from every strict browser.
    expect(src).toMatch(/catch \{ return false \}/)
  })

  it('gives the dismiss a touch target bigger than the dot', () => {
    // 16px of visible circle; a missed tap would open the payment page.
    expect(css).toMatch(/\.wl-coffee-x::after \{[\s\S]*?top: -8px; right: -8px; bottom: -8px; left: -8px;/)
  })

  it('labels the dismiss for screen readers', () => {
    expect(src).toContain("aria-label={t('coffeeHide')}")
  })
})

describe('what it links to', () => {
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

  it('takes its label from the dictionary', () => {
    expect(src).toContain("t('coffeeSupport')")
  })
})
