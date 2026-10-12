import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// New Academy videos announce themselves twice: in the bell, from the catalog
// the app ships, and by push from the worker, which reads the same catalog.
// Both must agree on what is new and say it the same way, once.

const DAY = 24 * 60 * 60 * 1000
const TODAY = '2026-03-11'

// Three videos linked and dated; the rest of the catalog stays unlinked.
vi.mock('./data/academyVideos.js', async (orig) => {
  const m = await orig()
  const linked = { 'stop-loss-skydive': ['AAAAAAAAAAA', TODAY], 'crash-sale': ['BBBBBBBBBBB', TODAY], 'howto-ar-zakat': ['CCCCCCCCCCC', TODAY], 'patience-pays': ['DDDDDDDDDDD', '2026-02-01'] }
  const VIDEOS = m.VIDEOS.map(v => (linked[v.key] ? { ...v, youtube: linked[v.key][0], added: linked[v.key][1] } : v))
  return { ...m, VIDEOS, newVideos: (o = {}) => m.newVideos({ ...o, list: o.list || VIDEOS }) }
})

const mod = await import('./data/academyVideos.js')
const { createJobs } = await import('../../workers/push/jobs.js')
const { DEFAULT_PREFS, VIDEO_HOUR, normalizeSub } = await import('../../push-api/notify-logic.js')
const { collectVideos, importItems, readInbox, addToInbox, FEED_CHANNELS } = await import('./notifyInbox.js')
const { hacks } = await import('./data/academyContent.js')

const at = (hour) => { const d = new Date(`${TODAY}T00:00:00Z`); d.setUTCHours(hour, 5, 0, 0); vi.setSystemTime(d); return d.getTime() }
const sub = (over = {}) => normalizeSub({ subscription: { endpoint: 'https://x/y', keys: { p256dh: 'p', auth: 'a' } }, lang: 'en', tz: 0, prefs: { ...DEFAULT_PREFS }, ...over })
function fakeStore(rows) {
  const map = new Map(rows.map(r => [r.key, r.sub]))
  return { map, async all() { return [...map.entries()].map(([key, sub]) => ({ key, sub })) }, async get(k) { return map.get(k) }, async save(k, s) { map.set(k, s) }, async delete(k) { map.delete(k) }, invalidate() {} }
}

let fetched = []
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); fetched = []
  // The worker reads the site's published list; here, the mocked catalog's.
  vi.stubGlobal('fetch', async (url) => { fetched.push(String(url)); return { ok: true, json: async () => ({ videos: mod.publishedVideos(mod.VIDEOS) }) } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('which videos are new', () => {
  it('is the linked ones from the last week, newest first, minus those sent', () => {
    const now = at(12)
    expect(mod.newVideos({ now }).map(v => v.key).sort()).toEqual(['crash-sale', 'stop-loss-skydive'])
    expect(mod.newVideos({ now, lang: 'ar' }).map(v => v.key).sort()).toEqual(['crash-sale', 'howto-ar-zakat', 'stop-loss-skydive'])
    expect(mod.newVideos({ now, sent: ['crash-sale'] }).map(v => v.key)).toEqual(['stop-loss-skydive'])
    expect(mod.newVideos({ now: now + 8 * DAY })).toEqual([])
  })

  it('announces one video by name and lesson, several by count, in every language', () => {
    const now = at(12)
    const [one] = mod.newVideos({ now, sent: ['crash-sale'] })
    expect(mod.videoPush([one], 'ar')).toEqual({ title: '🎬 جديد في الأكاديمية: The Stop Loss Skydive', body: hacks('ar')[1].title, url: '/academy?tab=watch&video=stop-loss-skydive', tag: 'video-stop-loss-skydive' })
    expect(mod.videoPush(mod.newVideos({ now }), 'fr').title).toBe('🎬 2 nouvelles leçons dans l’Académie')
    for (const l of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const n = mod.VIDEO_NOTICE[l]
      expect(`${n.one('x')} ${n.many(2)} ${n.tutorial}`, l).not.toMatch(/[—–]| - /)
    }
  })
})

describe('the bell', () => {
  it('shows each new video once, under Updates, in the reader language', () => {
    const now = at(12)
    expect(FEED_CHANNELS.has('video')).toBe(true)
    const items = collectVideos(mod, now, 'en')
    expect(items.map(x => x.key).sort()).toEqual(['video-crash-sale', 'video-stop-loss-skydive'])
    expect(items[0].i18n.ar.title).toMatch(/^🎬 جديد في الأكاديمية: /)
    expect(importItems(items)).toBe(2)
    expect(importItems(collectVideos(mod, now, 'en'))).toBe(0)
    expect(readInbox().find(x => x.tag === 'video-crash-sale').url).toBe('/academy?tab=watch&video=crash-sale')
  })

  it('does not add a second item when the push got there first', () => {
    const now = at(12)
    addToInbox({ title: 'push', channel: 'video', tag: 'video-crash-sale' })
    importItems(collectVideos(mod, now, 'en'))
    expect(readInbox().filter(x => x.tag === 'video-crash-sale')).toHaveLength(1)
  })
})

describe('the push', () => {
  it('sends once, at the video hour, under the Academy switch', async () => {
    at(VIDEO_HOUR)
    const store = fakeStore([{ key: 'k1', sub: sub() }, { key: 'k2', sub: sub({ prefs: { ...DEFAULT_PREFS, academy: false } }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push([s, p]); return true } })
    await jobs.checkDaily()
    const videos = sent.filter(([, p]) => p.channel === 'video')
    expect(videos).toHaveLength(1)
    expect(videos[0][1].title).toBe('🎬 2 new lessons in the Academy')
    expect(videos[0][1].url).toBe('/academy?tab=watch')
    expect(store.map.get('k1').videosSent.sort()).toEqual(['crash-sale', 'stop-loss-skydive'])
    // Kept through the normalizer, so the next save does not forget them.
    expect(normalizeSub(store.map.get('k1')).videosSent).toHaveLength(2)

    // Next day, same hour: nothing new, nothing sent.
    vi.setSystemTime(Date.now() + DAY)
    await jobs.checkDaily()
    expect(sent.filter(([, p]) => p.channel === 'video')).toHaveLength(1)
  })

  it('reads the list the site publishes, and falls back to the bundled one', async () => {
    at(VIDEO_HOUR)
    await createJobs({ store: fakeStore([{ key: 'k1', sub: sub() }]), send: async () => true }).checkDaily()
    expect(fetched).toEqual(['https://walletlens.live/academy-videos.json'])
    // The published list carries only linked videos, with what the push needs.
    const pub = mod.publishedVideos(mod.VIDEOS)
    expect(pub.map(v => v.key).sort()).toEqual(['crash-sale', 'howto-ar-zakat', 'patience-pays', 'stop-loss-skydive'])
    expect(Object.keys(pub[0]).sort()).toEqual(['added', 'emoji', 'hack', 'key', 'kind', 'lang', 'name', 'q', 'youtube'])

    vi.stubGlobal('fetch', async () => { throw new Error('offline') })
    const sent = []
    await createJobs({ store: fakeStore([{ key: 'k2', sub: sub() }]), send: async (s, p) => { sent.push(p); return true } }).checkDaily()
    expect(sent.filter(p => p.channel === 'video')).toHaveLength(1)
  })

  it('stays quiet at any other hour', async () => {
    at(VIDEO_HOUR - 1)
    const store = fakeStore([{ key: 'k1', sub: sub() }])
    const sent = []
    await createJobs({ store, send: async (s, p) => { sent.push(p); return true } }).checkDaily()
    expect(sent.filter(p => p.channel === 'video')).toHaveLength(0)
    // And does not fetch the list for nothing.
    expect(fetched).toEqual([])
  })
})
