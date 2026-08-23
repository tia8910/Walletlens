import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// On Android 8+ a notification's sound belongs to its CHANNEL, not to the
// notification. sw.js can set `silent: false` and a vibrate pattern all it
// likes; if the channel it lands on does not sound, it does not sound.
//
// Web push notifications were landing on a channel androidx.browser invents
// from the name Chrome passes — nobody had chosen its behaviour, and the three
// carefully-set channels in NotificationHelper served only the NATIVE local
// notifications. So a price alert the server marked urgent arrived mute.
//
// DelegationService now routes each one onto a WalletLens channel, choosing by
// the tag prefix. That decision is spread over three files in three languages
// that no compiler or bundler checks against each other:
//
//   push-api/main.ts   picks the channel and writes the tag
//   client/public/sw.js decides which channels are loud
//   DelegationService.java maps tag prefixes onto Android channels
//
// This test is the only thing holding them together.

const root = dirname(fileURLToPath(import.meta.url))
const server = readFileSync(join(root, '../../push-api/main.ts'), 'utf8')
const sw = readFileSync(join(root, '../public/sw.js'), 'utf8')
const javaDir = join(root, '../../walletlens_source/release_package/app/src/main/java/live/walletlens/twa')
const delegation = readFileSync(join(javaDir, 'DelegationService.java'), 'utf8')
const helper = readFileSync(join(javaDir, 'NotificationHelper.java'), 'utf8')

/** Channel name → the static prefix of the tag main.ts sends for it. */
function channelTagPrefixes() {
  const out = {}
  for (const m of server.matchAll(/\bchannel:\s*"([a-z]+)"/g)) {
    // The tag sits a few lines below the channel inside the same buildPayload.
    const after = server.slice(m.index, m.index + 400)
    const tag = after.match(/\btag:\s*(?:`([^`]*)`|"([^"]*)")/)
    if (!tag) continue
    // `level-${k}` → "level-";  "digest" → "digest"
    out[m[1]] = (tag[1] ?? tag[2]).split('${')[0]
  }
  return out
}

const loudChannels = new Set(
  [...(sw.match(/const LOUD_CHANNELS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '')
    .matchAll(/'([^']+)'/g)].map(x => x[1]),
)

const javaPrefixes = [...(delegation.match(/LOUD_TAG_PREFIXES\s*=\s*\{([^}]*)\}/)?.[1] ?? '')
  .matchAll(/"([^"]+)"/g)].map(x => x[1])

describe('push notifications land on a channel that matches their loudness', () => {
  it('finds all three definitions', () => {
    expect(Object.keys(channelTagPrefixes()).length).toBeGreaterThanOrEqual(8)
    expect(loudChannels.size).toBeGreaterThan(0)
    expect(javaPrefixes.length).toBeGreaterThan(0)
  })

  it('routes every loud channel to the alerts channel', () => {
    // The regression. `level` was loud in sw.js; if its tag prefix is missing
    // from the Java, the alert is delivered urgently and posted on the quiet
    // channel — audibly identical to the bug this replaced.
    for (const [channel, prefix] of Object.entries(channelTagPrefixes())) {
      if (!loudChannels.has(channel)) continue
      expect(
        javaPrefixes.some(p => prefix.startsWith(p) || p.startsWith(prefix)),
        `channel "${channel}" is loud in sw.js but its tag "${prefix}…" matches no LOUD_TAG_PREFIXES entry`,
      ).toBe(true)
    }
  })

  it('leaves the channels we initiated on the quiet one', () => {
    // The other direction, and the one that costs trust rather than a missed
    // alert: a morning brief routed to IMPORTANCE_HIGH buzzes at 9am forever.
    for (const [channel, prefix] of Object.entries(channelTagPrefixes())) {
      if (loudChannels.has(channel)) continue
      expect(
        javaPrefixes.some(p => prefix.startsWith(p)),
        `channel "${channel}" is silent in sw.js but its tag "${prefix}…" would route to the alerts channel`,
      ).toBe(false)
    }
  })

  it('has no prefix that matches nothing the server sends', () => {
    // A stale prefix is dead code that reads like a rule.
    const prefixes = Object.values(channelTagPrefixes())
    for (const p of javaPrefixes) {
      expect(
        prefixes.some(prefix => prefix.startsWith(p) || p.startsWith(prefix)),
        `LOUD_TAG_PREFIXES has "${p}", which no channel in main.ts sends`,
      ).toBe(true)
    }
  })

  it('actually overrides the posting step', () => {
    // Without the override the library picks the channel and everything above
    // is decoration.
    expect(delegation).toMatch(/public boolean onNotifyNotificationWithChannel\(/)
    expect(delegation).toMatch(/setChannelId\(channelId\)/)
    expect(delegation).toMatch(/NotificationHelper\.CHANNEL_ALERTS_ID/)
    expect(delegation).toMatch(/NotificationHelper\.CHANNEL_QUIET_ID/)
  })

  it('keeps the notification when it cannot re-channel it', () => {
    // Losing the sound is bad. Losing the notification is worse.
    expect(delegation).toMatch(/catch \(Throwable t\)/)
    const fallback = delegation.slice(delegation.indexOf('catch (Throwable t)'))
    expect(fallback).toMatch(/return super\.onNotifyNotificationWithChannel\(/)
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
