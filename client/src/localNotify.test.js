import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canNotify, showLocalNotification } from './localNotify'

// Android Chrome has never supported the Notification constructor. It throws:
//
//   TypeError: Failed to construct 'Notification': Illegal constructor.
//   Use ServiceWorkerRegistration.showNotification() instead.
//
// Four call sites did `try { new Notification(...) } catch {}`, so on the phone
// every in-app alert — a watchlist target crossed, a Smart Alert, a streak —
// was silently absent while the code read as though it worked everywhere. The
// empty catch is what hid it: no error surfaced, nothing happened.

const src = dirname(fileURLToPath(import.meta.url))

/** Every .js/.jsx under src/, excluding tests. */
function sourceFiles(dir = src, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) { sourceFiles(full, out); continue }
    if (!/\.(js|jsx)$/.test(e.name) || e.name.includes('.test.')) continue
    out.push(full)
  }
  return out
}

describe('in-app notifications reach Android', () => {
  let shown

  beforeEach(() => {
    shown = []
    vi.stubGlobal('Notification', class { constructor() { throw new TypeError('Illegal constructor') } })
    Notification.permission = 'granted'
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          showNotification: (title, opts) => { shown.push({ title, opts }); return Promise.resolve() },
        }),
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows through the service worker, where the constructor would throw', async () => {
    // The whole point. This is the Android case: the constructor is a trap and
    // the registration is the only way through.
    await expect(showLocalNotification('BTC ↑', { body: 'hit $100,000' })).resolves.toBe(true)
    expect(shown).toEqual([{ title: 'BTC ↑', opts: { body: 'hit $100,000' } }])
  })

  it('falls back to the constructor when no worker is controlling', async () => {
    // A first load before the worker activates, or a browser with service
    // workers off. Desktop must not lose the alerts it already had.
    const built = []
    vi.stubGlobal('Notification', class { constructor(t, o) { built.push({ t, o }) } })
    Notification.permission = 'granted'
    vi.stubGlobal('navigator', {})
    await expect(showLocalNotification('AAPL ↓', { body: 'below $200' })).resolves.toBe(true)
    expect(built).toHaveLength(1)
  })

  it('falls back when the registration has no showNotification', async () => {
    const built = []
    vi.stubGlobal('Notification', class { constructor(t, o) { built.push({ t, o }) } })
    Notification.permission = 'granted'
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({}) } })
    await expect(showLocalNotification('x', {})).resolves.toBe(true)
    expect(built).toHaveLength(1)
  })

  it('reports failure rather than throwing when both paths fail', async () => {
    // The callers are alert-checking loops running inside a React effect. One
    // notification that cannot be shown must not take the loop down with it.
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.reject(new Error('no sw')) } })
    await expect(showLocalNotification('x', {})).resolves.toBe(false)
  })

  it('shows nothing without permission', async () => {
    Notification.permission = 'default'
    expect(canNotify()).toBe(false)
    await expect(showLocalNotification('x', {})).resolves.toBe(false)
    expect(shown).toEqual([])
  })

  it('is the only place in the app that constructs a Notification', () => {
    // The guard. A new call site written the old way is invisible on Android
    // and passes every other test, exactly as the four originals did.
    const offenders = sourceFiles()
      .filter(f => !f.endsWith('localNotify.js'))
      .filter(f => /new Notification\s*\(/.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(src.length + 1))
    expect(offenders).toEqual([])
  })
})
