// The runtime's job is the stuff the pure core deliberately refuses to know
// about: settings, persistence, and not embarrassing the user.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  observeMarket, demoPulse, pulseSettings, setPulseSettings,
  pendingDiscovery, dismissDiscovery, noteDiscoveryShown,
  onPulseRelease, __heldEvent, __resetPulseRuntime,
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
  it('is on until the user says otherwise', () => {
    // Shipped off, on the argument that a finance app making noise nobody
    // asked for gets uninstalled once. What off actually produced was a
    // feature nobody ever encountered — the toggle that switched it on was
    // the one thing you had to already know about to find.
    expect(pulseSettings().enabled).toBe(true)
    expect(pulseSettings().visuals).toBe(true)
  })

  it('never writes a setting on the user\'s behalf', () => {
    // The default must stay a default. If merely reading it persisted a
    // value, someone who turned sound off in a previous version would have
    // their choice silently overwritten by the new default.
    pulseSettings()
    expect(localStorage.getItem('wl_pulse_settings')).toBeNull()
  })

  it('keeps sound off for anyone who turned it off', () => {
    setPulseSettings({ enabled: false })
    expect(pulseSettings().enabled).toBe(false)
    observeMarket({ samples: btc(4), totalValue: 50000, portfolioChangePct: 8, now: T0 })
    expect(audio.played).toEqual([])
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

  it('still speaks up on a bad day', () => {
    setPulseSettings({ enabled: true })
    // Seeding suppresses stale records, not today's facts. A first run on a
    // day the portfolio is down 7% has something true to say.
    const event = observeMarket({
      samples: btc(-7), totalValue: 120000, portfolioChangePct: -7, now: T0,
    })
    expect(event?.type).toBe('dip')
  })

  it('still crowns a champion on the very first run', () => {
    setPulseSettings({ enabled: true })
    // A champion is a statement about today, not a record, so seeding has no
    // business suppressing it. This is the case the old first-run whitelist
    // got wrong: it named the events allowed through, so every event added
    // afterwards was silently excluded.
    const next = {
      sol: { changePct: 24, cls: 'altcoin', symbol: 'SOL', image: '' },
      eth: { changePct: 2, cls: 'crypto-major', symbol: 'ETH', image: '' },
      ada: { changePct: 1, cls: 'altcoin', symbol: 'ADA', image: '' },
    }
    const event = observeMarket({ samples: next, totalValue: 120000, now: T0 })
    expect(event?.type).toBe('champion')
    expect(event.symbol).toBe('SOL')
  })

  it('does not replay targets that were met before it ever ran', () => {
    setPulseSettings({ enabled: true })
    const hit = [{ id: 't1', symbol: 'ETH', price: 4200 }]
    expect(observeMarket({
      samples: btc(2), totalValue: 120000, targetsHit: hit, now: T0,
    })).toBeNull()

    // A target crossed after the app has been running still lands.
    const event = observeMarket({
      samples: btc(2), totalValue: 120000, now: T0 + 60000,
      targetsHit: [...hit, { id: 't2', symbol: 'SOL', price: 300 }],
    })
    expect(event?.type).toBe('lock')
    expect(event.targetId).toBe('t2')
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
  // Explicit now that the default is on. These cases are about what happens
  // for someone who deliberately switched sound off, which is a different
  // thing from what a fresh install does.
  beforeEach(() => { setPulseSettings({ enabled: false }) })

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

  it('holds the celebration until a tap, rather than showing it silently', () => {
    // Nothing can be heard before the first gesture of a session, and an event
    // that fires on app open arrives before it — play() bails on `if (!ctx)`
    // and the user gets a mute celebration. That was the whole of "I see
    // fireworks but hear nothing". Held events land complete instead.
    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })

    audio.unlocked = false
    const released = []
    onPulseRelease(e => released.push(e))

    expect(observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })).toBeNull()
    expect(__heldEvent()).toMatchObject({ type: 'rocket' })
    expect(audio.played).toEqual([])

    document.dispatchEvent(new MouseEvent('click'))
    expect(audio.played).toEqual(['rocket'])
    expect(released[0]).toMatchObject({ type: 'rocket' })
    expect(__heldEvent()).toBeNull()
  })

  it('shows a held event anyway if the tap never comes', () => {
    // Silently is better than never: knowing the portfolio is flying is the
    // information, and the sound is the decoration.
    vi.useFakeTimers()
    try {
      setPulseSettings({ enabled: true })
      observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })
      observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
      audio.unlocked = false
      const released = []
      onPulseRelease(e => released.push(e))
      observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })

      vi.advanceTimersByTime(61000)
      expect(released[0]).toMatchObject({ type: 'rocket' })
      expect(audio.played).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays straight away once audio is already unlocked', () => {
    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(2), totalValue: 50000, now: T0 })
    observeMarket({ samples: btc(7), totalValue: 50000, now: T0 + 1000 })
    audio.unlocked = true
    const event = observeMarket({ samples: btc(9), totalValue: 50000, now: T0 + 20000 })
    expect(event).toMatchObject({ type: 'rocket' })
    expect(audio.played).toEqual(['rocket'])
    expect(__heldEvent()).toBeNull()
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

describe('fireworks on a flying day', () => {
  // The event that exists because the other three were unobservable. This is
  // the one that has to work on a plain app open, with no prior session, no
  // stored baseline and nothing to compare against.
  it('fires on a first-ever open, with no history at all', () => {
    setPulseSettings({ enabled: true })
    const event = observeMarket({
      samples: btc(4), totalValue: 50000, portfolioChangePct: 6.1, now: T0,
    })
    expect(event).toMatchObject({ type: 'fireworks' })
    expect(audio.played).toContain('fireworks')
  })

  it('still seeds records on that first open, so no false all-time high follows', () => {
    // The seed path is skipped for fireworks, which must not mean the records
    // go unseeded — otherwise the next refresh announces an all-time high for
    // a portfolio the user has held for a year.
    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(4), totalValue: 120000, portfolioChangePct: 6.1, now: T0 })
    audio.played = []

    observeMarket({ samples: btc(4), totalValue: 120000, portfolioChangePct: 1, now: T0 + 60000 })
    expect(audio.played).toEqual([])
  })

  it('stays quiet on an ordinary day', () => {
    setPulseSettings({ enabled: true })
    expect(observeMarket({
      samples: btc(1), totalValue: 50000, portfolioChangePct: 0.8, now: T0,
    })).toBeNull()
    expect(audio.played).toEqual([])
  })

  it('celebrates once, not on every refresh of a rally', () => {
    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(4), totalValue: 50000, portfolioChangePct: 6, now: T0 })
    expect(audio.played).toEqual(['fireworks'])

    for (let i = 1; i <= 5; i++) {
      observeMarket({
        samples: btc(4 + i * 0.1), totalValue: 50000 + i * 500,
        portfolioChangePct: 6 + i, now: T0 + i * 60000,
      })
    }
    expect(audio.played.filter(x => x === 'fireworks')).toHaveLength(1)
  })

  it('survives a reload without firing again the same day', async () => {
    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(4), totalValue: 50000, portfolioChangePct: 6, now: T0 })
    expect(audio.played).toEqual(['fireworks'])
    audio.played = []

    vi.resetModules()
    const fresh = await import('./marketPulseRuntime')
    fresh.observeMarket({ samples: btc(4), totalValue: 50000, portfolioChangePct: 7, now: T0 + 120000 })
    expect(audio.played).toEqual([])
  })
})

describe('sound and picture are separate switches', () => {
  // These used to be one switch. With audio off by default, that meant nobody
  // ever saw a visual either until they found a settings toggle they had no
  // reason to look for — the honest answer to "why do I never see anything".
  it('shows the event with sound off, because visuals are their own setting', () => {
    setPulseSettings({ enabled: false, visuals: true })
    const event = observeMarket({
      samples: btc(4), totalValue: 50000, portfolioChangePct: 6, now: T0,
    })
    expect(event).toMatchObject({ type: 'fireworks' })
    expect(audio.played).toEqual([])
  })

  it('still records it for the discovery card', () => {
    setPulseSettings({ enabled: false, visuals: true })
    observeMarket({ samples: btc(4), totalValue: 50000, portfolioChangePct: 6, now: T0 })
    expect(pendingDiscovery()).toMatchObject({ type: 'fireworks' })
  })

  it('goes fully quiet only when both are off', () => {
    setPulseSettings({ enabled: false, visuals: false })
    expect(observeMarket({
      samples: btc(4), totalValue: 50000, portfolioChangePct: 6, now: T0,
    })).toBeNull()
    expect(audio.played).toEqual([])
  })

  it('does not replay a silently-seen event when sound is switched on', () => {
    // The cooldown has to advance on the silent path too, or enabling sound
    // right after seeing one fires it again immediately.
    setPulseSettings({ enabled: false, visuals: true })
    observeMarket({ samples: btc(9), totalValue: 50000, portfolioChangePct: 6, now: T0 })

    setPulseSettings({ enabled: true })
    observeMarket({ samples: btc(9.1), totalValue: 50000, portfolioChangePct: 7, now: T0 + 1000 })
    expect(audio.played).toEqual([])
  })
})

describe('demo events', () => {
  // ?pulse=<type> is the only way to see most of these on a real phone, so an
  // event the overlay draws but the demo cannot fire is one nobody can check —
  // and that is discovered on a device, months later, by not seeing anything.
  //
  // Read out of the overlay rather than listed here, so adding a branch there
  // and forgetting the demo shape fails this test instead of shipping.
  const RENDERED = [...new Set(
    Array.from(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'components/PulseOverlay.jsx'), 'utf8')
        .matchAll(/event\.type === '([a-z]+)'/g),
      m => m[1],
    ),
  )]

  it('can fire every event the overlay knows how to draw', () => {
    setPulseSettings({ enabled: true })
    // A regex that matched nothing would make the loop below vacuous.
    expect(RENDERED.length).toBeGreaterThan(5)
    for (const type of RENDERED) {
      expect(demoPulse(type, { totalValue: 100000 })?.type, type).toBe(type)
    }
  })

  it('ignores anything else', () => {
    expect(demoPulse('nonsense')).toBeNull()
    expect(demoPulse('')).toBeNull()
    // Object.prototype keys must not read as valid types.
    expect(demoPulse('toString')).toBeNull()
    expect(demoPulse('constructor')).toBeNull()
  })

  it('crowns an asset the user actually owns', () => {
    setPulseSettings({ enabled: true })
    // The champion demo showing a hardcoded coin with no logo verifies the
    // animation and demonstrates nothing — it reads as two bugs, which is
    // exactly how it was reported.
    observeMarket({
      samples: {
        sol: { changePct: 3, cls: 'altcoin', symbol: 'SOL', image: 'sol.png' },
        eth: { changePct: 19, cls: 'crypto-major', symbol: 'ETH', image: 'eth.png' },
        usdt: { changePct: 44, cls: 'silent', symbol: 'USDT', image: 'usdt.png' },
      },
      totalValue: 50000, now: T0,
    })
    const event = demoPulse('champion', { totalValue: 50000 })
    expect(event.symbol).toBe('ETH')
    expect(event.image).toBe('eth.png')
    expect(event.assetId).toBe('eth')
  })

  it('falls back to a labelled placeholder that still has a logo', () => {
    setPulseSettings({ enabled: true })
    // An empty portfolio is every fresh browser this gets tested in, so the
    // fallback has to look like the real thing rather than like a failure:
    // no coin the user does not own, and never an empty centre.
    const event = demoPulse('champion', {})
    expect(event.symbol).toBe('DEMO')
    expect(event.image).toBe('/icon-512.png')
  })

  it('gives a down day a negative change, so the caption is not a lie', () => {
    setPulseSettings({ enabled: true })
    expect(demoPulse('dip', {}).changePct).toBeLessThan(0)
    expect(demoPulse('storm', {}).changePct).toBeLessThan(0)
    expect(demoPulse('rain', {}).changePct).toBeGreaterThan(0)
  })
})
