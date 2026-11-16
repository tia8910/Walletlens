import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import BondBadge from './components/BondBadge'

// Bonds showed a blue disc with letters; they have their own mark now.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('the bond mark', () => {
  it('draws a certificate with a gold seal, at the size asked', () => {
    const html = renderToStaticMarkup(createElement(BondBadge, { size: 18 }))
    expect(html).toMatch(/width="18"/)
    expect(html).toMatch(/aria-hidden="true"/)
    expect((html.match(/<linearGradient|<radialGradient/g) || []).length).toBe(3)
  })
  it('gives each copy its own gradient ids', () => {
    const two = renderToStaticMarkup(createElement('div', null, createElement(BondBadge), createElement(BondBadge)))
    const ids = [...two.matchAll(/id="(bd-disc-[^"]+)"/g)].map(m => m[1])
    expect(new Set(ids).size).toBe(2)
  })
  it('is the logo for every bond, and the Bonds tile in Buy and Sell', () => {
    expect(read('components/CoinLogo.jsx')).toMatch(/coinId\?\.startsWith\('bond:'\)\) \{\n\s*return <BondBadge/)
    expect(read('components/TradeSheet.jsx')).toMatch(/key: 'bond',[^}]*icon: IcoBond/)
  })
})
