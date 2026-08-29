import { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../LanguageContext'
import { getCachedCoinImage } from '../api'
import { EXPLODE, ROCKET, ATH } from '../screenEffects'
import { playEffectSound, SOUND_MS } from '../screenEffectsAudio'

// The three full-screen effects.
//
// Rendered from one place, outside any tab's block. The previous overlay lived
// inside `activeTab === 'overview' && (...)`, so an effect decided while the
// user sat on any other tab was computed, consumed, and never drawn — the
// event was spent on a picture nobody saw.
//
// Purely decorative and never interactive: pointer-events are off, so a
// celebration cannot swallow the tap the user was in the middle of making.
//
// The explode is the original Market Pulse "champion" animation, restored: the
// asset's logo rushes at the screen, whites out on impact, and comes apart
// into falling debris. Its 44% split, the flash timing and the audio's impact
// are one set of numbers — moving any of them alone is what makes an effect
// feel wrong without anyone being able to say why.

/** How long each effect owns the screen. Mirrors the audio's own lengths. */
export const DURATION_MS = {
  [EXPLODE]: SOUND_MS[EXPLODE],
  [ROCKET]: SOUND_MS[ROCKET],
  [ATH]: 2600,
}

/** Particle count for the ATH confetti. Fixed, not random — see below. */
const CONFETTI = 26

/**
 * Deterministic spread from an index.
 *
 * Math.random() would re-roll on every React re-render and make the particles
 * jump mid-flight. Deriving each particle's angle and distance from its index
 * keeps a given burst stable for its whole life.
 */
function particle(i, total) {
  const angle = (i / total) * Math.PI * 2
  const wobble = ((i * 37) % 11) / 11        // stable pseudo-jitter, no RNG
  const distance = 38 + wobble * 42          // vh
  return {
    '--fx-x': `${Math.cos(angle) * distance}vh`,
    '--fx-y': `${Math.sin(angle) * distance}vh`,
    '--fx-delay': `${(i % 5) * 22}ms`,
  }
}

/**
 * The debris layer.
 *
 * Canvas rather than DOM nodes: eighty animated elements would put eighty
 * things through layout every frame. One canvas puts through one. Counts drop
 * on a weak device, because this plays on the phone someone is holding, over a
 * live dashboard, and a stutter is more memorable than the effect.
 */
function BurstCanvas({ duration, delay = 0, originY = 0.5 }) {
  const ref = useRef(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return undefined
    const rect = c.getBoundingClientRect()
    const W = rect.width, H = rect.height
    if (!W || !H) return undefined

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = W * dpr
    c.height = H * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return undefined
    ctx.scale(dpr, dpr)

    const weak = (navigator.hardwareConcurrency || 8) < 4
    const N = weak ? 40 : 80
    const p = []
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 1.4 + Math.random() * 3.4
      p.push({
        x: W / 2, y: H * originY,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.4,
        r: 1.4 + Math.random() * 2.4,
      })
    }

    let raf = 0
    const start = performance.now()

    const frame = (now) => {
      const raw = (now - start) / duration
      ctx.clearRect(0, 0, W, H)
      if (raw >= 1) return                     // done; no further frames
      // Nothing is drawn before the delay, but the frames keep coming — the
      // debris has to appear at the instant the logo blows apart, and starting
      // the loop then instead would cost a frame of setup at the one moment
      // that has to land on time.
      if (raw < delay) { raf = requestAnimationFrame(frame); return }
      const t = (raw - delay) / (1 - delay)
      // Fade the field as one rather than per particle, so it ends together
      // instead of dribbling out a few stragglers.
      const fade = t < 0.66 ? 1 : Math.max(0, 1 - (t - 0.66) / 0.34)

      for (const q of p) {
        q.x += q.vx; q.y += q.vy; q.vy += 0.07; q.vx *= 0.995
        ctx.globalAlpha = fade * 0.9
        ctx.fillStyle = 'rgb(16,185,129)'
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [duration, delay, originY])

  return <canvas ref={ref} className="fx-canvas" />
}

/**
 * The asset's logo, filling the screen before it comes apart.
 *
 * The image is a remote coin icon, which is the one thing on screen that can
 * simply fail — a cold cache, a blocked CDN, an asset that never had an icon.
 * A blank centre would leave the whole effect looking broken, so a failure
 * falls back to the symbol on a plain disc, the same thing the rest of the app
 * does for a missing logo.
 */
function AssetLogo({ leader }) {
  // Two sources before giving up. The effect carries whatever the holdings row
  // had, but that can be empty for an asset added before its icon resolved,
  // and the app's own image cache often has one by now.
  const sources = [
    leader?.image,
    leader?.assetId ? getCachedCoinImage(leader.assetId) : null,
  ].filter(Boolean)
  const [tried, setTried] = useState(0)
  const label = (leader?.symbol || '?').toString().toUpperCase().slice(0, 4)
  const src = sources[tried]

  return (
    <span className="fx-champ">
      {src
        ? <img
            key={src}
            src={src}
            alt=""
            className="fx-champ-img"
            onError={() => setTried(n => n + 1)}
          />
        : <span className="fx-champ-badge">{label}</span>}
    </span>
  )
}

/** The asset's mark at rocket size — logo, or its ticker on a disc. */
function RocketMark({ leader }) {
  if (leader?.image) {
    return <img className="fx-rocket-mark" src={leader.image} alt="" aria-hidden="true" />
  }
  return (
    <span className="fx-rocket-mark fx-mark-text" aria-hidden="true">
      {leader?.symbol ? leader.symbol.slice(0, 4) : '★'}
    </span>
  )
}

export default function ScreenEffect({ effect, payload, onDone }) {
  const { t } = useLanguage()
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      setReduced(mq.matches)
      const onChange = (e) => setReduced(e.matches)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    } catch { return undefined }   // no matchMedia: assume motion is fine
  }, [])

  // Sound rides the same trigger as the picture, so they cannot disagree about
  // whether an effect happened. It may be held for a gesture; that is the
  // audio module's business, not this component's.
  useEffect(() => {
    if (!effect) return undefined
    if (!payload?.muted) {
      try { playEffectSound(effect) } catch { /* never block the animation */ }
    }
    const ms = reduced ? 1400 : (DURATION_MS[effect] ?? 2000)
    const timer = setTimeout(() => doneRef.current?.(), ms)
    return () => clearTimeout(timer)
  }, [effect, payload, reduced])

  const bits = useMemo(
    () => (effect === ATH ? Array.from({ length: CONFETTI }, (_, i) => particle(i, CONFETTI)) : []),
    [effect],
  )

  if (!effect) return null

  const leader = payload?.leader || null

  return (
    <div className={`fx-layer fx-${effect} ${reduced ? 'is-still' : ''}`} aria-hidden="true">
      <div className="fx-glow" />

      {effect === EXPLODE && !reduced && (
        <>
          <AssetLogo leader={leader} />
          {/* The flash is a separate layer so it can cover the logo at the
              moment of impact without animating the logo's own opacity, which
              is already carrying the scale. */}
          <span className="fx-flash" />
          {/* originY matches the logo's own centre; debris starting above the
              thing that exploded reads as two unrelated effects. */}
          <BurstCanvas duration={DURATION_MS[EXPLODE]} delay={0.44} originY={0.5} />
        </>
      )}

      {effect === ROCKET && !reduced && (
        <div className="fx-rocket-track">
          <div className="fx-rocket">
            <RocketMark leader={leader} />
            <span className="fx-flame" />
          </div>
          {Number.isFinite(payload?.changePct) && (
            <div className="fx-rocket-label">+{payload.changePct.toFixed(1)}%</div>
          )}
        </div>
      )}

      {effect === ATH && !reduced && (
        <div className="fx-celebrate">
          {bits.map((style, i) => (
            <span key={i} className={`fx-confetti fx-c${i % 4}`} style={style} />
          ))}
        </div>
      )}

      {effect === ATH && (
        <div className="fx-ath-badge">
          <span className="fx-ath-title">{t('fxAllTimeHigh')}</span>
        </div>
      )}
    </div>
  )
}
