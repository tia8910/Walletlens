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
    for (const f of ['WalletLensApp.java', 'LauncherActivity.java', 'BootReceiver.java']) {
      expect(read(f), `${f} must call NotificationScheduler.schedule`)
        .toMatch(/NotificationScheduler\.schedule\(/)
    }
  })

  it('keeps NotificationHelper, which web push needs', () => {
    // Easy to mistake for part of the same dead feature. DelegationService
    // routes every web push into these channels; deleting them silences the
    // system that replaced the timer.
    const delegation = read('DelegationService.java')
    expect(delegation).toMatch(/NotificationHelper/)
    expect(delegation).toMatch(/CHANNEL_ALERTS_ID/)
  })
})
