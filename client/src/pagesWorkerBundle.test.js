import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import worker from '../scripts/pages-worker-entry.js'
import { PUSH_HOST, SITE_ORIGIN } from './apiHosts.js'

// A zip deploy carries static assets and nothing else, so functions/ is absent
// from it entirely — which is what /api/push/subscribe answering 405 meant:
// Pages had no handler and served the path as a static asset, and a static
// asset refuses a POST. _worker.js is the one server-side mechanism a direct
// upload honours, so the same functions are bundled into it at build time.

const here = dirname(fileURLToPath(import.meta.url))
const config = readFileSync(join(here, '../vite.config.js'), 'utf8')

const ctx = { waitUntil: () => {} }
const assets = { fetch: vi.fn(async () => new Response('<!doctype html>', { status: 200 })) }
const env = { ASSETS: assets }

const call = (path, init) => worker.fetch(new Request(`${SITE_ORIGIN}${path}`, init), env, ctx)

afterEach(() => { vi.unstubAllGlobals(); assets.fetch.mockClear() })

describe('the bundled Pages worker', () => {
  it('routes /api/push/* to the proxy, with the catch-all params Pages would pass', async () => {
    let seen
    vi.stubGlobal('fetch', async (u) => { seen = u; return new Response('{}', { status: 200 }) })
    await call('/api/push/subscribe', { method: 'POST', body: '{}' })
    expect(seen).toBe(`https://${PUSH_HOST}/subscribe`)
    expect(assets.fetch, 'never fell through to the asset server').not.toHaveBeenCalled()
  })

  it('keeps the query string across the hop', async () => {
    let seen
    vi.stubGlobal('fetch', async (u) => { seen = u; return new Response('{}') })
    await call('/api/push/status?endpoint=abc')
    expect(seen).toBe(`https://${PUSH_HOST}/status?endpoint=abc`)
  })

  it('hands every other path to the asset server', async () => {
    // Which is what keeps _headers and _redirects applying — the CSP and the
    // SPA fallback — even if _routes.json is ever ignored.
    const res = await call('/settings/')
    expect(assets.fetch).toHaveBeenCalledOnce()
    expect(res.status).toBe(200)
  })

  it('still serves the four functions that were already live', async () => {
    // A zip deploy that fixed push by dropping /api/stocks would take the
    // stock ticker down with it.
    for (const p of ['/api/analyze', '/api/voice-parse', '/api/translate', '/api/stocks']) {
      assets.fetch.mockClear()
      await call(p, { method: 'OPTIONS' }).catch(() => {})
      expect(assets.fetch, `${p} must not fall through to a static asset`).not.toHaveBeenCalled()
    }
  })

  it('prefers the method-specific export, exactly as Pages does', async () => {
    // /api/stocks exports onRequestGet and onRequestOptions and no onRequest.
    const res = await call('/api/stocks', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
  })

  it('answers 405 as JSON when a module cannot serve the method', async () => {
    const res = await call('/api/stocks', { method: 'DELETE' })
    expect(res.status).toBe(405)
    expect((await res.json()).error).toBe('method_not_allowed')
  })
})

describe('what the build emits', () => {
  it('bundles the worker and narrows it to /api/*', () => {
    expect(config).toMatch(/entryPoints: \[resolve\(__dirname, 'scripts\/pages-worker-entry\.js'\)\]/)
    expect(config).toMatch(/include: \['\/api\/\*'\]/)
  })

  it('produces both files, with the push host inside', () => {
    const dist = join(here, '../dist')
    if (!existsSync(join(dist, '_worker.js'))) return   // no build in this run
    expect(readFileSync(join(dist, '_worker.js'), 'utf8')).toContain(PUSH_HOST)
    expect(JSON.parse(readFileSync(join(dist, '_routes.json'), 'utf8')).include).toEqual(['/api/*'])
  })
})
