// These tests cover the *rules* — when WalletLens decides someone has used it
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// enough to be worth asking. The transport is nativeBridge's problem and has
// its own tests, so it is mocked here: that keeps this file from caring whether
// an intent travels by iframe, top-frame navigation or anything else.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ fired: [], opts: [], twa: true }))
vi.mock('./nativeBridge', () => ({
  isAndroidTWA: () => bridge.twa,
  // Captures the OPTIONS too. It used to take only the url, which is why
  // nothing caught the automatic ask navigating the top frame and ending the
  // TWA session — the one argument that decided whether the app stayed open
  // was the one the mock threw away.
  fireNativeIntent: (url, opts) => { bridge.fired.push(url); bridge.opts.push(opts); return true },
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

const KEY = 'wl_review_state_v3'

// Default: a user well past every base gate, so each test below is isolating
// the one field it names. Tests that care about moments pass `moment`
// explicitly — moments only label the ask, they no longer decide it.
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
  // Onboarded, because that is what every case below is about: a person USING
  // the app. The welcome-flow gate has its own tests further down.
  localStorage.setItem('wl_welcomed_v2', '1')
  bridge.fired = []
  bridge.opts = []
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
    // No moment was recorded, so this is the plain returning-user path — and it
    // says so, which is how the Play console shows which trigger earns reviews.
    expect(firedIntents()).toEqual(['walletlens://review?source=returning'])
    expect(readState()).toMatchObject({ askCount: 1, asked: T0 + 60 * 1000 })
  })

  it('stays quiet in the first seconds of a session', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 10 * 1000)

    expect(maybeAskForReview(READY)).toBe(false)
    expect(firedIntents()).toEqual([])
  })

  // ── Not on the way in ────────────────────────────────────────────────
  //
  // These four are one bug, reported twice: the card arrived at the start of
  // the app, before there was anything to have an opinion about. Each asserts
  // one of the gates that now stands between a launch and an ask.

  it('never asks on a first visit', async () => {
    const { noteAppOpen, maybeAskForReview } = await loadModule()
    noteAppOpen()
    expect(readState()).toMatchObject({ opens: 1 })

    // Well past every dwell window — the block is the usage history, not time
    // on screen.
    vi.setSystemTime(T0 + 10 * 60 * 1000)
    expect(maybeAskForReview(READY)).toBe(false)
    expect(firedIntents()).toEqual([])
  })

  it('waits for a few launches', async () => {
    const { maybeAskForReview } = await loadModule()
    seed({ opens: 2 })
    vi.setSystemTime(T0 + 60 * 1000)
    expect(maybeAskForReview(READY)).toBe(false)

    seed({ opens: 3 })
    expect(maybeAskForReview(READY)).toBe(true)
  })

  it('waits for a later day than the first', async () => {
    // A single long session is still a first impression, however many hours
    // of it there are.
    const { maybeAskForReview } = await loadModule()
    seed({ first: T0 - 1 * DAY })
    vi.setSystemTime(T0 + 60 * 1000)
    expect(maybeAskForReview(READY)).toBe(false)

    seed({ first: T0 - 2 * DAY })
    expect(maybeAskForReview(READY)).toBe(true)
  })

  it('waits for a portfolio', async () => {
    // The app does one thing. A user with nothing in it has not seen it do it.
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    expect(maybeAskForReview({ holdingsCount: 0, totalValue: 0 })).toBe(false)
    expect(maybeAskForReview({ holdingsCount: 1, totalValue: 40 })).toBe(true)
  })

  it('never asks during the welcome flow', async () => {
    // The clearest version of the whole mistake: asking someone to rate an app
    // they are still being introduced to.
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    localStorage.removeItem('wl_welcomed_v2')
    expect(maybeAskForReview(READY), 'welcome never finished').toBe(false)

    localStorage.setItem('wl_welcomed_v2', '1')
    localStorage.setItem('wl_welcome_step_v2', '2')
    expect(maybeAskForReview(READY), 'part-way through the welcome').toBe(false)

    localStorage.removeItem('wl_welcome_step_v2')
    expect(maybeAskForReview(READY)).toBe(true)
  })

  it('gives a session a full minute before considering it', async () => {
    // Was fifteen seconds, which on a slow phone could land the card while the
    // dashboard was still settling.
    const { maybeAskForReview } = await loadModule()
    seed()

    vi.setSystemTime(T0 + 45 * 1000)
    expect(maybeAskForReview(READY)).toBe(false)

    vi.setSystemTime(T0 + 61 * 1000)
    expect(maybeAskForReview(READY)).toBe(true)
  })

  it('does not ask twice in the same session, or again for months', async () => {
    const { maybeAskForReview } = await loadModule()
    seed()
    vi.setSystemTime(T0 + 60 * 1000)

    expect(maybeAskForReview(READY)).toBe(true)
    expect(maybeAskForReview(READY)).toBe(false)

    // Inside the 60-day re-ask window — Play's own quota would swallow an ask
    // here anyway, so firing one only burns an intent.
    vi.setSystemTime(T0 + 30 * DAY)
    expect(maybeAskForReview(READY)).toBe(false)
    vi.setSystemTime(T0 + 59 * DAY)
    expect(maybeAskForReview(READY)).toBe(false)

    vi.setSystemTime(T0 + 70 * DAY)
    expect(maybeAskForReview(READY)).toBe(true)
    expect(readState().askCount).toBe(2)

    vi.setSystemTime(T0 + 200 * DAY)
    expect(maybeAskForReview(READY)).toBe(true)
    vi.setSystemTime(T0 + 400 * DAY)
    expect(maybeAskForReview(READY)).toBe(true)
    expect(firedIntents()).toHaveLength(4)
  })

  it('slows down after several asks, but never retires anyone', async () => {
    // This replaces a lifetime cap of four, and the reason is that an "ask" is
    // an ATTEMPT, never evidence anybody saw a card: launchReviewFlow completes
    // identically whether the card was shown, dismissed, or silently suppressed
    // because the user was over Google's quota.
    //
    // So four attempts inside one quota window could show nothing at all and
    // still retire that user for life — and the people most likely to hit that
    // are precisely the ones who have never rated. Someone who DOES rate stops
    // being asked anyway, because Play stops serving the card.
    const { maybeAskForReview } = await loadModule()
    seed({ askCount: 4, asked: T0 })
    vi.setSystemTime(T0 + 60 * 1000)

    // Still inside the slower window: quiet, but not retired.
    vi.setSystemTime(T0 + 100 * DAY)
    expect(maybeAskForReview(READY)).toBe(false)
    vi.setSystemTime(T0 + 179 * DAY)
    expect(maybeAskForReview(READY)).toBe(false)

    // The fifth ask, which the old cap made impossible.
    vi.setSystemTime(T0 + 181 * DAY)
    expect(maybeAskForReview(READY)).toBe(true)
    expect(readState().askCount).toBe(5)

    // And it keeps going. A great update a year later deserves its chance.
    vi.setSystemTime(T0 + 181 * DAY + 181 * DAY)
    expect(maybeAskForReview(READY)).toBe(true)
    expect(readState().askCount).toBe(6)
  })

  it('keeps the tighter cadence until the user has had several chances', async () => {
    // The backoff must not start early, or the first few asks — the ones most
    // likely to land inside a fresh quota window — get spread over a year.
    const { maybeAskForReview } = await loadModule()
    seed({ askCount: 3, asked: T0 })
    vi.setSystemTime(T0 + 61 * DAY)
    expect(maybeAskForReview(READY)).toBe(true)
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

describe('inside the app shell', () => {
  // fireNativeIntent goes out through a hidden iframe and refuses without a
  // live user activation. Both fail silently — and on THIS path a dropped
  // intent is indistinguishable from Play declining to show a card, which it
  // does more often than not. The ask could have been vanishing for ever with
  // nothing to see.
  afterEach(() => { delete window.AndroidBridge })

  it('asks the app directly rather than firing an intent', async () => {
    const requestReview = vi.fn()
    window.AndroidBridge = { requestReview }
    const { maybeAskForReview } = await loadModule()
    localStorage.setItem('wl_welcomed_v2', '1')
    seed()
    vi.setSystemTime(T0 + 61 * 1000)

    expect(maybeAskForReview(READY)).toBe(true)
    expect(requestReview).toHaveBeenCalledWith('returning', false)
    expect(firedIntents(), 'no iframe intent when the bridge is there').toEqual([])
  })

  it('lets the deliberate tap fall back to the store', async () => {
    const requestReview = vi.fn()
    window.AndroidBridge = { requestReview }
    const { requestReviewNow } = await loadModule()

    expect(requestReviewNow('settings')).toBe(true)
    expect(requestReview).toHaveBeenCalledWith('settings', true)
  })

  it('still fires the intent when there is no bridge', async () => {
    // A TWA install has no bridge and must keep working exactly as before.
    const { maybeAskForReview } = await loadModule()
    localStorage.setItem('wl_welcomed_v2', '1')
    seed()
    vi.setSystemTime(T0 + 61 * 1000)

    expect(maybeAskForReview(READY)).toBe(true)
    expect(firedIntents()).toEqual(['walletlens://review?source=returning'])
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
// Eligibility is decided by the base gates above. These decide how the ask is
// *credited*, and — in friction's case — when it must not happen at all.

describe('positive moments', () => {
  it('labels the ask with the moment that earned it', async () => {
    // A moment is not a gate — the base rules already carry this user. What it
    // changes is the source, which is the only way to tell afterwards which
    // trigger actually produces ratings.
    const { noteMoment, maybeAskForReview } = await loadModule()
    seed({ first: T0 - 5 * DAY, opens: 5 })
    vi.setSystemTime(T0 + 60 * 1000)

    noteMoment('target_reached')
    expect(maybeAskForReview(READY)).toBe(true)
    expect(firedIntents()).toEqual(['walletlens://review?source=target_reached'])
  })

  it('shortens the dwell, because the good news is already on screen', async () => {
    const { maybeAskForReview } = await loadModule()
    seed({ first: T0 - 5 * DAY, opens: 5, moment: T0, momentKind: 'import_success' })

    // Too soon even for a moment.
    vi.setSystemTime(T0 + 10 * 1000)
    expect(maybeAskForReview(READY)).toBe(false)

    // Past the shortened window, well inside the normal one-minute wait.
    vi.setSystemTime(T0 + 25 * 1000)
    expect(maybeAskForReview(READY)).toBe(true)
  })

  it('lets a moment go stale without blocking the ask', async () => {
    const { maybeAskForReview } = await loadModule()
    seed({ first: T0 - 5 * DAY, opens: 5, moment: T0, momentKind: 'achievement' })
    // Three minutes on, the card would feel unrelated to the badge, so it stops
    // being credited for it — but this user qualifies on the base rules anyway.
    vi.setSystemTime(T0 + 3 * 60 * 1000)
    expect(maybeAskForReview(READY)).toBe(true)
    expect(firedIntents()).toEqual(['walletlens://review?source=returning'])
  })

  it('clears the moment once used, so one win is not worth two asks', async () => {
    const { maybeAskForReview } = await loadModule()
    seed({ first: T0 - 5 * DAY, opens: 5, moment: T0, momentKind: 'goal_reached' })
    vi.setSystemTime(T0 + 25 * 1000)

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
    expect(readState()).toMatchObject({ moment: 0, momentKind: '' })

    // The user still qualifies on the base rules, so the ask goes out — but
    // credited to nothing, which is how a typo shows up in the Play console.
    expect(maybeAskForReview(READY)).toBe(true)
    expect(firedIntents()).toEqual(['walletlens://review?source=returning'])
  })
})

describe('friction', () => {
  it('stays quiet after the app fails, however eligible the user is', async () => {
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

    expect(firedIntents()).toEqual(['walletlens://review?source=returning'])
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

describe('asking for a review does not close the app', () => {
  // ReviewActivity is translucent and excludeFromRecents — it is built to
  // appear OVER a running app, which only works if the app is still running.
  //
  // The automatic ask fired through fireNativeIntent's default path, which
  // navigates the top frame to intent://. Inside a TWA that takes the Custom
  // Tab off its own origin and ends the session: the app closes and comes back
  // as a fresh task. Doing that at the exact moment you ask somebody to rate
  // you is the worst possible trade — a jarring relaunch, a lost scroll
  // position, and then a review card.
  //
  // Nothing caught it because the test mock took only the url and discarded
  // the options, so the one argument that decided whether the app stayed open
  // was the one nobody could see.

  it('passes keepSession on the automatic ask', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'reviewPrompt.js'), 'utf8',
    )
    const fn = src.slice(src.indexOf('function fireAsk('))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toContain('walletlens://review?source=')
    expect(body).toMatch(/\{ keepSession: true \}/)
  })

  it('keeps the deliberate Settings tap on the top frame', () => {
    // Not an oversight, a different case. Someone who went looking for "Rate
    // WalletLens" expects a visible outcome, and that path can fall back to
    // opening the Play Store listing — which leaves the app anyway. The
    // silent-drop tradeoff that suits the automatic ask does not suit a button
    // the user pressed on purpose.
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'reviewPrompt.js'), 'utf8',
    )
    expect(src).toContain("'walletlens://review?fallback=store&source=' + encodeURIComponent(source)")
  })
})

describe('the Diagnostics readout', async () => {
  const { describeReviewState } = await import('./reviewPrompt')
  const DAY = 24 * 60 * 60 * 1000
  const now = Date.UTC(2026, 8, 25)
  const play = { installer: 'com.android.vending', outcome: '', at: 0 }

  it('says when this is not the installed app', () => {
    expect(describeReviewState({ twa: false }, null, now).detail).toMatch(/only appears there/)
  })

  it('flags a sideloaded install, which can never show the card', () => {
    const r = describeReviewState({ twa: true, blockedBy: '' }, { ...play, installer: 'sideload' }, now)
    expect(r.state).toBe('fail')
    expect(r.detail).toMatch(/sideloaded/)
  })

  it('reads what Play said last time', () => {
    const shown = describeReviewState({ twa: true, blockedBy: '' }, { ...play, outcome: 'shown_2400ms', at: now - 3 * DAY }, now)
    expect(shown).toEqual({ state: 'ok', detail: 'installed from Play · last ask 3d ago: Play showed the card · next ask: ready (needs a portfolio and a minute in the app)' })
    expect(describeReviewState({ twa: true, blockedBy: '' }, { ...play, outcome: 'no_card_120ms', at: now }, now).detail).toMatch(/today: Play answered without a card/)
  })

  it('names the rule holding the next ask back', () => {
    expect(describeReviewState({ twa: true, blockedBy: 'few-opens', opensLeft: 1 }, play, now).detail).toMatch(/waiting: 1 more open$/)
    expect(describeReviewState({ twa: true, blockedBy: 'too-new', daysLeft: 2 }, play, now).detail).toMatch(/waiting: 2 more days of use$/)
    const recent = describeReviewState({ twa: true, blockedBy: 'recent-ask', asked: now - 12 * DAY, askCount: 1 }, play, now)
    expect(recent.state).toBe('warn')
    expect(recent.detail).toMatch(/asked 12d ago, asks again after 60d$/)
  })
})

describe('timing the card', () => {
  it('counts a new record and a big green day as happy moments', async () => {
    const m = await loadModule()
    expect(m.MOMENTS.has('all_time_high')).toBe(true)
    expect(m.MOMENTS.has('big_day')).toBe(true)
  })

  it('waits while any dialog is open over the app', async () => {
    seed()
    const m = await loadModule()
    vi.advanceTimersByTime(2 * 60 * 1000)
    const dlg = document.createElement('div')
    dlg.setAttribute('aria-modal', 'true')
    document.body.appendChild(dlg)
    expect(m.maybeAskForReview(READY)).toBe(false)
    expect(m.reviewDiagnostics().pendingAsk).toBe(false)
    dlg.remove()
  })

  it("tells the native shell whether now is a good moment", async () => {
    const m = await loadModule()
    expect(window.__wlReviewReady).toBe(m.reviewReadyNow)
    m.maybeAskForReview({ holdingsCount: 0 })
    expect(m.reviewReadyNow()).toBe(false)                  // no portfolio yet
    m.maybeAskForReview({ holdingsCount: 3, busy: true })
    expect(m.reviewReadyNow()).toBe(false)                  // a sheet or an effect is up
    m.maybeAskForReview({ holdingsCount: 3 })
    expect(m.reviewReadyNow()).toBe(true)
    const dlg = document.createElement('div')
    dlg.setAttribute('aria-modal', 'true')
    document.body.appendChild(dlg)
    expect(m.reviewReadyNow()).toBe(false)                  // a dialog is open
    dlg.remove()
    m.noteFriction('import_failed')
    expect(m.reviewReadyNow()).toBe(false)                  // the app just failed at something
  })

  it('never says yes during setup or behind the lock', async () => {
    const m = await loadModule()
    m.maybeAskForReview({ holdingsCount: 3 })
    m.setAppInteractive(false)
    expect(m.reviewReadyNow()).toBe(false)
    m.setAppInteractive(true)
    localStorage.removeItem('wl_welcomed_v2')
    expect(m.reviewReadyNow()).toBe(false)
  })
})

describe('the native shell', () => {
  const shell = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..',
    'walletlens_source', 'release_package', 'app', 'src', 'main', 'java', 'live', 'walletlens', 'twa', 'AppShellActivity.java'), 'utf8')

  it('asks the page before showing the card, and waits when the answer is no', () => {
    expect(shell).toMatch(/window\.__wlReviewReady/)
    expect(shell).toMatch(/"\\"no\\""\.equals\(answer\)/)
    expect(shell).toMatch(/postDelayed\(this::maybeAskForReview, REVIEW_RETRY_MS\)/)
  })
})
