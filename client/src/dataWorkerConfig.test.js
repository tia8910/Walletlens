import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_HOST, SITE_ORIGIN, dataUrl } from './apiHosts.js'

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

  it('serves every dataset the client asks for, on the route it asks on', () => {
    // Each of these is a route in the toml and a call site in the app; a
    // dataset present in one and not the other 404s silently.
    //
    // The client asks on the zone now, not on workers.dev — a connection check
    // from the app had every workers.dev host throwing "Failed to fetch" on a
    // device that loaded the site fine. These routes already existed; dataUrl
    // simply did not use them. So the URL the app builds and the pattern the
    // worker answers on have to be checked against each other, not just both
    // mentioning the filename.
    for (const f of ['news.json', 'stocks.json', 'economy.json', 'market.json']) {
      expect(toml, `${f} routed`).toContain(f)
      expect(dataUrl(f)).toBe(`${SITE_ORIGIN}/${f}`)
      const host = new URL(dataUrl(f)).host
      expect(toml, `${f} routed on ${host}`).toContain(`pattern = "${host}/${f}"`)
    }
  })
})
