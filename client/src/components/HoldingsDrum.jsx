import { useEffect, useRef, useState } from 'react'
import { AssetLogo } from './HomeTop'

// The balance card's right side: a drum that rolls through every holding,
// each with its logo, ticker and today's move, in place of three logos and
// "+N". Tap pauses it with the front holding squared up; tap again rolls on.
//
// Driven by requestAnimationFrame so a pause can stop on a whole face. It
// does nothing while off screen or in a background tab. With reduced motion
// it stands still and each tap steps to the next holding.

export const DRUM_MAX = 10
const FACE_H = 34
const SECONDS_PER_FACE = 1.9

/** The faces the drum shows: the largest holdings, then "+N" for the rest. Pure, for the test. */
export function drumFaces(holdings, max = DRUM_MAX) {
  const list = (holdings || []).filter(h => h && h.coin_id)
  if (list.length <= max) return list.map(h => ({ h }))
  return [...list.slice(0, max - 1).map(h => ({ h })), { more: list.length - (max - 1) }]
}

/** The face nearest the front at a given angle (degrees). Pure, for the test. */
export function frontFace(angle, n) {
  if (!(n > 0)) return 0
  const step = 360 / n
  return ((Math.round(angle / step) % n) + n) % n
}

const pctTxt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

export default function HoldingsDrum({ holdings = [], label = 'Holdings' }) {
  const faces = drumFaces(holdings)
  const n = faces.length
  const cyl = useRef(null)
  const box = useRef(null)
  const angle = useRef(0)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const step = n ? 360 / n : 0
  const R = n > 2 ? FACE_H / (2 * Math.tan(Math.PI / n)) + 3 : 0

  const paint = (a) => { if (cyl.current) cyl.current.style.transform = `translateZ(${-R}px) rotateX(${-a}deg)` }

  useEffect(() => {
    if (n < 3) return undefined
    paint(angle.current)
    if (reduced) return undefined
    let raf = 0, last = 0, visible = true
    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting })
      : null
    if (box.current && io) io.observe(box.current)
    const tick = (t) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0
      last = t
      if (visible && !document.hidden && !pausedRef.current) {
        angle.current = (angle.current + dt * (step / SECONDS_PER_FACE)) % 360
        paint(angle.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); io?.disconnect() }
  }, [n, reduced]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    if (n < 3) return
    if (reduced) {
      // No motion: each tap steps to the next holding.
      angle.current = (frontFace(angle.current, n) + 1) * step
      if (cyl.current) cyl.current.style.transition = 'transform .35s ease'
      paint(angle.current)
      return
    }
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    if (next) {
      // Square up on the face nearest the front.
      angle.current = frontFace(angle.current, n) * step
      if (cyl.current) {
        cyl.current.style.transition = 'transform .4s cubic-bezier(.3,1.4,.5,1)'
        paint(angle.current)
        setTimeout(() => { if (cyl.current) cyl.current.style.transition = '' }, 420)
      }
    }
  }

  if (!n) return null
  const names = faces.map(f => (f.more ? `+${f.more}` : `${(f.h.coin_symbol || '').toUpperCase()} ${pctTxt(f.h.pct24h)}`)).join(', ')

  const chip = (f, i, style) => (
    <span key={f.more ? 'more' : f.h.coin_id} className={`nl-drum-face${f.more ? ' more' : ''}`} style={style} aria-hidden="true">
      {f.more ? <b>+{f.more}</b> : (
        <>
          <AssetLogo h={f.h} size={18} />
          <b>{(f.h.coin_symbol || '').toUpperCase().slice(0, 6)}</b>
          <em className={Number(f.h.pct24h) > 0 ? 'up' : Number(f.h.pct24h) < 0 ? 'down' : ''}>{pctTxt(f.h.pct24h)}</em>
        </>
      )}
    </span>
  )

  // One or two holdings: no drum to turn, just the faces.
  if (n < 3) {
    return (
      <div className="nl-drum flat" role="img" aria-label={`${label}: ${names}`}>
        {faces.map((f, i) => chip(f, i))}
      </div>
    )
  }

  return (
    <button type="button" ref={box} className={`nl-drum${paused ? ' paused' : ''}`} onClick={toggle}
      aria-pressed={paused} aria-label={`${label}: ${names}`}>
      <span className="nl-drum-cyl" ref={cyl}>
        {faces.map((f, i) => chip(f, i, { transform: `rotateX(${i * step}deg) translateZ(${R}px)` }))}
      </span>
    </button>
  )
}
