// Note on the stderr noise from this file: the bridge fires intents by pointing
// a hidden iframe at walletlens://…, and happy-dom tries to actually fetch that
// URL, then prints a NotSupportedError trace. It is emulator behaviour, not a
// failure — a real browser hands the scheme to Android — and it does not reach
// the page, which is why fireNativeIntent still returns true.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const TWA_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36'
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date('2026-03-01T12:00:00Z').getTime()

function setUA(ua) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

/** Fresh import, so the module's session-start clock is the current fake time. */
async function loadModule() {
  vi.resetModules()
  return import('./reviewPrompt')
}

/** URLs the module pushed into hidden iframes. */
function firedIntents() {
  return [...document.querySelectorAll('iframe')].map(f => f.getAttribute('src'))
}

function seed({ first = T0 - 30 * DAY, opens = 12, asked = 0, askCount = 0 } = {}) {
  localStorage.setItem('wl_review_state_v1', JSON.stringify({ first, opens, asked, askCount }))
}

function readState() {
  return JSON.parse(localStorage.getItem('wl_review_state_v1') || '{}')
}

/** Enough real usage that only the field under test decides the outcome. */
const READY = { holdingsCount: 8, totalValue: 12500 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = ''
  setUA(TWA_UA)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('noteAppOpen', () => {
  it('counts one launch per session and records the first-seen date', async () => {
    const { noteAppOpen } = await loadModule()

    noteAppOpen()
    expect(readState()).toMatchObject({ first: T0, opens: 1 })

    // A remount inside the same session must not inflate the count.
    noteAppOpen()
    noteAppOpen()
    expect(readState().opens).toBe(1)

    // A new launch is a new sessionStorage.
    sessionStorage.clear()
    noteAppOpen()
    expect(readState()).toMatchObject({ first: T0, opens: 2 })
  })

  it('does nothing outside the Android app', async () => {
    setUA(DESKTOP_UA)
    const { noteAppOpen } = await loadModule()
    noteAppOpen()
    expect(localStorage.getItem('wl_review_state_v1')).toBeNull()
  })
})

describe('maybeAskForReview', () => {
  it('asks once every threshold is met', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000) // past the dwell window

    expect(maybeAskForReview(READY)).toBe(true)
    expect(firedIntents()).toEqual(['walletlens://review?source=dashboard'])
    expect(readState()).toMatchObject({ askCount: 1, asked: T0 + 60 * 1000 })
  })

  it('stays quiet in the first seconds of a session', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 10 * 1000)

    expect(maybeAskForReview(READY)).toBe(false)
    expect(firedIntents()).toEqual([])
  })

  it('stays quiet until the app has been used for a few days and sessions', async () => {
    const { maybeAskForReview } = await loadModule()
    vi.setSystemTime(T0 + 60 * 1000)

    seed({ opens: 2 })
    expect(maybeAskForReview(READY)).toBe(false)

    seed({ first: T0 - 1 * DAY })
    expect(maybeAskForReview(READY)).toBe(false)

    expect(firedIntents()).toEqual([])
  })

  it('stays quiet when there is no portfolio to have an opinion about', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    expect(maybeAskForReview({ holdingsCount: 1, totalValue: 400 })).toBe(false)
    expect(maybeAskForReview({ holdingsCount: 8, totalValue: 0 })).toBe(false)
    expect(firedIntents()).toEqual([])
  })

  it('does not ask twice in the same session, or again for months', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    expect(maybeAskForReview(READY)).toBe(true)
    expect(maybeAskForReview(READY)).toBe(false)

    vi.setSystemTime(T0 + 60 * DAY)
    expect(maybeAskForReview(READY)).toBe(false)

    vi.setSystemTime(T0 + 200 * DAY)
    expect(maybeAskForReview(READY)).toBe(true)
    expect(readState().askCount).toBe(2)

    // Two asks is the lifetime limit.
    vi.setSystemTime(T0 + 900 * DAY)
    expect(maybeAskForReview(READY)).toBe(false)
    expect(firedIntents()).toHaveLength(2)
  })

  it('does nothing outside the Android app', async () => {
    setUA(DESKTOP_UA)
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    expect(maybeAskForReview(READY)).toBe(false)
    expect(firedIntents()).toEqual([])
  })
})

describe('requestReviewNow', () => {
  it('ignores the usage rules and allows the store fallback', async () => {
    const { requestReviewNow } = await loadModule()
    // No seeded history at all: the user tapped the button, so we ask anyway.
    expect(requestReviewNow('settings')).toBe(true)
    expect(firedIntents()).toEqual(['walletlens://review?fallback=store&source=settings'])
  })

  it('does nothing outside the Android app', async () => {
    setUA(DESKTOP_UA)
    const { requestReviewNow } = await loadModule()
    expect(requestReviewNow('settings')).toBe(false)
    expect(firedIntents()).toEqual([])
  })
})
