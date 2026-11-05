import { useEffect, useRef, useState } from 'react'
import { embedUrl } from '../data/academyVideos'

// The Academy's lesson player, on YouTube's own player API so the app knows
// what the video is doing: it marks a lesson watched once most of it has
// played (not when it is opened), resumes a long film where it was left,
// plays the next lesson after a short countdown, offers a playback speed,
// turns captions on when the video is in another language, and shows a clean
// way out to YouTube when a video cannot play here. The API script loads only
// when a lesson opens, and the player stays on the privacy enhanced host. If
// the script cannot load, the plain embed takes over, as before.

const API_SRC = 'https://www.youtube.com/iframe_api'
const API_TIMEOUT_MS = 8000
export const WATCHED_AT = 0.8
export const RATES = [1, 1.25, 1.5]
export const COUNTDOWN_S = 5
const POS_KEY = 'wl_academy_pos'
const RATE_KEY = 'wl_academy_rate'

let apiPromise = null
/** YouTube's player API, loaded once, on first use. Rejects if it cannot load. */
export function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { apiPromise = null; reject(new Error('timeout')) }, API_TIMEOUT_MS)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer)
      try { prev?.() } catch { /* someone else's handler */ }
      resolve(window.YT)
    }
    const s = document.createElement('script')
    s.src = API_SRC
    s.async = true
    s.onerror = () => { clearTimeout(timer); apiPromise = null; s.remove(); reject(new Error('blocked')) }
    document.head.appendChild(s)
  })
  return apiPromise
}

function readJson(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback } catch { return fallback }
}
function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode */ } }

/** Where to start a video: its saved place, for a film long enough to need one. */
export function resumeAt(key, all = readJson(POS_KEY, {})) {
  const at = Number(all?.[key]?.t) || 0
  const dur = Number(all?.[key]?.d) || 0
  return dur >= 120 && at >= 15 && at < dur - 20 ? Math.floor(at) : 0
}
/** Remember the place in a film; forget it near the end. */
export function savePosition(key, t, d, all = readJson(POS_KEY, {})) {
  const next = { ...(all || {}) }
  if (!d || t >= d * 0.95) delete next[key]
  else next[key] = { t: Math.floor(t), d: Math.floor(d) }
  writeJson(POS_KEY, next)
  return next
}
/** How far through each film someone stopped, for the films worth resuming (key → 0..1). */
export function inProgress(all = readJson(POS_KEY, {})) {
  const out = {}
  for (const [key, v] of Object.entries(all || {})) if (resumeAt(key, all) > 0) out[key] = Math.min(1, v.t / v.d)
  return out
}
export const readRate = () => { const r = Number(readJson(RATE_KEY, 1)); return RATES.includes(r) ? r : 1 }

/** Captions on when the words are in a language other than the reader's. */
export const wantsCaptions = (videoLang, lang) => !!videoLang && videoLang !== 'all' && videoLang !== lang

/** YouTube's error codes for "this cannot play here" (embedding off, removed, private). */
export const isPlayError = (code) => [2, 5, 100, 101, 150, 153].includes(Number(code))

export default function LessonPlayer({ video, lang, c, nextVideo, onNext, onWatched, renderError }) {
  const host = useRef(null)
  const player = useRef(null)
  const [mode, setMode] = useState('loading') // loading | api | plain | error
  const [ended, setEnded] = useState(false)
  const [count, setCount] = useState(COUNTDOWN_S)
  const [rate, setRate] = useState(readRate)
  const watchedRef = useRef(false)
  const cbs = useRef({ onWatched, onNext })
  cbs.current = { onWatched, onNext }

  useEffect(() => {
    let live = true
    let tick = null
    watchedRef.current = false
    setEnded(false)
    setMode('loading')
    const markOnce = () => { if (!watchedRef.current) { watchedRef.current = true; cbs.current.onWatched?.(video) } }
    loadYouTubeApi().then((YT) => {
      if (!live || !host.current) return
      const el = document.createElement('div')
      host.current.replaceChildren(el)
      const cc = wantsCaptions(video.lang, lang)
      player.current = new YT.Player(el, {
        host: 'https://www.youtube-nocookie.com',
        videoId: video.id,
        width: '100%', height: '100%',
        playerVars: {
          autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, hl: lang,
          start: resumeAt(video.key),
          ...(cc ? { cc_load_policy: 1, cc_lang_pref: lang } : {}),
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (!live) return
            setMode('api')
            try { e.target.setPlaybackRate(readRate()) } catch { /* rate not offered */ }
            const f = host.current?.querySelector('iframe')
            if (f) { f.title = video.name; f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); f.setAttribute('allowfullscreen', '') }
          },
          onStateChange: (e) => {
            if (!live) return
            const p = e.target
            if (e.data === YT.PlayerState.PLAYING) {
              setEnded(false)
              clearInterval(tick)
              tick = setInterval(() => {
                try {
                  const t = p.getCurrentTime(), d = p.getDuration()
                  if (d > 0 && t / d >= WATCHED_AT) markOnce()
                  savePosition(video.key, t, d)
                } catch { /* player gone */ }
              }, 2000)
            } else {
              clearInterval(tick)
            }
            if (e.data === YT.PlayerState.ENDED) {
              markOnce()
              savePosition(video.key, 1, 1)
              setCount(COUNTDOWN_S)
              setEnded(true)
            }
          },
          onError: (e) => { if (live && isPlayError(e.data)) setMode('error') },
        },
      })
    }).catch(() => {
      // The plain embed reports nothing back, so opening the lesson counts, as it always did.
      if (live) { setMode('plain'); markOnce() }
    })
    return () => {
      live = false
      clearInterval(tick)
      try { player.current?.destroy() } catch { /* already gone */ }
      player.current = null
    }
  }, [video.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // The countdown to the next lesson; any choice stops it.
  useEffect(() => {
    if (!ended || !nextVideo) return
    if (count <= 0) { setEnded(false); cbs.current.onNext?.(); return }
    const t = setTimeout(() => setCount(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [ended, count, nextVideo])

  const pickRate = (r) => {
    setRate(r); writeJson(RATE_KEY, r)
    try { player.current?.setPlaybackRate(r) } catch { /* not ready */ }
  }

  if (mode === 'error') return renderError()
  return (
    <>
      <div className="aw-frame">
        {mode === 'plain'
          ? <iframe src={embedUrl(video.id)} title={video.name} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          : <div ref={host} className="aw-yt-host" />}
        {mode === 'loading' && <span className="aw-spin" aria-hidden="true" />}
        {ended && (
          <div className="aw-ended" role="status">
            {nextVideo ? (
              <>
                <small>{c.upNext}</small>
                <b dir="auto">{nextVideo.name}</b>
                <span className="aw-count" aria-live="polite">{c.nextIn(count)}</span>
                <span className="aw-ended-btns">
                  <button type="button" className="aw-pill solid" onClick={() => { setEnded(false); onNext() }}>{c.playNow}</button>
                  <button type="button" className="aw-pill" onClick={() => setEnded(false)}>{c.cancel}</button>
                </span>
              </>
            ) : (
              <button type="button" className="aw-pill solid" onClick={() => { setEnded(false); try { player.current?.seekTo(0); player.current?.playVideo() } catch { /* gone */ } }}>{c.watchAgain}</button>
            )}
          </div>
        )}
      </div>
      {mode === 'api' && (
        <div className="aw-rates" role="group" aria-label={c.speed}>
          <span>{c.speed}</span>
          {RATES.map(r => (
            <button key={r} type="button" className={r === rate ? 'on' : ''} aria-pressed={r === rate} onClick={() => pickRate(r)}>{r}×</button>
          ))}
        </div>
      )}
    </>
  )
}
