import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localMatches } from './components/TechChartPanel'

// Technicals charts any asset, not only holdings: the search box offers
// crypto (api.searchCoins), US stocks and the metals.

const here = dirname(fileURLToPath(import.meta.url))

describe('Technicals asset search', () => {
  it('finds stocks by ticker or name and metals by symbol or name', () => {
    expect(localMatches('aapl').map(a => a.coin_id)).toContain('stock:aapl')
    expect(localMatches('apple').map(a => a.coin_id)).toContain('stock:aapl')
    expect(localMatches('gold')[0]).toMatchObject({ coin_id: 'metal:xau', kind: 'metal' })
    expect(localMatches('xag')[0]).toMatchObject({ coin_id: 'metal:xag' })
  })

  it('offers any ticker-shaped query as a stock even when it is not in the list', () => {
    expect(localMatches('ZZZQ').find(a => a.coin_id === 'stock:zzzq')).toMatchObject({ guess: true })
    expect(localMatches('brk.b').map(a => a.coin_id)).toContain('stock:brk.b')
  })

  it('returns nothing for an empty query', () => {
    expect(localMatches('   ')).toEqual([])
  })

  it('searches crypto too, and charts the pick without it being held', () => {
    const src = readFileSync(join(here, 'components/TechChartPanel.jsx'), 'utf8')
    expect(src).toContain('api.searchCoins(q)')
    expect(src).toMatch(/const chips = found && !assets\.some/)
    expect(src).toContain('!(l.guess && syms.has(l.coin_symbol))')
  })
})
