import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Moving the app off the Trusted Web Activity and onto its own WebView.
//
// The single fact that makes this dangerous: a WebView CANNOT read what Chrome
// stored for the same origin. Different process, different sandbox. So the
// first launch after the switch finds localStorage empty, and without a
// migration every existing user opens the app to a portfolio they spent months
// building and finds nothing in it.
//
// The vault is what crosses. These cover the crossing, and the guards that
// stop it firing when it must not.

const SRC = dirname(fileURLToPath(import.meta.url))
const JAVA_DIR = join(
  SRC, '..', '..', 'walletlens_source/release_package/app/src/main/java/live/walletlens/twa',
)
const read = (f) => readFileSync(join(JAVA_DIR, f), 'utf8')
const code = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '')

describe('the WebView shell', () => {
  it('turns on the storage that is the entire reason for the change', () => {
    // Without setDomStorageEnabled a WebView's localStorage silently does
    // nothing: writes appear to succeed and the store is empty on the next
    // load. That looks exactly like the data loss this change is meant to end,
    // which is the worst possible way for it to be missing.
    expect(code('AppShellActivity.java')).toMatch(/setDomStorageEnabled\(true\)/)
  })

  it('keeps outside pages out of the bridge', () => {
    // @JavascriptInterface exposes the bridge to whatever page the WebView is
    // showing, and the bridge can read the user's portfolio. If an outbound
    // link could load in here, that page could read it. Everything that is not
    // our origin leaves for a real browser, which has no bridge.
    const src = code('AppShellActivity.java')
    expect(src).toMatch(/shouldOverrideUrlLoading/)
    expect(src).toMatch(/ORIGIN\.equals/)
    expect(src).toMatch(/ACTION_VIEW/)
  })

  it('refuses mixed content', () => {
    expect(code('AppShellActivity.java')).toMatch(/MIXED_CONTENT_NEVER_ALLOW/)
  })

  it('does not become the launcher yet', () => {
    // It changes where every user's data lives, so it ships dark: reachable by
    // an explicit intent for on-device testing while the TWA launcher stays
    // exactly as it is. Promoting it is a deliberate one-line change.
    const manifest = readFileSync(
      join(SRC, '..', '..', 'walletlens_source/release_package/app/src/main/AndroidManifest.xml'),
      'utf8',
    )
    const block = manifest.slice(
      manifest.indexOf('android:name=".AppShellActivity"'),
      manifest.indexOf('</activity>', manifest.indexOf('android:name=".AppShellActivity"')),
    )
    expect(block).toMatch(/android:exported="false"/)
    expect(block, 'the shell must not carry LAUNCHER yet').not.toMatch(/category\.LAUNCHER/)
  })

  it('holds its host weakly, so the Activity can be collected', () => {
    // A JavaScript object holding a strong reference to the Activity is the
    // classic WebView leak: nothing can be collected on rotation or finish.
    expect(code('WalletLensBridge.java')).toMatch(/WeakReference<Activity>/)
  })

  it('calls only helpers that actually exist', () => {
    // A bridge method calling a helper that does not exist is a file that does
    // not compile, and there is no Java compiler in CI to catch it — so the
    // check is that every class.method the bridge reaches for is declared in
    // the class it names.
    //
    // This began life as "exposes only what phase 1 implements", which was the
    // right guard while the bridge was a stub and the wrong one the moment it
    // stopped being one. The invariant it was really protecting is this.
    const src = code('WalletLensBridge.java')
    const dir = join(
      SRC, '..', '..',
      'walletlens_source/release_package/app/src/main/java/live/walletlens/twa',
    )
    // Only classes in this package. Framework and AndroidX types resolve
    // against the SDK, which the compiler checks and this cannot.
    const ours = new Set(
      readdirSync(dir).filter(f => f.endsWith('.java')).map(f => f.replace(/\.java$/, '')),
    )
    const calls = [...src.matchAll(/\b([A-Z]\w+)\.(\w+)\(/g)]
      .filter(([, cls]) => ours.has(cls))

    expect(calls.length, 'the bridge should be reaching for something').toBeGreaterThan(0)
    for (const [, cls, method] of calls) {
      const target = readFileSync(join(dir, `${cls}.java`), 'utf8')
      expect(target, `${cls}.${method} must exist`).toMatch(new RegExp(`\\b${method}\\s*\\(`))
    }
  })

  it('can write the vault without going through an Activity', () => {
    // The whole gain of the bridge: a call with a return value, from anywhere,
    // with no user gesture. The intent path could offer none of those.
    expect(code('DataVaultActivity.java')).toMatch(/static boolean write\(/)
  })
})

// ── The web half ────────────────────────────────────────────────────────────

describe('detecting the shell', () => {
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

  const withBridge = (over = {}) => vi.stubGlobal('window', {
    AndroidBridge: {
      shellVersion: () => 'webview-1',
      readVault: () => '',
      writeVault: () => true,
      appLockEnabled: () => false,
      setAppLock: () => {},
      ...over,
    },
  })

  it('is a capability check, not a user-agent sniff', async () => {
    // isAndroidTWA() guesses from document.referrer and the UA, and one wrong
    // guess silently disabled App Lock, the widgets, the biometric onboarding
    // slide and the rating card at once — all four being features that are
    // SUPPOSED to be absent off Android, so nothing errored.
    withBridge()
    const { inAppShell, shellVersion } = await import('./nativeShell.js')
    expect(inAppShell()).toBe(true)
    expect(shellVersion()).toBe('webview-1')

    const src = readFileSync(join(SRC, 'nativeShell.js'), 'utf8')
    expect(src).not.toMatch(/navigator\.userAgent|document\.referrer/)
  })

  it('says no when there is no bridge', async () => {
    vi.stubGlobal('window', {})
    const { inAppShell, shellVersion } = await import('./nativeShell.js')
    expect(inAppShell()).toBe(false)
    expect(shellVersion()).toBeNull()
  })
})

describe('seeding the portfolio across from the vault', () => {
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

  async function load(bridgeOver = {}, applyImpl) {
    vi.stubGlobal('window', {
      AndroidBridge: {
        shellVersion: () => 'webview-1',
        readVault: () => '',
        writeVault: () => true,
        appLockEnabled: () => false,
        setAppLock: () => {},
        ...bridgeOver,
      },
    })
    vi.doMock('./backupCore', () => ({
      applyBackupCode: applyImpl || (async () => ({ restored: 7, when: null })),
    }))
    return import('./nativeShell.js')
  }

  it('restores an empty device from the app’s copy', async () => {
    // The migration in one test. Without it, every user updating from the TWA
    // build opens the app to nothing.
    const { seedFromVault } = await load({ readVault: () => 'WL3-payload' })
    expect(await seedFromVault()).toEqual({ status: 'restored', restored: 7 })
  })

  it('never overwrites a device that already has holdings', async () => {
    store.crypto_tracker_transactions = JSON.stringify([{ id: 1 }])
    const apply = vi.fn(async () => ({ restored: 99 }))
    const { seedFromVault } = await load({ readVault: () => 'WL3-payload' }, apply)

    expect((await seedFromVault()).status).toBe('not-empty')
    expect(apply, 'a live portfolio must never be replaced').not.toHaveBeenCalled()
  })

  it('treats an unreadable store as NOT empty', async () => {
    // Seeding over a store that merely failed to parse once would destroy the
    // very data the migration exists to protect.
    store.crypto_tracker_transactions = '{ not json'
    const apply = vi.fn(async () => ({ restored: 99 }))
    const { seedFromVault } = await load({ readVault: () => 'WL3-payload' }, apply)

    expect((await seedFromVault()).status).toBe('not-empty')
    expect(apply).not.toHaveBeenCalled()
  })

  it('runs once ever, not once per launch', async () => {
    const apply = vi.fn(async () => ({ restored: 7 }))
    const { seedFromVault } = await load({ readVault: () => 'WL3-payload' }, apply)

    expect((await seedFromVault()).status).toBe('restored')
    expect((await seedFromVault()).status).toBe('already-seeded')
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('does not retry a corrupt vault for ever', async () => {
    // Marked before applying, on purpose: a corrupt vault does not become less
    // corrupt on the fifth attempt, and retrying every launch is a loop.
    const apply = vi.fn(async () => { throw new Error('corrupt') })
    const { seedFromVault } = await load({ readVault: () => 'WL3-bad' }, apply)

    expect((await seedFromVault()).status).toBe('corrupt')
    expect((await seedFromVault()).status).toBe('already-seeded')
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('reports an empty vault without claiming to have restored', async () => {
    const { seedFromVault } = await load({ readVault: () => '' })
    expect((await seedFromVault()).status).toBe('empty-vault')
  })

  it('does nothing outside the shell', async () => {
    vi.stubGlobal('window', {})
    vi.doMock('./backupCore', () => ({ applyBackupCode: async () => ({ restored: 1 }) }))
    const { seedFromVault } = await import('./nativeShell.js')
    expect((await seedFromVault()).status).toBe('not-in-shell')
  })

  it('survives a bridge that throws', async () => {
    const { seedFromVault } = await load({
      readVault: () => { throw new Error('binder died') },
    })
    expect((await seedFromVault()).status).toBe('bridge-failed')
  })
})

// ── Google Drive in the shell ───────────────────────────────────────────────
//
// Google REFUSES OAuth inside an embedded WebView: accounts.google.com answers
// `disallowed_useragent`, deliberately, so an app cannot watch its users type a
// Google password into a view it controls. So the sign-in has to leave the
// WebView for a real browser tab, and the token has to find its way back.

describe('signing in to Google from inside the app', () => {
  const JAVA = join(
    SRC, '..', '..',
    'walletlens_source/release_package/app/src/main/java/live/walletlens/twa',
  )
  const rawJava = (f) => readFileSync(join(JAVA, f), 'utf8')
  const javaCode = (f) => rawJava(f).replace(/\/\*[\s\S]*?\*\//g, '')

  it('leaves the WebView through a Custom Tab, not a browser hand-off', () => {
    // A Custom Tab IS the user's browser — Google accepts it — and it keeps
    // the flow inside this app's task, so the redirect comes back to us. A
    // plain browser intent completes the OAuth somewhere this app can never
    // hear the answer from.
    expect(javaCode('WalletLensBridge.java')).toMatch(/CustomTabsIntent/)
    expect(javaCode('AppShellActivity.java')).toMatch(/CustomTabsIntent/)
  })

  it('refuses to open anything that is not https', () => {
    // openExternal is reachable from any JavaScript in the WebView. An
    // intent:// or file:// here would be a way out of the sandbox rather than
    // a way to a login page.
    expect(javaCode('WalletLensBridge.java')).toMatch(/!url\.startsWith\("https:\/\/"\)/)
  })

  it('brings the callback back into the SAME WebView', () => {
    // The state parameter that makes this flow safe lives in sessionStorage.
    // A fresh WebView would come back to a token it cannot verify, and the
    // sign-in would fail with a state mismatch.
    const src = javaCode('AppShellActivity.java')
    expect(src).toMatch(/protected void onNewIntent/)
    expect(src).toMatch(/web\.loadUrl\(url\.toString\(\)\)/)
    // And only our own origin may be loaded into a WebView that has the bridge
    // attached to it.
    expect(src).toMatch(/ORIGIN\.equals/)
  })

  it('declares the Custom Tabs dependency rather than inheriting it', () => {
    const gradle = readFileSync(
      join(SRC, '..', '..', 'walletlens_source/release_package/app/build.gradle'), 'utf8',
    )
    expect(gradle).toMatch(/androidx\.browser:browser/)
  })

  it('routes the auth navigation through the bridge when there is one', () => {
    const src = readFileSync(join(SRC, 'googleDrive.js'), 'utf8')
    const fn = src.slice(src.indexOf('export function beginRedirectSignIn'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/openExternal/)
    // And still navigates normally in a browser, where there is no bridge and
    // the ordinary redirect is exactly right.
    expect(body).toMatch(/window\.location\.assign\(url\)/)
  })
})

// ── Widgets ─────────────────────────────────────────────────────────────────
//
// The widgets were fed by an intent, which could not report whether it
// applied and could only fire during a user gesture. A widget is looked at
// precisely when nobody is touching the screen, so the background sync was
// being skipped exactly when it mattered.

describe('widget sync in the shell', () => {
  const JAVA = join(
    SRC, '..', '..',
    'walletlens_source/release_package/app/src/main/java/live/walletlens/twa',
  )
  const javaCode = (f) => readFileSync(join(JAVA, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  it('can be applied without starting an Activity', () => {
    // Starting one is what needed the gesture, what left tasks in the recents
    // switcher, and what made taskAffinity="" necessary in the manifest.
    expect(javaCode('WidgetSyncActivity.java')).toMatch(/static void applyPayload\(/)
    expect(javaCode('WalletLensBridge.java'))
      .toMatch(/WidgetSyncActivity\.applyPayload\(a, json\)/)
  })

  it('reports whether it worked', () => {
    // The whole gain over the intent. Through that channel the web app could
    // never tell a written widget from a dropped one.
    expect(javaCode('WalletLensBridge.java')).toMatch(/public boolean syncWidgets\(/)
  })

  it('tries the bridge before the intent at every send site', () => {
    // Three call sites, and one left on the old path is a sync that silently
    // does not happen in the shell — which is the failure this replaces.
    const src = readFileSync(join(SRC, 'nativeWidgets.js'), 'utf8')
    const bridgeCalls = (src.match(/syncViaBridge\(/g) || []).length
    const intentCalls = (src.match(/walletlens:\/\/widget-sync\?data=/g) || []).length
    // One definition plus one guard per intent site.
    expect(bridgeCalls).toBe(intentCalls + 1)
  })

  it('still falls back to the intent outside the shell', () => {
    // The TWA build is still what most installs are running, and it has no
    // bridge at all.
    const src = readFileSync(join(SRC, 'nativeWidgets.js'), 'utf8')
    expect(src).toMatch(/!syncViaBridge\([\s\S]{0,40}?&&\s*\n\s*!fireNativeIntent\(/)
  })
})
