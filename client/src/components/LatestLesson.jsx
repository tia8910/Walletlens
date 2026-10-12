import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { academyCopy, posterFor } from '../data/academyCopy'
import { readWatched, WATCHED_EVENT } from '../academyProgress'

// Home's lesson card: the newest Academy lesson while it is unwatched, then
// the next unwatched one, and nothing once every lesson has been watched.
// The catalog loads after Home has painted; it carries the Academy's lesson
// text, which has no place in the first screen.

export default function LatestLesson() {
  const { lang } = useLanguage()
  const c = academyCopy(lang)
  const navigate = useNavigate()
  const [mod, setMod] = useState(null)
  const [watched, setWatched] = useState(readWatched)

  useEffect(() => {
    let live = true
    import('../data/academyVideos').then(m => { if (live) setMod(m) }).catch(() => {})
    const sync = () => setWatched(readWatched())
    window.addEventListener(WATCHED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { live = false; window.removeEventListener(WATCHED_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])

  const pick = mod?.homeLesson(watched, lang)
  if (!pick) return null
  const { video, isNew } = pick
  const open = () => {
    track('home_lesson_click', { video: video.key, isNew })
    navigate(`/academy?video=${encodeURIComponent(video.key)}`)
  }

  return (
    <button type="button" className="nl-card nl-lesson" onClick={open}>
      <span className={`aw-poster p-${posterFor(video.key, video.poster)} nl-lesson-art`} aria-hidden="true">
        <i />
        <span className="nl-lesson-play"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#0f1d2b" /></svg></span>
      </span>
      <span className="nl-lesson-txt">
        <span className="nl-lesson-over">{isNew ? c.newLesson : c.upNext}</span>
        <b dir="auto">{video.name}</b>
        {video.lesson && <span className="nl-lesson-line">{video.lesson.title}</span>}
        <span className="nl-lesson-foot">
          <small>{c.title} · {video.kind === 'original' ? c.film : c.short}</small>
          <span className="nl-lesson-btn">{c.watch}</span>
        </span>
      </span>
    </button>
  )
}
