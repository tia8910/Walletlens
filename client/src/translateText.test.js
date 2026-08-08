import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { translateBatch } from './translateText'

// This module spends the site owner's API key and sits in front of the news
// ticker, so the two things worth pinning down are: it never asks for the same
// string twice, and it never leaves the ticker empty when something fails.

const okResponse = (translations) => ({
  ok: true,
  json: async () => ({ translations }),
})

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  delete globalThis.fetch
})

describe('translateBatch', () => {
  it('returns the input untouched for English', async () => {
    const spy = vi.fn()
    globalThis.fetch = spy
    const out = await translateBatch(['BTC hits 65k'], 'en')
    expect(out).toEqual(['BTC hits 65k'])
    expect(spy).not.toHaveBeenCalled()
  })

  it('translates and preserves order', async () => {
    globalThis.fetch = vi.fn(async () => okResponse(['واحد', 'اثنان']))
    const out = await translateBatch(['one', 'two'], 'ar')
    expect(out).toEqual(['واحد', 'اثنان'])
  })

  it('does not call the endpoint twice for a headline it already knows', async () => {
    const spy = vi.fn(async () => okResponse(['مترجم']))
    globalThis.fetch = spy
    await translateBatch(['same headline'], 'ar')
    const out = await translateBatch(['same headline'], 'ar')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(out).toEqual(['مترجم'])
  })

  it('only asks for the strings it is missing', async () => {
    globalThis.fetch = vi.fn(async () => okResponse(['أول']))
    await translateBatch(['first'], 'ar')

    const second = vi.fn(async () => okResponse(['ثاني']))
    globalThis.fetch = second
    const out = await translateBatch(['first', 'second'], 'ar')

    const sent = JSON.parse(second.mock.calls[0][1].body)
    expect(sent.texts).toEqual(['second'])
    expect(out).toEqual(['أول', 'ثاني'])
  })

  it('caches per language, not per string', async () => {
    globalThis.fetch = vi.fn(async () => okResponse(['مرحبا']))
    await translateBatch(['hello'], 'ar')
    const fr = vi.fn(async () => okResponse(['bonjour']))
    globalThis.fetch = fr
    expect(await translateBatch(['hello'], 'fr')).toEqual(['bonjour'])
    expect(fr).toHaveBeenCalledTimes(1)
  })

  it('falls back to English when the endpoint errors', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503 }))
    expect(await translateBatch(['headline'], 'ar')).toEqual(['headline'])
  })

  it('falls back to English when the network throws', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('offline') })
    expect(await translateBatch(['headline'], 'ar')).toEqual(['headline'])
  })

  it('discards a response whose length does not match the request', async () => {
    // The dangerous failure: a short array would shift every headline onto the
    // wrong article rather than simply looking untranslated.
    globalThis.fetch = vi.fn(async () => okResponse(['only one']))
    expect(await translateBatch(['a', 'b', 'c'], 'ar')).toEqual(['a', 'b', 'c'])
  })

  it('does not cache a failure, so a later attempt can still succeed', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    await translateBatch(['headline'], 'ar')
    globalThis.fetch = vi.fn(async () => okResponse(['عنوان']))
    expect(await translateBatch(['headline'], 'ar')).toEqual(['عنوان'])
  })

  it('chunks a long feed rather than exceeding the endpoint cap', async () => {
    const texts = Array.from({ length: 30 }, (_, i) => `headline ${i}`)
    const spy = vi.fn(async (_url, opts) => {
      const { texts: sent } = JSON.parse(opts.body)
      expect(sent.length).toBeLessThanOrEqual(24)
      return okResponse(sent.map(s => 'ar:' + s))
    })
    globalThis.fetch = spy
    const out = await translateBatch(texts, 'ar')
    expect(spy).toHaveBeenCalledTimes(2)
    expect(out[0]).toBe('ar:headline 0')
    expect(out[29]).toBe('ar:headline 29')
  })

  it('survives localStorage being unavailable', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    globalThis.fetch = vi.fn(async () => okResponse(['عنوان']))
    expect(await translateBatch(['headline'], 'ar')).toEqual(['عنوان'])
    getItem.mockRestore(); setItem.mockRestore()
  })

  it('handles an empty list without calling out', async () => {
    const spy = vi.fn()
    globalThis.fetch = spy
    expect(await translateBatch([], 'ar')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})
