import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ASSET_ICONS } from './data/assetIcons'
import { GOLD_ID, SILVER_ID, COPPER_ID, PLATINUM_ID } from './data/assets'

// One asset, one mark.
//
// A gold holding showed three different things depending on where you looked:
// the trade sheet drew an ingot, assetIcons exported a disc with the ISO code,
// and CoinLogo had its own third copy of that disc. The dashboard got the
// least recognisable of the three.

const here = dirname(fileURLToPath(import.meta.url))
const icons = readFileSync(join(here, 'data/assetIcons.jsx'), 'utf8')
const logo = readFileSync(join(here, 'components/CoinLogo.jsx'), 'utf8')

describe('every metal has an ingot', () => {
  it('covers all four, not just gold and silver', () => {
    // Platinum and copper fell through to a lettered disc while gold and
    // silver got a bar.
    for (const id of [GOLD_ID, SILVER_ID, COPPER_ID, PLATINUM_ID]) {
      expect(ASSET_ICONS[id], id).toBeTruthy()
      expect(ASSET_ICONS[id].metal, `${id} names its bar`).toBeTruthy()
    }
  })

  it('names a bar that actually exists', () => {
    const bars = icons.slice(icons.indexOf('const BARS = {'), icons.indexOf('\n}', icons.indexOf('const BARS = {')))
    for (const id of Object.keys(ASSET_ICONS)) {
      expect(bars, `${ASSET_ICONS[id].metal} defined`).toContain(`${ASSET_ICONS[id].metal}:`)
    }
  })
})

describe('the mark is drawn once', () => {
  it('shares the artwork between the trade sheet and the holdings badge', () => {
    // Two drawings kept in step by hand is how they drifted apart.
    expect(icons).toMatch(/function BarShapes\(\{ c \}\)/)
    expect(icons.match(/<BarShapes c=\{/g).length).toBeGreaterThanOrEqual(2)
  })

  it('has no second copy of the badge inside CoinLogo', () => {
    expect(logo).toMatch(/<AssetIconBadge coinId=\{coinId\}/)
    expect(logo).not.toMatch(/radialGradient id=\{`gi-\$\{coinId\}`\}/)
  })

  it('keeps the round slot, so a metal still lines up with the coins beside it', () => {
    const badge = icons.slice(icons.indexOf('export function AssetIconBadge'))
    expect(badge).toMatch(/borderRadius: '50%'/)
    expect(badge).toMatch(/<circle cx="16" cy="16" r="16"/)
  })

  it('puts the bar on a neutral plate rather than its own colour', () => {
    // A gold bar on a gold disc is one flat shape; the plate is what lets the
    // metal read the way it does on the trade sheet.
    const badge = icons.slice(icons.indexOf('export function AssetIconBadge'))
    expect(badge).toMatch(/fill="#0f172a"/)
    expect(badge).toMatch(/transform="translate\(4 8\.5\) scale\(0\.75\)"/)
  })

  it('still has something to draw for an id with no bar', () => {
    const badge = icons.slice(icons.indexOf('export function AssetIconBadge'))
    expect(badge).toMatch(/\{known\.label\}/)
  })
})
