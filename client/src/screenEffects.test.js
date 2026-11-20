import { describe, it, expect } from 'vitest'
import {
  decideEffect, dayKey, pickLeader, dailyReturnsFromSnapshots,
  EXPLODE, SUNRISE, ROCKET, ATH, EMPTY_STATE, ROCKET_THRESHOLD_PCT,
} from './screenEffects'

// The three occasions are rare by design, which is exactly what makes them
// hard to check by hand: the burst fires once a day, the rocket needs a 5%
// day, and the all-time high needs a record. Opening the app on the right
// morning is not a test strategy, so the decision is pure and the awkward
// parts are answered here.

const DAY = 86_400_000
const noon = Date.UTC(2026, 7, 20, 12, 0, 0)

/** decideEffect with the boring arguments filled in. */
function decide(over = {}) {
  return decideEffect({ now: noon, totalValue: 1000, changePct: 1, state: EMPTY_STATE, ...over })
}

describe('dayKey', () => {
  it('reads the offset as minutes EAST of UTC', () => {
    // 23:30 UTC is already tomorrow in Cairo (+120). Getting this sign
    // backwards rolls the day over at the wrong hour, and the "first open
    // today" burst then fires in the middle of an evening session.
    const late = Date.UTC(2026, 7, 20, 23, 30)
    expect(dayKey(late, 0)).toBe('2026-08-20')
    expect(dayKey(late, 120)).toBe('2026-08-21')
    expect(dayKey(late, -300)).toBe('2026-08-20')
  })

  it('is stable across a whole local day', () => {
    const tz = -420  // US Pacific
    const start = Date.UTC(2026, 7, 20, 7, 0)   // local midnight
    expect(dayKey(start, tz)).toBe('2026-08-20')
    expect(dayKey(start + DAY - 1, tz)).toBe('2026-08-20')
    expect(dayKey(start + DAY, tz)).toBe('2026-08-21')
  })
})

describe('the first open of the day', () => {
  it('bursts when you are up since yesterday', () => {
    expect(decide({ changePct: 0.4 }).effect).toBe(EXPLODE)
  })

  it('plays the calm sunrise, not a burst, on a flat or red morning', () => {
    expect(decide({ changePct: 0 }).effect).toBe(SUNRISE)
    const red = decide({ changePct: -3.1, leader: { symbol: 'BTC' } })
    expect(red.effect).toBe(SUNRISE)
    expect(red.payload.leader).toBeNull()
    expect(red.payload.changePct).toBe(-3.1)
  })

  it('does not play again the same day', () => {
    const first = decide()
    expect(decide({ state: first.nextState }).effect).toBeNull()
  })

  it('plays again the next day', () => {
    const first = decide()
    expect(decide({ now: noon + DAY, state: first.nextState }).effect).toBe(EXPLODE)
  })

  it('carries the leading asset so the burst has a logo', () => {
    const leader = { symbol: 'BTC', image: 'x.png' }
    expect(decide({ leader }).payload.leader).toEqual(leader)
  })
})

describe('blocked moments', () => {
  it('plays nothing and spends nothing while values are hidden or prices missing', () => {
    const { effect, nextState } = decide({ blocked: true })
    expect(effect).toBeNull()
    expect(nextState.day).toBe('')
    expect(decide({ state: nextState }).effect).toBe(EXPLODE)
  })
})

describe('the rocket', () => {
  const opened = { ...EMPTY_STATE, athP: 10_000, day: dayKey(noon, 0) }
  const history = [0.5, -1, 1.2, 2.1, -0.4, 0.9, 1.5, -2, 0.3, 1.1, 3.0, -0.8, 0.6, 1.9, 2.4, -1.3, 0.2, 0.7, 1.4, -0.6]

  it('launches on a day better than 9 in 10 of your own days, and says by how much', () => {
    const r = decide({ changePct: 3.2, dailyReturns: history, state: opened })
    expect(r.effect).toBe(ROCKET)
    expect(r.payload.beats).toBe(20)
    expect(r.payload.of).toBe(20)
  })

  it('does not launch on a good day that is ordinary for you', () => {
    expect(decide({ changePct: 2.05, dailyReturns: history, state: opened }).effect).toBeNull()
  })

  it('never launches under +2%, however quiet your history', () => {
    const calm = Array(20).fill(0.1)
    expect(decide({ changePct: 1.9, dailyReturns: calm, state: opened }).effect).toBeNull()
    expect(decide({ changePct: 2.0, dailyReturns: calm, state: opened }).effect).toBe(ROCKET)
  })

  it('uses the fixed +5% day until there are 10 days of history', () => {
    expect(decide({ changePct: ROCKET_THRESHOLD_PCT - 0.1, dailyReturns: [0.1], state: opened }).effect).toBeNull()
    const r = decide({ changePct: ROCKET_THRESHOLD_PCT, dailyReturns: [0.1], state: opened })
    expect(r.effect).toBe(ROCKET)
    expect(r.payload.beats).toBeNull()
  })

  it('launches once a day, not once a poll', () => {
    const first = decide({ changePct: 6, state: opened })
    expect(first.effect).toBe(ROCKET)
    expect(decide({ changePct: 6, state: first.nextState }).effect).toBeNull()
  })
})

describe('the all-time high', () => {
  const seen = { ...EMPTY_STATE, athP: 200, athTs: noon - 10 * DAY, day: dayKey(noon, 0) }

  it('needs two updates in a row above the old high, minutes apart', () => {
    const one = decide({ totalValue: 1300, invested: 1000, state: seen })
    expect(one.effect).toBeNull()
    expect(one.nextState.athPending).toBe(1)
    // The same numbers rendered again a moment later are not a second update.
    const again = decide({ now: noon + 1000, totalValue: 1300, invested: 1000, state: one.nextState })
    expect(again.effect).toBeNull()
    const two = decide({ now: noon + 3 * 60_000, totalValue: 1300, invested: 1000, state: again.nextState })
    expect(two.effect).toBe(ATH)
    expect(two.payload.gain).toBe(100)
    expect(two.payload.since).toBe(noon - 10 * DAY)
    expect(two.nextState.athP).toBe(300)
  })

  it('starts again when the value drops back between updates', () => {
    const one = decide({ totalValue: 1300, invested: 1000, state: seen })
    const dip = decide({ now: noon + 60_000, totalValue: 1100, invested: 1000, state: one.nextState })
    expect(dip.nextState.athPending).toBe(0)
    expect(decide({ now: noon + 5 * 60_000, totalValue: 1300, invested: 1000, state: dip.nextState }).effect).toBeNull()
  })

  it('ignores a rise smaller than 0.5% of the portfolio', () => {
    const one = decide({ totalValue: 1204, invested: 1000, state: seen })
    expect(decide({ now: noon + 5 * 60_000, totalValue: 1204, invested: 1000, state: one.nextState }).effect).toBeNull()
  })

  it('does not count money you added', () => {
    // Value jumps by a deposit; profit stays at the old high.
    const one = decide({ totalValue: 5200, invested: 5000, state: seen })
    expect(decide({ now: noon + 5 * 60_000, totalValue: 5200, invested: 5000, state: one.nextState }).effect).toBeNull()
  })

  it('arms quietly on a device that has never stored a high', () => {
    const { effect, nextState } = decide({ totalValue: 1000, invested: 800, state: EMPTY_STATE })
    expect(effect).toBe(EXPLODE)
    expect(nextState.athP).toBe(200)
  })
})

describe('before prices land', () => {
  it('decides nothing on a zero portfolio', () => {
    const { effect, nextState } = decide({ totalValue: 0, changePct: 99 })
    expect(effect).toBeNull()
    expect(nextState.athP).toBeNull()
  })

  it('still marks the day, so the welcome is not spent on an empty screen later', () => {
    expect(decide({ totalValue: 0 }).nextState.day).toBe(dayKey(noon, 0))
  })

  it('survives a missing or corrupt stored state', () => {
    for (const state of [undefined, null, {}, { athP: 'x', day: 5 }]) {
      expect(() => decide({ state })).not.toThrow()
      expect(decide({ state }).effect).toBe(EXPLODE)
    }
  })
})

describe('dailyReturnsFromSnapshots', () => {
  const at = (d, h) => Date.UTC(2026, 7, d, h)
  it('takes each day\'s last snapshot and measures profit, not deposits', () => {
    const snaps = [
      { ts: at(1, 10), v: 900, inv: 1000 }, { ts: at(1, 22), v: 1000, inv: 1000 },
      { ts: at(2, 22), v: 1100, inv: 1000 },
      { ts: at(3, 22), v: 2100, inv: 2000 }, // a 1000 deposit: no move
    ]
    const r = dailyReturnsFromSnapshots(snaps, 0, at(4, 12))
    expect(r.map(x => +x.toFixed(2))).toEqual([10, 0])
  })
  it('skips gaps and leaves today out', () => {
    const snaps = [{ ts: at(1, 22), v: 1000, inv: 0 }, { ts: at(5, 22), v: 1100, inv: 0 }, { ts: at(6, 9), v: 1200, inv: 0 }]
    expect(dailyReturnsFromSnapshots(snaps, 0, at(6, 12))).toEqual([])
  })
})

describe('pickLeader', () => {
  const h = (coin_symbol, pct24h, coin_image = '') => ({ coin_symbol, pct24h, coin_image })

  it('picks the best day, not the biggest holding', () => {
    expect(pickLeader([h('btc', 2), h('sol', 19), h('eth', 5)]).symbol).toBe('SOL')
  })

  it("carries the leader's day so the explode can show it", () => {
    expect(pickLeader([h('btc', 2), h('sol', 19.25)]).pct).toBe(19.25)
  })

  it('ignores holdings with no daily change', () => {
    expect(pickLeader([h('btc', null), h('eth', 1)]).symbol).toBe('ETH')
  })

  it('returns null rather than an empty badge', () => {
    // The overlay falls back to a plain burst, which looks deliberate. A logo
    // slot holding nothing does not.
    expect(pickLeader([])).toBeNull()
    expect(pickLeader(null)).toBeNull()
    expect(pickLeader([h('', 5)])).toBeNull()
  })

  it('picks the least-bad day when everything is down', () => {
    expect(pickLeader([h('btc', -9), h('eth', -2)]).symbol).toBe('ETH')
  })
})

describe('each wallet has its own profit high', () => {
  it('a wallet on screen only checks its own high, and leaves the day alone', () => {
    const state = { ...EMPTY_STATE, athP: 100, athTs: noon - DAY, day: '' }
    const r = decide({ athOnly: true, totalValue: 1300, invested: 1000, changePct: 9, state })
    expect(r.effect).toBeNull()                 // no burst, no rocket for one wallet
    expect(r.nextState.day).toBe('')            // the day's first open is not spent
    expect(r.nextState.athPending).toBe(1)
    const two = decide({ now: noon + 3 * 60_000, athOnly: true, totalValue: 1300, invested: 1000, state: r.nextState })
    expect(two.effect).toBe(ATH)
    expect(two.payload.gain).toBe(200)
  })

  it('the runtime keeps a separate high per wallet', async () => {
    const mem = {}
    globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v) }, removeItem: k => { delete mem[k] } }
    const { observe } = await import('./screenEffectsRuntime.js')
    const t0 = noon
    observe({ now: t0, totalValue: 2000, invested: 1000, changePct: 1, holdings: [], walletId: 'all' })
    observe({ now: t0 + 1000, totalValue: 300, invested: 250, changePct: 1, holdings: [], walletId: 'w1' })
    const st = JSON.parse(mem.wl_fx_state)
    expect(st.highs.all.athP).toBe(1000)
    expect(st.highs.w1.athP).toBe(50)
    // w1 at its own new high does not touch the whole portfolio's
    observe({ now: t0 + 2000, totalValue: 400, invested: 250, changePct: 1, holdings: [], walletId: 'w1' })
    const r = observe({ now: t0 + 5 * 60_000, totalValue: 400, invested: 250, changePct: 1, holdings: [], walletId: 'w1' })
    expect(r?.effect).toBe(ATH)
    expect(JSON.parse(mem.wl_fx_state).highs.all.athP).toBe(1000)
  })
})

describe('the dashboard says which wallet is on screen', () => {
  it('passes the selected wallet to the effects', async () => {
    const { readFileSync } = await import('node:fs')
    const { join, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pages/Dashboard.jsx'), 'utf8')
    expect(src).toMatch(/observe\(\{[^\n]*walletId: selectedWalletId/)
  })
})
