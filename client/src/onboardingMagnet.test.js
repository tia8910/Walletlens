import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import en from './i18n/en'

// The welcome slide's wealth magnet: the app's own asset logos orbit the
// lens, a tap pulls them in with coin clinks and a cash register, and the
// onboarding score is the money themed one in sfx.js.
// Source checks, like onboardingSlides.test.js: there is no component harness.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/NativeOnboarding.jsx'), 'utf8')
const css = readFileSync(join(here, 'components/NativeOnboarding.css'), 'utf8')
const sfx = readFileSync(join(here, 'sfx.js'), 'utf8')

describe('welcome magnet', () => {
  it('draws the orbiting assets with the app\'s own logos, not hand drawn glyphs', () => {
    expect(src).toMatch(/import CoinLogo from '\.\/CoinLogo'/)
    expect(src).toMatch(/MAGNET_ASSETS = \['bitcoin', 'metal:xau', 'ethereum', 'stock:AAPL', 'fiat:USD', 'solana'\]/)
    expect(src).toMatch(/<CoinLogo coinId=\{id\} size=\{40\}/)
  })

  it('pulls on a tap, and on its own if nobody taps', () => {
    expect(src).toMatch(/className="ocx-mg-lens" onClick=\{pull\}/)
    expect(src).toMatch(/setTimeout\(pull, 4200\)/)
    expect(src).not.toMatch(/ocx-aperture/)
  })

  it('plays a coin per asset and a cash register when the figure lands', () => {
    expect(src).toMatch(/sfx\.playCoin\(i\)/)
    expect(src).toMatch(/sfx\.playCashIn\(\)/)
    expect(sfx).toMatch(/function playCoin\(/)
    expect(sfx).toMatch(/function playCashIn\(/)
    expect(sfx).toMatch(/\n {2}playCoin,\n {2}playCashIn,/)
  })

  it('stops the onboarding score cleanly, ticker included', () => {
    expect(sfx).toMatch(/clearInterval\(d\.timer\)/)
    expect(sfx).toMatch(/const TICKER = \[/)
  })

  it('has its words in English and keeps reduced motion still', () => {
    for (const k of ['obMagnetTap', 'obMagnetPulling', 'obMagnetKinds', 'obMagnetTitle', 'obMagnetAria']) expect(en[k]).toBeTruthy()
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.ocx-mg-orbit/)
  })
})
