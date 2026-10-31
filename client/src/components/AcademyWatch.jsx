import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'
import { noteMoment } from '../reviewPrompt'
import { useLanguage } from '../LanguageContext'
import { academyVideos, lessonOrder, newestLesson, embedUrl, watchUrl, isLesson, COURSES, ACTIONS, inLang, YT_SUBSCRIBE } from '../data/academyVideos'
import { academyCopy, posterFor } from '../data/academyCopy'
import { readWatched, markWatched, WATCHED_EVENT } from '../academyProgress'
import { inAppShell, shellVersion } from '../nativeShell'

// The Academy, built around the video lessons on the WalletLens channel:
// the newest episode, progress through the lessons, the courses as shelves,
// the tutorials, and the reading (hacks and articles) after them. No points,
// no games: a lesson is watched, its takeaway is read, and a button opens the
// part of the app that puts it to work.

const PlayIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill={color} /></svg>
)
const Chevron = () => (
  <svg className="aw-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
)
const YT_PLAY = <svg width="18" height="13" viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" rx="5" fill="#e00030" /><path d="M11 5.5v9l8-4.5z" fill="#fff" /></svg>
const YT_ICON = <svg width="20" height="14" viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" rx="5" fill="#e00030" /><path d="M11 5.5v9l8-4.5z" fill="#fff" /></svg>

/** A painted scene standing in for a thumbnail: no image is fetched from YouTube until play. */
export function Poster({ video, className = '' }) {
  return <span className={`aw-poster p-${posterFor(video.key, video.poster)} ${className}`} aria-hidden="true"><i /></span>
}

function useWatched() {
  const [watched, setWatched] = useState(readWatched)
  useEffect(() => {
    const sync = () => setWatched(readWatched())
    window.addEventListener(WATCHED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(WATCHED_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  return watched
}

function Player({ video, c, lang, onNext, nextVideo, onClose }) {
  const navigate = useNavigate()
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  const act = video.act && ACTIONS[video.act]
  // The first app shell (webview-1) sent any navigation inside a frame to a
  // browser tab, so YouTube's player died there; from webview-2 the frame
  // loads in place and the lesson plays inline like everywhere else.
  const shell = inAppShell() && shellVersion() === 'webview-1'
  // In the app a link with a target opens nothing, so the page itself goes
  // there: the shell hands any outside address to a browser tab or YouTube.
  const openOnYoutube = (e) => {
    track('academy_open_youtube', { video: video.key, shell })
    if (!shell) return
    e?.preventDefault?.()
    try { window.location.href = watchUrl(video.id) } catch { /* nothing to open with */ }
  }
  const course = COURSES.find(x => x.id === video.course)
  return (
    <div className="aw-player" role="dialog" aria-modal="true" aria-label={video.name} onClick={onClose}>
      <div className={`aw-player-card ${video.wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <button type="button" className="aw-close" onClick={onClose} aria-label={c.close} title={c.close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {/* The first Android app cannot load YouTube's player in a frame (it
            shows its broken page there), so in that app the lesson opens on
            YouTube itself; everywhere else, newer apps included, it plays here. */}
        {shell ? (
          <button type="button" className="aw-frame aw-frame-out" onClick={openOnYoutube}>
            <Poster video={video} />
            <span className="aw-frame-out-btn">{YT_PLAY}{c.playYt}</span>
          </button>
        ) : (
          <div className="aw-frame">
            <iframe src={embedUrl(video.id)} title={video.name} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          </div>
        )}
        <div className="aw-after">
          <div className="aw-head">
            {course && <span className="aw-over">{inLang(course.name, lang)}</span>}
            <b className="aw-name" dir="auto">{video.name}</b>
          </div>
          {video.lesson && (
            <div className="aw-takeaway">
              <span className="aw-over muted">{c.takeaway}</span>
              <b>{video.lesson.title}</b>
              <p>{video.lesson.body}</p>
            </div>
          )}
          {act && (
            <button type="button" className="aw-try" onClick={() => { track('academy_try_it', { video: video.key, act: video.act }); onClose(); navigate(act.path, act.state ? { state: act.state } : undefined) }}>
              <span className="aw-try-ic" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
              <span className="aw-try-txt"><b>{c.tryIt}</b><small>{inLang(act.label, lang)}</small></span>
              <Chevron />
            </button>
          )}
          {nextVideo && (
            <button type="button" className="aw-upnext" onClick={onNext}>
              <Poster video={nextVideo} className="sm" />
              <span className="aw-upnext-txt"><small>{c.upNext}</small><b dir="auto">{nextVideo.name}</b></span>
              <span className="aw-pill">{c.next}</span>
            </button>
          )}
          <a className="aw-yt" href={watchUrl(video.id)} target="_blank" rel="noopener noreferrer" onClick={openOnYoutube}>{YT_PLAY}{c.watchYt}</a>
          <small className="aw-foot">{c.source} · {c.advice}</small>
        </div>
      </div>
    </div>
  )
}

function Tile({ v, watched, c, onPlay }) {
  return (
    <button type="button" className="aw-tile" onClick={() => onPlay(v, 'shelf')}>
      <Poster video={v} />
      <span className="aw-tile-kind">{v.kind === 'original' ? c.film : c.short}</span>
      {watched.has(v.key) && (
        <span className="aw-tile-done" aria-label={c.watched}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
        </span>
      )}
      <span className="aw-tile-txt"><b dir="auto">{v.name}</b>{v.lesson && <small>{v.lesson.title}</small>}</span>
    </button>
  )
}

function CoursePage({ course, list, watched, c, lang, onPlay, onBack }) {
  const done = list.filter(v => watched.has(v.key)).length
  const next = list.find(v => !watched.has(v.key)) || list[0]
  return (
    <div className="aw">
      <button type="button" className="aw-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>{c.title}
      </button>
      <div className="aw-course-hero">
        <span className="aw-over">{c.course}</span>
        <b>{inLang(course.name, lang)}</b>
        <p>{inLang(course.sub, lang)}</p>
        <div className="aw-bar dark"><i style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
        <small>{c.courseProgress(done, list.length)}</small>
        {next && <button type="button" className="aw-cta" onClick={() => onPlay(next, 'course_continue')}><PlayIcon color="#052e14" />{done ? c.continueCourse : c.watch}</button>}
      </div>
      <div className="aw-list">
        {list.map((v, i) => (
          <button key={v.key} type="button" className="aw-row" onClick={() => onPlay(v, 'course')}>
            <span className="aw-row-thumb"><Poster video={v} className="sm" /><span className="aw-row-play"><PlayIcon size={10} color="#0f1d2b" /></span></span>
            <span className="aw-row-txt"><small>{c.lesson(i + 1)}</small><b dir="auto">{v.name}</b>{v.lesson && <span className="muted">{v.lesson.title}</span>}</span>
            {watched.has(v.key) && <span className="aw-row-done" aria-label={c.watched}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg></span>}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AcademyWatch({ openKey = null, onOpened, onOpenHacks, onOpenArticles, hackCount = 0 }) {
  const { lang } = useLanguage()
  const c = academyCopy(lang)
  const watched = useWatched()
  const all = academyVideos(lang)
  const order = lessonOrder(lang)
  const featured = newestLesson(lang)
  const howtos = all.filter(v => v.kind === 'howto')
  const shelves = COURSES.map(course => ({ course, list: order.filter(v => v.course === course.id) })).filter(s => s.list.length)
  const loose = order.filter(v => !COURSES.some(x => x.id === v.course) && v.kind !== 'original')
  // Full-length channel videos have no course. Kept out of "More lessons" with
  // the shorts, they were on no shelf at all: counted in the progress total but
  // reachable only when one happened to be the featured episode.
  const films = order.filter(v => !COURSES.some(x => x.id === v.course) && v.kind === 'original')
  const [playing, setPlaying] = useState(null)
  const [courseId, setCourseId] = useState(null)

  const play = (v, source) => {
    setPlaying(v)
    // Finishing the last unwatched lesson of a course is a moment worth
    // noticing (and the one point the app may ask for a rating).
    const shelf = shelves.find(s => s.course.id === v.course)?.list || []
    const finishes = !watched.has(v.key) && shelf.length > 1 && shelf.every(x => x.key === v.key || watched.has(x.key))
    markWatched(v.key)
    if (finishes) { noteMoment('achievement'); track('academy_course_done', { course: v.course }) }
    track('academy_video_play', { video: v.key, kind: v.kind, source })
  }

  // A notification, the Home card or a hack card asked for one video.
  useEffect(() => {
    if (!openKey) return
    const v = all.find(x => x.key === openKey)
    if (v) play(v, 'link')
    onOpened?.()
  }, [openKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.classList.toggle('wl-aw-open', !!playing)
    return () => document.documentElement.classList.remove('wl-aw-open')
  }, [playing])

  // Up next: the following unwatched lesson in course order, else the following one.
  const nextOf = (v) => {
    if (!v || !isLesson(v)) return null
    const i = order.findIndex(x => x.key === v.key)
    const after = [...order.slice(i + 1), ...order.slice(0, Math.max(i, 0))]
    return after.find(x => !watched.has(x.key) && x.key !== v.key) || null
  }
  const done = order.filter(v => watched.has(v.key)).length
  const upNext = order.find(v => !watched.has(v.key))

  const reading = (
    <section className="aw-sec">
      <h3 className="aw-h">{c.read}</h3>
      <div className="aw-list">
        <button type="button" className="aw-row" onClick={onOpenHacks}>
          <span className="aw-row-txt"><b>{c.hacks}</b><span className="muted">{c.hacksSub(hackCount)}</span></span><Chevron />
        </button>
        <button type="button" className="aw-row" onClick={onOpenArticles}>
          <span className="aw-row-txt"><b>{c.articles}</b><span className="muted">{c.articlesSub}</span></span><Chevron />
        </button>
      </div>
    </section>
  )
  const channel = (
    <a className="aw-channel" href={YT_SUBSCRIBE} target="_blank" rel="noopener noreferrer" onClick={() => track('academy_channel_click', { lang })}>
      <span className="aw-channel-ic">{YT_ICON}</span>
      <span className="aw-channel-txt"><b>{c.subT}</b><small>{c.subS}</small></span>
      <span className="aw-channel-sub">{c.subscribe}</span>
    </a>
  )
  const player = playing && (
    <Player video={playing} c={c} lang={lang} nextVideo={nextOf(playing)}
      onNext={() => play(nextOf(playing), 'next')} onClose={() => setPlaying(null)} />
  )

  const course = courseId && shelves.find(s => s.course.id === courseId)
  if (course) {
    return <>
      <CoursePage course={course.course} list={course.list} watched={watched} c={c} lang={lang} onPlay={play} onBack={() => setCourseId(null)} />
      {player}
    </>
  }

  return (
    <div className="aw">
      {featured ? (
        <button type="button" className="aw-hero" onClick={() => play(featured, 'featured')}>
          <span className="aw-hero-art"><Poster video={featured} className="lg" /><span className="aw-hero-tag">{c.newEp}</span><span className="aw-hero-play"><PlayIcon size={20} color="#0f1d2b" /></span></span>
          <span className="aw-hero-txt">
            <b dir="auto">{featured.name}</b>
            {featured.lesson && <span>{featured.lesson.title}</span>}
            <small>{[inLang(COURSES.find(x => x.id === featured.course)?.name, lang), featured.kind === 'original' ? c.film : c.short].filter(Boolean).join(' · ')}</small>
          </span>
        </button>
      ) : (
        <div className="glass-card aw-empty"><b>{c.comingT}</b><p>{c.comingS}</p></div>
      )}

      {order.length > 0 && (
        <div className="aw-progress">
          <div className="aw-progress-top"><b>{c.progressH}</b><small>{c.progress(done, order.length)}</small></div>
          <div className="aw-bar"><i style={{ width: `${(done / order.length) * 100}%` }} /></div>
          {upNext
            ? <button type="button" className="aw-link" onClick={() => play(upNext, 'up_next')}><PlayIcon />{c.upNext}: <span dir="auto">{upNext.name}</span></button>
            : <small className="muted">{c.allDone}</small>}
        </div>
      )}

      {shelves.map(({ course, list }) => (
        <section key={course.id} className="aw-sec">
          <div className="aw-sec-head">
            <span><h3 className="aw-h">{inLang(course.name, lang)}</h3><small className="muted">{inLang(course.sub, lang)}</small></span>
            <button type="button" className="aw-link" onClick={() => { setCourseId(course.id); track('academy_course_open', { course: course.id }) }}>{c.seeAll}</button>
          </div>
          <div className="aw-shelf">{list.map(v => <Tile key={v.key} v={v} watched={watched} c={c} onPlay={play} />)}</div>
        </section>
      ))}

      {films.length > 0 && (
        <section className="aw-sec">
          <h3 className="aw-h">{c.films}</h3>
          <div className="aw-shelf">{films.map(v => <Tile key={v.key} v={v} watched={watched} c={c} onPlay={play} />)}</div>
        </section>
      )}

      {loose.length > 0 && (
        <section className="aw-sec">
          <h3 className="aw-h">{c.more}</h3>
          <div className="aw-shelf">{loose.map(v => <Tile key={v.key} v={v} watched={watched} c={c} onPlay={play} />)}</div>
        </section>
      )}

      {howtos.length > 0 && (
        <section className="aw-sec">
          <h3 className="aw-h">{c.howto}</h3>
          <div className="aw-how-grid">
            {howtos.map(v => (
              <button key={v.key} type="button" className="aw-how" onClick={() => play(v, 'howto')}>
                <span className="aw-how-ic"><PlayIcon /></span><b dir="auto">{v.name}</b>
              </button>
            ))}
          </div>
        </section>
      )}

      {reading}
      {channel}
      {player}
    </div>
  )
}
