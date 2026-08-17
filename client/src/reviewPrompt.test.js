// These tests cover the *rules* — when WalletLens decides someone has used it
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const KEY = 'wl_review_state_v2'

// Default: a tenured user, so the tenure fallback carries the ask and each
// test below is still isolating the one field it names. Tests that care about
// the moment path pass `moment` explicitly.
function seed({ first = T0 - 30 * DAY, opens = 12, asked = 0, askCount = 0, moment = 0, momentKind = '', friction = 0 } = {}) {
  localStorage.setItem(KEY, JSON.stringify({ first, opens, asked, askCount, moment, momentKind, friction }))
}

function readState() {
  return JSON.parse(localStorage.getItem(KEY) || '{}')
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
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('maybeAskForReview', () => {
  it('asks once every threshold is met', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000) // past the dwell window

    expect(maybeAskForReview(READY)).toBe(true)
    // No moment was recorded, so this is the tenure path — and it says so, which
    // is how the Play console shows which trigger earns reviews.
    expect(firedIntents()).toEqual(['walletlens://review?source=tenure'])
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

    expect(maybeAskForReview({ holdingsCount: 0, totalValue: 400 })).toBe(false)
    expect(maybeAskForReview({ holdingsCount: 8, totalValue: 0 })).toBe(false)
    expect(firedIntents()).toEqual([])
  })

  it('counts a single holding as enough to have an opinion', async () => {
    // The old floor was three, which silently excluded everyone tracking only
    // Bitcoin — a large share of the users most likely to rate the thing.
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    expect(maybeAskForReview({ holdingsCount: 1, totalValue: 400 })).toBe(true)
  })

  it('does not ask twice in the same session, or again for months', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    expect(maybeAskForReview(READY)).toBe(true)
    expect(maybeAskForReview(READY)).toBe(false)

    // Inside the 45-day re-ask window.
    vi.setSystemTime(T0 + 30 * DAY)
    expect(maybeAskForReview(READY)).toBe(false)

    vi.setSystemTime(T0 + 60 * DAY)
    expect(maybeAskForReview(READY)).toBe(true)
    expect(readState().askCount).toBe(2)

    // Four asks is the lifetime limit. Play's own quota bites long before
    // this does; the cap only stops us firing intents that cannot be honoured.
    vi.setSystemTime(T0 + 200 * DAY)
    expect(maybeAskForReview(READY)).toBe(true)
    vi.setSystemTime(T0 + 400 * DAY)
    expect(maybeAskForReview(READY)).toBe(true)
    vi.setSystemTime(T0 + 900 * DAY)
    expect(maybeAskForReview(READY)).toBe(false)
    expect(firedIntents()).toHaveLength(4)
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

// ── Moments, friction and interruption ─────────────────────────────────────
//
// These are what changed the shape of the thing. The old rules asked any
// eligible user 50 seconds after the dashboard loaded, regardless of what had
// just happened to them. These decide *when*.

describe('positive moments', () => {
  it('lets a fresh moment carry an ask that tenure alone would not', async () => {
    const { noteMoment, maybeAskForReview } = await loadModule()
    // Eligible on the base gates, but nowhere near tenured.
    seed({ first: T0 - 5 * DAY, opens: 5 })
    vi.setSystemTime(T0 + 60 * 1000)
    expect(maybeAskForReview(READY)).toBe(false)

    noteMoment('target_reached')
    expect(maybeAskForReview(READY)).toBe(true)
    expect(firedIntents()).toEqual(['walletlens://review?source=target_reached'])
  })

  it('shortens the dwell, because the good news is already on screen', async () => {
    const { maybeAskForReview } = await loadModule()
    seed({ first: T0 - 5 * DAY, opens: 5, moment: T0, momentKind: 'import_success' })

    // Too soon even for a moment.
    vi.setSystemTime(T0 + 3 * 1000)
    expect(maybeAskForReview(READY)).toBe(false)

    // Past the shortened window but well inside the normal 40s one.
    vi.setSystemTime(T0 + 12 * 1000)
    expect(maybeAskForReview(READY)).toBe(true)
  })

  it('lets a moment go stale', async () => {
    const { maybeAskForReview } = await loadModule()
    seed({ first: T0 - 5 * DAY, opens: 5, moment: T0, momentKind: 'achievement' })
    // Three minutes later the card would feel unrelated to whatever happened.
    vi.setSystemTime(T0 + 3 * 60 * 1000)
    expect(maybeAskForReview(READY)).toBe(false)
  })

  it('clears the moment once used, so one win is not worth two asks', async () => {
    const { maybeAskForReview } = await loadModule()
    seed({ first: T0 - 5 * DAY, opens: 5, moment: T0, momentKind: 'goal_reached' })
    vi.setSystemTime(T0 + 12 * 1000)

    expect(maybeAskForReview(READY)).toBe(true)
    expect(readState()).toMatchObject({ moment: 0, momentKind: '' })
  })

  it('ignores a kind that is not on the list', async () => {
    // A typo at a call site should fail loudly in tests, not quietly register
    // a moment that never matches anything.
    const { noteMoment, maybeAskForReview } = await loadModule()
    seed({ first: T0 - 5 * DAY, opens: 5 })
    vi.setSystemTime(T0 + 60 * 1000)

    noteMoment('target_reachd')
    expect(maybeAskForReview(READY)).toBe(false)
  })
})

describe('friction', () => {
  it('stays quiet after the app fails, even for a tenured user', async () => {
    const { noteFriction, maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    noteFriction('import_failed')
    expect(maybeAskForReview(READY)).toBe(false)
    expect(firedIntents()).toEqual([])
  })

  it('outranks even a fresh positive moment', async () => {
    // Import two files, one works and one does not. The failure is the thing
    // they will remember, and it is the one that decides.
    const { maybeAskForReview } = await loadModule()
    seed({ moment: T0, momentKind: 'import_success', friction: T0 })
    vi.setSystemTime(T0 + 60 * 1000)

    expect(maybeAskForReview(READY)).toBe(false)
  })

  it('lifts once the cooling-off period passes', async () => {
    const { maybeAskForReview } = await loadModule()
    seed({ friction: T0 })

    vi.setSystemTime(T0 + 30 * 60 * 60 * 1000)   // still inside 36h
    expect(maybeAskForReview(READY)).toBe(false)

    vi.setSystemTime(T0 + 40 * 60 * 60 * 1000)
    expect(maybeAskForReview(READY)).toBe(true)
  })

  it('ignores a kind that is not a real failure', async () => {
    const { noteFriction, maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    // Notably NOT a friction: the market falling is not the app failing, and
    // suppressing on it would be screening by predicted mood.
    noteFriction('portfolio_down')
    expect(maybeAskForReview(READY)).toBe(true)
  })
})

describe('interruption', () => {
  it('never asks over an open sheet', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    expect(maybeAskForReview({ ...READY, busy: true })).toBe(false)
    expect(maybeAskForReview({ ...READY, busy: false })).toBe(true)
  })
})

describe('the manual Rate button', () => {
  it('bypasses the quiet period, because they went looking for it', async () => {
    const { noteFriction, requestReviewNow } = await loadModule()
    seed()
    noteFriction('exception')

    expect(requestReviewNow('settings')).toBe(true)
    expect(firedIntents()).toEqual(['walletlens://review?fallback=store&source=settings'])
  })
})

// ── Call sites across the tree ─────────────────────────────────────────────
//
// noteMoment ignores a kind it does not recognise, which is the right runtime
// behaviour and a terrible failure mode to debug: the call runs, nothing
// throws, and the moment simply never fires. This checks the real call sites
// rather than trusting them.

describe('every noteMoment / noteFriction call site uses a real kind', () => {
  const SRC = dirname(fileURLToPath(import.meta.url))

  function sourceFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue
      const p = join(dir, name)
      if (statSync(p).isDirectory()) sourceFiles(p, out)
      else if (/\.(jsx|js)$/.test(name) && !name.endsWith('.test.js')) out.push(p)
    }
    return out
  }

  const files = sourceFiles(SRC).filter(f => !f.endsWith('reviewPrompt.js'))

  // Matches both the direct call and the lazy-import form used where importing
  // reviewPrompt eagerly would be wrong:
  //   noteMoment('streak')
  //   import('./reviewPrompt').then(m => m.noteMoment?.('streak'))
  function callsOf(fn) {
    const re = new RegExp(`\\b${fn}\\??\\(\\s*['"]([a-z_]+)['"]`, 'g')
    const found = []
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(re)) {
        found.push({ file: f.slice(SRC.length + 1), kind: m[1] })
      }
    }
    return found
  }

  it('finds the call sites at all', () => {
    expect(callsOf('noteMoment').length).toBeGreaterThan(3)
    expect(callsOf('noteFriction').length).toBeGreaterThan(1)
  })

  it('every noteMoment kind is declared in MOMENTS', async () => {
    const { MOMENTS } = await loadModule()
    const bad = callsOf('noteMoment').filter(c => !MOMENTS.has(c.kind))
    expect(bad.map(c => `${c.file} → ${c.kind}`)).toEqual([])
  })

  it('every noteFriction kind is declared in FRICTIONS', async () => {
    const { FRICTIONS } = await loadModule()
    const bad = callsOf('noteFriction').filter(c => !FRICTIONS.has(c.kind))
    expect(bad.map(c => `${c.file} → ${c.kind}`)).toEqual([])
  })
})

// Every automatic ask is made from a timer, so there is never a user
// activation at the moment the rules pass. fireNativeIntent refuses to
// navigate without one, which meant the card could not appear for anyone: the
// gates were all satisfied and the intent was silently dropped.
//
// These drive the real DOM path. Point `activation` at false and nothing may
// fire until a genuine tap arrives.
describe('asking without a user gesture', () => {
  let activation
  let realAdd
  let added

  beforeEach(() => {
    activation = { isActive: false }
    Object.defineProperty(navigator, 'userActivation', {
      value: activation, configurable: true, writable: true,
    })
    document.body.innerHTML = ''

    // loadModule() resets the module registry but not the DOM, so an armed
    // instance from an earlier test keeps its listener — and its own stale
    // snapshot — attached to this same document. Left alone it answers the
    // next test's tap and fires an intent nothing in that test asked for.
    // Production only ever has one instance; this is purely the cost of
    // re-importing. Track what gets attached and take it back off.
    added = []
    realAdd = document.addEventListener
    document.addEventListener = function (type, fn, opts) {
      if (type === 'click') added.push([fn, opts])
      return realAdd.call(this, type, fn, opts)
    }
  })

  afterEach(() => {
    document.addEventListener = realAdd
    for (const [fn, opts] of added) document.removeEventListener('click', fn, opts)
    delete navigator.userActivation
    document.body.innerHTML = ''
  })

  /** A tappable control, which is the only thing an armed ask rides on. */
  function control() {
    const b = document.createElement('button')
    document.body.appendChild(b)
    return b
  }

  it('arms instead of firing, then asks on the next tap', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    // The timer's own call cannot fire — no gesture to ride on.
    expect(maybeAskForReview(READY)).toBe(false)
    expect(firedIntents()).toEqual([])

    // A real tap. Chrome would have set the activation flag by now.
    activation.isActive = true
    control().click()
    vi.advanceTimersByTime(1)

    expect(firedIntents()).toEqual(['walletlens://review?source=tenure'])
    expect(readState()).toMatchObject({ askCount: 1 })
  })

  it('ignores taps that are not on a control', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)
    maybeAskForReview(READY)

    // Scrolling produces no click at all, but an incidental tap on background
    // padding does. That is not someone interacting with the app.
    activation.isActive = true
    const plain = document.createElement('div')
    document.body.appendChild(plain)
    plain.click()
    vi.advanceTimersByTime(1)

    expect(firedIntents()).toEqual([])
  })

  it('does not land on a sheet the tap just opened', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    // The dashboard passes a getter precisely so this stays live: the ask is
    // armed while nothing is open, and the tap that carries it is the tap that
    // opens the trade sheet.
    const snap = { ...READY, busy: false }
    maybeAskForReview(() => snap)

    activation.isActive = true
    const btn = control()
    btn.addEventListener('click', () => { snap.busy = true })
    btn.click()
    vi.advanceTimersByTime(1)

    expect(firedIntents()).toEqual([])
    expect(readState().askCount ?? 0).toBe(0)
  })

  it('disarms when the user stops qualifying', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)
    maybeAskForReview(READY)

    // Something went wrong in the app before the tap arrived.
    const { noteFriction } = await import('./reviewPrompt')
    noteFriction('import_failed')
    maybeAskForReview(READY)

    activation.isActive = true
    control().click()
    vi.advanceTimersByTime(1)

    expect(firedIntents()).toEqual([])
  })

  it('still fires straight away when the caller already has a gesture', async () => {
    const { requestReviewNow } = await loadModule()
    // The Rate button runs inside a click handler, so this path was always
    // fine — it is the only reason the feature looked half-working.
    activation.isActive = true
    expect(requestReviewNow('settings')).toBe(true)
    expect(firedIntents()[0]).toContain('fallback=store')
  })
})
