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

/**
 * Source with comments removed and string bodies blanked.
 *
 * A single pass, not chained regexes, and that is the point. Java source
 * contains all four of these, and every regex ordering gets one of them wrong:
 *
 *   "*​/*"                    a string holding a block-comment CLOSER
 *   "https:/​/walletlens.live" a string holding a line-comment opener
 *   // the app's own WebView  an apostrophe in prose, which looks like a char
 *                            literal and runs to the next apostrophe
 *
 * Strip comments first and the mime wildcard opens a comment that deletes real
 * code up to the next javadoc. Blank strings first and an apostrophe in a
 * comment blanks the code after it. Both happened here, and both reported a
 * missing line that was plainly in the file.
 *
 * So this walks the text once, in the states the language actually has.
 */
function code(f) {
  const src = read(f)
  let out = ''
  let i = 0
  while (i < src.length) {
    const two = src.slice(i, i + 2)
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (two === '/*') {
      i += 2
      while (i < src.length && src.slice(i, i + 2) !== '*/') i++
      i += 2
      continue
    }
    if (src[i] === '"' || src[i] === "'") {
      const quote = src[i]
      i++
      while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1
      i++
      // The quotes are kept so a matcher can still see that a literal was
      // there; only the body goes.
      out += quote + quote
      continue
    }
    out += src[i++]
  }
  return out
}

const javaDir = () => JAVA_DIR

/**
 * The manifest with its comments removed.
 *
 * Stripped because the comments in it discuss the very attributes these tests
 * count — the note explaining why the permission gate no longer carries
 * MAIN/LAUNCHER would otherwise be counted as an activity that does.
 */
const readManifest = () => readFileSync(
  join(SRC, '..', '..', 'walletlens_source/release_package/app/src/main/AndroidManifest.xml'),
  'utf8',
).replace(/<!--[\s\S]*?-->/g, '')

/** One <activity> element, by its exact android:name value. */
function activityBlock(name) {
  const manifest = readManifest()
  const start = manifest.indexOf(`android:name="${name}"`)
  if (start < 0) throw new Error(`no activity named ${name} in the manifest`)
  const end = manifest.indexOf('</activity>', start)
  return manifest.slice(start, end < 0 ? undefined : end)
}

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

  // The shell shipped dark first — declared, reachable by an explicit intent,
  // deliberately not the launcher — and this suite asserted that. It is the
  // launcher now, so what these assert is the state that replaced it: the app
  // has ONE way in, and it is the one that is not a browser.

  it('is the launcher', () => {
    const block = activityBlock('.AppShellActivity')
    expect(block).toMatch(/android:exported="true"/)
    expect(block).toMatch(/category\.LAUNCHER/)
  })

  it('is the only launcher', () => {
    // The TWA gate carried MAIN/LAUNCHER until this version. Two of them is
    // two icons in the app drawer, one of which opens Chrome — and a user who
    // taps the wrong one gets the address bar back with no way to tell why.
    const manifest = readManifest()
    const launchers = [...manifest.matchAll(/category\.LAUNCHER/g)]
    expect(launchers.length, 'exactly one activity may carry MAIN/LAUNCHER').toBe(1)
    expect(activityBlock('.NotificationPermissionActivity')).not.toMatch(/category\.LAUNCHER/)
  })

  it('answers walletlens.live links instead of the TWA', () => {
    // A link tapped anywhere on the device used to open LauncherActivity,
    // which is Chrome rendering the site. Leaving that filter behind would
    // mean every shared link re-entered the app through the browser it just
    // stopped being.
    expect(activityBlock('.AppShellActivity')).toMatch(/android:scheme="https"/)
    expect(activityBlock('LauncherActivity')).not.toMatch(/android:scheme="https"/)
  })

  it('owns the long-press shortcuts', () => {
    // Android reads android.app.shortcuts from whichever activity carries
    // MAIN/LAUNCHER, and the generated file names its target class outright —
    // so a shortcut left pointing at the TWA opens Chrome from the one path
    // nobody thinks to retest.
    expect(activityBlock('.AppShellActivity')).toMatch(/android\.app\.shortcuts/)
    const shortcuts = readFileSync(
      join(SRC, '..', '..', 'walletlens_source/release_package/app/src/main/res/xml/shortcuts.xml'),
      'utf8',
    )
    expect(shortcuts).toMatch(/AppShellActivity/)
    expect(shortcuts).not.toMatch(/LauncherActivity/)
  })

  it('sends nothing to the TWA launcher any more', () => {
    // Ten files built an Intent for LauncherActivity by name: every widget's
    // tap target, the notification tap, the biometric hand-back, the crash
    // screen, the review prompt, the vault restore. Each one that stayed
    // behind is a path that opens Chrome from inside the app.
    const dir = javaDir()
    const offenders = readdirSync(dir)
      .filter(f => f.endsWith('.java'))
      .filter(f => /new Intent\([^)]*LauncherActivity\.class/.test(
        readFileSync(join(dir, f), 'utf8')))
    expect(offenders, 'these still open the TWA directly').toEqual([])
  })

  // ── The app must look like an app ────────────────────────────────────
  //
  // display-mode: standalone was the "am I the app" test for years, and it was
  // right for years: a TWA renders in a Custom Tab, which reports standalone.
  // The shell's WebView reports `browser`, so the flag went false everywhere at
  // once and took the native onboarding, the bottom navigation, the app-mode
  // layout class and — through onboarding, which the primer waits for — the
  // notification prompt with it. Nothing errored, because every one of those is
  // supposed to be absent in a browser tab.

  it('counts the shell as an installed app', async () => {
    const { isInstalledApp } = await import('./nativeBridge')

    const mq = window.matchMedia
    window.matchMedia = () => ({ matches: false })   // a WebView: display-mode browser
    try {
      expect(isInstalledApp(), 'a plain browser is not the app').toBe(false)

      window.AndroidBridge = { shellVersion: () => 'webview-1' }
      expect(isInstalledApp(), 'the shell is the app').toBe(true)
    } finally {
      delete window.AndroidBridge
      window.matchMedia = mq
    }
  })

  it('still counts a standalone PWA as an installed app', async () => {
    const { isInstalledApp } = await import('./nativeBridge')
    const mq = window.matchMedia
    window.matchMedia = () => ({ matches: true })
    try {
      expect(isInstalledApp()).toBe(true)
    } finally { window.matchMedia = mq }
  })

  it('decides app-only UI from one place', () => {
    // Four files each had their own copy of the media query, so "is this the
    // app" could be answered differently in four places — and was, the moment
    // the answer changed. They go through isInstalledApp now.
    const roots = ['App.jsx', 'components/PWAInstallPrompt.jsx', 'pages/Landing.jsx']
    for (const f of roots) {
      const src = readFileSync(join(SRC, f), 'utf8')
      expect(src, `${f} must not test display-mode itself`)
        .not.toMatch(/matchMedia\??\.?\(['"]\(display-mode: standalone\)['"]\)/)
    }
  })

  // ── Files ────────────────────────────────────────────────────────────

  it('opens a file picker for the page', () => {
    // A WebView does not open one on its own: tapping <input type="file">
    // calls onShowFileChooser and, if the app does not answer, nothing at all
    // happens. That is screenshot import, CSV import and restoring a backup
    // file — most of the ways data gets into this app.
    const src = code('AppShellActivity.java')
    expect(src).toMatch(/setWebChromeClient/)
    expect(src).toMatch(/onShowFileChooser/)
    expect(src).toMatch(/FileChooserParams\.parseResult/)
  })

  it('always answers the file-chooser callback', () => {
    // A callback that is never answered leaves the input permanently inert:
    // the user taps it again and nothing happens, for the rest of the session.
    // So cancellation has to deliver null rather than returning early.
    const src = code('AppShellActivity.java')
    const body = src.slice(src.indexOf('private void deliverFiles'))
    expect(body).toMatch(/onReceiveValue/)
    expect(body, 'cancellation must still answer the callback').toMatch(/:\s*null/)
  })

  it('registers the picker before the activity can start', () => {
    // registerForActivityResult throws if it runs after STARTED, so it has to
    // be a field initialiser rather than something the tap sets up.
    expect(code('AppShellActivity.java'))
      .toMatch(/private final ActivityResultLauncher<Intent> filePicker\s*=\s*registerForActivityResult/)
  })

  it('cannot be talked into writing outside Downloads', () => {
    // The filename arrives from the page. A separator in it would put the
    // write somewhere else entirely.
    // Asserted on the CALLS, not on the sanitiser's character class: the class
    // lives in a string literal, which code() blanks, and pinning the exact
    // regex would test the spelling rather than the property anyway. What
    // matters is that neither writer ever touches the raw name.
    const src = code('WalletLensBridge.java')
    expect(src).toMatch(/private static String safeName\(/)
    for (const method of ['saveFile', 'shareFile']) {
      const body = src.slice(src.indexOf(`public boolean ${method}(`))
      expect(body.slice(0, body.indexOf('\n    }')), `${method} must sanitise the name`)
        .toMatch(/safeName\(name\)/)
    }
  })

  it('shares through the FileProvider, never a file:// URI', () => {
    // A file:// URI throws FileUriExposedException on anything since Android
    // 7, and there is no way for the receiving app to read it.
    const src = code('WalletLensBridge.java')
    expect(src).toMatch(/FileProvider\.getUriForFile/)
    expect(src).toMatch(/FLAG_GRANT_READ_URI_PERMISSION/)
  })

  it('keeps the page out from under the status bar', () => {
    // An app targeting SDK 35+ is edge-to-edge and cannot opt out, so the
    // window covers the whole screen and a WebView added to it renders behind
    // the clock. The header, the search field and the settings button all live
    // up there. The TWA never had this because the window was Chrome's.
    const src = code('AppShellActivity.java')
    expect(src).toMatch(/setOnApplyWindowInsetsListener/)
    expect(src).toMatch(/web\.setPadding\(bars\.left, bars\.top, bars\.right, bars\.bottom\)/)
  })

  it('pads for the camera cutout too, not just the bars', () => {
    // A punch-hole sits beside the status bar in landscape rather than within
    // it, so systemBars() alone still loses a strip of the page to the lens.
    expect(code('AppShellActivity.java')).toMatch(/Type\.displayCutout\(\)/)
  })

  it('targets an SDK where this is mandatory', () => {
    // If this ever drops below 35 the inset handling above stops being forced
    // — and someone removing it would find the tests still green.
    const gradle = readFileSync(
      join(SRC, '..', '..', 'walletlens_source/release_package/app/build.gradle'),
      'utf8',
    )
    const targetSdk = Number((gradle.match(/targetSdk\s+(\d+)/) || [])[1])
    expect(targetSdk).toBeGreaterThanOrEqual(35)
  })

  it('never hands a walletlens:// URL to a browser', () => {
    // THE BUG THIS ENDS. Every route into native code is a walletlens:// URL
    // the page navigates to, and they were all falling through to the Custom
    // Tab branch — a Custom Tab is a browser, and a browser cannot open a
    // custom scheme. Enabling the fingerprint lock in onboarding fired an
    // intent that went to Chrome and died there; so did the review prompt, the
    // export and the vault save. Nothing errored, because the page fires these
    // and never expects an answer.
    const src = code('AppShellActivity.java')
    const handler = src.slice(src.indexOf('shouldOverrideUrlLoading'))
    const nonWeb = handler.indexOf('.equals(scheme)')
    const customTab = handler.indexOf('CustomTabsIntent')
    expect(nonWeb, 'the scheme must be checked at all').toBeGreaterThan(-1)
    expect(nonWeb, 'non-web schemes must be handled BEFORE the Custom Tab')
      .toBeLessThan(customTab)
  })

  it('sets App Lock through the bridge, not only an intent', () => {
    // The intent path cannot report anything, so a dropped one leaves the lock
    // on in the page and off in the app — which is the state that demands a
    // fingerprint the app has no record of wanting.
    const lock = readFileSync(join(SRC, 'components/BiometricLock.jsx'), 'utf8')
    expect(lock).toMatch(/setNativeAppLock\(true\)/)
    expect(lock).toMatch(/setNativeAppLock\(false\)/)
  })

  it('holds its host weakly, so the Activity can be collected', () => {
    // A JavaScript object holding a strong reference to the Activity is the
    // classic WebView leak: nothing can be collected on rotation or finish.
    expect(code('WalletLensBridge.java')).toMatch(/WeakReference<Activity>/)
  })

  it('calls only helpers that actually exist', () => {
    // A bridge method calling a helper that does not exist is a file that does
    // not compile, so the check is that every class.method the bridge reaches
    // for is declared in the class it names.
    //
    // A real compiler now runs on every PR that touches the Android project
    // (.github/workflows/android-compile.yml), which makes this the cheaper of
    // two overlapping guards rather than the only one: it answers in
    // milliseconds here instead of minutes on a runner, and it names the
    // bridge method rather than a line number in generated output.
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
