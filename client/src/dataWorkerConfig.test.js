import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_HOST, dataUrl } from './apiHosts.js'

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..')
const toml = readFileSync(join(repo, 'data-api/wrangler.toml'), 'utf8')

describe('the data worker stays reachable on the host the client uses', () => {
  it('keeps workers.dev enabled alongside the zone routes', () => {
    // wrangler turns the *.workers.dev subdomain OFF on any deploy that
    // declares routes, unless this is set. The routes kept
    // walletlens.live/news.json answering, so the service looked healthy from
    // outside while the URL the app actually fetches stopped resolving — and
    // NewsTicker renders nothing on an empty list, so the strip vanished with
    // no error to find.
    if (/^\s*routes\s*=/m.test(toml)) {
      expect(toml, 'routes without workers_dev takes the client offline')
        .toMatch(/^\s*workers_dev\s*=\s*true\s*$/m)
    }
  })

  it('names the same worker the client points at', () => {
    // A rename here and the client fetches a host that never existed.
    const name = toml.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1]
    expect(name).toBeTruthy()
    expect(DATA_HOST.startsWith(name + '.'), `${DATA_HOST} should start with ${name}.`).toBe(true)
  })

  it('serves every dataset the client asks for', () => {
    // Each of these is a route in the toml and a call site in the app; a
    // dataset present in one and not the other 404s silently.
    for (const f of ['news.json', 'stocks.json', 'economy.json', 'market.json']) {
      expect(toml, `${f} routed`).toContain(f)
      expect(dataUrl(f)).toBe(`https://${DATA_HOST}/${f}`)
    }
  })
})
