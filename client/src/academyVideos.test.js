import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VIDEOS, BASE_VIDEOS, youtubeId, academyVideos, videoForHack, embedUrl, YT_CHANNEL, COURSES, ACTIONS, inLang, lessonOrder, newestLesson, homeLesson } from './data/academyVideos'
import { HACK_TEXT } from './data/academyContent'
import { ACADEMY_COPY, posterFor, POSTERS } from './data/academyCopy'
import { readWatched, markWatched, WATCHED_KEY } from './academyProgress'

// The Academy is the video lessons on the WalletLens channel: courses as
// shelves, a takeaway and a "Try it in WalletLens" action after each, and
// progress counted in lessons watched. No points, badges or games.

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf8')
const LANGS = ['en', 'ar', 'fr', 'es', 'de', 'it']
const linked = (ids) => BASE_VIDEOS.map(v => ({ ...v, youtube: ids[v.key]?.[0] || '', added: ids[v.key]?.[1] }))

describe('the catalog', () => {
  it('reads a video id from every shape of YouTube link', () => {
    for (const link of ['https://youtube.com/shorts/AbCdEfGhIj0', 'https://www.youtube.com/watch?v=AbCdEfGhIj0&t=3s', 'https://youtu.be/AbCdEfGhIj0', 'https://www.youtube.com/embed/AbCdEfGhIj0', 'AbCdEfGhIj0']) {
      expect(youtubeId(link), link).toBe('AbCdEfGhIj0')
    }
    expect(youtubeId('https://youtube.com/@walletlens')).toBe('')
  })

  it('puts every lesson on a course, with a lesson and an action that exist', () => {
    const keys = new Set()
    for (const v of BASE_VIDEOS) {
      expect(keys.has(v.key), v.key).toBe(false); keys.add(v.key)
      if (v.kind === 'howto') continue
      expect(COURSES.map(c => c.id), v.key).toContain(v.course)
      expect(HACK_TEXT.en[v.hack], v.key).toBeTruthy()
      expect(ACTIONS[v.act], v.key).toBeTruthy()
      expect(v).not.toHaveProperty('q')
    }
  })

  it('names every course and action in every language, without dashes', () => {
    for (const lang of LANGS) {
      for (const c of COURSES) {
        expect(c.name[lang], `${c.id} ${lang}`).toBeTruthy()
        expect(`${c.name[lang]} ${c.sub[lang]}`).not.toMatch(/[—–]| - /)
      }
      for (const [id, a] of Object.entries(ACTIONS)) {
        expect(a.label[lang], `${id} ${lang}`).toBeTruthy()
        expect(a.label[lang]).not.toMatch(/[—–]| - /)
      }
    }
    expect(inLang({ en: 'x' }, 'zz')).toBe('x')
  })

  it('opens real app screens from "Try it"', () => {
    const app = read('./App.jsx')
    for (const a of Object.values(ACTIONS)) expect(app, a.path).toContain(`path="${a.path}"`)
  })

  it('shows only linked videos, the reader language first, with the lesson in that language', () => {
    expect(academyVideos('en', BASE_VIDEOS.map(v => ({ ...v, youtube: '' })))).toEqual([])
    const list = linked({ 'stop-loss-skydive': ['AAAAAAAAAAA'], 'howto-five-apps': ['BBBBBBBBBBB'], 'howto-ar-zakat': ['CCCCCCCCCCC'] })
    expect(academyVideos('en', list).map(v => v.key)).toEqual(['stop-loss-skydive', 'howto-five-apps'])
    const ar = academyVideos('ar', list)
    expect(ar.map(v => v.key)).toEqual(['howto-ar-zakat', 'stop-loss-skydive'])
    expect(ar[1].lesson.title).toBe(HACK_TEXT.ar[1][0])
    expect(ar[1]).not.toHaveProperty('question')
  })

  it('finds the video for a hack card once it is linked', () => {
    expect(videoForHack(0, BASE_VIDEOS)).toBe(null)
    expect(videoForHack(0, linked({ 'hack-buy-in-thirds': ['DDDDDDDDDDD'] }))?.key).toBe('hack-buy-in-thirds')
  })

  it('plays from the privacy enhanced player, the one extra frame source the CSP allows', () => {
    expect(embedUrl('AAAAAAAAAAA')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/AAAAAAAAAAA\?/)
    expect(read('../public/_headers')).toContain('https://www.youtube-nocookie.com')
    expect(YT_CHANNEL).toBe('https://www.youtube.com/@walletlens')
  })

  it('loads in plain Node, which the build step that publishes it runs in', () => {
    expect(read('./data/academyVideos.js')).toContain("from './academyContent.js'")
    expect(read('../scripts/prerender.mjs')).toContain("writeFileSync(resolve(DIST, 'academy-videos.json')")
  })
})

describe('what to watch', () => {
  const list = linked({
    'patience-pays': ['AAAAAAAAAAA', '2026-10-12'],
    'stop-loss-skydive': ['BBBBBBBBBBB', '2026-10-01'],
    'crash-sale': ['CCCCCCCCCCC', '2026-10-05'],
  })

  it('orders lessons by course: mindset, risk, then buying and selling', () => {
    expect(lessonOrder('en', list).map(v => v.key)).toEqual(['patience-pays', 'stop-loss-skydive', 'crash-sale'])
  })

  it('features the newest lesson', () => {
    expect(newestLesson('en', list).key).toBe('patience-pays')
  })

  it('offers Home the newest lesson, then the next unwatched one, then nothing', () => {
    expect(homeLesson(new Set(), 'en', list)).toMatchObject({ video: { key: 'patience-pays' }, isNew: true })
    expect(homeLesson(new Set(['patience-pays']), 'en', list)).toMatchObject({ video: { key: 'stop-loss-skydive' }, isNew: false })
    expect(homeLesson(new Set(['patience-pays', 'stop-loss-skydive', 'crash-sale']), 'en', list)).toBe(null)
    expect(homeLesson(new Set(), 'en', BASE_VIDEOS)).toBe(null)
  })
})

describe('progress', () => {
  beforeEach(() => localStorage.clear())

  it('counts lessons watched on this device, once each', () => {
    expect(readWatched().size).toBe(0)
    markWatched('patience-pays'); markWatched('patience-pays')
    expect([...readWatched()]).toEqual(['patience-pays'])
    expect(Object.keys(JSON.parse(localStorage.getItem(WATCHED_KEY)))).toEqual(['patience-pays'])
  })

  it('keeps what the old Academy recorded as watched', () => {
    localStorage.setItem('wl_academy_v1', JSON.stringify({ iq: 75, watched: { 'crash-sale': 1 } }))
    expect(readWatched().has('crash-sale')).toBe(true)
  })
})

describe('the Academy has no points or games', () => {
  const page = read('./pages/Academy.jsx')
  const watch = read('./components/AcademyWatch.jsx')

  it('drops the IQ, badges, streaks, daily challenge, wheel and guessr', () => {
    for (const gone of ['KnowledgeWheel', 'CryptoGuessr', 'ACHIEVEMENTS', 'getRank', 'startChallenge', 'acad-iq', 'VIDEO_QUIZ_IQ', 'onQuiz']) {
      expect(page + watch, gone).not.toContain(gone)
    }
    const content = read('./data/academyContent.js')
    for (const gone of ['ACHIEVEMENT_TEXT', 'QUESTION_TEXT', 'GUESSR_META', 'export function questions']) expect(content, gone).not.toContain(gone)
    expect(read('../../workers/push/jobs.js')).not.toContain('pickChallenge')
  })

  it('keeps the hacks, with their deep link and share, and the articles', () => {
    expect(page).toContain("get('hack')")
    expect(page).toContain('shareHackToX')
    expect(page).toContain("view === 'articles'")
  })

  it('shows the takeaway and a way to try it after a lesson', () => {
    expect(watch).toContain('c.takeaway')
    expect(watch).toContain('c.tryIt')
    expect(watch).toContain('navigate(act.path')
  })

  it('puts the latest lesson on Home', () => {
    expect(read('./pages/Dashboard.jsx')).toContain('<LatestLesson />')
    const card = read('./components/LatestLesson.jsx')
    // The catalog is loaded after Home paints, not bundled into it.
    expect(card).toContain("import('../data/academyVideos')")
    expect(card).not.toMatch(/^import .*academyVideos/m)
  })

  it('has its words in every language, without dashes, and a poster for every video', () => {
    for (const lang of LANGS) {
      const c = ACADEMY_COPY[lang]
      expect(Object.keys(c).sort(), lang).toEqual(Object.keys(ACADEMY_COPY.en).sort())
      const text = Object.values(c).map(x => (typeof x === 'function' ? x(2, 5) : x)).join(' ')
      expect(text, lang).not.toMatch(/[—–]| - /)
    }
    for (const v of VIDEOS) expect(POSTERS).toContain(posterFor(v.key))
  })

  it('leaves no file behind from the games', () => {
    expect(existsSync(join(here, 'components/KnowledgeWheel.jsx'))).toBe(false)
  })

  it('opens the lesson on YouTube inside the Android app, whose WebView cannot frame the player', () => {
    // The shell's WebView shows its broken page in the player's frame, so the
    // app gets a play button that leaves for YouTube, and every player keeps
    // a "Watch on YouTube" link in case the embed fails.
    expect(watch).toContain("inAppShell() && shellVersion() === 'webview-1'")
    // The shell that fixes frames says so, and the site plays inline there.
    const bridge = read('../../walletlens_source/release_package/app/src/main/java/live/walletlens/twa/WalletLensBridge.java')
    expect(bridge).toContain('return "webview-2"')
    const shellSrc = read('../../walletlens_source/release_package/app/src/main/java/live/walletlens/twa/AppShellActivity.java')
    expect(shellSrc).toContain('if (!request.isForMainFrame()) return false;')
    expect(shellSrc).toContain('public void onShowCustomView(')
    expect(watch).toContain('window.location.href = watchUrl(video.id)')
    expect(watch).toMatch(/className="aw-yt" href=\{watchUrl\(video\.id\)\}/)
  })

  it('lets the lesson player through every policy on walletlens.live, the edge worker included', () => {
    // The preview played and the live site blocked the frame: walletlens.live
    // alone passes through the security headers worker, whose CSP said
    // frame-src 'none'. Every copy must allow the player.
    // The directive itself, not a comment that mentions it.
    const frameSrc = (txt) => /frame-src (https:[^;"\n]*)/.exec(txt)?.[1] || ''
    for (const f of ['../public/_headers', '../index.html', '../../workers/security-headers/index.js']) {
      expect(frameSrc(read(f)), f).toContain('https://www.youtube-nocookie.com')
    }
  })
})
