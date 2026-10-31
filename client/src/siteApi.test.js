import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { siteApi } from './apiHosts.js'

// A site check of the home page found one broken request:
// 404 /api/stocks?symbols=AAPL,MSFT,… The function never answers 404; the
// path was relative, so on a host that does not run the Pages worker (the
// GitHub Pages copy) it named a file that does not exist.

const loc = (href) => new URL(href)
const here = dirname(fileURLToPath(import.meta.url))

describe('siteApi', () => {
  it('stays relative on the site itself and its previews', () => {
    expect(siteApi('/api/stocks?symbols=AAPL', loc('https://walletlens.live/dashboard'))).toBe('/api/stocks?symbols=AAPL')
    expect(siteApi('/api/geo', loc('https://abc.walletlenslive1.pages.dev/'))).toBe('/api/geo')
  })

  it('goes to the site from a host with no worker', () => {
    expect(siteApi('/api/stocks?symbols=AAPL', loc('https://tia8910.github.io/Walletlens/'))).toBe('https://walletlens.live/api/stocks?symbols=AAPL')
    expect(siteApi('/api/icon?sym=btc', loc('http://localhost:5173/'))).toBe('https://walletlens.live/api/icon?sym=btc')
    expect(siteApi('/api/geo', null)).toBe('https://walletlens.live/api/geo')
  })
})

describe('no price or logo request uses a bare /api path', () => {
  for (const file of ['api.js', 'components/CoinLogo.jsx']) {
    it(file, () => {
      const src = readFileSync(join(here, file), 'utf8')
      const bare = src.split('\n').filter(l => /[`'"]\/api\/(stocks|geo|market-list|stock-search|candles|icon)/.test(l) && !/siteApi\(/.test(l))
      expect(bare).toEqual([])
    })
  }
})
