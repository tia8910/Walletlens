import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Registering a device that has no service worker.
//
// Inside the app's own WebView there is no Web Push subscription to make —
// PushManager does not exist there — so the address is an FCM token handed
// over by the native side. What must not break: every browser, desktop and iOS
// install still takes the push.js path, and a token that rotates must be
// re-registered rather than left pointing at nobody.

describe('registering over FCM', () => {
  let calls

  const bridgeWith = (over = {}) => {
    const b = {
      pushToken: () => 'tok-1234567890123456789',
      pushTokenSynced: () => false,
      markPushTokenSynced: vi.fn(),
      ensurePushToken: vi.fn(),
      notificationsAllowed: () => true,
      ...over,
    }
    vi.stubGlobal('window', { AndroidBridge: b })
    return b
  }

  beforeEach(() => {
    calls = []
    vi.stubGlobal('localStorage', {
      getItem: () => null, setItem: () => {}, removeItem: () => {},
    })
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) })
      return { ok: true, status: 200 }
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.restoreAllMocks() })

  async function load() { return import('./nativePush.js') }

  it('does nothing outside the shell', async () => {
    vi.stubGlobal('window', {})
    const { usesNativePush, registerNativePush } = await load()
    expect(usesNativePush()).toBe(false)
    expect((await registerNativePush()).reason).toBe('not-in-shell')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the token, flagged as the FCM transport', async () => {
    bridgeWith()
    const { registerNativePush } = await load()

    expect((await registerNativePush()).ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(/\/subscribe$/)
    // Without the flag the server stores this as a Web Push row with no
    // endpoint, which accepts happily and then delivers nothing, for ever.
    expect(calls[0].body.transport).toBe('fcm')
    expect(calls[0].body.fcmToken).toBe('tok-1234567890123456789')
  })

  it('does not re-register a token the server already has', async () => {
    // Called on every launch, so this is what stops one POST per app open.
    bridgeWith({ pushTokenSynced: () => true })
    const { registerNativePush } = await load()

    expect(await registerNativePush()).toEqual({ ok: true, reason: 'already' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('re-registers once FCM rotates the token', async () => {
    // A rotated token is the FCM equivalent of an expired endpoint: the server
    // keeps sending to an address nobody is at and nothing fails loudly. The
    // native side clears the flag when a new one arrives.
    bridgeWith({ pushToken: () => 'tok-rotated-98765432100', pushTokenSynced: () => false })
    const { registerNativePush } = await load()

    expect((await registerNativePush()).ok).toBe(true)
    expect(calls[0].body.fcmToken).toBe('tok-rotated-98765432100')
  })

  it('marks synced only after the server accepted it', async () => {
    // Marking on the attempt means one failed launch leaves the device
    // permanently believing it is registered — and the flag exists precisely
    // to stop that being invisible.
    const b = bridgeWith()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    const { registerNativePush } = await load()

    expect(await registerNativePush()).toEqual({ ok: false, reason: 'http-500' })
    expect(b.markPushTokenSynced).not.toHaveBeenCalled()
  })

  it('marks synced on success', async () => {
    const b = bridgeWith()
    const { registerNativePush } = await load()
    await registerNativePush()
    expect(b.markPushTokenSynced).toHaveBeenCalled()
  })

  it('survives the server being unreachable', async () => {
    const b = bridgeWith()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const { registerNativePush } = await load()

    expect(await registerNativePush()).toEqual({ ok: false, reason: 'unreachable' })
    expect(b.markPushTokenSynced).not.toHaveBeenCalled()
  })

  it('asks the native side to fetch a token when it has none', async () => {
    // onNewToken only fires when a token is created or rotated, so a device
    // that already had one before this shipped would otherwise hold an address
    // it never tells anyone about.
    const b = bridgeWith({ pushToken: () => '' })
    const { registerNativePush } = await load()

    expect((await registerNativePush()).reason).toBe('no-token')
    expect(b.ensurePushToken).toHaveBeenCalled()
    expect(fetch, 'nothing to register yet').not.toHaveBeenCalled()
  })

  it('re-registers on force even when the flag says synced', async () => {
    bridgeWith({ pushTokenSynced: () => true })
    const { registerNativePush } = await load()
    expect((await registerNativePush({ force: true })).ok).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('treats an unreadable flag as not synced', async () => {
    // Failing closed here costs one redundant POST. Failing open costs a
    // device that never registers and never says why.
    bridgeWith({ pushTokenSynced: () => { throw new Error('binder died') } })
    const { registerNativePush } = await load()
    expect((await registerNativePush()).ok).toBe(true)
    expect(calls).toHaveLength(1)
  })
})
