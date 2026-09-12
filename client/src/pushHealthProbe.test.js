import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { probeAssetPage } from '../../workers/push/index.js'
import { buildMessage } from '../../workers/push/fcm.js'
import { SITE_ORIGIN } from '../../workers/push/site.js'
import { assetUrl } from '../../push-api/notify-logic.js'

// /health reports two different things about the same link, and conflating
// them is what sent a round of diagnosis at a non-bug:
//
//   assetUrlSample — the SHAPE the running build emits. A string. It is
//     relative because that is what the payload carries, so fetching it
//     against the worker's own subdomain 404s correctly: this worker has no
//     /asset/ route and should not have one.
//   assetPage — whether that shape resolves on the site notifications
//     actually open. A real request, against SITE_ORIGIN.
//
// The first cannot go green by being pointed somewhere that answers, and the
// second cannot pass by testing a host no notification uses.

const here = dirname(fileURLToPath(import.meta.url))
const index = readFileSync(join(here, '../../workers/push/index.js'), 'utf8')

afterEach(() => { vi.unstubAllGlobals() })

describe('the reported link shape', () => {
  it('stays a relative string, not a fetch', () => {
    const health = index.slice(index.indexOf('assetUrlSample:'))
    expect(health.slice(0, health.indexOf('\n'))).toBe("assetUrlSample: assetUrl({ coin_id: 'bitcoin' }),")
    expect(assetUrl({ coin_id: 'bitcoin' }).startsWith('/')).toBe(true)
  })

  it('is the query shape a cold navigation can resolve', () => {
    // /asset/:coinId can never be a file — the id is a holding, not a route —
    // so Pages served 404.html for every tapped price alert.
    expect(assetUrl({ coin_id: 'bitcoin' })).toBe('/asset/?id=bitcoin')
  })
})

describe('the live probe', () => {
  it('asks the origin the notification will carry', async () => {
    const seen = []
    vi.stubGlobal('fetch', async (u) => { seen.push(u); return new Response('', { status: 200 }) })
    const out = await probeAssetPage(null)
    expect(seen[0]).toBe(`${SITE_ORIGIN}/asset/?id=bitcoin`)
    expect(out).toMatchObject({ status: 200, ok: true })
    expect(typeof out.ms).toBe('number')
  })

  it('reports a missing page rather than throwing', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    expect(await probeAssetPage(null)).toMatchObject({ ok: false, status: 404 })
  })

  it('survives a timeout and says so', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('The operation was aborted') })
    const out = await probeAssetPage(null)
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/aborted/)
    expect(out.status).toBeUndefined()
  })

  it('can be switched off for an uptime pinger', async () => {
    let called = false
    vi.stubGlobal('fetch', async () => { called = true; return new Response('') })
    expect(await probeAssetPage('0')).toMatchObject({ skipped: 'probe=0' })
    expect(called).toBe(false)
  })

  it('does not follow a redirect onto something that answers 200', async () => {
    let opts
    vi.stubGlobal('fetch', async (_u, o) => { opts = o; return new Response('', { status: 301 }) })
    await probeAssetPage(null)
    expect(opts.redirect).toBe('manual')
  })
})

describe('one origin, not two', () => {
  it('is the same constant fcm.js writes into the payload', () => {
    const m = buildMessage({ token: 't', payload: { url: '/asset/?id=bitcoin' }, urgency: 'high', ttl: 60 })
    expect(m.message.data.url).toBe(`${SITE_ORIGIN}/asset/?id=bitcoin`)
  })

  it('is the origin the Android shell will accept', () => {
    // WalletLensMessagingService drops any url that does not start with this
    // and falls back to /dashboard — a mismatch is a silently wrong link, not
    // a broken one.
    const java = readFileSync(
      join(here, '../../walletlens_source/release_package/app/src/main/java/live/walletlens/twa/WalletLensMessagingService.java'),
      'utf8')
    expect(java).toContain(`"${SITE_ORIGIN}/"`)
  })
})

describe('the preflight the app actually makes', () => {
  const cors = index.slice(index.indexOf('function corsHeaders('), index.indexOf('const json ='))

  it('does not rely on the header wildcard', () => {
    // '*' in Access-Control-Allow-Headers is only understood by Chromium 77+.
    // Every GET here is a simple request and never preflights, so the wildcard
    // was never exercised — but /subscribe is a POST with a JSON content type,
    // which always does. On an older Android System WebView the preflight then
    // fails and the POST surfaces in the page as a bare "Failed to fetch".
    expect(cors).not.toMatch(/'Access-Control-Allow-Headers': '\*'/)
    expect(cors).toMatch(/requestedHeaders \|\| 'Content-Type'/)
  })

  it('echoes what the preflight asked for, and varies on it', () => {
    expect(index).toMatch(/corsHeaders\(origin, req\.headers\.get\('access-control-request-headers'\)\)/)
    expect(cors).toMatch(/'Vary': 'Origin, Access-Control-Request-Headers'/)
  })

  it('allows the methods the routes answer', () => {
    // A method missing here fails the preflight for that route only, which is
    // the hardest version of this bug to spot.
    const methods = cors.match(/'Access-Control-Allow-Methods': '([^']+)'/)[1]
    for (const m of ['GET', 'POST', 'DELETE', 'OPTIONS']) expect(methods).toContain(m)
  })

  it('caches the preflight so registering is one round trip', () => {
    expect(cors).toMatch(/'Access-Control-Max-Age'/)
  })
})
