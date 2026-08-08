import { describe, it, expect, beforeEach, vi } from 'vitest'
import { onRequestPost } from '../../functions/api/translate.js'

// The handler runs on Cloudflare, which this sandbox cannot reach, so it would
// otherwise ship having never executed. Importing it directly and standing in
// for the two globals it uses — fetch and caches — exercises the validation,
// the cache key and every error path without a deployment.
//
// The rules worth pinning down are the ones that protect the owner: the input
// caps that keep portfolio text and runaway batches out, and the length check
// that stops a short reply from shifting headlines onto the wrong articles.

const req = (body) => new Request('https://walletlens.live/api/translate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

const ctx = (body, env = { ANTHROPIC_API_KEY: 'test-key' }) => ({
  env,
  request: req(body),
  waitUntil: () => {},
})

const claudeReply = (payload) => ({
  ok: true,
  json: async () => ({ content: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] }),
})

let cacheStore

beforeEach(() => {
  vi.restoreAllMocks()
  cacheStore = new Map()
  globalThis.caches = {
    default: {
      match: async (k) => cacheStore.get(k.url) || undefined,
      put: async (k, v) => { cacheStore.set(k.url, v) },
    },
  }
})

describe('/api/translate', () => {
  it('refuses when the key is not configured', async () => {
    const r = await onRequestPost(ctx({ lang: 'ar', texts: ['x'] }, {}))
    expect(r.status).toBe(503)
    expect((await r.json()).error).toBe('not_configured')
  })

  it('rejects a language it does not support', async () => {
    const r = await onRequestPost(ctx({ lang: 'de', texts: ['x'] }))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('unsupported_language')
  })

  it('rejects a batch over the item cap', async () => {
    const texts = Array.from({ length: 25 }, (_, i) => `h${i}`)
    const r = await onRequestPost(ctx({ lang: 'ar', texts }))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('too_many')
  })

  it('rejects text longer than a headline', async () => {
    // The length cap is a privacy guard as much as a cost one: a paragraph of
    // user-entered text should never reach this endpoint, and this is what
    // stops it.
    const r = await onRequestPost(ctx({ lang: 'ar', texts: ['x'.repeat(301)] }))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('text_too_long')
  })

  it('rejects a malformed body', async () => {
    const r = await onRequestPost(ctx('not json'))
    expect(r.status).toBe(400)
  })

  it('rejects an empty list', async () => {
    const r = await onRequestPost(ctx({ lang: 'ar', texts: [] }))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('no_texts')
  })

  it('translates and returns the array in order', async () => {
    globalThis.fetch = vi.fn(async () => claudeReply(['واحد', 'اثنان']))
    const r = await onRequestPost(ctx({ lang: 'ar', texts: ['one', 'two'] }))
    expect(r.status).toBe(200)
    expect((await r.json()).translations).toEqual(['واحد', 'اثنان'])
  })

  it('strips a markdown fence the model may add', async () => {
    globalThis.fetch = vi.fn(async () => claudeReply('```json\n["مرحبا"]\n```'))
    const r = await onRequestPost(ctx({ lang: 'ar', texts: ['hello'] }))
    expect((await r.json()).translations).toEqual(['مرحبا'])
  })

  it('discards a reply whose length does not match the request', async () => {
    // Zipping a short array onto the headlines would put each translation on
    // the wrong article — a silent, plausible-looking corruption.
    globalThis.fetch = vi.fn(async () => claudeReply(['only one']))
    const r = await onRequestPost(ctx({ lang: 'ar', texts: ['a', 'b'] }))
    expect(r.status).toBe(502)
    expect((await r.json()).error).toBe('length_mismatch')
  })

  it('discards a reply that is not an array of strings', async () => {
    globalThis.fetch = vi.fn(async () => claudeReply([{ t: 'nope' }]))
    const r = await onRequestPost(ctx({ lang: 'ar', texts: ['a'] }))
    expect(r.status).toBe(502)
  })

  it('reports an upstream failure rather than pretending to translate', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 429 }))
    const r = await onRequestPost(ctx({ lang: 'ar', texts: ['a'] }))
    expect(r.status).toBe(502)
    expect((await r.json()).error).toBe('upstream_error')
  })

  it('survives the upstream being unreachable', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('dns') })
    const r = await onRequestPost(ctx({ lang: 'ar', texts: ['a'] }))
    expect(r.status).toBe(502)
    expect((await r.json()).error).toBe('upstream_unreachable')
  })

  it('serves a repeat batch from cache without calling the model again', async () => {
    // This is the whole cost argument: the second reader of the same headlines
    // must not spend anything.
    const spy = vi.fn(async () => claudeReply(['عنوان']))
    globalThis.fetch = spy
    const body = { lang: 'ar', texts: ['headline'] }
    const first = await onRequestPost({ ...ctx(body), waitUntil: (p) => p })
    await first.json()
    const second = await onRequestPost(ctx(body))
    expect(spy).toHaveBeenCalledTimes(1)
    expect((await second.json()).translations).toEqual(['عنوان'])
  })

  it('keys the cache by language, so Arabic is not served to a French reader', async () => {
    globalThis.fetch = vi.fn(async () => claudeReply(['عنوان']))
    await (await onRequestPost({ ...ctx({ lang: 'ar', texts: ['h'] }), waitUntil: (p) => p })).json()
    const fr = vi.fn(async () => claudeReply(['titre']))
    globalThis.fetch = fr
    const r = await onRequestPost(ctx({ lang: 'fr', texts: ['h'] }))
    expect(fr).toHaveBeenCalledTimes(1)
    expect((await r.json()).translations).toEqual(['titre'])
  })

  it('sends the target language to the model', async () => {
    const spy = vi.fn(async () => claudeReply(['x']))
    globalThis.fetch = spy
    await onRequestPost(ctx({ lang: 'es', texts: ['a'] }))
    const sent = JSON.parse(spy.mock.calls[0][1].body)
    expect(sent.system).toContain('Spanish')
    expect(sent.model).toBe('claude-haiku-4-5-20251001')
  })
})
