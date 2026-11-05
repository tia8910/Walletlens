import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resumeAt, savePosition, wantsCaptions, isPlayError, readRate, WATCHED_AT, RATES } from './components/LessonPlayer'
import { academyCopy } from './data/academyCopy'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('lesson player', () => {
  beforeEach(() => localStorage.clear())

  it('counts a lesson watched once most of it has played, not on opening', () => {
    expect(WATCHED_AT).toBe(0.8)
    const aw = read('components/AcademyWatch.jsx')
    const play = aw.slice(aw.indexOf('const play = (v, source) => {'), aw.indexOf('const onWatched'))
    expect(play).not.toMatch(/markWatched/)
    expect(aw).toMatch(/const onWatched = \(v\) => \{[\s\S]*markWatched\(v\.key\)/)
  })

  it('resumes a long film where it was left, and forgets the place near the end', () => {
    savePosition('film', 300, 1200)
    expect(resumeAt('film')).toBe(300)
    savePosition('film', 1180, 1200)
    expect(resumeAt('film')).toBe(0)
  })

  it('never resumes a short, or a film barely started', () => {
    savePosition('short', 30, 60)
    expect(resumeAt('short')).toBe(0)
    savePosition('film', 8, 1200)
    expect(resumeAt('film')).toBe(0)
  })

  it('turns captions on only when the video speaks another language', () => {
    expect(wantsCaptions('ar', 'en')).toBe(true)
    expect(wantsCaptions('en', 'en')).toBe(false)
    expect(wantsCaptions('all', 'en')).toBe(false)
  })

  it('treats embedding off, removed and private videos as unplayable here', () => {
    for (const code of [2, 5, 100, 101, 150]) expect(isPlayError(code)).toBe(true)
    expect(isPlayError(0)).toBe(false)
  })

  it('remembers a playback speed it offers, and ignores any other', () => {
    expect(readRate()).toBe(1)
    localStorage.setItem('wl_academy_rate', '1.5')
    expect(readRate()).toBe(1.5)
    localStorage.setItem('wl_academy_rate', '3')
    expect(readRate()).toBe(1)
    expect(RATES).toEqual([1, 1.25, 1.5])
  })

  it('has its words in every app language', () => {
    for (const lang of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const c = academyCopy(lang)
      for (const k of ['playErr', 'playNow', 'cancel', 'speed']) expect(typeof c[k], `${lang}.${k}`).toBe('string')
      expect(c.nextIn(3)).toMatch(/3/)
    }
  })

  it('may load YouTube’s player script, and only YouTube’s privacy enhanced player frames', () => {
    for (const p of ['../public/_headers', '../index.html']) {
      const csp = read(p)
      expect(csp, p).toMatch(/script-src [^;]*https:\/\/www\.youtube\.com/)
      expect(csp, p).toMatch(/frame-src [^;]*https:\/\/www\.youtube-nocookie\.com/)
    }
    expect(read('components/LessonPlayer.jsx')).toMatch(/host: 'https:\/\/www\.youtube-nocookie\.com'/)
  })

  it('falls back to the plain embed when the player script cannot load', () => {
    const src = read('components/LessonPlayer.jsx')
    expect(src).toMatch(/setMode\('plain'\)/)
    expect(src).toMatch(/mode === 'plain'[\s\S]*<iframe src=\{embedUrl\(video\.id\)\}/)
  })
})

describe('continue watching and the offline notice', () => {
  beforeEach(() => localStorage.clear())
  it('lists the films left part way, with how far through they are', async () => {
    const { inProgress, savePosition } = await import('./components/LessonPlayer')
    savePosition('film', 300, 1200)
    savePosition('short', 30, 60)
    savePosition('done', 1190, 1200)
    expect(inProgress()).toEqual({ film: 0.25 })
  })
  it('puts a Continue watching row on the Academy, named in every language', () => {
    const aw = read('components/AcademyWatch.jsx')
    expect(aw).toMatch(/resuming\.length > 0 &&[\s\S]*c\.continueW/)
    for (const lang of ['en', 'ar', 'fr', 'es', 'de', 'it']) expect(typeof academyCopy(lang).continueW).toBe('string')
  })
  it('says the device is offline, in every language, and is mounted in both shells', async () => {
    const { OFFLINE_COPY } = await import('./components/OfflineNotice')
    for (const lang of ['en', 'ar', 'fr', 'es', 'de', 'it']) expect(OFFLINE_COPY[lang].msg.length).toBeGreaterThan(10)
    expect((read('App.jsx').match(/<OfflineNotice \/>/g) || []).length).toBe(2)
    expect(read('components/OfflineNotice.jsx')).toMatch(/role="status" aria-live="polite"/)
  })
})
