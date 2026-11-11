import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { videoHub, videoObject, videoDescription, llmsVideoSection, seoVideos } from '../scripts/videoSeo.mjs'
import { BASE_VIDEOS } from './data/academyVideos'

const here = dirname(fileURLToPath(import.meta.url))
const ORIGIN = 'https://walletlens.live'
// Two catalog lessons, an Arabic short and an unlinked video.
const list = [
  { ...BASE_VIDEOS.find(v => v.key === 'patience-pays'), youtube: 'AAAAAAAAAAA', added: '2026-10-12' },
  { ...BASE_VIDEOS.find(v => v.key === 'crash-sale'), youtube: 'BBBBBBBBBBB', added: '2026-10-05' },
  { key: 'yt-ar', kind: 'story', lang: 'ar', name: 'يعني إيه نظام بونزي؟ #shorts', youtube: 'CCCCCCCCCCC', added: '2026-10-30' },
  { ...BASE_VIDEOS.find(v => v.key === 'stop-loss-skydive'), youtube: '' },
]

describe('video lessons for search engines and AI assistants', () => {
  it('lists every playable video once, and none without a link', () => {
    expect(seoVideos(list).map(v => v.key).sort()).toEqual(['crash-sale', 'patience-pays', 'yt-ar'])
  })

  it('describes a video by the lesson it teaches', () => {
    const v = seoVideos(list).find(x => x.key === 'patience-pays')
    expect(videoDescription(v)).toContain(v.lesson.title)
    expect(videoDescription(seoVideos(list).find(x => x.key === 'yt-ar'))).toMatch(/WalletLens/)
  })

  it('gives each video the fields a VideoObject needs', () => {
    const o = videoObject(seoVideos(list)[0], ORIGIN)
    for (const k of ['name', 'description', 'thumbnailUrl', 'uploadDate', 'embedUrl', 'url']) expect(o[k], k).toBeTruthy()
    expect(o.uploadDate).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/)
    expect(o.embedUrl).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\//)
    expect(videoObject({ ...seoVideos(list)[0], added: undefined }, ORIGIN)).toBe(null)
  })

  it('writes the page with each lesson in words, Arabic marked as Arabic, and clean titles', () => {
    const { bodyHtml, jsonLd, count } = videoHub({ origin: ORIGIN, list })
    expect(count).toBe(3)
    expect((bodyHtml.match(/<h1>/g) || []).length).toBe(1)
    expect(bodyHtml).toContain('<h3>Patience Pays</h3>')
    expect(bodyHtml).toMatch(/<section lang="ar" dir="rtl">/)
    expect(bodyHtml).not.toContain('#shorts')
    expect(bodyHtml).toContain('/academy?video=patience-pays')
    expect(jsonLd[0].numberOfItems).toBe(3)
    expect(jsonLd[0].itemListElement.map(i => i.item['@type'])).toEqual(['VideoObject', 'VideoObject', 'VideoObject'])
  })

  it('fetches nothing from YouTube on the page itself: the thumbnail is named in data only', () => {
    const { bodyHtml } = videoHub({ origin: ORIGIN, list })
    expect(bodyHtml).not.toMatch(/<img|<iframe/)
  })

  it('tells llms.txt what each lesson teaches', () => {
    const s = llmsVideoSection({ origin: ORIGIN, list })
    expect(s).toMatch(/^## Video lessons/)
    expect(s).toContain('[Patience Pays](https://www.youtube.com/watch?v=AAAAAAAAAAA)')
    expect(s).toContain('(Arabic)')
    expect(readFileSync(join(here, '../scripts/prerender.mjs'), 'utf8')).toMatch(/llmsVideoSection\(\{ origin: ORIGIN \}\)/)
  })

  it('keeps the prerendered FAQ in step with the six languages that ship', () => {
    const pre = readFileSync(join(here, '../scripts/prerender.mjs'), 'utf8')
    expect(pre).not.toMatch(/more languages are planned/)
    for (const l of ['French', 'Spanish', 'German', 'Italian']) expect(pre).toContain(l)
  })
})
