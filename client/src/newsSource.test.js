import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The RSS digest moved from a static file a GitHub Action committed into
// client/public/ to the data worker, because the Action stopped and the file
// kept being served from inside the Pages build: nine days stale and looking
// perfectly healthy from the outside. Nothing that reads it should point at
// walletlens.live any more.
const repo = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = f => readFileSync(join(repo, f), 'utf8')

describe('news comes from the data worker', () => {
  it('the push sender does not read the frozen static file', () => {
    const markets = read('push-api/markets.js')
    expect(markets, 'no hardcoded site URL').not.toMatch(/walletlens\.live\/news\.json/)
    expect(markets, 'goes through dataUrl like its neighbours')
      .toMatch(/dataUrl\('news\.json'\)/)
  })

  it('the client reads all three digests the same way', () => {
    // crypto, stocks and economy are one pipeline; a call site that drifts back
    // to a same-origin path is the bug this guards.
    const ticker = read('client/src/components/NewsTicker.jsx')
    expect(ticker).toMatch(/dataUrl\('news\.json'\)/)
    expect(ticker).not.toMatch(/walletlens\.live\/news\.json/)
  })

  it('the worker still has a news job to serve', () => {
    // If this dataset is dropped from the registry the fetches above 404 and
    // the app silently shows nothing rather than something stale.
    expect(read('data-api/core.js')).toMatch(/'news\.json':/)
  })
})
