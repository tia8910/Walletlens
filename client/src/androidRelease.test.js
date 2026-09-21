import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// versionCode is set in exactly one place and nothing verifies it, which has
// already cost a build: it sat at 41 while codes in the high 40s were in use,
// so every artifact from a clean clone was rejected by Play on upload. There
// is no bubblewrap twa-manifest.json to cross-check it against, and the number
// Play actually holds lives in the Console, not the repo.
//
// So this cannot verify the value is RIGHT. It can only hold the floor: 73 is
// in production, Play never accepts a duplicate or lower code, and a release
// build is worth more than the ten seconds this takes.

const nativeRoot = join(dirname(fileURLToPath(import.meta.url)),
  '../../walletlens_source/release_package/app/src/main')
const manifest = readFileSync(join(nativeRoot, 'AndroidManifest.xml'), 'utf8')
const adaptiveIcon = readFileSync(join(nativeRoot, 'res/mipmap-anydpi-v26/ic_launcher.xml'), 'utf8')
const monochrome = readFileSync(join(nativeRoot, 'res/drawable/ic_launcher_monochrome.xml'), 'utf8')

const gradle = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)),
       '../../walletlens_source/release_package/app/build.gradle'),
  'utf8',
)

const versionCode = Number(gradle.match(/^\s*versionCode\s+(\d+)/m)?.[1])

// The release build type, isolated.
//
// This used to be sliced from the first `release {` in the file, which was the
// buildTypes one only for as long as nothing else declared a release. Adding
// signingConfigs.release made that anchor grab the wrong block, and the tests
// below went on asserting confidently about R8 settings that were not in the
// text they were reading. Anchor on buildTypes first, so the block is found by
// where it lives rather than by being the only one of its name.
const releaseBuildType = (() => {
  const types = gradle.slice(gradle.indexOf('buildTypes {'))
  const body = types.slice(types.indexOf('release {'))
  return body.slice(0, body.indexOf('\n        }')).replace(/^\s*\/\/.*$/gm, '')
})()

describe('the Android release is uploadable', () => {
  it('has a versionCode Play will accept', () => {
    // 73 was accepted for the current production release. Anything at or below
    // it is rejected at upload, after the build has already been made.
    expect(Number.isInteger(versionCode)).toBe(true)
    expect(versionCode).toBeGreaterThanOrEqual(74)
  })

  it('sets the version in one place only', () => {
    // Two versionCode lines means one of them is a lie, and the build picks
    // whichever the parser saw last.
    expect(gradle.match(/^\s*versionCode\s+\d+/gm)).toHaveLength(1)
  })

  it('still flags the unresolved versionName', () => {
    // Deliberately not asserting a value: versionName is user-visible on the
    // Play listing and the real string for release 73 is not recoverable from
    // this repo — only the Console has it. Guessing would put a wrong version
    // in front of every user, which is worse than a TODO that stays visible.
    // Remove this test in the commit that sets the real string.
    expect(gradle).toMatch(/TODO\(tarek\)[\s\S]{0,300}?versionName/)
  })

  it('gives the launcher something to tint on Android 13+', () => {
    // Without a <monochrome> layer the launcher has nothing to theme and falls
    // back to the full-colour icon, so WalletLens was the one icon on a themed
    // home screen that ignored the theme. The manifest and the icon XML are
    // both PWABuilder output and get regenerated; this is what notices if the
    // layer is dropped on the way through.
    expect(adaptiveIcon).toMatch(/<monochrome android:drawable="@drawable\/ic_launcher_monochrome"/)
    expect(monochrome).toMatch(/<vector[\s\S]*android:viewportWidth="108"/)
    expect(monochrome).toMatch(/android:viewportHeight="108"/)
  })

  it('keeps the themed icon inside the adaptive-icon safe zone', () => {
    // Content outside the 72dp centre circle can be clipped by whatever mask
    // the launcher uses. The scale here was chosen so the furthest point —
    // the round cap on the handle tip — lands at 35.4dp from centre against a
    // 36dp limit, which is close enough that a nudge would push it out.
    const scale = Number(monochrome.match(/android:scaleX="([\d.]+)"/)?.[1])
    expect(scale).toBeGreaterThan(0)
    expect(scale).toBeLessThanOrEqual(1.10)
    // Centred: pivot (32,33) + translate (22,21) puts the mark at (54,54).
    expect(Number(monochrome.match(/android:pivotX="([\d.]+)"/)[1])
         + Number(monochrome.match(/android:translateX="([\d.]+)"/)[1])).toBe(54)
    expect(Number(monochrome.match(/android:pivotY="([\d.]+)"/)[1])
         + Number(monochrome.match(/android:translateY="([\d.]+)"/)[1])).toBe(54)
  })

  it('opts into predictive back without breaking the crash log', () => {
    // enableOnBackInvokedCallback stops the framework dispatching
    // onBackPressed(). CrashLogActivity still overrides it — back there means
    // "return to the app", not "go home" — so it must opt out individually.
    // Enabling app-wide without this exemption is a silent behaviour change.
    expect(manifest).toMatch(/<application[\s\S]*?android:enableOnBackInvokedCallback="true"/)
    const crashLog = manifest.slice(manifest.indexOf('android:name=".CrashLogActivity"'))
    expect(crashLog.slice(0, 400)).toMatch(/android:enableOnBackInvokedCallback="false"/)
  })

  it('keeps the launcher gate out of the app\'s own task', () => {
    // Two bugs, one cause. The gate is excludeFromRecents, which is right for
    // a throwaway activity — but excludeFromRecents belongs to the TASK, taken
    // from whichever activity created it. Sharing the default affinity with
    // LauncherActivity meant the gate's FLAG_ACTIVITY_NEW_TASK found the
    // gate's own task and reused it, so the app never appeared in recents AND
    // LauncherActivity was not a clean task root — which is the one thing
    // androidbrowserhelper needs to run a TWA rather than fall back to a
    // Custom Tab with walletlens.live in an address bar.
    const gate = manifest.slice(manifest.indexOf('android:name=".NotificationPermissionActivity"'))
    const decl = gate.slice(0, gate.indexOf('>'))
    expect(decl, 'the launcher gate must not share the app task\'s affinity')
      .toMatch(/android:taskAffinity=""/)
    expect(decl).toMatch(/android:excludeFromRecents="true"/)
  })

  it('leaves the entry activity with the app\'s own affinity', () => {
    // The other half: the gate is moved aside, the app is not. Giving the
    // entry activity an empty affinity too would put them back in the same
    // boat — one excluded task, no entry in the recents switcher.
    //
    // This used to name LauncherActivity, the TWA. That activity is gone (see
    // the case below), so the invariant moved to the activity that actually
    // roots the task now.
    const launcher = manifest.slice(manifest.indexOf('android:name=".AppShellActivity"'))
    const decl = launcher.slice(0, launcher.indexOf('>'))
    expect(decl).not.toMatch(/android:taskAffinity/)
    expect(decl).not.toMatch(/android:excludeFromRecents/)
  })

  it('has no Trusted Web Activity left anywhere', () => {
    // Play flagged release 90 for deprecated edge-to-edge APIs —
    // Window.setStatusBarColor and setNavigationBarColor — and every one of
    // them was called by androidbrowserhelper, not by this app. The app
    // stopped being a TWA when AppShellActivity took over as launcher, so all
    // of it was unreachable code still dragging in deprecated window APIs and
    // an edge-to-edge path nothing rendered.
    //
    // The dependency, the two classes that extended it, and the four
    // activities it contributed to the manifest are all gone. This fails if
    // any of them comes back.
    expect(gradle, 'the dependency').not.toMatch(/androidbrowserhelper:androidbrowserhelper/)
    for (const name of [
      'LauncherActivity',
      'DelegationService',
      'ManageDataLauncherActivity',
      'WebViewFallbackActivity',
      'FocusActivity',
      'NotificationPermissionRequestActivity',
    ]) {
      expect(manifest.match(new RegExp(`android:name="[^"]*\\b${name}"`)), name).toBeNull()
    }
    // And the meta-data that fed the deprecated colour setters.
    expect(manifest).not.toMatch(/customtabs\.trusted\.(STATUS|NAVIGATION)_BAR_COLOR/)
  })

  it('never runs R8 without the keep rules', () => {
    // THE BUG THIS EXISTS FOR: 6ff0b43 dropped the proguardFiles line and left
    // minifyEnabled true. R8 kept shrinking and obfuscating with none of the
    // rules in proguard-rules.pro applied, so nothing protected what Android
    // resolves by name — WorkManager loading a worker from a class name in its
    // database, androidbrowserhelper reading class names out of manifest
    // meta-data, the Play review library's callbacks crossing a binder.
    //
    // That combination is worse than either extreme, and it is invisible: the
    // build succeeds, the APK installs, and it fails at runtime. Worse still,
    // -keepattributes SourceFile,LineNumberTable lives in the same unapplied
    // file, so the crash it caused arrived with no line numbers.
    //
    // Minify may be on or off. What must never happen again is on WITHOUT the
    // rules.
    const code = releaseBuildType
    if (/minifyEnabled\s+true/.test(code)) {
      expect(code, 'R8 is on, so the keep rules must be applied')
        .toMatch(/proguardFiles[^\n]*'proguard-rules\.pro'/)
    }
  })

  it('signs the release, and holds no credentials to do it with', () => {
    // There was no signingConfigs block at all, so `./gradlew assembleRelease`
    // wrote app-release-unsigned.apk and reported success. An unsigned APK
    // installs nowhere, and the way that surfaced was a third-party store
    // refusing the upload with "we couldn't validate the file's signature" —
    // days after the build, with nothing in the build log pointing at it.
    expect(gradle, 'a release build must be signable').toMatch(/signingConfigs\s*\{/)
    expect(releaseBuildType, 'the release build type must use the config')
      .toMatch(/signingConfig\s+signingConfigs\.release/)

    // The credentials arrive from Gradle properties or the environment. The
    // moment one is written here instead, it is in the history for good and
    // the upload key has to be rotated, which costs a Play support round trip.
    const literal = /(storePassword|keyPassword|storeFile\s+file)\s*\(?\s*['"]/
    expect(gradle, 'no signing material may be written into this file')
      .not.toMatch(literal)

    // v1 as well as v2/v3. Android itself is satisfied by v2 at minSdk 23, but
    // several third-party store validators read only the v1 JAR signature and
    // call a v2-only APK unsigned.
    expect(gradle).toMatch(/enableV1Signing\s+true/)

    // And the guard that turns the silent failure into a loud one.
    expect(gradle, 'an unsigned release must fail rather than be written')
      .toMatch(/throw new GradleException/)
  })

  it('keeps the plugin and the wrapper on the same major', () => {
    // AGP 9 REQUIRES Gradle 9, and AGP 8 does not run on it. So these two
    // version strings, in two files that nothing else connects, have to move
    // together — and the failure when they don't is a build error nobody sees
    // until CI, or worse, a toolchain mismatch that builds and misbehaves.
    //
    // Deliberately NOT a pin to a specific version. Reverting to AGP 8.9.1 /
    // Gradle 8.11.1 is the documented first response to a launch crash on this
    // release; a test that named 9.0.0 would fail the moment someone did the
    // right thing in a hurry. It checks the relationship, which holds either
    // way round.
    const root = readFileSync(join(nativeRoot, '..', '..', '..', 'build.gradle'), 'utf8')
    const wrapper = readFileSync(
      join(nativeRoot, '..', '..', '..', 'gradle/wrapper/gradle-wrapper.properties'), 'utf8')

    const agp = root.match(/com\.android\.tools\.build:gradle:(\d+)\.\d+/)
    const gradle = wrapper.match(/gradle-(\d+)\.[\d.]*-bin\.zip/)
    expect(agp, 'an AGP version on the buildscript classpath').toBeTruthy()
    expect(gradle, 'a Gradle distribution in the wrapper').toBeTruthy()

    const agpMajor = Number(agp[1])
    const gradleMajor = Number(gradle[1])
    if (agpMajor >= 9) {
      expect(gradleMajor, `AGP ${agpMajor} needs Gradle 9 or newer`).toBeGreaterThanOrEqual(9)
    } else {
      expect(gradleMajor, `AGP ${agpMajor} does not run on Gradle ${gradleMajor}`).toBeLessThan(9)
    }
  })

  it('keeps the R8 settings internally consistent', () => {
    // This case used to pin minifyEnabled/shrinkResources/optimize ON, on the
    // reasoning that Play asks for all three and a quiet revert is how they
    // came to be off after the v2.7 crash.
    //
    // That was the wrong thing to assert, and 6.15 proved it: the app failed
    // to launch, the documented first response is to turn R8 back down, and
    // this test stood in front of the emergency action demanding a code change
    // to perform it. A test must never pin the state whose reversal is the
    // remedy — at best it is noise during an incident, at worst someone
    // deletes it in a hurry and the real invariants go with it.
    //
    // What IS invariant is that the settings agree with each other. AGP fails
    // the build outright for shrinkResources without minifyEnabled, and an
    // optimising proguard file with minification off is a line that reads as
    // protection while doing nothing — the exact misreading that made the v2.8
    // bisect ambiguous. Whether R8 is up or down is a release decision; that
    // the three settings tell the same story is not.
    const code = releaseBuildType

    const minify = /minifyEnabled\s+true/.test(code)
    const shrink = /shrinkResources\s+true/.test(code)
    const optimize = /proguard-android-optimize\.txt/.test(code)

    if (shrink) {
      expect(minify, 'shrinkResources needs minifyEnabled, or AGP fails the build').toBe(true)
    }
    if (optimize) {
      expect(minify, 'an optimising proguard file with minification off does nothing').toBe(true)
    }
    // Whichever way it is set, the file must still be named: dropping the
    // proguardFiles line entirely while leaving minifyEnabled on is what
    // 6ff0b43 did, and it ran R8 with no keep rules of ours at all.
    expect(code, 'the rules file must always be named').toMatch(/proguard-rules\.pro/)
  })

  it('keeps the JavaScript bridge, which optimisation would otherwise eat', () => {
    // The whole app-to-native surface — vault, notifications, biometrics, file
    // save, widgets — is 26 methods called from the web app BY NAME. Nothing
    // in the Java references them, so to R8 they are dead code.
    //
    // AGP's default config has carried a @JavascriptInterface rule for years,
    // which is why the bridge survives today. This asserts our own copy: the
    // app should not depend on a file it does not control for the one thing
    // that would take every native feature down at once.
    const rules = readFileSync(join(nativeRoot, '..', '..', 'proguard-rules.pro'), 'utf8')
    expect(rules).toMatch(/@android\.webkit\.JavascriptInterface <methods>;/)
    expect(rules).toMatch(/-keep class live\.walletlens\.twa\.WalletLensBridge/)
  })

  it('keeps every Play library that answers across a binder', () => {
    // The review library has had a rule since it was added. app-update did
    // not, and it is the same situation: the Play Store drives the flow and
    // resolves the listener's callback and AppUpdateInfo's fields by name on
    // its side. Under optimisation that becomes a silent failure — the update
    // prompt simply reports that no update is available, on release builds
    // only.
    const rules = readFileSync(join(nativeRoot, '..', '..', 'proguard-rules.pro'), 'utf8')
    for (const pkg of ['review', 'appupdate', 'install']) {
      expect(rules, `com.google.android.play.core.${pkg}`)
        .toMatch(new RegExp(`-keep class com\\.google\\.android\\.play\\.core\\.${pkg}`))
    }
  })

  it('still protects the resources resolved by name', () => {
    // shrinkResources removes what it cannot see a reference to, and layouts
    // and drawables named at runtime are exactly that. shrinkMode stays "safe"
    // so the conservative heuristic applies too.
    const keep = readFileSync(join(nativeRoot, 'res/raw/keep.xml'), 'utf8')
    expect(keep).toMatch(/tools:shrinkMode="safe"/)
    expect(keep).toMatch(/@layout\/widget_\*/)
  })

  it('keeps the rules that cover what R8 cannot see', () => {
    // Each of these is a class Android resolves by name. Losing any one is a
    // runtime failure the build cannot detect.
    const rules = readFileSync(join(nativeRoot, '..', '..', 'proguard-rules.pro'), 'utf8')
    expect(rules).toMatch(/-keep class live\.walletlens\.twa\.PeriodicUpdateWorker/)
    // androidbrowserhelper's keep is gone with the library: a keep rule for a
    // dependency that is no longer on the classpath protects nothing and
    // outlives the reader who could tell.
    expect(rules).not.toMatch(/androidbrowserhelper/)
    expect(rules).toMatch(/-keep class com\.google\.android\.play\.core\.review\.\*\*/)
    // Without this the mapping file cannot turn a Play Console trace back into
    // line numbers, which is half the point of shipping a mapping at all.
    expect(rules).toMatch(/-keepattributes SourceFile,LineNumberTable/)
  })

  it('routes every notification through the app\'s own channels', () => {
    // This used to assert that DelegationService stayed enabled: under the TWA
    // Chrome handed notifications to that service, and without it a price
    // alert arrived on a channel androidx.browser invented and ignored the
    // sound the user had chosen.
    //
    // There is no Chrome in the path any more. FCM delivers to
    // WalletLensMessagingService, which draws the notification itself through
    // NotificationHelper — so the channels are reached directly rather than
    // via a delegate that had to be kept switched on.
    const java = (f) => readFileSync(join(nativeRoot, 'java/live/walletlens/twa', f), 'utf8')
    expect(java('NotificationHelper.java')).toMatch(/CHANNEL_ALERTS_ID/)
    expect(java('WalletLensMessagingService.java')).toMatch(/showNotification/)
  })
})
