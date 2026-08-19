// The runtime's job is the stuff the pure core deliberately refuses to know
// about: settings, persistence, and not embarrassing the user.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const audio = vi.hoisted(() => ({ played: [], unlocked: true }))
vi.mock('./pulseAudio', () => ({
  unlock: () => { audio.unlocked = true; return true },
  play: (t) => { audio.played.push(t); return audio.unlocked },
  setVolume: () => {},
  release: () => {},
  isUnlocked: () => audio.unlocked,
}))

const {
  observeMarket, pulseSettings, setPulseSettings,
  pendingDiscovery, dismissDiscovery, noteDiscoveryShown,
  __resetPulseRuntime,
} = await import('./marketPulseRuntime')

const T0 = new Date('2026-03-04T15:00:00Z').getTime()
const btc = (pct) => ({ btc: { changePct: pct, source: 'cg', cls: 'crypto-major', symbol: 'BTC' } })

beforeEach(() => {
  localStorage.clear()
  audio.played = []
  audio.unlocked = true
  __resetPulseRuntime()
})

describe('defaults', () => {
  it('is off until the user says otherwise', () => {
    // A finance app that makes noise nobody asked for gets uninstalled once.
    expect(pulseSettings().enabled).toBe(false)
  })
})

describe('seeding an existing portfolio', () => {
  it('banks the current value instead of celebrating it', () => {
    setPulseSettings({ enabled: true })
    // Someone who has held $120K for a year must not be congratulated on a
    // new all-time high the first time the feature ever runs.
    expect(observeMarket({ samples: btc(2), totalValue: 120000, now: T0 })).toBeNull()
    expect(audio.played).toEqual([])

    // And the next genuine record still lands.
    observeMarket({ samples: btc(2), totalValue: 130000, now: T0 + 60000 })
    expect(audio.played).toContain('ath')
  })
})

describe('with sound enabled', () => {
  beforeEach(() => {
    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })   // seed
  })

  it('plays the rocket on a newly crossed threshold', () => {
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
    expect(audio.played).toEqual([])

    observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })
    expect(audio.played).toEqual(['rocket'])
  })

  it('does not replay it on the next refresh', () => {
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
    observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })
    observeMarket({ samples: btc(9.2), totalValue: 50000, now: T0 + 40000 })
    observeMarket({ samples: btc(9.4), totalValue: 50000, now: T0 + 60000 })
    expect(audio.played).toEqual(['rocket'])
  })

  it('respects the cooldown between two separate events', () => {
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
    observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })
    expect(audio.played).toEqual(['rocket'])

    // A new all-time high two seconds later is real, but it is not worth a
    // second noise on top of the first.
    observeMarket({ samples: btc(9), totalValue: 60000, now: T0 + 22000 })
    expect(audio.played).toEqual(['rocket'])
  })

  it('still records events it chose not to play', () => {
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
    observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })
    // The ATH is suppressed by the cooldown here...
    observeMarket({ samples: btc(9), totalValue: 60000, now: T0 + 22000 })
    // ...and must not resurface once the cooldown expires, because it already
    // happened. Only a further new high should.
    observeMarket({ samples: btc(9), totalValue: 60000, now: T0 + 90000 })
    expect(audio.played).toEqual(['rocket'])
  })
})

describe('with sound disabled', () => {
  it('plays nothing but remembers what was missed', () => {
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
    observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })

    expect(audio.played).toEqual([])
    expect(pendingDiscovery()).toMatchObject({ type: 'rocket', symbol: 'BTC' })
  })

  it('does not replay the missed event once sound is switched on', () => {
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
    observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })

    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(9.1), totalValue: 50000, now: T0 + 40000 })
    expect(audio.played).toEqual([])
  })

  it('stops offering discovery after two showings', () => {
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
    observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })

    expect(pendingDiscovery()).toBeTruthy()
    noteDiscoveryShown()
    expect(pendingDiscovery()).toBeTruthy()
    noteDiscoveryShown()
    expect(pendingDiscovery()).toBeNull()
  })

  it('stops offering discovery once dismissed', () => {
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
    observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })

    dismissDiscovery()
    expect(pendingDiscovery()).toBeNull()
  })

  it('offers nothing once the feature is already on', () => {
    setPulseSettings({ enabled: true })
    expect(pendingDiscovery()).toBeNull()
  })
})

describe('robustness', () => {
  it('survives junk input without throwing', () => {
    setPulseSettings({ enabled: true })
    expect(() => observeMarket()).not.toThrow()
    expect(() => observeMarket({ samples: null, totalValue: NaN })).not.toThrow()
    expect(() => observeMarket({ samples: { x: null }, totalValue: 1 })).not.toThrow()
  })

  it('still reports the event when audio silently refuses', () => {
    // Device on silent, or the context never unlocked. The visual layer should
    // still react — the user has not opted out of seeing it.
    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
    audio.unlocked = false
    const event = observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })
    expect(event).toMatchObject({ type: 'rocket' })
  })
})

describe('across app restarts', () => {
  // The whole point of persisting the snapshot. A crossing is only visible by
  // comparing two samples, so while the baseline lived in memory the first
  // observation of every session had nothing to compare against and was
  // discarded — the app could only react to moves that happened while you were
  // already watching it.
  //
  // Re-importing the module with localStorage left intact is what a cold app
  // open actually looks like: fresh module state, same disk.
  const restart = async () => {
    vi.resetModules()
    return import('./marketPulseRuntime')
  }

  it('reacts on the first observation after a cold open', async () => {
    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })          // seed
    observeMarket({ samples: btc(2.1), totalValue: 50000, now: T0 + 1000 }) // baseline

    const fresh = await restart()
    const event = fresh.observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 2000 })

    expect(event).toMatchObject({ type: 'rocket', symbol: 'BTC' })
    expect(audio.played).toContain('rocket')
  })

  it('stays quiet on a cold open when nothing crossed while away', async () => {
    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })
    observeMarket({ samples: btc(2.1), totalValue: 50000, now: T0 + 1000 })

    const fresh = await restart()
    expect(fresh.observeMarket({ samples: btc(2.4), totalValue: 50000, now: T0 + 2000 })).toBeNull()
    expect(audio.played).toEqual([])
  })

  it('re-seeds silently when the stored snapshot is too old to compare', async () => {
    // 24-hour change figures from two days ago are not two points on the same
    // curve, they are unrelated windows. Comparing them would invent crossings.
    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })
    observeMarket({ samples: btc(2.1), totalValue: 50000, now: T0 + 1000 })

    const stored = JSON.parse(localStorage.getItem('wl_pulse_samples'))
    stored.at = Date.now() - (49 * 60 * 60 * 1000)
    localStorage.setItem('wl_pulse_samples', JSON.stringify(stored))

    const fresh = await restart()
    expect(fresh.observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 2000 })).toBeNull()
    expect(audio.played).toEqual([])

    // ...and the session carries on normally from that fresh baseline. The
    // re-seed banked 9%, which is already over the threshold, so it takes a
    // real crossing — down and back up — to earn a sound.
    fresh.observeMarket({ samples: btc(3), totalValue: 50000, now: T0 + 3000 })
    fresh.observeMarket({ samples: btc(12), totalValue: 50000, now: T0 + 4000 })
    expect(audio.played).toContain('rocket')
  })
})
