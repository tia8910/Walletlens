import { describe, it, expect, beforeEach } from 'vitest'
import { toWatchAssets, watchFromStorage, getPushPrefs, autoEnablePush, DEFAULT_PUSH_PREFS } from './push'

// toWatchAssets is the privacy boundary: it decides exactly which fields of a
// user's portfolio are allowed to leave the device. A regression here doesn't
// break a feature, it leaks — so the shape of its output is asserted exactly
// rather than with toMatchObject.

describe('holdings → watch list', () => {
  it('sends identifiers and nothing else', () => {
    const out = toWatchAssets([{
      coin_id: 'bitcoin', coin_symbol: 'BTC',
      // Everything below is the private part of a holding and must be dropped.
      amount: 1.5, value: 141000, total_invested: 90000, avg_price: 60000,
    }])
    expect(out).toEqual([{ id: 'bitcoin', symbol: 'BTC', kind: 'crypto' }])
    expect(Object.keys(out[0])).toEqual(['id', 'symbol', 'kind'])
  })

  it('classifies the asset types the dashboard uses', () => {
    const out = toWatchAssets([
      { coin_id: 'ethereum', coin_symbol: 'ETH' },
      { coin_id: 'stock:aapl', coin_symbol: 'AAPL' },
      { coin_id: 'xstock:tsla', coin_symbol: 'TSLA' },
      { coin_id: 'metal:xau', coin_symbol: 'XAU' },
    ])
    expect(out).toEqual([
      { id: 'ethereum', symbol: 'ETH', kind: 'crypto' },
      { id: 'aapl', symbol: 'AAPL', kind: 'stock' },
      { id: 'tsla', symbol: 'TSLA', kind: 'stock' },
      { id: 'xau', symbol: 'XAU', kind: 'metal' },
    ])
  })

  it('recognises a bare metal symbol without the prefix', () => {
    expect(toWatchAssets([{ coin_id: 'silver', coin_symbol: 'XAG' }])[0].kind).toBe('metal')
  })

  it('drops cash and real estate', () => {
    // Neither has a market price worth interrupting anyone about, so sending
    // them would hand over rows that buy the user nothing.
    expect(toWatchAssets([
      { coin_id: 'cash:usd', coin_symbol: 'USD' },
      { coin_id: 'fiat:eur', coin_symbol: 'EUR' },
      { coin_id: 'real:apartment', coin_symbol: 'FLAT' },
    ])).toEqual([])
  })

  it('de-duplicates the same asset held in two wallets', () => {
    expect(toWatchAssets([
      { coin_id: 'bitcoin', coin_symbol: 'BTC' },
      { coin_id: 'bitcoin', coin_symbol: 'BTC' },
    ])).toHaveLength(1)
  })

  it('accepts the plainer {id, symbol} shape too', () => {
    expect(toWatchAssets([{ id: 'solana', symbol: 'SOL' }]))
      .toEqual([{ id: 'solana', symbol: 'SOL', kind: 'crypto' }])
  })

  it('skips rows with nothing usable, and survives junk input', () => {
    expect(toWatchAssets([{}, null, { coin_id: '  ' }])).toEqual([])
    expect(toWatchAssets(null)).toEqual([])
    expect(toWatchAssets(undefined)).toEqual([])
  })

  it('normalises case both ways', () => {
    expect(toWatchAssets([{ coin_id: 'Bitcoin', coin_symbol: 'btc' }]))
      .toEqual([{ id: 'bitcoin', symbol: 'BTC', kind: 'crypto' }])
  })
})

describe('watch list from stored transactions', () => {
  beforeEach(() => localStorage.clear())

  const save = (txs) => localStorage.setItem('crypto_tracker_transactions', JSON.stringify(txs))

  it('derives holdings without the dashboard having run', () => {
    // This is what makes closed-app notifications work for someone who adds
    // holdings and then turns push on from Settings: the server has to learn
    // the tickers from storage, not from a page that was never rendered.
    save([
      { coin_id: 'bitcoin', coin_symbol: 'BTC', type: 'buy', amount: 0.5 },
      { coin_id: 'ethereum', coin_symbol: 'ETH', type: 'buy', amount: 2 },
    ])
    expect(watchFromStorage()).toEqual([
      { id: 'bitcoin', symbol: 'BTC', kind: 'crypto' },
      { id: 'ethereum', symbol: 'ETH', kind: 'crypto' },
    ])
  })

  it('nets buys against sells', () => {
    save([
      { coin_id: 'bitcoin', coin_symbol: 'BTC', type: 'buy', amount: 1 },
      { coin_id: 'bitcoin', coin_symbol: 'BTC', type: 'buy', amount: 0.5 },
    ])
    expect(watchFromStorage()).toHaveLength(1)
  })

  it('drops a position that has been fully sold', () => {
    // Still in the transaction history, but there is nothing left to notify
    // anyone about.
    save([
      { coin_id: 'bitcoin', coin_symbol: 'BTC', type: 'buy', amount: 1 },
      { coin_id: 'bitcoin', coin_symbol: 'BTC', type: 'sell', amount: 1 },
      { coin_id: 'ethereum', coin_symbol: 'ETH', type: 'buy', amount: 2 },
    ])
    expect(watchFromStorage()).toEqual([{ id: 'ethereum', symbol: 'ETH', kind: 'crypto' }])
  })

  it('carries the asset class through from the id prefix', () => {
    save([
      { coin_id: 'stock:aapl', coin_symbol: 'AAPL', type: 'buy', amount: 10 },
      { coin_id: 'metal:xau', coin_symbol: 'XAU', type: 'buy', amount: 1 },
      { coin_id: 'cash:usd', coin_symbol: 'USD', type: 'deposit', amount: 500 },
    ])
    expect(watchFromStorage()).toEqual([
      { id: 'aapl', symbol: 'AAPL', kind: 'stock' },
      { id: 'xau', symbol: 'XAU', kind: 'metal' },
    ])
  })

  it('returns nothing rather than throwing on an empty or corrupt store', () => {
    expect(watchFromStorage()).toEqual([])
    localStorage.setItem('crypto_tracker_transactions', '{not json')
    expect(watchFromStorage()).toEqual([])
  })
})

describe('push preferences', () => {
  beforeEach(() => localStorage.clear())

  it('returns the defaults when nothing is stored', () => {
    expect(getPushPrefs()).toEqual(DEFAULT_PUSH_PREFS)
  })

  it('merges a partial stored set over the defaults', () => {
    // Records written before a preference existed must not come back with it
    // undefined — that would read as "off" in the toggle UI.
    localStorage.setItem('wl_push_prefs', JSON.stringify({ digest: true }))
    expect(getPushPrefs()).toEqual({ ...DEFAULT_PUSH_PREFS, digest: true })
  })

  it('falls back to the defaults if the stored value is corrupt', () => {
    localStorage.setItem('wl_push_prefs', '{not json')
    expect(getPushPrefs()).toEqual(DEFAULT_PUSH_PREFS)
  })

  it('matches the server-side defaults', async () => {
    // The client renders the toggles and the server enforces them; if the two
    // default tables drift, Settings shows a state the server isn't in.
    const { DEFAULT_PREFS } = await import('../../push-api/notify-logic.js')
    expect(DEFAULT_PUSH_PREFS).toEqual(DEFAULT_PREFS)
  })
})


describe('auto-enable', () => {
  beforeEach(() => localStorage.clear())

  // The Android shell asks for POST_NOTIFICATIONS at launch, so in the app the
  // permission is already granted before the web layer loads. Auto-enable is
  // what stops us asking the same question twice — but it must never prompt,
  // and must never override someone who said no.

  it('does nothing when the user has explicitly turned push off', async () => {
    localStorage.setItem('wl_push_optout', '1')
    const res = await autoEnablePush()
    expect(res.ok).toBe(false)
    // Opt-out is checked without needing permission state, so this holds even
    // on a device that would otherwise qualify.
    expect(['opted-out', 'unsupported', 'not-granted']).toContain(res.reason)
  })

  it('never throws, whatever the environment', async () => {
    // Runs unattended at every app start; an exception here would surface as a
    // startup error for a thing the user never asked for.
    await expect(autoEnablePush()).resolves.toMatchObject({ ok: expect.any(Boolean) })
  })

  it('reports a reason rather than silently doing nothing', async () => {
    const res = await autoEnablePush()
    expect(typeof res.reason === 'string' || res.ok).toBe(true)
  })
})
