import { useEffect, useState } from 'react'
import { useLanguage } from '../LanguageContext'
import { DURATION_MS } from '../pulseAudio'
import { pulseSettings } from '../marketPulseRuntime'

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
    : event.type === 'fireworks' ? t('pulseFlying')(pct)
    : event.type === 'ath'       ? t('pulseNewHigh')
    : /* milestone */              t('pulseMilestone')(compactValue(event.value))

  return (
    <div className={`wl-pulse wl-pulse-${event.type} ${reduced ? 'is-still' : ''}`} aria-hidden="true">
      <div className="wl-pulse-glow" />
      {event.type === 'rocket' && !reduced && (
        <span className="wl-pulse-craft">🚀</span>
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
