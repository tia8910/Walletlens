import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  BEARISH_KW, headlineTone, marketDirection, marketMood, MOOD_THRESHOLD, moodReading, marketStats,
} from './sentiment'

// The bug this replaces: a red BEARISH badge on a morning Bitcoin was up 8.9%
// with 68% of the top 100 green, two lines under a greeting reading "green on
// the board". These tests exist to stop the badge contradicting the chart.

const article = (title, description = '') => ({ title, description })

describe('whole-word matching', () => {
  // Every one of these was a false bearish vote under substring matching, and
  // they are not rare words — "bank" appears in finance headlines constantly,
  // which is why the old scorer leaned bearish no matter what prices did.
  it('matches inflections of the real words', () => {
    // Sealing the front while allowing ordinary endings is what lets "hacked"
    // through while keeping "bank" out.
    expect(headlineTone([article('Mining banned outright')])).toBeLessThan(0)
    expect(headlineTone([article('Hacking spree hits DeFi')])).toBeLessThan(0)
    expect(headlineTone([article('Liquidations cascade across venues')])).toBeLessThan(0)
  })

  it('does not read "bank" as a ban', () => {
    expect(headlineTone([article('Major bank adds crypto custody')])).toBeGreaterThanOrEqual(0)
    expect(headlineTone([article('Banking giants expand digital asset desks')])).toBeGreaterThanOrEqual(0)
    expect(headlineTone([article('A banker joins the exchange')])).toBeGreaterThanOrEqual(0)
  })

  it('does not read "airdrop" as a drop', () => {
    expect(headlineTone([article('Protocol announces airdrop for early users')])).toBeGreaterThanOrEqual(0)
  })

  it('still catches the real words, including inflected ones', () => {
    expect(headlineTone([article('Exchange hacked overnight')])).toBeLessThan(0)
    expect(headlineTone([article('Country moves to ban mining')])).toBeLessThan(0)
    expect(headlineTone([article('Token plunges after sell-off')])).toBeLessThan(0)
  })

  it('keeps hyphenated keywords working', () => {
    expect(headlineTone([article('Broad sell-off hits markets')])).toBeLessThan(0)
  })

  it('drops the ambiguous words that carry no direction', () => {
    // These fired constantly in neutral and bullish stories alike.
    for (const w of ['regulation', 'concern', 'warning', 'correction', 'decline']) {
      expect(BEARISH_KW, `${w} is not directional`).not.toContain(w)
    }
    expect(headlineTone([article('New regulation clarifies token rules')])).toBe(0)
  })
})

describe('headlineTone normalisation', () => {
  it('is independent of how many articles the feed holds', () => {
    // The old raw count grew with the feed, so a fixed threshold meant
    // something different every time the feed changed size.
    const one = [article('Bitcoin rally continues')]
    const many = Array.from({ length: 20 }, () => article('Bitcoin rally continues'))
    expect(headlineTone(many)).toBeCloseTo(headlineTone(one), 5)
  })

  it('stays within bounds and survives junk', () => {
    expect(headlineTone([])).toBe(0)
    expect(headlineTone(null)).toBe(0)
    expect(headlineTone([{}, null])).toBe(0)
    const wild = [article('surge rally breakout soars milestone growth upgrade inflows')]
    expect(headlineTone(wild)).toBeLessThanOrEqual(1)
  })
})

describe('marketDirection', () => {
  const coins = (n, pct, btcPct = pct) =>
    Array.from({ length: n }, (_, i) => ({
      id: i === 0 ? 'bitcoin' : `c${i}`,
      price_change_percentage_24h: i === 0 ? btcPct : pct,
    }))

  it('reads a broad rally as positive and a broad rout as negative', () => {
    expect(marketDirection(coins(100, 4))).toBeGreaterThan(MOOD_THRESHOLD)
    expect(marketDirection(coins(100, -4))).toBeLessThan(-MOOD_THRESHOLD)
  })

  it('will not call it a bull market on Bitcoin alone', () => {
    // Bitcoin +9% while everything else bleeds is not a rally.
    expect(marketDirection(coins(100, -3, 9))).toBeLessThan(0.5)
  })

  it('will not call it a bull market on breadth alone', () => {
    // Everything up a hair while Bitcoin drops 8% is not one either.
    expect(marketDirection(coins(100, 0.2, -8))).toBeLessThan(0.5)
  })

  it('returns null when there is no usable data, rather than guessing', () => {
    expect(marketDirection([])).toBeNull()
    expect(marketDirection(null)).toBeNull()
    expect(marketDirection([{ id: 'x' }])).toBeNull()
  })
})

describe('marketMood', () => {
  it('does not say bearish while the market is clearly up', () => {
    // The reported bug, as a test.
    const coins = Array.from({ length: 100 }, (_, i) => ({
      id: i === 0 ? 'bitcoin' : `c${i}`,
      price_change_percentage_24h: i === 0 ? 8.9 : (i < 68 ? 2 : -1),
    }))
    const grim = Array.from({ length: 10 }, () => article('Exchange hack triggers sell-off and liquidation'))
    expect(marketMood({ articles: grim, coins })).not.toBe('bearish')
  })

  it('still says bearish when prices actually fall', () => {
    const coins = Array.from({ length: 100 }, (_, i) => ({
      id: i === 0 ? 'bitcoin' : `c${i}`,
      price_change_percentage_24h: i === 0 ? -7 : -4,
    }))
    expect(marketMood({ articles: [], coins })).toBe('bearish')
  })

  it('falls back to headlines when market data is missing', () => {
    const good = Array.from({ length: 5 }, () => article('Bitcoin rally and record high inflows surge'))
    expect(marketMood({ articles: good, coins: [] })).toBe('bullish')
  })

  it('says neutral when nothing is known', () => {
    expect(marketMood({})).toBe('neutral')
    expect(marketMood()).toBe('neutral')
  })

  it('agrees with the real shipped data', () => {
    // Guards against the exact contradiction reported: whatever these two
    // files say, the badge must not disagree with the direction of prices.
    const { articles } = JSON.parse(readFileSync('public/news.json', 'utf8'))
    const { coins } = JSON.parse(readFileSync('public/market.json', 'utf8'))
    const direction = marketDirection(coins)
    const mood = marketMood({ articles, coins })
    if (direction > MOOD_THRESHOLD) expect(mood).not.toBe('bearish')
    if (direction < -MOOD_THRESHOLD) expect(mood).not.toBe('bullish')
  })
})

describe('a more accurate reading', () => {
  const coin = (id, day, week, cap = 1e9, price = 10) => ({
    id, current_price: price, market_cap: cap,
    price_change_percentage_24h: day, price_change_percentage_7d_in_currency: week,
  })

  it('leaves stablecoins out, so they neither dilute the move nor count as up', () => {
    const coins = [coin('bitcoin', -3, -3, 1e12), coin('tether', 0.02, 0.01, 1e12, 1), coin('mystery-usd', 0.05, 0.1, 1e9, 1.0)]
    const st = marketStats(coins)
    expect(st.n).toBe(1)
    expect(st.up).toBe(0)
    expect(st.day).toBeCloseTo(-3)
  })

  it('weights each coin by its size', () => {
    const st = marketStats([coin('bitcoin', 2, 0, 9e11), coin('tiny', -20, 0, 1e9)])
    expect(st.day).toBeGreaterThan(1.9)
  })

  it('calls an ordinary 1% dip neutral, not bearish', () => {
    const coins = Array.from({ length: 50 }, (_, i) => coin(`c${i}`, -0.8, 1))
    expect(marketMood({ coins })).toBe('neutral')
  })

  it('calls a normal 2-3% red day on a flat week neutral', () => {
    // The day this was tuned on: market −2.3%, week +0.2%, most coins red.
    const coins = Array.from({ length: 83 }, (_, i) => coin(`c${i}`, i < 17 ? 0.5 : i < 27 ? -0.5 : -2.8, 0.2))
    expect(marketMood({ coins })).toBe('neutral')
  })

  it('says how strong the move is', () => {
    const mild = Array.from({ length: 50 }, (_, i) => coin(`c${i}`, -3.5, -2))
    const rout = Array.from({ length: 50 }, (_, i) => coin(`c${i}`, -8, -15))
    expect(moodReading({ coins: mild })).toMatchObject({ mood: 'bearish', strength: 'slight' })
    expect(moodReading({ coins: rout })).toMatchObject({ mood: 'bearish', strength: 'strong' })
  })

  it('lets a strong week steady a slightly red day', () => {
    const coins = Array.from({ length: 50 }, (_, i) => coin(`c${i}`, -1.2, 14))
    expect(marketMood({ coins })).not.toBe('bearish')
  })
})
