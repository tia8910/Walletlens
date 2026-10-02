import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLASS_PARAMS, mixParams, realGrowth, simulate, monthlyFromHistory, goalCrossing } from './growthEngine'

const here = dirname(fileURLToPath(import.meta.url))

describe('Grow My Net Worth: realistic by construction', () => {
  it('uses sober long-run growth, not boom-year crypto returns', () => {
    for (const p of Object.values(CLASS_PARAMS)) expect(p.mu).toBeLessThanOrEqual(0.10)
    expect(CLASS_PARAMS.crypto_small.mu).toBeLessThan(CLASS_PARAMS.crypto_large.mu)
    expect(CLASS_PARAMS.stocks.mu).toBeGreaterThan(CLASS_PARAMS.metals.mu)
  })

  it('takes inflation out for "today\'s money"', () => {
    expect(realGrowth(0.03)).toBeCloseTo(0, 5)
    expect(realGrowth(0.08)).toBeCloseTo(0.0485, 3)
  })

  it('keeps the percentile lines in order and the likely line rising', () => {
    const { mu, sig } = mixParams({ crypto_large: 0.6, stocks: 0.3, cash: 0.1 })
    const sim = simulate({ start: 20000, monthly: 300, months: 120, mu, sig })
    for (const b of sim.band) {
      expect(b.p10).toBeLessThanOrEqual(b.p25)
      expect(b.p25).toBeLessThanOrEqual(b.p50)
      expect(b.p50).toBeLessThanOrEqual(b.p75)
      expect(b.p75).toBeLessThanOrEqual(b.p90)
    }
    const dips = sim.band.slice(1).filter((b, i) => b.p50 < sim.band[i].p50).length
    expect(dips).toBeLessThanOrEqual(1)
  })

  it('never gives good odds for a goal the likely line ends short of', () => {
    const { mu, sig } = mixParams({ crypto_large: 0.7, metals: 0.2, cash: 0.1 })
    const base = simulate({ start: 26000, monthly: 250, months: 120, mu, sig })
    const goal = base.p50Terminal * 1.15
    const sim = simulate({ start: 26000, monthly: 250, months: 120, mu, sig, goal })
    expect(sim.probGoal).toBeLessThan(0.5)
    expect(goalCrossing(sim.band, 26000, goal)).toBeNull()
  })
})

describe('the monthly amount comes from what this person really invests', () => {
  const now = new Date('2026-10-15T00:00:00Z')
  const buy = (date, cost) => ({ type: 'buy', date, total_cost: cost })

  it('reads a steady monthly habit', () => {
    const months = ['2025-11', '2025-12', ...['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map(m => `2026-${m}`)]
    const txs = months.map(m => buy(`${m}-05`, 400))
    expect(monthlyFromHistory(txs, now)).toEqual({ monthly: 400, months: 12 })
  })

  it('does not mistake a one-day portfolio import for a monthly habit', () => {
    const txs = [buy('2026-03-01', 50000), buy('2026-03-01', 20000), ...['04', '05', '06', '07', '08', '09', '10'].map(m => buy(`2026-${m}-10`, 200))]
    expect(monthlyFromHistory(txs, now).monthly).toBe(200)
  })

  it('subtracts sells, and needs a few months before it guesses', () => {
    const txs = ['08', '09', '10'].flatMap(m => [buy(`2026-${m}-02`, 500), { type: 'sell', date: `2026-${m}-20`, total_cost: 200 }])
    expect(monthlyFromHistory(txs, now).monthly).toBe(300)
    expect(monthlyFromHistory([buy('2026-10-01', 100)], now)).toBeNull()
  })
})

describe('Backup & wallets page', () => {
  it('no longer shows the "Welcome to WalletLens" checklist', () => {
    const dash = readFileSync(join(here, 'pages/Dashboard.jsx'), 'utf8')
    expect(dash).not.toMatch(/OnboardingTutorial/)
  })
})
