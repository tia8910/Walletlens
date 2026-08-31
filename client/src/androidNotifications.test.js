import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Android shell used to send its own notifications on a timer: every 30
// minutes, cycling price → hack tip → academy tip → feature tip, from a
// hard-coded list of twelve coins, with no quiet hours and no daily cap. A
// user was interrupted about assets they might not even hold.
//
// That was retired. Notifications now come from the push worker, which sends
// only when something has happened to something the user owns, honours quiet
// hours on the user's own clock, and shares one daily budget. This suite used
// to check the parallel copy arrays that fed the timer; the copy is gone, so
// what is worth guarding now is that the retirement cannot be half-undone.
//
// THE TRAP: WorkManager persists enqueued work across app updates, and the old
// registration used ExistingPeriodicWorkPolicy.KEEP. Deleting the scheduling
// code was never enough — a device that last ran a pre-retirement build still
// has the work queued, and only an explicit cancel stops it. So two things
// have to stay true until no meaningful number of installs predates the
// retirement: the cancel must run on every entry point, and the worker class
// must still load, or WorkManager cannot drain the queue to cancel it.

const SRC = dirname(fileURLToPath(import.meta.url))
const ANDROID = join(SRC, '..', '..', 'walletlens_source/release_package/app/src/main')
const JAVA = join(ANDROID, 'java/live/walletlens/twa')

const read = (f) => readFileSync(join(JAVA, f), 'utf8')
const worker = read('PeriodicUpdateWorker.java')
const scheduler = read('NotificationScheduler.java')

describe('the timer-driven notifications stay retired', () => {
  it('leaves the worker class loadable', () => {
    // Not deleted. WorkManager instantiates by class name while draining a
    // queue; a missing class makes those runs fail rather than complete, and
    // the queue does not clear.
    expect(worker).toMatch(/class PeriodicUpdateWorker extends Worker/)
  })

  it('does no work and does not ask to be retried', () => {
    // Result.success(), not retry: a failed run stays in the queue, which is
    // the one outcome that would keep this alive.
    expect(worker).toMatch(/return Result\.success\(\)/)
    expect(worker).not.toMatch(/Result\.retry\(\)/)
  })

  it('posts nothing and fetches nothing', () => {
    // The whole point. A tombstone that still talks to CoinGecko or still
    // holds notification copy reads as a live feature to the next person.
    expect(worker).not.toMatch(/NotificationManager|NotificationCompat|\.notify\(/)
    expect(worker).not.toMatch(/HttpURLConnection|coingecko|metals\.live/i)
    expect(worker).not.toMatch(/getStringArray/)
  })

  it('takes the canned copy with it', () => {
    // Six files of string-arrays that nothing reads any more.
    for (const dir of ['values', 'values-ar', 'values-de', 'values-es', 'values-fr', 'values-it']) {
      expect(existsSync(join(ANDROID, 'res', dir, 'notification_copy.xml')),
        `${dir}/notification_copy.xml should be gone`).toBe(false)
    }
  })

  it('still cancels the queued work, under the names it was queued with', () => {
    // A renamed constant cancels nothing and fails silently — the device just
    // keeps its 30-minute worker.
    expect(scheduler).toMatch(/cancelUniqueWork\(PERIODIC_WORK\)/)
    expect(scheduler).toMatch(/cancelUniqueWork\(IMMEDIATE_WORK\)/)
    expect(scheduler).toMatch(/PERIODIC_WORK\s*=\s*"[^"]+"/)
  })

  it('runs the cancel from every entry point', () => {
    // Cold start, launch and boot. Missing one leaves a device that only ever
    // arrives through that path still running the worker.
    // LauncherActivity was on this list until the TWA was removed; the paths
    // that remain are the process starting and the device booting.
    for (const f of ['WalletLensApp.java', 'BootReceiver.java']) {
      expect(read(f), `${f} must call NotificationScheduler.schedule`)
        .toMatch(/NotificationScheduler\.schedule\(/)
    }
  })

  it('keeps NotificationHelper, which the push path needs', () => {
    // Easy to mistake for part of the same dead feature. Every push is drawn
    // through these channels; deleting them silences the system that replaced
    // the timer.
    //
    // This used to read DelegationService — the TWA service Chrome handed
    // notifications to. That is gone with the rest of the TWA, and the
    // messaging service draws them directly now, so the same invariant is
    // asserted one link further down the chain.
    const fcm = read('WalletLensMessagingService.java')
    expect(fcm).toMatch(/NotificationHelper/)
    expect(read('NotificationHelper.java')).toMatch(/CHANNEL_ALERTS_ID/)
  })
})

describe('one decision, one prompt', () => {
  // The Android app permission and this origin's web Notification permission
  // are separate, and both are needed: the app permission without a
  // subscription is silence, and a subscription the app cannot post is silence
  // too. The app used to request the first on every cold start — before the
  // user had seen anything — and the second only when they later found the
  // switch. Two dialogs for one decision, and the first bought nothing: the
  // switch still read Off afterwards, because nothing had subscribed.
  const gate = readFileSync(join(JAVA, 'NotificationPermissionActivity.java'), 'utf8')
  const manifest = readFileSync(join(ANDROID, 'AndroidManifest.xml'), 'utf8')
  const push = readFileSync(join(SRC, 'push.js'), 'utf8')

  it('does not ask on a launcher start', () => {
    // The request is reachable only down the on-demand branch.
    expect(gate).toMatch(/if \(askOnly && needsRequest\)/)
    const launch = /\} else \{\s*proceed\(\);/.exec(gate)
    expect(launch, 'a launcher start must fall through to proceed()').not.toBeNull()
  })

  it('is reachable on demand from the web side', () => {
    expect(gate).toMatch(/HOST_REQUEST = "notification-permission"/)
    expect(manifest).toMatch(/android:host="notification-permission"/)
    expect(push).toMatch(/walletlens:\/\/notification-permission/)
  })

  it('returns the user to the app rather than relaunching it', () => {
    // The TWA is already on screen behind the dialog. proceed() would restart
    // the app under them, mid-tap.
    expect(gate).toMatch(/if \(askOnly\) finish\(\);\s*\n\s*else proceed\(\);/)
  })

  it('never moves the top frame to fire it', () => {
    // Navigating to intent:// takes the Custom Tab off its own origin and ends
    // the session. Losing the app is a poor way to turn notifications on.
    const fn = /async function askNativeNotificationPermission\(\) \{[\s\S]*?\n\}/.exec(push)[0]
    expect(fn).toMatch(/keepSession: true/)
  })

  it('still asks the web side afterwards', () => {
    // The native grant alone creates no subscription. Under TWA delegation
    // this resolves without a second dialog; if it does not, the user is at
    // least being asked at the moment they asked for it.
    const enable = /export async function enablePush\(\) \{[\s\S]*?\n\}/.exec(push)[0]
    expect(enable.indexOf('askNativeNotificationPermission'))
      .toBeLessThan(enable.indexOf('Notification.requestPermission'))
  })
})
