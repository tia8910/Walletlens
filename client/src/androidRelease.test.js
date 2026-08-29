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

  it('leaves LauncherActivity with the app\'s own affinity', () => {
    // The other half: the gate is moved aside, the TWA is not. Giving this one
    // an empty affinity too would put them back in the same boat.
    const launcher = manifest.slice(manifest.indexOf('android:name="LauncherActivity"'))
    const decl = launcher.slice(0, launcher.indexOf('>'))
    expect(decl).not.toMatch(/android:taskAffinity/)
    expect(decl).not.toMatch(/android:excludeFromRecents/)
  })

  it('keeps notification delegation switched on', () => {
    // The whole channel-routing fix hangs off DelegationService being bound by
    // Chrome. enableNotifications false silently disables the service in the
    // manifest, and web push falls back to arriving as "Chrome".
    expect(gradle).toMatch(/enableNotifications:\s*true/)
  })
})
