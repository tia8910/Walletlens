import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(fileURLToPath(import.meta.url))

const DAY = 24 * 60 * 60 * 1000

// Every test re-imports the module, because the dwell clock and the
// interactive flag are module state captured at load. Sharing one import
// across tests would mean the first test's clock decides the rest.
async function load() {
  vi.resetModules()
  return import('./supportNudge')
}

function seedState(over = {}) {
  localStorage.setItem('wl_support_nudge_v1', JSON.stringify({
    first: Date.now() - 7 * DAY, opens: 6, dismissed: 0, dismissCount: 0,
    supported: 0, friction: 0, ...over,
  }))
}

/** The gates that live outside this module's own state. */
function seedOnboarded() {
  localStorage.setItem('wl_welcomed_v2', '1')
  localStorage.removeItem('wl_welcome_step_v2')
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.useRealTimers()
})

afterEach(() => { vi.useRealTimers() })

describe('open counting', () => {
  it('counts one open per session however many times it is called', async () => {
    const m = await load()
    m.noteSupportOpen(); m.noteSupportOpen(); m.noteSupportOpen()
    expect(m.supportDiagnostics().opens).toBe(1)
  })

  it('stamps the first open so the days gate has something to measure', async () => {
    const m = await load()
    const before = Date.now()
    m.noteSupportOpen()
    expect(m.supportDiagnostics().first).toBeGreaterThanOrEqual(before)
  })

  it('accumulates across sessions', async () => {
    let m = await load()
    m.noteSupportOpen()
    sessionStorage.clear()
    m = await load()
    m.noteSupportOpen()
    expect(m.supportDiagnostics().opens).toBe(2)
  })
})

describe('stored gates', () => {
  it('passes once opens, days and onboarding are all satisfied', async () => {
    const m = await load()
    seedOnboarded(); seedState()
    expect(m.storedGates()).toBe('')
  })

  it('blocks a user who has not opened the app enough', async () => {
    const m = await load()
    seedOnboarded(); seedState({ opens: 2 })
    expect(m.storedGates()).toBe('few-opens')
  })

  it('blocks a user whose first open was today, however many opens', async () => {
    const m = await load()
    seedOnboarded(); seedState({ first: Date.now(), opens: 40 })
    expect(m.storedGates()).toBe('too-new')
  })

  it('blocks while the welcome flow is unfinished', async () => {
    const m = await load()
    seedState()
    localStorage.setItem('wl_welcomed_v2', '1')
    localStorage.setItem('wl_welcome_step_v2', '2')
    expect(m.storedGates()).toBe('onboarding')
  })

  it('blocks when the welcome flow was never completed at all', async () => {
    const m = await load()
    seedState()
    expect(m.storedGates()).toBe('onboarding')
  })
})

describe('after the app fails', () => {
  it('goes quiet', async () => {
    const m = await load()
    seedOnboarded(); seedState()
    m.noteSupportFriction('import_failed')
    expect(m.storedGates()).toBe('friction')
  })

  it('comes back once the quiet period has passed', async () => {
    const m = await load()
    seedOnboarded(); seedState({ friction: Date.now() - 3 * DAY })
    expect(m.storedGates()).toBe('')
  })

  it('ignores a kind that is not an app failure', async () => {
    const m = await load()
    seedOnboarded(); seedState()
    m.noteSupportFriction('price_went_down')
    expect(m.storedGates()).toBe('')
  })

  it('does not treat a market drawdown as friction', async () => {
    const m = await load()
    expect(m.FRICTIONS.has('drawdown')).toBe(false)
    expect(m.FRICTIONS.has('loss')).toBe(false)
  })
})

describe('saying no', () => {
  it('snoozes for three months', async () => {
    const m = await load()
    seedOnboarded(); seedState()
    m.noteSupportDismissed()
    expect(m.storedGates()).toBe('snoozed')
  })

  it('asks again once the snooze has run out', async () => {
    const m = await load()
    seedOnboarded(); seedState({ dismissed: Date.now() - 100 * DAY, dismissCount: 1 })
    expect(m.storedGates()).toBe('')
  })

  it('stops asking after three dismissals, however old they are', async () => {
    const m = await load()
    seedOnboarded(); seedState({ dismissed: Date.now() - 900 * DAY, dismissCount: 3 })
    expect(m.storedGates()).toBe('done-asking')
  })
})

describe('after supporting', () => {
  it('never asks again', async () => {
    const m = await load()
    seedOnboarded(); seedState()
    m.noteSupported()
    expect(m.storedGates()).toBe('supported')
  })

  it('beats every other gate, including a pending snooze', async () => {
    const m = await load()
    seedOnboarded()
    seedState({ supported: Date.now(), dismissed: Date.now(), dismissCount: 2, friction: Date.now() })
    expect(m.storedGates()).toBe('supported')
  })
})

describe('shouldShowSupport', () => {
  it('waits out the dwell even when every stored gate passes', async () => {
    const m = await load()
    seedOnboarded(); seedState()
    expect(m.shouldShowSupport({ holdingsCount: 4 })).toBe(false)
  })

  it('shows once the dwell has elapsed', async () => {
    vi.useFakeTimers()
    const m = await load()
    seedOnboarded(); seedState()
    vi.advanceTimersByTime(m.LIMITS.MIN_DWELL_MS + 1000)
    expect(m.shouldShowSupport({ holdingsCount: 4 })).toBe(true)
  })

  it('stays hidden for an empty portfolio', async () => {
    vi.useFakeTimers()
    const m = await load()
    seedOnboarded(); seedState()
    vi.advanceTimersByTime(m.LIMITS.MIN_DWELL_MS + 1000)
    expect(m.shouldShowSupport({ holdingsCount: 0 })).toBe(false)
  })

  it('stays hidden while a sheet is open', async () => {
    vi.useFakeTimers()
    const m = await load()
    seedOnboarded(); seedState()
    vi.advanceTimersByTime(m.LIMITS.MIN_DWELL_MS + 1000)
    expect(m.shouldShowSupport({ holdingsCount: 4, busy: true })).toBe(false)
  })

  it('stays hidden behind the app lock screen', async () => {
    vi.useFakeTimers()
    const m = await load()
    seedOnboarded(); seedState()
    vi.advanceTimersByTime(m.LIMITS.MIN_DWELL_MS + 1000)
    m.setSupportInteractive(false)
    expect(m.shouldShowSupport({ holdingsCount: 4 })).toBe(false)
  })

  it('restarts the dwell when the app becomes interactive, so the card cannot land on the unlock', async () => {
    vi.useFakeTimers()
    const m = await load()
    seedOnboarded(); seedState()
    m.setSupportInteractive(false)
    vi.advanceTimersByTime(m.LIMITS.MIN_DWELL_MS * 3)
    m.setSupportInteractive(true)
    expect(m.shouldShowSupport({ holdingsCount: 4 })).toBe(false)
    vi.advanceTimersByTime(m.LIMITS.MIN_DWELL_MS + 1000)
    expect(m.shouldShowSupport({ holdingsCount: 4 })).toBe(true)
  })
})

describe('storage is never allowed to throw', () => {
  it('survives a localStorage that rejects writes', async () => {
    const m = await load()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    expect(() => m.noteSupportOpen()).not.toThrow()
    expect(() => m.noteSupported()).not.toThrow()
    expect(() => m.noteSupportDismissed()).not.toThrow()
    expect(() => m.noteSupportFriction('exception')).not.toThrow()
    spy.mockRestore()
  })

  it('treats unparseable state as a fresh user rather than crashing', async () => {
    const m = await load()
    localStorage.setItem('wl_support_nudge_v1', '{not json')
    expect(m.supportDiagnostics().opens).toBe(0)
    expect(m.shouldShowSupport({ holdingsCount: 4 })).toBe(false)
  })
})

describe('the ask is never screened on sentiment', () => {
  it('has no gate that reads a rating, a mood or a sentiment value', async () => {
    const src = readFileSync(join(SRC, 'supportNudge.js'), 'utf8')
    // A "are you enjoying the app?" gate that routes only the happy ones to
    // the payment page is a review funnel wearing a different hat. Nothing
    // here should ever read one.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/sentiment|\bmood\b|\brating\b|enjoy/i)
  })
})

describe('every app failure the support card cares about is actually reported', () => {
  // Mirrors reviewWiring.test.js. The support card has its own FRICTIONS set
  // and its own call sites, because reviewPrompt's noteFriction no-ops outside
  // the Android build: forwarding through it would leave the web card asking
  // for money moments after a failed import.
  const sources = () => {
    const out = []
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name)
        if (e.isDirectory()) { walk(full); continue }
        if (!/\.(js|jsx)$/.test(e.name) || e.name.endsWith('.test.js')) continue
        out.push(full)
      }
    }
    walk(SRC)
    return out
  }
  const all = () => sources().map(f => readFileSync(f, 'utf8')).join('\n')

  it('reports each declared failure somewhere', async () => {
    const m = await load()
    const src = all()
    const live = new Set()
    // The Drive call site passes the name through a ternary, so every literal
    // in the argument list counts, not just a lone one after the paren.
    for (const c of src.matchAll(/noteSupportFriction\??\.?\(([^)]*)\)/g)) {
      for (const lit of c[1].matchAll(/'([^']+)'/g)) live.add(lit[1])
    }
    expect([...m.FRICTIONS].filter(f => !live.has(f)),
      'declared in FRICTIONS but never reported').toEqual([])
  })

  it('reports nothing the set does not declare', async () => {
    const m = await load()
    const direct = [...all().matchAll(/noteSupportFriction\??\.?\('([^']+)'\)/g)].map(x => x[1])
    for (const f of direct) expect(m.FRICTIONS.has(f), `noteSupportFriction('${f}')`).toBe(true)
  })

  it('silences the ask on both halves of a Drive failure', () => {
    // Backup and restore fail through one shared catch and carry very
    // different weight: a failed restore is someone who thinks they have lost
    // their portfolio.
    const drive = readFileSync(join(SRC, 'components/DriveBackup.jsx'), 'utf8')
    expect(drive).toMatch(/noteSupportFriction\(which === 'backup' \? 'sync_failed' : 'restore_failed'\)/)
  })

  it('counts an open on every platform, not only the Android build', () => {
    // noteSupportOpen must not inherit reviewPrompt's isAndroidTWA gate, or
    // the card can never reach the five-open bar on the web.
    const s = readFileSync(join(SRC, 'supportNudge.js'), 'utf8')
    expect(s).not.toMatch(/isAndroidTWA/)
  })
})
