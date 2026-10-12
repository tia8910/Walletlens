import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFeed, matchVideo, merge, norm } from '../scripts/sync-youtube.mjs'
import synced from './data/academyVideoLinks.js'
import { VIDEOS, BASE_VIDEOS } from './data/academyVideos.js'

// Uploading to the channel is the whole job: the Update Videos workflow finds
// the video in the public feed, links it to its lesson, and the app, the bell
// and the push follow. These pin the part that decides which lesson it is.

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf8')

const entry = (id, title, { date = '2026-10-12', short = true, desc = '' } = {}) => `<entry>
  <id>yt:video:${id}</id><yt:videoId>${id}</yt:videoId><title>${title}</title>
  <link rel="alternate" href="https://www.youtube.com/${short ? 'shorts/' : 'watch?v='}${id}"/>
  <published>${date}T15:00:00+00:00</published>
  <media:group><media:title>${title}</media:title><media:description>${desc}</media:description></media:group>
</entry>`
const FEED = `<?xml version="1.0"?><feed>${[
  entry('AAAAAAAAAAA', 'The Stop Loss Skydive 🪂 #shorts'),
  entry('BBBBBBBBBBB', '3am, 100x long… what could go wrong? #shorts'),
  entry('CCCCCCCCCCC', 'Chart Checks Today | a short film about trader life', { short: false }),
  entry('DDDDDDDDDDD', 'Behind the scenes', { desc: 'wl:the-3am-pump and more' }),
  entry('EEEEEEEEEEE', 'Q&amp;A: our first 1,000 users', { short: false }),
  entry('FFFFFFFFFFF', 'الزكاة في محادثة العائلة'),
].join('')}</feed>`

describe('sync from the YouTube channel', () => {
  it('reads every video from the feed', () => {
    const list = parseFeed(FEED)
    expect(list).toHaveLength(6)
    expect(list[0]).toEqual({ id: 'AAAAAAAAAAA', title: 'The Stop Loss Skydive 🪂 #shorts', description: '', added: '2026-10-12', short: true })
    expect(list[2].short).toBe(false)
    expect(list[4].title).toBe('Q&A: our first 1,000 users')
  })

  it('links each to its lesson by title, a wl: tag, or not at all', () => {
    const [a, b, c, d, e, f] = parseFeed(FEED)
    expect(matchVideo(a)).toBe('stop-loss-skydive')
    // The longer name wins: this is the leverage short, not "The 3am Pump".
    expect(matchVideo(b)).toBe('3am-100x-long')
    expect(matchVideo(c)).toBe('chart-checks-today')
    expect(matchVideo(d)).toBe('the-3am-pump')
    expect(matchVideo(e)).toBe(null)
    expect(matchVideo(f)).toBe('howto-ar-zakat')
    expect(norm('The Crash  Sale!')).toBe('the crash sale')
  })

  it('keeps what it found before, adds only what is new, and shows unknown videos as they are', () => {
    const entries = parseFeed(FEED)
    const { next, added } = merge({ channelId: 'UCx', links: { 'crash-sale': { youtube: 'ZZZZZZZZZZZ', added: '2026-10-01' } }, extras: [] }, entries)
    expect(added).toHaveLength(6)
    expect(next.links['crash-sale']).toEqual({ youtube: 'ZZZZZZZZZZZ', added: '2026-10-01' })
    expect(next.links['stop-loss-skydive']).toEqual({ youtube: 'AAAAAAAAAAA', added: '2026-10-12' })
    expect(next.extras).toEqual([{ key: 'yt-EEEEEEEEEEE', kind: 'original', name: 'Q&A: our first 1,000 users', emoji: '🎬', lang: 'en', youtube: 'EEEEEEEEEEE', added: '2026-10-12', wide: true }])
    // A second run over the same feed changes nothing.
    expect(merge(next, entries).added).toEqual([])
  })

  it('feeds the catalog the app, the bell and the push all read', () => {
    expect(synced).toHaveProperty('links')
    expect(VIDEOS.length).toBe(BASE_VIDEOS.length + (synced.extras || []).length)
    const flow = read('../../.github/workflows/update-videos.yml')
    expect(flow).toContain('node scripts/sync-youtube.mjs')
    expect(flow).toContain('gh workflow run deploy-site.yml --ref main')
    expect(flow).toContain('actions: write')
    // The push worker redeploys itself when its own code changes.
    const workers = read('../../.github/workflows/deploy-workers.yml')
    expect(workers).toMatch(/push:\n    branches: \[ main \]/)
    expect(workers).toContain("inputs.worker || 'push'")
  })
})
