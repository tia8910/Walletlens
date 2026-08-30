import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Most of WalletLens ships the moment Cloudflare Pages deploys. The parts that
// do not are the parts that live in the APK — the notification channels, the
// vault, the file pickers, the biometric prompt, the FCM transport — and Play's
// automatic update is off, deferred or Wi-Fi-only for a large share of devices.
// An install can sit years behind without its owner ever seeing a reason to
// look at the store, so the app has to say so itself.
//
// There is no Java test harness in this repo. These read the source as text,
// which is crude, but it is the only check the two halves get.

const SRC = dirname(fileURLToPath(import.meta.url))
const ANDROID = join(
  SRC, '..', '..',
  'walletlens_source/release_package/app/src/main/java/live/walletlens/twa',
)
const read = (f) => readFileSync(join(ANDROID, f), 'utf8')

describe('the in-app update check', () => {
  it('the source is where the build expects it', () => {
    // build-aab.yml compiles walletlens_source/release_package. If this file
    // moves, every assertion below passes vacuously.
    expect(existsSync(join(ANDROID, 'PlayUpdate.java'))).toBe(true)
  })

  it('the Play library is actually a dependency', () => {
    // Without this the class does not compile, and the compile check is on a
    // workflow that only runs on PRs touching the release package.
    const gradle = readFileSync(
      join(SRC, '..', '..', 'walletlens_source/release_package/app/build.gradle'), 'utf8')
    expect(gradle).toMatch(/com\.google\.android\.play:app-update:/)
  })

  it('runs on every resume, gated to once a day inside', () => {
    const shell = read('AppShellActivity.java')
    const resume = shell.slice(shell.indexOf('protected void onResume()'))
    expect(resume.slice(0, resume.indexOf('\n    }'))).toContain('PlayUpdate.check(this)')
  })

  it('stamps the day gate before the async call, not in its callback', () => {
    // The callback may never run — no Play Store, no network, a task the user
    // swipes away — and a stamp written only on success would put this back to
    // checking on every single resume on exactly the devices where the check
    // is failing.
    const src = read('PlayUpdate.java')
    const check = src.slice(src.indexOf('static void check('))
    const before = check.slice(0, check.indexOf('getAppUpdateInfo'))
    expect(before).toMatch(/putLong\(KEY_LAST_CHECK, now\)/)
  })

  it('prefers the flexible flow, which leaves the app usable', () => {
    // An immediate update takes over the screen and restarts the app. That is
    // right for a client that cannot function on an old version and wrong for
    // one whose old version keeps working while its owner reads their
    // portfolio.
    const src = read('PlayUpdate.java')
    const flexible = src.indexOf('AppUpdateType.FLEXIBLE')
    const immediate = src.indexOf('AppUpdateType.IMMEDIATE')
    expect(flexible).toBeGreaterThan(-1)
    expect(immediate).toBeGreaterThan(flexible)
  })

  it('falls back to the immediate flow rather than saying nothing', () => {
    // A release can be published as immediate-only, and then the flexible flow
    // is refused. Returning there would mean the user is never told at all,
    // which is the one outcome this class exists to prevent.
    expect(read('PlayUpdate.java'))
      .toMatch(/isUpdateTypeAllowed\(AppUpdateType\.IMMEDIATE\)/)
  })

  it('asks before restarting into a downloaded update', () => {
    // completeUpdate() restarts the app. Doing that silently to someone
    // mid-screen is worse than the old version they are reading it on.
    const src = read('PlayUpdate.java')
    const prompt = src.slice(src.indexOf('private static void promptInstall'))
    expect(prompt).toContain('completeUpdate()')
    expect(prompt).toMatch(/setPositiveButton/)
  })

  it('re-offers an update that finished downloading on an earlier run', () => {
    // Otherwise the bytes sit on the device for ever and the app never asks
    // again — the update is downloaded and never installed.
    const src = read('PlayUpdate.java')
    const onInfo = src.slice(src.indexOf('private static void onInfo'))
    const head = onInfo.slice(0, onInfo.indexOf('UpdateAvailability.UPDATE_AVAILABLE'))
    expect(head).toContain('InstallStatus.DOWNLOADED')
    expect(head).toContain('promptInstall(')
  })

  it('unregisters the download listener once it has fired', () => {
    // Left registered it stays for the life of the process and re-prompts on
    // every subsequent state change.
    expect(read('PlayUpdate.java')).toContain('manager.unregisterListener(this)')
  })

  it('says nothing at all on an install that did not come from Play', () => {
    // A sideloaded APK — the ones built straight out of CI — has no Play
    // install record, so the info call fails. It must NOT fall back to opening
    // the store listing: a tester would be nagged to "update" to a build older
    // than the one they are running.
    const src = read('PlayUpdate.java')
    const failure = src.slice(src.indexOf('addOnFailureListener'))
    const body = failure.slice(0, failure.indexOf(';', failure.indexOf('Log.d')))
    expect(body).toContain('Log.d')
    expect(src, 'never opens the store listing').not.toMatch(/play\.google\.com|market:\/\//)
  })

  it('never lets an update check stop the app opening', () => {
    // Play Core throws on devices where the Store is missing or disabled, and
    // this runs from onResume.
    const src = read('PlayUpdate.java')
    const check = src.slice(src.indexOf('static void check('))
    expect(check.slice(0, check.indexOf('\n    }'))).toMatch(/catch \(Throwable/)
  })
})
