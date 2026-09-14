import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onRequest } from '../../functions/api/voice/[[path]].js'
import { VOICE_HOST, VOICE_API, SITE_ORIGIN, voiceProxy } from './apiHosts.js'

// The sixth feature on this hostname.
//
// Screenshot import posts the image to the voice worker, which holds the
// Anthropic key. That worker is on workers.dev, and /diag on the reporting
// device had it failing in 4ms while same-origin answered in ~430ms — the
// request never left the phone. The import then said "No holdings detected in
// any screenshot. Try clearer, tighter shots", sending someone off to
// re-photograph an exchange for a request that was never sent.
//
// Push registration, the six datasets, the news, the coin icons and Drive
// sign-in went the same way. This carries RSS import and two coin-logo
// fallbacks with it.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '../../functions/api/voice/[[path]].js'), 'utf8')
const panel = readFileSync(join(here, 'components/SmartImport.jsx'), 'utf8')
const WORKER = `https://${VOICE_HOST}`

const call = (path, init = {}) => onRequest({
  request: new Request(`${SITE_ORIGIN}/api/voice/${path}`, init),
  params: { path: path.split('?')[0].split('/').filter(Boolean) },
})

afterEach(() => { vi.unstubAllGlobals() })

describe('the voice relay', () => {
  it('answers the URLs the app actually builds', () => {
    expect(VOICE_API).toBe(`${SITE_ORIGIN}/api/voice/`)
    expect(voiceProxy('https://x.com/a')).toBe(`${SITE_ORIGIN}/api/voice/proxy?url=https%3A%2F%2Fx.com%2Fa`)
  })

  it('forwards the worker root, which is where the image is posted', async () => {
    let seen
    vi.stubGlobal('fetch', async (u, init) => { seen = { u, init }; return new Response('{}') })
    await onRequest({
      request: new Request(`${SITE_ORIGIN}/api/voice/`, { method: 'POST', body: '{"mode":"vision"}' }),
      params: { path: [] },
    })
    expect(seen.u).toBe(`${WORKER}/`)
    expect(seen.init.method).toBe('POST')
  })

  it('forwards the other three routes the worker answers', async () => {
    for (const p of ['proxy', 'guardian-reset', 'subscribers']) {
      let seen
      vi.stubGlobal('fetch', async (u) => { seen = u; return new Response('{}') })
      const res = await call(p)
      expect(res.status, p).toBe(200)
      expect(seen).toBe(`${WORKER}/${p}`)
    }
  })

  it('keeps the query string, which carries the proxy target', async () => {
    let seen
    vi.stubGlobal('fetch', async (u) => { seen = u; return new Response('{}') })
    await onRequest({
      request: new Request(`${SITE_ORIGIN}/api/voice/proxy?url=https%3A%2F%2Fx.com%2Fa`),
      params: { path: ['proxy'] },
    })
    expect(seen).toBe(`${WORKER}/proxy?url=https%3A%2F%2Fx.com%2Fa`)
  })

  it('is not an open proxy', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    for (const p of ['admin', 'proxy/../admin', 'anything']) {
      expect((await call(p)).status, `/${p}`).toBe(404)
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('passes the caller IP, because the worker rate limits on it', async () => {
    // Without it every visitor shares one bucket and throttles the others. The
    // browser called this worker directly before, so the worker already saw
    // these addresses — this is the same exposure, not new exposure.
    let seen
    vi.stubGlobal('fetch', async (u, init) => { seen = init; return new Response('{}') })
    await call('proxy', { headers: { 'CF-Connecting-IP': '1.2.3.4' } })
    expect(seen.headers.get('cf-connecting-ip')).toBe('1.2.3.4')
  })

  it('does not forward the visitor cookies', async () => {
    let seen
    vi.stubGlobal('fetch', async (u, init) => { seen = init; return new Response('{}') })
    await call('proxy', { headers: { Cookie: 'session=secret' } })
    expect(seen.headers.get('cookie')).toBeNull()
  })

  it('turns an unreachable worker into a status, never a thrown error', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('refused') })
    const res = await call('proxy')
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('voice_unreachable')
  })

  it('targets the host apiHosts.js names, and nothing else', () => {
    const hosts = [...src.matchAll(/https:\/\/([a-z0-9.-]*workers\.dev)/g)].map((m) => m[1])
    expect([...new Set(hosts)]).toEqual([VOICE_HOST])
  })
})

describe('what the import tells you when it fails', () => {
  it('stops blaming the screenshot for a request that was never sent', () => {
    expect(panel).toMatch(/function isUnreachable\(e\)/)
    expect(panel).toMatch(/errImportUnreachable/)
  })

  it('still says "no holdings" when the reader genuinely found none', () => {
    // The distinction is the point: one means try a clearer shot, the other
    // means the shot was never looked at.
    expect(panel).toMatch(/errNoHoldingsDetected/)
    expect(panel).toMatch(/} else if \(unreachable\) \{/)
  })

  it('offers the new message in every language the app ships', () => {
    for (const lang of ['en', 'ar', 'de', 'es', 'fr', 'it']) {
      const f = readFileSync(join(here, `i18n/${lang}.js`), 'utf8')
      expect(f, `${lang} is missing errImportUnreachable`).toMatch(/errImportUnreachable:/)
    }
  })
})
