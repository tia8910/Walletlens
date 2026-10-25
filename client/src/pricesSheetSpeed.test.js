import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The ticker's All button waited on a code download with nothing on screen,
// then showed an empty crypto list until the market data arrived.

const SRC = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(SRC, p), 'utf8')

describe('the All prices button', () => {
  it('fetches the sheet ahead of the tap and opens on the cached list', () => {
    const ticker = read('components/PriceTicker.jsx')
    expect(ticker).toMatch(/requestIdleCallback\(go/)
    expect(ticker).toMatch(/onPointerDown=\{loadPricesSheet\}/)
    expect(read('components/PricesSheet.jsx')).toMatch(/useState\(\(\) => \{ try \{ return api\.getCachedMarketData\?\.\(\)/)
  })
})
