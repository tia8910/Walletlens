import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../LanguageContext'
import { DURATION_MS } from '../pulseAudio'

/** Which events draw particles, and which shape. */
const CANVAS_KIND = { rain: 'rain', dip: 'dip', storm: 'storm', milestone: 'burst' }
import { pulseSettings } from '../marketPulseRuntime'

/**
 * The particle layer, for the three effects CSS cannot do cheaply.
 *
 * Canvas rather than DOM nodes for the same reason the fireworks use four CSS
 * shells instead of generated particles: ninety animated elements would put
 * ninety things through layout every frame. One canvas puts through one.
 *
 * Counts follow DynamicBackground's throttle — fewer cores means fewer
 * particles, because this plays on the phone someone is holding, over a live
 * dashboard, and a stutter is more memorable than the effect.
 */
function PulseCanvas({ kind, duration, delay = 0, originY = 0.4 }) {
  const ref = useRef(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const W = rect.width, H = rect.height
    if (!W || !H) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = W * dpr
    c.height = H * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const weak = (navigator.hardwareConcurrency || 8) < 4
    const N = kind === 'burst' ? (weak ? 40 : 80) : (weak ? 34 : 66)
    // Down days are slate, never red. Same palette moodEngine uses.
    const rgb = (kind === 'dip' || kind === 'storm') ? '100,116,139' : '16,185,129'
    const p = []

    for (let i = 0; i < N; i++) {
      if (kind === 'burst') {
        const a = Math.random() * Math.PI * 2
        const s = 1.4 + Math.random() * 3.4
        p.push({ x: W / 2, y: H * originY, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.4, r: 1.4 + Math.random() * 2.4 })
      } else {
        const slow = kind === 'storm' || kind === 'dip'
        p.push({
          x: Math.random() * W, y: -Math.random() * H,
          vy: (slow ? 1.0 : 2.2) + Math.random() * (slow ? 1.4 : 2.2),
          len: slow ? 10 : 6, w: slow ? 1 : 1.6,
        })
      }
    }

    let raf = 0
    const start = performance.now()
    const total = duration

    const frame = (now) => {
      const raw = (now - start) / total
      ctx.clearRect(0, 0, W, H)
      if (raw >= 1) return                     // done; no further frames
      // Nothing is drawn before the delay, but the frames keep coming — the
      // champion's debris has to appear at the instant the logo blows apart,
      // and starting the loop then instead would cost a frame of setup at the
      // one moment in the whole set that has to land on time.
      if (raw < delay) { raf = requestAnimationFrame(frame); return }
      const t = (raw - delay) / (1 - delay)
      // Fade the field as one rather than per particle, so it ends together
      // instead of dribbling out a few stragglers.
      const fade = t < 0.66 ? 1 : Math.max(0, 1 - (t - 0.66) / 0.34)

      for (const q of p) {
        if (kind === 'burst') {
          q.x += q.vx; q.y += q.vy; q.vy += 0.07; q.vx *= 0.995
          ctx.globalAlpha = fade * 0.9
          ctx.fillStyle = `rgb(${rgb})`
          ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill()
        } else {
          q.y += q.vy
          if (q.y > H + 20) { q.y = -20; q.x = Math.random() * W }
          ctx.globalAlpha = fade * (kind === 'storm' || kind === 'dip' ? 0.4 : 0.72)
          ctx.strokeStyle = `rgb(${rgb})`
          ctx.lineWidth = q.w
          ctx.lineCap = 'round'
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y + q.len); ctx.stroke()
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [kind, duration, delay, originY])

  return <canvas ref={ref} className="wl-pulse-canvas" />
}

/**
 * The champion's logo, filling the screen before it comes apart.
 *
 * The image is a remote coin icon, which is the one thing on screen that can
 * simply fail — a cold cache, a blocked CDN, an asset that never had an icon.
 * A blank centre would leave the whole effect looking broken, so a failure
 * falls back to the symbol on a plain disc, which is the same thing the rest
 * of the app does for a missing logo.
 */
function ChampionLogo({ image, symbol }) {
  const [broken, setBroken] = useState(!image)
  const label = (symbol || '?').toString().toUpperCase().slice(0, 4)

  return (
    <span className="wl-pulse-champ">
      {broken
        ? <span className="wl-pulse-champ-badge">{label}</span>
        : <img
            src={image}
            alt=""
            className="wl-pulse-champ-img"
            onError={() => setBroken(true)}
          />}
    </span>
  )
}

/**
 * The visible half of Market Pulse.
 *
 * Timings come from pulseAudio's DURATION_MS and the keyframe offsets in
 * index.css mirror the audio cue points — ignition, launch, boom, fade. That
 * is the whole reason the two are worth building together: a launch animation
 * that peaks half a second after the engine sound is worse than no animation.
 *
 * Rules this obeys, all of them from the spec:
 *   • auto-dismisses, never waits for a tap
 *   • pointer-events: none, so it cannot swallow a tap meant for the app
 *   • aria-hidden, because it is decoration — the numbers are already on screen
 *   • prefers-reduced-motion gets a still caption instead of a flight path
 *   • nothing renders when visual effects are switched off
 */
export default function PulseOverlay({ event, onDone }) {
  const { t } = useLanguage()
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      setReduced(mq.matches)
      const onChange = (e) => setReduced(e.matches)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    } catch { /* no matchMedia: assume motion is fine */ }
  }, [])

  useEffect(() => {
    if (!event) return
    // Reduced motion still gets the caption, just for a shorter, calmer beat.
    const ms = reduced ? 1400 : (DURATION_MS[event.type] || 2000)
    const timer = setTimeout(() => onDone?.(), ms)
    return () => clearTimeout(timer)
  }, [event, reduced, onDone])

  if (!event) return null
  if (!pulseSettings().visuals) return null

  const pct = Math.abs(Number(event.changePct) || 0).toFixed(1)
  const caption =
    event.type === 'rocket'      ? `${event.symbol} +${pct}%`
    : event.type === 'shockwave' ? `${event.symbol} +${pct}%`
    : event.type === 'fireworks' ? t('pulseFlying')(pct)
    : event.type === 'ath'       ? t('pulseNewHigh')
    : event.type === 'rain'      ? t('pulseRain')(pct)
    : event.type === 'aurora'    ? t('pulseAurora')
    : event.type === 'lock'      ? t('pulseTargetHit')(event.symbol)
    : event.type === 'champion'  ? t('pulseChampion')(event.symbol, pct)
    // Down-day copy states the fact and stops. No apology, no encouragement —
    // both read as the app having an opinion about your portfolio.
    : event.type === 'dip'       ? t('pulseDip')(pct)
    : event.type === 'storm'     ? t('pulseStorm')(pct)
    : /* milestone */              t('pulseMilestone')(compactValue(event.value))

  return (
    <div className={`wl-pulse wl-pulse-${event.type} ${reduced ? 'is-still' : ''}`} aria-hidden="true">
      <div className="wl-pulse-glow" />
      {event.type === 'rocket' && !reduced && (
        <span className="wl-pulse-craft">🚀</span>
      )}
      {event.type === 'shockwave' && !reduced && (
        <>
          <span className="wl-pulse-ring" />
          <span className="wl-pulse-ring wl-pulse-ring-2" />
          <span className="wl-pulse-ring wl-pulse-ring-3" />
        </>
      )}
      {event.type === 'aurora' && !reduced && (
        <>
          <span className="wl-pulse-band" />
          <span className="wl-pulse-band wl-pulse-band-2" />
        </>
      )}
      {event.type === 'lock' && !reduced && (
        <span className="wl-pulse-reticle">
          <i /><i /><i /><i /><u />
        </span>
      )}
      {event.type === 'champion' && !reduced && (
        <>
          <ChampionLogo image={event.image} symbol={event.symbol} />
          {/* The flash is a separate layer so it can cover the logo at the
              moment of impact without animating the logo's own opacity, which
              is already carrying the scale. */}
          <span className="wl-pulse-flash" />
          {/* originY matches the logo's own centre. The default sits higher,
              for the milestone, and debris that starts above the thing that
              exploded reads as two unrelated effects. */}
          <PulseCanvas kind="burst" duration={DURATION_MS.champion || 2600} delay={0.44} originY={0.5} />
        </>
      )}
      {CANVAS_KIND[event.type] && !reduced && (
        <PulseCanvas kind={CANVAS_KIND[event.type]} duration={DURATION_MS[event.type] || 2000} />
      )}
      {event.type === 'fireworks' && !reduced && (
        // Four shells, positioned and coloured entirely in CSS. Rendering them
        // here rather than generating particles in JS keeps the whole display
        // at four nodes and lets the compositor own every frame.
        <>
          <span className="wl-pulse-shell wl-pulse-shell-1" />
          <span className="wl-pulse-shell wl-pulse-shell-2" />
          <span className="wl-pulse-shell wl-pulse-shell-3" />
          <span className="wl-pulse-shell wl-pulse-shell-4" />
        </>
      )}
      <span className="wl-pulse-caption">{caption}</span>
    </div>
  )
}

/** $250,000 → $250K. The caption has room for a number, not a paragraph. */
function compactValue(v) {
  const n = Number(v) || 0
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`
  return `$${Math.round(n / 1e3)}K`
}
