import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromiumDesktop, shouldOfferExtension, EXT_BAR_KEY, EXT_MARK } from './components/ExtensionToolbar'

// The bar that offers the Chrome extension on walletlens.live. It must reach
// desktop Chromium users who do not have the extension, and nobody else: not a
// phone, not Firefox or Safari, not an installed app window, not someone who
// already has it, and not someone who closed it last week.

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf8')

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const EDGE = CHROME + ' Edg/141.0.0.0'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

function fakeWin({ ua = CHROME, width = 1440, standalone = false, coarse = false, marked = false, stored = null } = {}) {
  const store = new Map(stored ? [[EXT_BAR_KEY, stored]] : [])
  return {
    navigator: { userAgent: ua },
    innerWidth: width,
    matchMedia: (q) => ({ matches: q.includes('display-mode: standalone') ? standalone : q.includes('pointer: fine') ? !coarse : false }),
    document: { documentElement: { hasAttribute: (a) => marked && a === EXT_MARK } },
    localStorage: { getItem: (k) => store.get(k) ?? null },
  }
}

describe('extension toolbar targeting', () => {
  it('names the desktop Chromium browser and nothing else', () => {
    expect(chromiumDesktop(fakeWin())).toBe('Chrome')
    expect(chromiumDesktop(fakeWin({ ua: EDGE }))).toBe('Edge')
    expect(chromiumDesktop(fakeWin({ ua: ANDROID }))).toBe(null)
    expect(chromiumDesktop(fakeWin({ ua: FIREFOX }))).toBe(null)
    expect(chromiumDesktop(fakeWin({ ua: SAFARI }))).toBe(null)
  })

  it('offers it on desktop Chrome without the extension', () => {
    expect(shouldOfferExtension(fakeWin())).toBe(true)
    expect(shouldOfferExtension(fakeWin({ ua: EDGE }))).toBe(true)
  })

  it('stays away from phones, touch screens, narrow windows and app windows', () => {
    expect(shouldOfferExtension(fakeWin({ ua: ANDROID }))).toBe(false)
    expect(shouldOfferExtension(fakeWin({ coarse: true }))).toBe(false)
    expect(shouldOfferExtension(fakeWin({ width: 700 }))).toBe(false)
    expect(shouldOfferExtension(fakeWin({ standalone: true }))).toBe(false)
  })

  it('never shows to someone who already has the extension', () => {
    expect(shouldOfferExtension(fakeWin({ marked: true }))).toBe(false)
  })

  it('stays closed for the snooze, then comes back', () => {
    const now = Date.now()
    expect(shouldOfferExtension(fakeWin({ stored: String(now + 1000) }), now)).toBe(false)
    expect(shouldOfferExtension(fakeWin({ stored: String(now - 1000) }), now)).toBe(true)
  })
})

describe('extension marks the page', () => {
  const content = read('../../extension/content.js')
  it('sets the attribute the bar looks for, with only the version', () => {
    expect(content).toContain(`setAttribute('${EXT_MARK}', ext.runtime.getManifest().version)`)
  })

  it('is mounted in both the landing shell and the app shell', () => {
    const app = read('./App.jsx')
    expect(app.split('<ExtensionToolbar />').length - 1).toBe(2)
  })

  it('reaches the static pages too: the tour at "/" and the landing pages', () => {
    expect(read('../public/tour/index.html')).toContain('<script src="/ext-bar.js" defer></script>')
    expect(read('../scripts/landings/build.mjs')).toContain('<script src="/ext-bar.js" defer></script>')
    const js = read('../public/ext-bar.js')
    // Same mark, same snooze key, same store link as the React bar.
    expect(js).toContain(`MARK = '${EXT_MARK}'`)
    expect(js).toContain(`KEY = '${EXT_BAR_KEY}'`)
    expect(js).toContain('display-mode: standalone')
    expect(js).not.toMatch(/innerHTML\s*=\s*[^'"]*c\[/)
  })
})
