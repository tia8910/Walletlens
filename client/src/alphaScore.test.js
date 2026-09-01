import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calcAlphaScore, assetClass, effectiveCount, gradeFor, MOVE_BAND } from './alphaScore'

const src = dirname(fileURLToPath(import.meta.url))

const hold = (coin_id, value, pnlPct = 0) => ({ coin_id, value, pnlPct })
const px = (obj) => Object.fromEntries(
  Object.entries(obj).map(([id, change]) => [id, { usd: 1, usd_24h_change: change }]))

describe('assetClass()', () => {
  it('reads the app\'s own id prefixes', () => {
    expect(assetClass('bitcoin')).toBe('crypto')
    expect(assetClass('stock:aapl')).toBe('equity')
    expect(assetClass('metal:xau')).toBe('metal')
    expect(assetClass('fiat:eur')).toBe('cash')
    expect(assetClass('bond:us10y')).toBe('bond')
    expect(assetClass('real:reit')).toBe('realestate')
    expect(assetClass('other:art')).toBe('other')
  })

  it('counts a tokenised stock as equity, not crypto', () => {
    // xstock:aapl trades as a CoinGecko token, but what it tracks is a share —
    // and for the momentum band and the class count that is what matters.
    expect(assetClass('xstock:aapl')).toBe('equity')
  })

  it('treats an unprefixed id as crypto, which is the app\'s convention', () => {
    expect(assetClass('ethereum')).toBe('crypto')
    expect(assetClass('')).toBe('crypto')
  })
})

describe('effectiveCount()', () => {
  it('counts equal weights as their number', () => {
    expect(effectiveCount([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(4, 6)
    expect(effectiveCount([1])).toBeCloseTo(1, 6)
  })

  it('discounts a mix dominated by one position', () => {
    // Five holdings, but 96% in one: it behaves like barely more than one.
    expect(effectiveCount([0.96, 0.01, 0.01, 0.01, 0.01])).toBeLessThan(1.1)
  })
})

describe('the score reads the whole portfolio, not the crypto in it', () => {
  it('scores a portfolio holding no crypto at all', () => {
    // THE BUG: the loader stripped every stock:/metal:/fiat: id before
    // fetching prices, so those holdings arrived unpriced, were dropped for
    // having no price, and a portfolio of nothing but shares got no score.
    const stocksOnly = [
      hold('stock:aapl', 5000, 12),
      hold('stock:msft', 4000, 8),
      hold('stock:nvda', 3000, 30),
    ]
    const s = calcAlphaScore(stocksOnly, px({ 'stock:aapl': 1.2, 'stock:msft': 0.8, 'stock:nvda': 2.0 }))
    expect(s).not.toBeNull()
    expect(s.total).toBeGreaterThan(0)
    expect(s.mix.map(m => m.name)).toEqual(['equity'])
  })

  it('does not tell a diversified investor their diversification is zero', () => {
    // The symptom people actually saw. Under the old measure this collapsed
    // to the single crypto holding, largest weight 1.0, diversification 0/20.
    const mixed = [
      hold('stock:aapl', 3000, 10),
      hold('stock:msft', 3000, 5),
      hold('metal:xau', 2000, 4),
      hold('bitcoin', 2000, 20),
    ]
    const s = calcAlphaScore(mixed, px({ 'stock:aapl': 1, 'stock:msft': 1, 'metal:xau': 0.3, bitcoin: 2 }))
    expect(s.divScore).toBeGreaterThan(0)
    expect(s.classSpread).toBeGreaterThan(0)
    expect(s.mix.map(m => m.name).sort()).toEqual(['crypto', 'equity', 'metal'])

    // And it must beat the same money concentrated in one class — otherwise
    // "counts asset classes" is a comment rather than behaviour.
    const sameMoneyOneClass = calcAlphaScore(
      [hold('c1', 3000, 10), hold('c2', 3000, 5), hold('c3', 2000, 4), hold('c4', 2000, 20)],
      px({ c1: 1, c2: 1, c3: 0.3, c4: 2 }))
    expect(s.divScore).toBeGreaterThan(sameMoneyOneClass.divScore)
  })

  it('caps an all-crypto portfolio at half the diversification points', () => {
    // Thirty altcoins are one bet wearing thirty names. The old measure —
    // which only looked at the largest single weight — called that excellent.
    const manyCoins = Array.from({ length: 30 }, (_, i) => hold(`coin${i}`, 1000, 5))
    const s = calcAlphaScore(manyCoins, px(Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`coin${i}`, 1]))))
    expect(s.classSpread).toBe(0)
    expect(s.divScore).toBeLessThanOrEqual(10)
  })

  it('rewards spreading across classes over spreading within one', () => {
    const oneClass = calcAlphaScore(
      [hold('c1', 1000), hold('c2', 1000), hold('c3', 1000)],
      px({ c1: 0, c2: 0, c3: 0 }))
    const threeClasses = calcAlphaScore(
      [hold('c1', 1000), hold('stock:aapl', 1000), hold('metal:xau', 1000)],
      px({ c1: 0, 'stock:aapl': 0, 'metal:xau': 0 }))
    expect(threeClasses.divScore).toBeGreaterThan(oneClass.divScore)
  })
})

describe('momentum is judged against what you actually hold', () => {
  it('rates a good equity day as a good day, not a mediocre one', () => {
    // +2% is an excellent session for a stock portfolio and an unremarkable
    // one for crypto. Scored on the crypto band both come out middling, which
    // is what the single ±20% clamp used to do.
    const stocks = calcAlphaScore(
      [hold('stock:aapl', 1000)], px({ 'stock:aapl': 2 }))
    const coins = calcAlphaScore([hold('bitcoin', 1000)], px({ bitcoin: 2 }))
    expect(stocks.momentumScore).toBeGreaterThan(coins.momentumScore)
  })

  it('uses a band blended from the mix, not from the largest class', () => {
    const half = calcAlphaScore(
      [hold('bitcoin', 1000), hold('stock:aapl', 1000)],
      px({ bitcoin: 0, 'stock:aapl': 0 }))
    expect(half.band).toBeCloseTo((MOVE_BAND.crypto + MOVE_BAND.equity) / 2, 6)
  })

  it('gives a flat day the middle of the range, whatever is held', () => {
    for (const id of ['bitcoin', 'stock:aapl', 'metal:xau', 'fiat:eur']) {
      const s = calcAlphaScore([hold(id, 1000)], px({ [id]: 0 }))
      expect(s.momentumScore, id).toBe(15)
    }
  })

  it('does not divide by nothing on an all-cash portfolio', () => {
    const s = calcAlphaScore([hold('fiat:usd', 5000)], px({ 'fiat:usd': 0 }))
    expect(Number.isFinite(s.total)).toBe(true)
    expect(s.band).toBeGreaterThanOrEqual(1)
  })
})

describe('the published total', () => {
  it('cannot exceed 100 or fall below 0', () => {
    const best = calcAlphaScore(
      [hold('bitcoin', 1000, 50), hold('stock:aapl', 1000, 50), hold('metal:xau', 1000, 50)],
      px({ bitcoin: 99, 'stock:aapl': 99, 'metal:xau': 99 }))
    expect(best.total).toBeLessThanOrEqual(100)
    expect(best.total).toBeGreaterThan(70)

    const worst = calcAlphaScore(
      [hold('bitcoin', 1000, -60)], px({ bitcoin: -99 }))
    expect(worst.total).toBeGreaterThanOrEqual(0)
  })

  it('sums its four parts exactly', () => {
    const s = calcAlphaScore(
      [hold('bitcoin', 1000, 5), hold('stock:aapl', 700, -3)],
      px({ bitcoin: 1.5, 'stock:aapl': -0.4 }))
    expect(s.total).toBe(s.momentumScore + s.pnlScore + s.divScore + s.oppScore)
  })

  it('grades each band at its exact boundary', () => {
    // Asserting only that the key is one of the five passes whatever the
    // thresholds are, which is no test at all. These pin the edges.
    expect(gradeFor(100).gradeKey).toBe('axGradeStrong')
    expect(gradeFor(80).gradeKey).toBe('axGradeStrong')
    expect(gradeFor(79).gradeKey).toBe('axGradeGood')
    expect(gradeFor(60).gradeKey).toBe('axGradeGood')
    expect(gradeFor(59).gradeKey).toBe('axGradeNeutral')
    expect(gradeFor(40).gradeKey).toBe('axGradeNeutral')
    expect(gradeFor(39).gradeKey).toBe('axGradeWeak')
    expect(gradeFor(20).gradeKey).toBe('axGradeWeak')
    expect(gradeFor(19).gradeKey).toBe('axGradePoor')
    expect(gradeFor(0).gradeKey).toBe('axGradePoor')
  })

  it('gives every score from 0 to 100 a grade and a colour', () => {
    for (let n = 0; n <= 100; n++) {
      expect(gradeFor(n).gradeKey, `score ${n}`).toMatch(/^axGrade/)
      expect(gradeFor(n).color, `score ${n}`).toBeTruthy()
    }
  })

  it('carries the grade through from the scorer', () => {
    const s = calcAlphaScore([hold('bitcoin', 1000, -60)], px({ bitcoin: -99 }))
    expect(s.gradeKey).toBe(gradeFor(s.total).gradeKey)
  })

  it('is null on an empty or worthless portfolio', () => {
    expect(calcAlphaScore([], {})).toBeNull()
    expect(calcAlphaScore(null, {})).toBeNull()
    expect(calcAlphaScore([hold('bitcoin', 0)], {})).toBeNull()
  })

  it('survives a missing price map entirely', () => {
    // Prices arriving late is the normal first render, not an error state.
    const s = calcAlphaScore([hold('bitcoin', 1000, 5)])
    expect(s.momentumScore).toBe(15)
  })

  it('reports the mix so the page can show what it scored', () => {
    const s = calcAlphaScore(
      [hold('bitcoin', 7000), hold('stock:aapl', 3000)],
      px({ bitcoin: 0, 'stock:aapl': 0 }))
    expect(s.mix).toEqual([
      { name: 'crypto', weight: 0.7 },
      { name: 'equity', weight: 0.3 },
    ])
    expect(s.priced).toBe(2)
  })
})

describe('the page feeds the score every asset class', () => {
  // The scoring function can only be as multi-asset as what it is handed, and
  // what it was handed was filtered upstream. These hold the call site.
  const page = readFileSync(join(src, 'pages/Alpha.jsx'), 'utf8')

  it('no longer strips non-crypto ids before fetching prices', () => {
    // api.getPrices() has routed stock: to Stooq and metal: to a spot feed all
    // along — the filter was discarding support that already existed.
    const loader = /async function loadPortfolio\(\) \{[\s\S]*?\n  \}/.exec(page)[0]
    expect(loader).not.toMatch(/!id\.startsWith\('stock:'\)/)
    expect(loader).not.toMatch(/!id\.startsWith\('metal:'\)/)
  })

  it('uses the shared model rather than a private copy', () => {
    expect(page).toMatch(/import \{ calcAlphaScore.* \} from '\.\.\/alphaScore'/)
    expect(page).not.toMatch(/^function calcAlphaScore/m)
  })

  it('builds the portfolio signals from every holding it can price', () => {
    // These lists drove "Your Portfolio Signals", and a `cryptoHoldings`
    // filter meant a stock down 9% on the day was never warned about.
    expect(page).not.toMatch(/const cryptoHoldings = /)
    expect(page).toMatch(/const pricedHoldings = /)
  })
})
