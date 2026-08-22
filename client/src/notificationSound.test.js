import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHANNEL_DELIVERY } from '../../push-api/notify-logic.js'

// Whether a push makes a sound is decided in two files that never see each
// other: the Deno service picks an `urgency` per channel, and the service
// worker — running on the phone, hours later — decides whether to render that
// notification silent.
//
// They disagreed. `level` (the round-number alerts, "BTC drops below $77,000")
// was added to the server as urgency `high`, but never added to the service
// worker's LOUD_CHANNELS, so every one of them was delivered urgently and then
// shown with `silent: true` and no vibration. The push arrived; the user found
// out about it whenever they next unlocked the phone.
//
// Neither file is importable from the other — sw.js is a classic worker script
// with no exports, and it has no test harness of its own — so this reads it as
// text and holds the two definitions equal.

const root = dirname(fileURLToPath(import.meta.url))
const sw = readFileSync(join(root, '../public/sw.js'), 'utf8')
const serverMain = readFileSync(join(root, '../../push-api/main.ts'), 'utf8')

/** The channel names inside `const LOUD_CHANNELS = new Set([...])`. */
function loudChannels() {
  const m = sw.match(/const LOUD_CHANNELS = new Set\(\[([^\]]*)\]\)/)
  expect(m, 'sw.js must declare LOUD_CHANNELS as a Set literal').toBeTruthy()
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]))
}

/** Channels the server marks as time-critical. */
function highUrgencyChannels() {
  return new Set(
    Object.entries(CHANNEL_DELIVERY)
      .filter(([, d]) => d.urgency === 'high')
      .map(([name]) => name),
  )
}

describe('push notification loudness', () => {
  it('makes a sound for exactly the channels the server sends urgently', () => {
    // Urgency and audibility are the same judgement made twice. A channel
    // worth waking a push service for out of hours is worth being heard; one
    // that is not should not buzz. Anything else is a channel that either
    // arrives late or arrives rude.
    expect([...loudChannels()].sort()).toEqual([...highUrgencyChannels()].sort())
  })

  it('gives round-number price levels a sound', () => {
    // The specific regression. Pinned by name because this is the alert the
    // whole level feature exists to deliver.
    expect(loudChannels().has('level')).toBe(true)
    expect(CHANNEL_DELIVERY.level.urgency).toBe('high')
  })

  it('keeps the notifications we initiated silent', () => {
    // The consent line: a daily brief and a come-back nudge are ours, not
    // theirs. They land in the same tray and must not make noise there.
    const loud = loudChannels()
    for (const quiet of ['news', 'digest', 'retention', 'feature']) {
      expect(loud.has(quiet), `${quiet} must not buzz`).toBe(false)
    }
  })

  it('routes both sound and vibration through the same decision', () => {
    // `silent` and `vibrate` are separate notification options, and setting
    // one without the other produces a notification that buzzes mutely or
    // chimes without moving. Both must read `loud`.
    expect(sw).toMatch(/silent:\s*!loud/)
    expect(sw).toMatch(/vibrate:\s*loud\s*\?/)
  })

  it('has a loudness ruling for every channel the server can send', () => {
    // A new channel added to main.ts with no entry in CHANNEL_DELIVERY falls
    // through to DEFAULT_DELIVERY and is silent — a decision nobody made.
    const sent = new Set([...serverMain.matchAll(/\bchannel:\s*"([a-z]+)"/g)].map(m => m[1]))
    expect(sent.size, 'expected to find the channel literals in main.ts').toBeGreaterThan(4)
    for (const channel of sent) {
      expect(CHANNEL_DELIVERY[channel], `${channel} has no delivery ruling`).toBeTruthy()
    }
  })
})
