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

  it('opens the support page in a panel, not by leaving the app', () => {
    expect(src).toContain("const EMBED_URL = 'https://www.buymeacoffee.com/widget/page/Walletlens'")
    expect(src).toContain('className="wl-coffee-frame"')
    expect(src).not.toMatch(/window\.open\(/)
  })

  it('both policies admit the frame, or the panel is blank in production only', () => {
    for (const f of ['../index.html', '../public/_headers']) {
      expect(readFileSync(join(here, f), 'utf8')).toContain('https://www.buymeacoffee.com')
    }
  })

  it('checks the host before putting a frame on screen', () => {
    // Measured: a frame that cannot load renders the browser's own error page
    // inside itself and FIRES load, which cancelled a five second timeout and
    // left the fallback unreachable. onError does not fire either. So the
    // frame is only rendered once a probe says the host answered.
    expect(src).toContain("await fetch(EMBED_URL, { mode: 'no-cors'")
    expect(src).toContain('{reachable && (')
    expect(src).toContain('{blocked || reachable === false ? (')
  })

  it('the probe is a fetch, so connect-src has to admit the host', () => {
    for (const f of ['../index.html', '../public/_headers']) {
      const p = readFileSync(join(here, f), 'utf8')
      const connect = p.match(/connect-src([^;]*)/)[1]
      expect(connect).toContain('https://www.buymeacoffee.com')
    }
  })

  it('has somewhere to go when the embed cannot be shown', () => {
    // The vendor widget's form came back net::ERR_BLOCKED_BY_CSP and showed a
    // white sheet with an Android error page in it. A plain link is a
    // top-level navigation and frame-src does not govern those.
    expect(src).toContain("document.addEventListener('securitypolicyviolation'")
    expect(src).toContain("href={SUPPORT_URL}")
  })

  it('closes on Back rather than exiting the app', () => {
    // Without the pushed entry, Back in the Android shell navigates the
    // WebView away instead of closing the panel.
    expect(src).toContain("window.history.pushState({ wlCoffee: true }, '')")
    expect(src).toContain("e.key === 'Escape'")
  })

  it('has no hide-forever dismiss and stores nothing', () => {
    // The panel needs useState; what is gone is the close-for-good that wrote
    // wl_coffee_hidden and could not be undone.
    expect(src).not.toMatch(/localStorage/)
    expect(src).not.toMatch(/wl-coffee-x/)
    expect(css).not.toContain('.wl-coffee-x')
  })

  it('reports the click to GA under its own event name', () => {
    // initAutoTrack() already fires a generic click for every <a>, so without
    // this the support click is one row among every other link on the page,
    // identified by a class name. A named event is what a conversion can be
    // built on.
    expect(src).toContain("track('coffee_support_click', { source: 'topbar' })")
    expect(src).toContain("import { track } from '../analytics'")
  })

  it('sends nothing about the portfolio with it', () => {
    // The contract at the top of analytics.js. `source` is a placement, which
    // is the only thing this event has any business knowing.
    const params = src.match(/track\('coffee_support_click', (\{[^}]*\})\)/)
    expect(params).not.toBeNull()
    expect(params[1]).toBe("{ source: 'topbar' }")
  })

  it('takes its label from the dictionary', () => {
    expect(src).toContain("t('coffeeSupport')")
    expect(src).toContain('aria-label={t(')
  })
})
