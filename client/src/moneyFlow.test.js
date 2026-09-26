import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  indexFlows, flowFor, flowStatus, fmtUsdShort, FLAT_USD, STRONG_USD,
} from './moneyFlow'
import { normalizeFlow, mergeFlows, netflowBodies } from '../../data-api/feeds.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('reading Nansen smart-money netflow rows', () => {
  it('takes the 24h figure as the headline and keeps 7d, 30d and wallets', () => {
    const f = normalizeFlow({
      token_symbol: 'aave', chain: 'ethereum',
      net_flow_1h_usd: 10, net_flow_24h_usd: 2_400_000, net_flow_7d_usd: 5_000_000,
      net_flow_30d_usd: -1_000_000, trader_count: 14,
    })
    expect(f).toMatchObject({ symbol: 'AAVE', netflow: 2_400_000, netflow7d: 5_000_000, netflow30d: -1_000_000, traders: 14 })
  })

  it('sums one token across chains', () => {
    const merged = mergeFlows([
      { symbol: 'USDE', netflow: 100, netflow7d: 10, netflow30d: null, traders: 2, volume: null },
      { symbol: 'USDE', netflow: -40, netflow7d: 5, netflow30d: null, traders: 1, volume: null },
      { symbol: 'ENA', netflow: 7, netflow7d: null, netflow30d: null, traders: null, volume: null },
    ])
    expect(merged.find(f => f.symbol === 'USDE')).toMatchObject({ netflow: 60, netflow7d: 15, netflow30d: null, traders: 3 })
    expect(merged).toHaveLength(2)
  })

  it('asks for both the biggest inflows and the biggest outflows', () => {
    const dirs = netflowBodies().map(v => v[0].order_by[0].direction)
    expect(dirs).toEqual(['DESC', 'ASC'])
    // A bare fallback for each, in case a filter is refused.
    for (const v of netflowBodies()) expect(v[1].filters).toBeUndefined()
  })
})

describe('the flow for a holding', () => {
  const index = indexFlows({
    updated: '2026-09-26T10:00:00Z',
    flows: [
      { symbol: 'WBTC', netflow: 3_000_000, netflow7d: 9_000_000 },
      { symbol: 'CBBTC', netflow: 500_000, netflow7d: 1_000_000 },
      { symbol: 'ARB', netflow: -2_000_000, netflow7d: 4_000_000 },
      { symbol: 'LINK', netflow: 10_000 },
    ],
  })

  it('folds wrapped bitcoin into BTC', () => {
    expect(flowFor(index, 'btc').netflow).toBe(3_500_000)
    expect(flowFor(index, 'btc').netflow7d).toBe(10_000_000)
  })

  it('is null for a token Nansen does not report, rather than a zero', () => {
    expect(flowFor(index, 'DOGE')).toBeNull()
    expect(flowStatus(flowFor(index, 'DOGE'))).toBeNull()
    expect(indexFlows({ flows: [] })).toBeNull()
    expect(indexFlows(null)).toBeNull()
  })

  it('calls conviction only when size and the week agree', () => {
    expect(flowStatus(flowFor(index, 'BTC'))).toBe('strongIn')
    // Big 24h outflow against a week of buying is a dip in the flow, not distribution.
    expect(flowStatus(flowFor(index, 'ARB'))).toBe('out')
    expect(flowStatus(flowFor(index, 'LINK'))).toBe('flat')
    expect(flowStatus({ netflow: -STRONG_USD, netflow7d: -1 })).toBe('strongOut')
    expect(flowStatus({ netflow: FLAT_USD })).toBe('in')
  })

  it('abbreviates with a real minus sign', () => {
    expect(fmtUsdShort(-2_400_000, true)).toBe('−$2.4M')
    expect(fmtUsdShort(840_000, true)).toBe('+$840K')
    expect(fmtUsdShort(NaN)).toBe('—')
  })
})

describe('where it costs and where it shows', () => {
  it('reads the published hourly file, never the Nansen proxy', () => {
    const src = read('moneyFlow.js')
    expect(src).toMatch(/dataUrl\('smartmoney\.json'\)/)
    expect(src).not.toMatch(/walletlens-nansen|api\.nansen\.ai/)
  })

  it('appears on holdings, the asset page and Technical Analysis', () => {
    expect(read('pages/Dashboard.jsx')).toMatch(/<MoneyFlowBadge symbol=\{h\.coin_symbol\}/)
    expect(read('pages/AssetDetail.jsx').match(/<MoneyFlowCard /g)).toHaveLength(2)
    expect(read('components/TechChartPanel.jsx')).toMatch(/<MoneyFlowCard symbol=\{cur\.coin_symbol\}/)
  })

  it('has retired the whale tracker from menus and links', () => {
    const app = read('App.jsx')
    expect(app).not.toMatch(/go\('\/whales'\)/)
    expect(app).not.toMatch(/pages\/Whales/)
    // Old bookmarks land somewhere useful instead of on the 404 page.
    expect(app).toMatch(/path="\/whales" element=\{<Navigate to="\/technicals" replace \/>\}/)
    expect(read('components/HelpGuide.jsx')).not.toMatch(/'\/whales'/)
    expect(read('pages/Landing.jsx')).not.toMatch(/'\/whales'/)
  })
})
