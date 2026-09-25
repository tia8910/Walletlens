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
    expect(block).toContain('width: 36px; height: 36px')
    expect(css).toMatch(/\.wl-topbar \.wl-topbar-x \{\s*width: 36px; height: 36px;/)
  })

  it('stays a circle on a phone, not an oval', () => {
    // Measured at 34x44 on a 390px viewport while looking perfect on desktop.
    // A global rule sets `button, a, select { min-height: 44px }` below 768px
    // and this is an <a>, so the disc kept its width and grew 10px taller.
    // The class-level min-height is the only thing outranking it.
    expect(block).toContain('min-height: 36px')
    expect(css).toMatch(/@media \(max-width: 768px\) \{[\s\S]{0,400}?button, a, select \{\s*min-height: 44px;/)
  })

  it('keeps the 44px touch target the global rule was after', () => {
    // Shrinking the button must not shrink what a thumb has to hit.
    expect(css).toMatch(/\.wl-coffee-btn::after \{[\s\S]*?top: -4px; right: -4px; bottom: -4px; left: -4px;/)
  })

  it('keeps the same cup drawing it has always had', () => {
    expect(src).toContain('M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5Z')
    expect(src).toContain('M17 11h1.5a2.5 2.5 0 0 1 0 5H17')
  })
})

describe('where it sits', () => {
  it('is rendered in the header, next to the settings gear', () => {
    // Classic only: the v2 preview gives this slot to notifications.
    expect(app).toMatch(/\{!v2 && <CoffeeButton \/>\}\s*\n\s*<button\s*\n\s*className="wl-topbar-x wl-topbar-gear"/)
  })

  it('moves into the menu in the v2 preview rather than disappearing', () => {
    const v2Menu = app.slice(app.indexOf('const DrawerV2'), app.indexOf('// ── Memoized app footer'))
    expect(v2Menu).toContain('href={SUPPORT_URL}')
    expect(v2Menu).toContain("track('coffee_support_click', { source: 'menu' })")
  })

  it('is imported directly, not lazily', () => {
    // A lazy chunk would pop into the header a beat after everything else.
    expect(app).toMatch(/import CoffeeButton(, \{ SUPPORT_URL \})? from '\.\/components\/CoffeeButton'/)
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

  it('never embeds the support page', () => {
    // Two attempts at that: the vendor widget's form and then our own panel.
    // Both came back net::ERR_BLOCKED_BY_CSP. A link is a top-level
    // navigation and frame-src does not govern those.
    expect(src).not.toMatch(/iframe/)
    for (const f of ['../index.html', '../public/_headers']) {
      expect(readFileSync(join(here, f), 'utf8')).not.toContain('buymeacoffee')
    }
  })

  it('pins padding so the cup cannot be squashed again', () => {
    // As a <button> it inherited a global 8.8px 17.6px padding; with
    // border-box on a 36px square that left a 0.8px content box and the icon
    // rendered at 0.8x0.8 — a blank yellow disc. Measured in a browser.
    expect(block).toContain('padding: 0')
  })

  it('animates the steam and nothing else', () => {
    // A drifting cup reads as a glitch. Only the two wisps carry the class.
    expect(src).toContain('className="wl-coffee-steam"')
    expect(src).toContain('wl-coffee-steam wl-coffee-steam-b')
    expect(css).toContain('@keyframes wl-coffee-rise')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.wl-coffee-steam \{ animation: none;/)
  })

  it('takes its label from the dictionary', () => {
    expect(src).toContain("t('coffeeSupport')")
    expect(src).toContain('aria-label={t(')
  })
})
