import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VIDEOS, youtubeId, academyVideos, videoForHack, embedUrl, YT_CHANNEL } from './data/academyVideos'
import { HACK_TEXT, QUESTION_TEXT, ACHIEVEMENT_TEXT } from './data/academyContent'
import { WATCH_COPY } from './components/AcademyWatch'

// The Academy's video lessons play from the WalletLens YouTube channel. A
// video shows once its link is filled in, and its lesson line and quiz come
// from the hack and question banks every language already has.

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf8')
const withIds = (ids) => VIDEOS.map(v => (ids[v.key] ? { ...v, youtube: ids[v.key] } : v))

describe('academy videos', () => {
  it('reads a video id from every shape of YouTube link', () => {
    for (const link of ['https://youtube.com/shorts/AbCdEfGhIj0', 'https://www.youtube.com/watch?v=AbCdEfGhIj0&t=3s', 'https://youtu.be/AbCdEfGhIj0', 'https://www.youtube.com/embed/AbCdEfGhIj0', 'AbCdEfGhIj0']) {
      expect(youtubeId(link), link).toBe('AbCdEfGhIj0')
    }
    expect(youtubeId('')).toBe('')
    expect(youtubeId('https://youtube.com/@walletlens')).toBe('')
  })

  it('pairs every lesson with a real hack and question', () => {
    const keys = new Set()
    for (const v of VIDEOS) {
      expect(keys.has(v.key), v.key).toBe(false); keys.add(v.key)
      if (v.kind === 'howto') continue
      expect(HACK_TEXT.en[v.hack], v.key).toBeTruthy()
      expect(QUESTION_TEXT.en[v.q], v.key).toBeTruthy()
    }
  })

  it('shows only videos with a link, in the reader language first', () => {
    expect(academyVideos('en', VIDEOS.map(v => ({ ...v, youtube: '' })))).toEqual([])
    const list = withIds({ 'stop-loss-skydive': 'https://youtu.be/AAAAAAAAAAA', 'howto-five-apps': 'BBBBBBBBBBB', 'howto-ar-zakat': 'CCCCCCCCCCC' })
    const en = academyVideos('en', list)
    expect(en.map(v => v.key)).toEqual(['stop-loss-skydive', 'howto-five-apps'])
    expect(en[0].lesson.title).toBe(HACK_TEXT.en[1][0])
    expect(en[0].question.q).toBe(QUESTION_TEXT.en[11][0])
    // Arabic readers get the Arabic tutorial first, and the lesson in Arabic.
    const ar = academyVideos('ar', list)
    expect(ar.map(v => v.key)).toEqual(['howto-ar-zakat', 'stop-loss-skydive'])
    expect(ar[1].lesson.title).toBe(HACK_TEXT.ar[1][0])
  })

  it('finds the video for a hack card once it is linked', () => {
    expect(videoForHack(0, VIDEOS.map(v => ({ ...v, youtube: '' })))).toBe(null)
    expect(videoForHack(0, withIds({ 'hack-buy-in-thirds': 'DDDDDDDDDDD' }))?.key).toBe('hack-buy-in-thirds')
  })

  it('plays from the privacy enhanced player, the one extra frame source the CSP allows', () => {
    expect(embedUrl('AAAAAAAAAAA')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/AAAAAAAAAAA\?/)
    expect(read('../public/_headers')).toContain('https://www.youtube-nocookie.com')
    expect(YT_CHANNEL).toBe('https://www.youtube.com/@walletlens')
  })

  it('has the tab and the new badges in every language, without dashes', () => {
    for (const lang of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const c = WATCH_COPY[lang]
      expect(Object.keys(c).sort(), lang).toEqual(Object.keys(WATCH_COPY.en).sort())
      expect(Object.values(c).join(' '), lang).not.toMatch(/[—–]| - /)
      for (const id of ['first_watch', 'binge_learner', 'full_course']) expect(ACHIEVEMENT_TEXT[lang][id], `${lang} ${id}`).toBeTruthy()
    }
  })

  it('is wired into the Academy as its own tab with IQ for the quiz', () => {
    const page = read('./pages/Academy.jsx')
    expect(page).toContain("{ id: 'watch',")
    expect(page).toContain('<AcademyWatch store={store} onWatch={handleVideoWatch} onQuiz={handleVideoQuiz}')
    expect(page).toContain("if (prev.vquiz?.[v.key]) return prev")
  })

  it('loads in plain Node, which the build step that publishes it runs in', () => {
    // Node needs the extension; without it the prerender crashed and took the
    // whole site build with it.
    expect(read('./data/academyVideos.js')).toContain("from './academyContent.js'")
    expect(read('../scripts/prerender.mjs')).toContain("writeFileSync(resolve(DIST, 'academy-videos.json')")
  })
})
