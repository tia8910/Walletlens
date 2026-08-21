import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// fireNativeIntent is the only thing that actually reaches Android, so counting
// its calls is the honest measure of "did the widget get updated".
const fired = []
vi.mock('./nativeBridge', () => ({
  isAndroidTWA: () => true,
  fireNativeIntent: (url) => { fired.push(url); return true },
}))

const HOLDINGS = [
  { coin_symbol: 'BTC', value: 5000, pct24h: 2.5, price: 60000 },
  { coin_symbol: 'ETH', value: 2000, pct24h: -1.2, price: 3000 },
]

async function freshModule() {
  vi.resetModules()
  fired.length = 0
  return import('./nativeWidgets')
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('widget sync throttle', () => {
  it('fires on the first call of a session', async () => {
    const { syncWidgets } = await freshModule()
    expect(syncWidgets({ enriched: HOLDINGS, totalValue: 7000 })).toBe(true)
    expect(fired).toHaveLength(1)
    expect(fired[0]).toContain('walletlens://widget-sync?data=')
  })

  it('throttles a second call in the same session', async () => {
    const { syncWidgets } = await freshModule()
    syncWidgets({ enriched: HOLDINGS, totalValue: 7000 })
    expect(syncWidgets({ enriched: HOLDINGS, totalValue: 7000 })).toBe(false)
    expect(fired).toHaveLength(1)
  })

  it('fires again on a new app session even inside the throttle window', async () => {
    // The case this exists for. Clearing the app's data empties the native
    // widgets, but localStorage — a different store with a different lifetime —
    // still says we synced a minute ago. Without this the widgets stay at
    // "Not yet updated" until the gap expires and the dashboard happens to be
    // open, which can be never.
    const { syncWidgets } = await freshModule()
    syncWidgets({ enriched: HOLDINGS, totalValue: 7000 })
    expect(fired).toHaveLength(1)

    sessionStorage.clear()            // a cold start: new document, same origin
    expect(syncWidgets({ enriched: HOLDINGS, totalValue: 7000 })).toBe(true)
    expect(fired).toHaveLength(2)
  })

  it('still honours force after the session sync is spent', async () => {
    const { syncWidgets } = await freshModule()
    syncWidgets({ enriched: HOLDINGS, totalValue: 7000 })
    expect(syncWidgets({ enriched: HOLDINGS, totalValue: 7000, force: true })).toBe(true)
    expect(fired).toHaveLength(2)
  })

  it('does not fire for an empty portfolio, session or not', async () => {
    // Pushing zeros would overwrite a good widget with a blank one.
    const { syncWidgets } = await freshModule()
    expect(syncWidgets({ enriched: [], totalValue: 0 })).toBe(false)
    expect(fired).toHaveLength(0)
  })

  it('records why it did not fire', async () => {
    const { syncWidgets, widgetSyncDiagnostics } = await freshModule()
    syncWidgets({ enriched: [], totalValue: 0 })
    expect(widgetSyncDiagnostics().diag.result).toBe('no-holdings')
  })
})


describe('the widget sync must not end the session', () => {
  // Every widget-sync call has to pass keepSession. One that does not is a
  // top-frame navigation to intent://, which ends the TWA session and leaves a
  // new task in recents — every five minutes, on the sync cadence.
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'nativeWidgets.js'), 'utf8',
  )

  it('passes keepSession on every widget-sync intent', () => {
    const calls = [...src.matchAll(/fireNativeIntent\(\s*'walletlens:\/\/widget-sync[\s\S]*?\)\)/g)]
    expect(calls.length).toBeGreaterThanOrEqual(3)
    for (const c of calls) expect(c[0], c[0].slice(0, 60)).toContain('keepSession: true')
  })
})
