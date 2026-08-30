import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The portfolio lives in Chrome's storage, because a TWA is Chrome. Clearing
// the browser's data deletes it, this app's own "Clear storage" does not touch
// it, and Android's app backup has never included it. The vault is a copy in
// the app's own directory, which all three of those reach correctly.
//
// Two sides, one contract, nothing type-checked across it: the web sends a
// walletlens:// intent and the Java reads it. These cover both.

const SRC = dirname(fileURLToPath(import.meta.url))
const JAVA = join(
  SRC, '..', '..',
  'walletlens_source/release_package/app/src/main/java/live/walletlens/twa/DataVaultActivity.java',
)
const MANIFEST = join(
  SRC, '..', '..',
  'walletlens_source/release_package/app/src/main/AndroidManifest.xml',
)

const java = () => readFileSync(JAVA, 'utf8')
/** Java with comments removed — the prose describes the payloads it handles. */
const javaCode = () => java()
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '')

describe('the native side of the vault', () => {
  it('answers both halves of the contract the web app sends', () => {
    expect(javaCode()).toMatch(/"vault-save"/)
    expect(javaCode()).toMatch(/"vault-restore"/)
    const manifest = readFileSync(MANIFEST, 'utf8')
    expect(manifest).toMatch(/android:name="\.DataVaultActivity"/)
    expect(manifest).toMatch(/android:host="vault-save"/)
    expect(manifest).toMatch(/android:host="vault-restore"/)
  })

  it('writes into the app’s own directory, which is the entire point', () => {
    // getFilesDir() is inside this package's sandbox: covered by Android's app
    // backup, cleared by the app's own Clear storage, and untouched by
    // anything Chrome does. A cache dir or external storage would be none of
    // those things.
    expect(javaCode()).toMatch(/getFilesDir\(\)/)
    expect(javaCode()).not.toMatch(/getCacheDir\(\)|getExternalFilesDir/)
  })

  it('renames a temporary file rather than writing in place', () => {
    // A half-written vault is worse than no vault: it looks present and
    // restores as corrupt, at the one moment nothing else is left.
    expect(javaCode()).toMatch(/\.tmp/)
    expect(javaCode()).toMatch(/renameTo\(/)
  })

  it('refuses a payload that is not one of our backup codes', () => {
    // The intent filter is exported — it has to be, the sender runs in
    // Chrome's process — so any installed app can call it. It cannot read the
    // vault back, but without this it could overwrite it with rubbish and
    // destroy the backup silently.
    expect(javaCode()).toMatch(/startsWith\("WL3-"\)/)
    expect(javaCode()).toMatch(/startsWith\("WL1-"\)/)
  })

  it('caps the payload at a size it can still hand back', () => {
    // Restoring means putting the payload on a URL inside an Intent, which
    // crosses a Binder transaction with a hard ceiling. A vault that saved
    // and could never be returned fails only on the day it is needed.
    expect(javaCode()).toMatch(/MAX_PAYLOAD_BYTES/)
    expect(javaCode()).toMatch(/512 \* 1024/)
  })

  it('returns the payload on the fragment, never the query string', () => {
    // Fragments are not sent to the server. A query parameter would put the
    // user's whole portfolio in a request log — this app's own, which is the
    // one place it has promised never to be.
    expect(javaCode()).toMatch(/"wlvault"/)
    expect(javaCode()).toMatch(/RESTORE_URL \+ "#"/)
  })

  it('never crashes the app on a bad vault', () => {
    // It is a safety net. Failing to write one is not worth a crash dialog on
    // top of whatever the user was actually doing.
    expect(javaCode()).toMatch(/catch \(Throwable/)
  })
})

// ── The web side ────────────────────────────────────────────────────────────

describe('the web side of the vault', () => {
  let store

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: k => { delete store[k] },
    })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.restoreAllMocks() })

  async function load() {
    return import('./nativeVault.js')
  }

  it('reads the payload off the fragment', async () => {
    vi.stubGlobal('location', { hash: '#wlvault=WL3-abc', pathname: '/dashboard', search: '' })
    const { pendingVaultPayload } = await load()
    expect(pendingVaultPayload()).toBe('WL3-abc')
  })

  it('ignores a fragment that carries something else', async () => {
    vi.stubGlobal('location', { hash: '#section=holdings', pathname: '/dashboard', search: '' })
    const { pendingVaultPayload } = await load()
    expect(pendingVaultPayload()).toBeNull()
  })

  it('strips the payload off the URL whatever the outcome', async () => {
    // Left on the URL, a refresh replays the restore over data the user has
    // since changed, and a corrupt payload retries for ever.
    const replaceState = vi.fn()
    vi.stubGlobal('location', { hash: '#wlvault=not-a-code', pathname: '/dashboard', search: '' })
    vi.stubGlobal('history', { replaceState })
    const { consumeVaultPayload } = await load()

    const out = await consumeVaultPayload()
    expect(out.status).toBe('corrupt')
    expect(replaceState).toHaveBeenCalled()
  })

  it('reports an empty vault as empty rather than as a failure', async () => {
    vi.stubGlobal('location', { hash: '#wlvault=empty', pathname: '/dashboard', search: '' })
    vi.stubGlobal('history', { replaceState: vi.fn() })
    const { consumeVaultPayload } = await load()
    expect((await consumeVaultPayload()).status).toBe('empty')
  })

  it('does nothing at all when there is no payload', async () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { hash: '', pathname: '/dashboard', search: '' })
    vi.stubGlobal('history', { replaceState })
    const { consumeVaultPayload } = await load()
    expect((await consumeVaultPayload()).status).toBe('none')
    expect(replaceState, 'an untouched URL must stay untouched').not.toHaveBeenCalled()
  })

  it('only calls a device empty when it has neither holdings nor wallets', async () => {
    const { looksEmpty } = await load()
    expect(looksEmpty()).toBe(true)

    store.crypto_tracker_transactions = JSON.stringify([{ id: 1 }])
    expect(looksEmpty(), 'one transaction is not an empty device').toBe(false)

    store.crypto_tracker_transactions = '[]'
    store.crypto_tracker_wallets = JSON.stringify([{ id: 1 }])
    expect(looksEmpty(), 'nor is a wallet with no trades yet').toBe(false)
  })

  it('treats an unreadable store as NOT empty', async () => {
    // Guessing wrong here offers to overwrite data that is merely unreadable
    // at this instant. An offer to restore must never reach someone who has
    // lost nothing.
    store.crypto_tracker_transactions = '{ not json'
    const { looksEmpty } = await load()
    expect(looksEmpty()).toBe(false)
  })

  it('does nothing outside the Android app', async () => {
    vi.doMock('./nativeBridge', () => ({
      isAndroidTWA: () => false,
      fireNativeIntent: vi.fn(() => true),
    }))
    const { saveVault, requestVaultRestore } = await load()
    expect((await saveVault()).ok).toBe(false)
    expect(requestVaultRestore()).toBe(false)
  })

  it('sends the backup code through the session-preserving transport', async () => {
    const fireNativeIntent = vi.fn(() => true)
    vi.doMock('./nativeBridge', () => ({ isAndroidTWA: () => true, fireNativeIntent }))
    vi.doMock('./backupCore', () => ({
      generateBackupCode: async () => ({ code: 'WL3-payload', txCount: 1, walletCount: 0 }),
      applyBackupCode: async () => ({ restored: 2, when: null }),
    }))
    const { saveVault } = await load()

    const out = await saveVault()
    expect(out.ok).toBe(true)
    const [url, opts] = fireNativeIntent.mock.calls[0]
    expect(url).toBe('walletlens://vault-save?data=WL3-payload')
    // A top-frame navigation to intent:// takes the Custom Tab off its own
    // origin and ends the TWA session — the app simply disappears. A mirror
    // must never do that.
    expect(opts, 'the mirror must not end the session').toEqual({ keepSession: true })
  })

  it('asks for a restore on the top frame, which is the one case that should', async () => {
    const fireNativeIntent = vi.fn(() => true)
    vi.doMock('./nativeBridge', () => ({ isAndroidTWA: () => true, fireNativeIntent }))
    const { requestVaultRestore } = await load()

    requestVaultRestore()
    const [url, opts] = fireNativeIntent.mock.calls[0]
    expect(url).toBe('walletlens://vault-restore')
    // The native side answers by relaunching the app, so there is no session
    // to preserve — it is about to be replaced either way.
    expect(opts).toBeUndefined()
  })

  it('reports a payload too large to be handed back, rather than saving it', async () => {
    const fireNativeIntent = vi.fn(() => true)
    vi.doMock('./nativeBridge', () => ({ isAndroidTWA: () => true, fireNativeIntent }))
    vi.doMock('./backupCore', () => ({
      generateBackupCode: async () => ({ code: 'WL3-' + 'x'.repeat(512 * 1024) }),
      applyBackupCode: async () => ({ restored: 0, when: null }),
    }))
    const { saveVault } = await load()

    expect((await saveVault())).toMatchObject({ ok: false, reason: 'too-large' })
    expect(fireNativeIntent, 'nothing that cannot be restored is sent').not.toHaveBeenCalled()
  })

  it('says so when Chrome refused the launch for want of a gesture', async () => {
    // fireNativeIntent returns false with no user activation. Recording a save
    // that never happened is how a backup turns out to be missing on the day
    // it is needed.
    const fireNativeIntent = vi.fn(() => false)
    vi.doMock('./nativeBridge', () => ({ isAndroidTWA: () => true, fireNativeIntent }))
    vi.doMock('./backupCore', () => ({
      generateBackupCode: async () => ({ code: 'WL3-payload' }),
      applyBackupCode: async () => ({ restored: 0, when: null }),
    }))
    const { saveVault, lastVaultSave } = await load()

    expect((await saveVault())).toMatchObject({ ok: false, reason: 'no-activation' })
    expect(lastVaultSave(), 'a refused launch is not a save').toBeNull()
  })
})

// ── Mirroring on change ─────────────────────────────────────────────────────

describe('the mirror fires when the portfolio changes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const store = {}
    vi.stubGlobal('localStorage', {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: k => { delete store[k] },
    })
  })
  afterEach(() => {
    vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); vi.restoreAllMocks()
  })

  async function withBridge(fireNativeIntent, inApp = true) {
    vi.doMock('./nativeBridge', () => ({ isAndroidTWA: () => inApp, fireNativeIntent }))
    vi.doMock('./backupCore', () => ({
      generateBackupCode: async () => ({ code: 'WL3-x' }),
      applyBackupCode: async () => ({ restored: 0, when: null }),
    }))
    return import('./nativeVault.js')
  }

  it('coalesces a burst of writes into one copy', async () => {
    // An import writing a hundred rows must not fire a hundred intents.
    const fire = vi.fn(() => true)
    const { scheduleVaultSave } = await withBridge(fire)

    for (let i = 0; i < 50; i++) scheduleVaultSave()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fire).toHaveBeenCalledTimes(1)
  })

  it('waits well inside the window Chrome allows the launch in', async () => {
    // Chrome permits an external protocol launch only while a user activation
    // is live, and that lasts a few seconds from the last interaction. A
    // debounce of the length one would normally reach for here would find it
    // expired and be dropped silently — a mirror that never runs.
    const fire = vi.fn(() => true)
    const { scheduleVaultSave } = await withBridge(fire)

    scheduleVaultSave()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fire).toHaveBeenCalledTimes(1)
  })

  it('does not schedule anything outside the Android app', async () => {
    const fire = vi.fn(() => true)
    const { scheduleVaultSave } = await withBridge(fire, false)

    scheduleVaultSave()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fire).not.toHaveBeenCalled()
  })
})

describe('saveData mirrors the portfolio and nothing else', () => {
  it('only reaches for the vault on the keys that ARE the portfolio', () => {
    // A settings toggle firing a native intent would be noise, and on this
    // transport noise is expensive: each one is a real Android intent.
    const src = readFileSync(join(SRC, 'data', 'storage.js'), 'utf8')
    expect(src).toMatch(/MIRRORED\s*=\s*new Set\(\['transactions', 'wallets'\]\)/)
    expect(src).toMatch(/if \(MIRRORED\.has\(key\)\)/)
    // Imported lazily for isolation, not bundle size: App.jsx pulls the same
    // module in statically for a boot-time restore, so it is in the main chunk
    // regardless. What this buys is that the line cannot throw.
    expect(src).toMatch(/import\('\.\.\/nativeVault'\)/)
    // And the mirror must never be able to break saving a transaction.
    expect(src).toMatch(/\.catch\(\(\) => \{\}\)/)
  })
})
