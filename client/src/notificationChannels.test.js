import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHANNEL_DELIVERY } from '../../push-api/notify-logic.js'

// On Android 8+ a notification's sound belongs to its CHANNEL, not to the
// notification. A sender can set `silent: false` and a vibrate pattern all it
// likes; if the channel it lands on does not sound, it does not sound.
//
// So "is this one loud" is decided in two places for two transports, and
// nothing but this file holds them together:
//
//   client/public/sw.js                 Web Push — every browser and desktop
//   WalletLensMessagingService.java     FCM — the Android app
//
// It used to be three, and the third was the fragile one: under the TWA,
// DelegationService re-channelled Chrome's notifications by matching TAG
// PREFIXES — "level-" and friends — against the tag the server happened to
// write. That whole path is gone with the TWA. The FCM service reads the
// server's own `channel` field instead, which is the same decision made
// against a name rather than a string prefix.
//
// Retargeting this file at that pair is what found the `test` channel: loud in
// sw.js since it was written, quiet on Android, so the one notification whose
// entire job is to prove notifications work arrived silently on the platform
// people most doubt.

const root = dirname(fileURLToPath(import.meta.url))
const sw = readFileSync(join(root, '../public/sw.js'), 'utf8')
const javaDir = join(root, '../../walletlens_source/release_package/app/src/main/java/live/walletlens/twa')
const fcm = readFileSync(join(javaDir, 'WalletLensMessagingService.java'), 'utf8')
const helper = readFileSync(join(javaDir, 'NotificationHelper.java'), 'utf8')

/** Every channel the server can send, from the one table that lists them. */
const serverChannels = new Set(Object.keys(CHANNEL_DELIVERY))

/** Channels sw.js plays a sound for. */
const loudInBrowser = new Set(
  [...(sw.match(/const LOUD_CHANNELS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '')
    .matchAll(/'([^']+)'/g)].map(x => x[1]),
)

/** Channels the Android app routes to the alerts channel. */
const loudOnAndroid = new Set(
  [...(fcm.slice(fcm.indexOf('private static boolean isPriceChannel'))
        .match(/\{([\s\S]*?)default:/)?.[1] ?? '')
    .matchAll(/case "([^"]+)":/g)].map(x => x[1]),
)

describe('push notifications land on a channel that matches their loudness', () => {
  it('finds both definitions', () => {
    expect(loudInBrowser.size, 'sw.js LOUD_CHANNELS').toBeGreaterThan(0)
    expect(loudOnAndroid.size, 'isPriceChannel cases').toBeGreaterThan(0)
  })

  it('agrees between the browser and the app', () => {
    // THE REGRESSION THIS EXISTS FOR, in its current form. A channel loud in
    // one transport and quiet in the other is the same notification arriving
    // urgently on a laptop and silently on the phone in your pocket — and the
    // phone is the one that matters.
    expect([...loudOnAndroid].sort()).toEqual([...loudInBrowser].sort())
  })

  it('names only channels the server actually sends', () => {
    // A stale entry is dead code that reads like a rule.
    for (const c of loudInBrowser) {
      expect(serverChannels.has(c), `sw.js calls "${c}" loud, but no channel by that name is sent`).toBe(true)
    }
    for (const c of loudOnAndroid) {
      expect(serverChannels.has(c), `isPriceChannel names "${c}", but no channel by that name is sent`).toBe(true)
    }
  })

  it('keeps the loud set to what the server itself treats as urgent', () => {
    // The server decides delivery urgency per channel; a channel it sends at
    // low urgency has no business waking a dozing phone. `test` is the one
    // deliberate exception — it is the welcome notification, sent once, whose
    // whole purpose is to be noticed.
    for (const c of loudOnAndroid) {
      if (c === 'test') continue
      expect(CHANNEL_DELIVERY[c]?.urgency, `${c} is loud but not urgent on the server`).toBe('high')
    }
  })

  it('treats an unknown channel as quiet', () => {
    // The right way round: a channel added on the server later should arrive
    // politely rather than buzzing until someone notices.
    const fn = fcm.slice(fcm.indexOf('private static boolean isPriceChannel'))
    expect(fn.slice(0, fn.indexOf('\n    }'))).toMatch(/default:\s*\n\s*return false;/)
  })

  it('actually posts on the channel it chose', () => {
    // Without this the decision above is decoration.
    expect(fcm).toMatch(/showAlertNotification\(/)
    expect(fcm).toMatch(/showNotification\(/)
    expect(helper).toMatch(/CHANNEL_ALERTS_ID/)
    expect(helper).toMatch(/CHANNEL_QUIET_ID/)
  })

  it('does not lose the notification when something throws', () => {
    // Losing the sound is bad. Losing the notification is worse.
    expect(fcm).toMatch(/catch \(Throwable e\)/)
  })

  it('gives the quiet channel an importance that is actually quiet', () => {
    expect(helper).toMatch(/CHANNEL_QUIET_ID\s*=\s*"walletlens_quiet"/)
    expect(helper).toMatch(/createChannel\(CHANNEL_QUIET_ID, CHANNEL_QUIET_NAME,\s*\n?\s*NotificationManager\.IMPORTANCE_LOW\)/)
    // IMPORTANCE_LOW still vibrates if vibration is enabled on the channel.
    expect(helper).toMatch(/enableVibration\(importance >= NotificationManager\.IMPORTANCE_DEFAULT\)/)
  })

  it('keeps the alerts channel high enough to sound', () => {
    expect(helper).toMatch(/createChannel\(CHANNEL_ALERTS_ID, CHANNEL_ALERTS_NAME,\s*\n?\s*NotificationManager\.IMPORTANCE_HIGH\)/)
  })
})
