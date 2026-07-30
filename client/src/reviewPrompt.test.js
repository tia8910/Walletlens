// These tests cover the *rules* — when WalletLens decides someone has used it
// enough to be worth asking. The transport is nativeBridge's problem and has
// its own tests, so it is mocked here: that keeps this file from caring whether
// an intent travels by iframe, top-frame navigation or anything else.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ fired: [], twa: true }))
vi.mock('./nativeBridge', () => ({
  isAndroidTWA: () => bridge.twa,
  fireNativeIntent: (url) => { bridge.fired.push(url); return true },
}))

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date('2026-03-01T12:00:00Z').getTime()

/** Fresh import, so the module's session-start clock is the current fake time. */
async function loadModule() {
  vi.resetModules()
  return import('./reviewPrompt')
}

/** URLs handed to the native bridge. */
function firedIntents() {
  return bridge.fired
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
  bridge.fired = []
  bridge.twa = true
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
    bridge.twa = false
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
    bridge.twa = false
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
    bridge.twa = false
    const { requestReviewNow } = await loadModule()
    expect(requestReviewNow('settings')).toBe(false)
    expect(firedIntents()).toEqual([])
  })
})
