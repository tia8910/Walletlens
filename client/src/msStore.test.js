import { describe, it, expect } from 'vitest'
import { detectMsStore, msStoreSkips } from './msStore'

// A stand-in window: the URL, the user agent, whether it runs as an installed
// app, and what is already stored on the device.
function win({ search = '', ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', standalone = false, stored = null } = {}) {
  const store = new Map(stored ? [['wl_store', stored]] : [])
  return {
    location: { search, pathname: '/' },
    navigator: { userAgent: ua },
    matchMedia: (q) => ({ matches: standalone && q.includes('standalone') }),
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
    _store: store,
  }
}

describe('Microsoft Store edition', () => {
  it('is on when the Store package opens with ?store=msstore, and remembers it', () => {
    const w = win({ search: '?store=msstore', standalone: true })
    expect(detectMsStore(w)).toBe(true)
    expect(w._store.get('wl_store')).toBe('msstore')
  })

  it('stays on for later navigations that no longer carry the parameter', () => {
    expect(detectMsStore(win({ stored: 'msstore', standalone: true }))).toBe(true)
  })

  it('never sticks in a browser tab: the parameter lasts one page load', () => {
    const w = win({ search: '?store=msstore', ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })
    expect(detectMsStore(w)).toBe(true)
    expect(w._store.has('wl_store')).toBe(false)
  })

  it('forgets a flag left behind in a browser tab, so the referral and store links come back', () => {
    const w = win({ stored: 'msstore', ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })
    expect(detectMsStore(w)).toBe(false)
    expect(w._store.has('wl_store')).toBe(false)
  })

  it('covers a package built before the parameter: an installed app window on Windows', () => {
    expect(detectMsStore(win({ standalone: true }))).toBe(true)
  })

  it('leaves a Windows browser tab alone, so the website keeps its store links', () => {
    expect(detectMsStore(win())).toBe(false)
  })

  it('leaves the Android app alone', () => {
    const android = win({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', standalone: true })
    expect(detectMsStore(android)).toBe(false)
  })

  it('opens the app in place of marketing pages, in English and Arabic', () => {
    for (const p of ['/', '/tour', '/tour/', '/ecosystem', '/free-net-worth-tracker', '/ar/add-holdings-by-voice']) {
      expect(msStoreSkips(p)).toBe(true)
    }
  })

  it('keeps the app and the information pages reachable', () => {
    for (const p of ['/dashboard', '/technicals', '/privacy', '/faq', '/about', '/blog/some-post']) {
      expect(msStoreSkips(p)).toBe(false)
    }
  })
})
