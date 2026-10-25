import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLED_LOGOS } from './components/CoinLogo'

// Onboarding showed blank discs for USDT and initials for BTC: every logo came
// from another host, requested only after the page's load event. The most held
// coins now ship with the app and draw in the first frame.

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'logos', 'coins')

describe('bundled coin logos', () => {
  it('has a file for every coin it names', () => {
    for (const [id, sym] of Object.entries(BUNDLED_LOGOS)) {
      expect(existsSync(join(PUB, `${sym}.svg`)), `${id} → ${sym}.svg`).toBe(true)
    }
  })

  it('covers what onboarding offers first', () => {
    for (const id of ['bitcoin', 'ethereum', 'tether', 'usd-coin', 'dai', 'binancecoin', 'ripple', 'cardano', 'dogecoin']) {
      expect(BUNDLED_LOGOS[id], id).toBeTruthy()
    }
  })

  it('keeps the licence beside the files', () => {
    expect(readFileSync(join(PUB, 'LICENSE.txt'), 'utf8')).toMatch(/CC0/)
  })
})
