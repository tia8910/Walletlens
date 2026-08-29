import { useEffect, useMemo, useRef } from 'react'
import { useLanguage } from '../LanguageContext'
import { EXPLODE, ROCKET, ATH } from '../screenEffects'
import { playEffectSound } from '../screenEffectsAudio'

// The three full-screen effects.
//
// Rendered from one place, outside any tab's block. The previous overlay lived
// inside `activeTab === 'overview' && (...)`, so an effect decided while the
// user sat on any other tab was computed, consumed, and never drawn — the
// event was spent on a picture nobody saw.
//
// Purely decorative and never interactive: pointer-events are off, so a
// celebration cannot swallow the tap the user was in the middle of making.

/** How long each effect owns the screen. Also the sound's rough length. */
export const DURATION_MS = {
  [EXPLODE]: 1600,
  [ROCKET]: 2000,
  [ATH]: 2600,
}

/** Particle count per effect. Fixed, not random — see below. */
const PARTICLES = { [EXPLODE]: 18, [ATH]: 26 }

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

/** The asset's logo, or its ticker on a disc when there is no image. */
function AssetMark({ leader, className }) {
  if (leader?.image) {
    return <img className={className} src={leader.image} alt="" aria-hidden="true" />
  }
  return (
    <span className={`${className} fx-mark-text`} aria-hidden="true">
      {leader?.symbol ? leader.symbol.slice(0, 4) : '★'}
    </span>
  )
}

export default function ScreenEffect({ effect, payload, onDone }) {
  const { t } = useLanguage()
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  // Sound rides the same trigger as the picture, so they cannot disagree about
  // whether an effect happened. It may be held for a gesture; that is the
  // audio module's business, not this component's.
  useEffect(() => {
    if (!effect) return undefined
    try { playEffectSound(effect) } catch { /* never block the animation */ }
    const ms = DURATION_MS[effect] ?? 2000
    const t = setTimeout(() => doneRef.current?.(), ms)
    return () => clearTimeout(t)
  }, [effect])

  const bits = useMemo(() => {
    const n = PARTICLES[effect]
    return n ? Array.from({ length: n }, (_, i) => particle(i, n)) : []
  }, [effect])

  if (!effect) return null

  const leader = payload?.leader || null

  return (
    <div className={`fx-layer fx-${effect}`} aria-hidden="true">
      {effect === EXPLODE && (
        <div className="fx-burst">
          <AssetMark leader={leader} className="fx-core" />
          {bits.map((style, i) => <span key={i} className="fx-bit" style={style} />)}
        </div>
      )}

      {effect === ROCKET && (
        <div className="fx-rocket-track">
          <div className="fx-rocket">
            <AssetMark leader={leader} className="fx-rocket-mark" />
            <span className="fx-flame" />
          </div>
          {Number.isFinite(payload?.changePct) && (
            <div className="fx-rocket-label">+{payload.changePct.toFixed(1)}%</div>
          )}
        </div>
      )}

      {effect === ATH && (
        <div className="fx-celebrate">
          {bits.map((style, i) => (
            <span key={i} className={`fx-confetti fx-c${i % 4}`} style={style} />
          ))}
          <div className="fx-ath-badge">
            <span className="fx-ath-title">{t('fxAllTimeHigh')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
