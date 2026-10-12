import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOGO_OVERRIDES } from './components/CoinLogo'

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf8')

// On desktop the mouse used to paint every button solid green: a global
// button:hover set the background, and it outranked the single-class skins of
// white tiles, the red Sell button, More rows and the bottom bar.
describe('desktop hover', () => {
  const css = read('./index.css')
  it('shades a button instead of repainting it', () => {
    const block = css.slice(css.indexOf('@media (hover: hover) {\n  /* Shade whatever'), css.indexOf('.btn-sm {'))
    expect(block).toContain('button:hover { filter: brightness(0.95); }')
    expect(block).not.toMatch(/button:hover\s*\{[^}]*background/)
  })
  it('gives the new look neutral, lifting hovers', () => {
    const v3 = read('./v3.css')
    expect(v3).toMatch(/\.nl-quick button:hover \{[^}]*background: var\(--nl-card\)/)
    expect(v3).toMatch(/\.nl-more-row:hover, \.nl-more-tile:hover \{[^}]*background: var\(--nl-card, var\(--card-bg\)\)/)
    expect(v3).toMatch(/\.wl-nav-item:not\(\.active\):hover \.wl-nav-icon \{ background: var\(--nl-seg\)/)
  })
})

describe('Solana logo', () => {
  it('uses the current mark from our own origin, in the app and the extension', () => {
    expect(LOGO_OVERRIDES.solana).toBe('/logos/solana.svg')
    for (const svg of [read('../public/logos/solana.svg'), read('../../extension/logos/coins/sol.svg')]) {
      expect(svg).toContain('#9945FF')
      expect(svg).toContain('#14F195')
      expect(svg).not.toContain('#66F9A1')
    }
  })
})
