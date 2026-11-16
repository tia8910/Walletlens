import { useEffect, useRef } from 'react'
import { AssetLogo } from './HomeTop'

// The balance card's right side: a drum that rolls through every holding,
// each with its logo, ticker and today's move. Every face is a button that
// opens its asset. Drag the drum up or down to spin it by hand; it snaps to a
// holding and rolls on by itself a few seconds later. A mouse over it holds
// it still, and Tab turns each holding to the front in turn.
//
// Driven by requestAnimationFrame. It does nothing while off screen or in a
// background tab, and with reduced motion it only moves when moved.

const FACE_H = 34
const SECONDS_PER_FACE = 1.9
const RESUME_MS = 3000
const DRAG_PX = 6

/** Every holding the drum shows, in the order given. Pure, for the test. */
export function drumFaces(holdings) {
  return (holdings || []).filter(h => h && h.coin_id)
}

/** The face nearest the front at a given angle (degrees). Pure, for the test. */
export function frontFace(angle, n) {
  if (!(n > 0)) return 0
  const step = 360 / n
  return ((Math.round(angle / step) % n) + n) % n
}

/** The ticker on a face, whole: never cut or shortened. */
export function drumTicker(h) {
  return String(h?.coin_symbol || h?.coin_name || '').toUpperCase()
}

/** The drum's width in px, wide enough for the longest ticker it holds. Pure, for the test. */
export function drumWidth(faces) {
  const longest = Math.max(0, ...(faces || []).map(f => Math.min(drumTicker(f).length, 12)))
  return Math.max(116, Math.min(168, 64 + longest * 8))
}

const pctTxt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

export default function HoldingsDrum({ holdings = [], label = 'Holdings', onAsset }) {
  const faces = drumFaces(holdings)
  const n = faces.length
  const box = useRef(null)
  const cyl = useRef(null)
  const angle = useRef(0)
  const hold = useRef(false)        // pointer over it, or keyboard inside it
  const resumeAt = useRef(0)        // after a drag or a tap, roll on from here
  const drag = useRef(null)         // { y, a, moved }
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const step = n ? 360 / n : 0
  const R = n > 2 ? FACE_H / (2 * Math.tan(Math.PI / n)) + 3 : 0

  const paint = (a, ease) => {
    const c = cyl.current
    if (!c) return
    c.style.transition = ease ? 'transform .4s cubic-bezier(.3,1.4,.5,1)' : ''
    c.style.transform = `translateZ(${-R}px) rotateX(${-a}deg)`
  }
  const snap = () => { angle.current = frontFace(angle.current, n) * step; paint(angle.current, true) }

  useEffect(() => {
    if (n < 3) return undefined
    paint(angle.current)
    if (reduced) return undefined
    let raf = 0, last = 0, visible = true
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => { visible = e.isIntersecting }) : null
    if (box.current && io) io.observe(box.current)
    const tick = (t) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0
      last = t
      const idle = !hold.current && !drag.current && Date.now() >= resumeAt.current
      if (visible && !document.hidden && idle) {
        angle.current = (angle.current + dt * (step / SECONDS_PER_FACE)) % 360
        paint(angle.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); io?.disconnect() }
  }, [n, reduced]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!n) return null

  // Drag to spin: one face per FACE_H pixels, snapping on release.
  const onPointerDown = (e) => {
    if (n < 3) return
    drag.current = { y: e.clientY, a: angle.current, moved: false, id: e.pointerId }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y
    if (!d.moved && Math.abs(dy) < DRAG_PX) return
    if (!d.moved) { d.moved = true; try { box.current?.setPointerCapture(d.id) } catch { /* not capturable */ } }
    angle.current = d.a - (dy / FACE_H) * step
    paint(angle.current)
  }
  const endDrag = () => {
    const d = drag.current
    drag.current = null
    if (d?.moved) { snap(); resumeAt.current = Date.now() + RESUME_MS; box.current.dataset.dragged = '1' }
  }
  const open = (f) => (e) => {
    // A drag ends with a click on whatever face is under the finger: not a tap.
    if (box.current?.dataset.dragged) { delete box.current.dataset.dragged; e.preventDefault(); return }
    onAsset?.(f)
  }
  const bringFront = (i) => () => { angle.current = i * step; paint(angle.current, true); resumeAt.current = Date.now() + RESUME_MS }

  const face = (f, i, style) => {
    const pct = Number(f.pct24h)
    const sym = drumTicker(f)
    return (
      <button key={f.coin_id} type="button" className={`nl-drum-face${sym.length > 9 ? ' long' : ''}`} style={style}
        onClick={open(f)} onFocus={n > 2 ? bringFront(i) : undefined}
        aria-label={`${f.coin_name || sym} ${pctTxt(f.pct24h)}`.trim()}>
        <AssetLogo h={f} size={18} />
        <b>{sym}</b>
        <em className={pct > 0 ? 'up' : pct < 0 ? 'down' : ''}>{pctTxt(f.pct24h)}</em>
      </button>
    )
  }

  // One or two holdings: no drum to turn, just the faces.
  if (n < 3) {
    return <div className="nl-drum flat" style={{ '--drum-w': `${drumWidth(faces)}px` }} role="group" aria-label={label}>{faces.map((f, i) => face(f, i))}</div>
  }

  return (
    <div ref={box} className="nl-drum" style={{ '--drum-w': `${drumWidth(faces)}px` }} role="group" aria-label={label}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') hold.current = true }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') { hold.current = false; if (!drag.current) snap() } }}
      onFocus={() => { hold.current = true }} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget)) hold.current = false }}>
      <span className="nl-drum-cyl" ref={cyl}>
        {faces.map((f, i) => face(f, i, { transform: `rotateX(${i * step}deg) translateZ(${R}px)` }))}
      </span>
    </div>
  )
}
