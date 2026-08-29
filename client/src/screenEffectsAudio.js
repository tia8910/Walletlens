// Sound for the three screen effects.
//
// Synthesised rather than shipped as files: three short cues cost a few
// hundred bytes of code against a few hundred kilobytes of audio, and the
// bundle is already the thing standing between a user and their dashboard.
//
// ── The rule that everything here is shaped around ─────────────────────────
//
// A browser will not let a page make noise before the user has interacted with
// it. An AudioContext created on load starts 'suspended' and stays there, so
// the effect that matters most — the one that fires the moment the app opens —
// is the one guaranteed to arrive with no permission to be heard.
//
// So a cue that cannot play now is HELD, and released by the next real tap.
// The picture plays immediately either way; only the sound waits. Dropping it
// instead was the previous behaviour and it read as the sound being broken,
// because on any given day the first effect is the one you never hear.

import { EXPLODE, ROCKET, ATH } from './screenEffects'

let ctx = null
let held = null       // a cue waiting for a gesture
let heldAt = 0
let armed = false     // whether the release listener is attached

// Long enough to survive the animation and a moment's hesitation, short enough
// that a tap two minutes later does not produce a noise with no picture.
const HOLD_MS = 8000

function context() {
  if (ctx) return ctx
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  } catch { return null }
  return ctx
}

/**
 * Whether audio can be heard right now.
 *
 * Reads the context rather than a cached flag, deliberately. resume() is
 * ASYNCHRONOUS: checking `ctx.state` on the line after calling it returns
 * 'suspended' every single time. A cached "unlocked" boolean written from that
 * read is false forever, and nothing ever plays — which is exactly how this
 * broke once before.
 */
export function canPlay() {
  const c = context()
  return !!c && c.state === 'running'
}

/**
 * Bring the context up. Only works inside a user gesture; harmless otherwise.
 * The promise is what settles the state, so callers must not read canPlay()
 * synchronously afterwards and conclude anything from it.
 */
export function unlock() {
  const c = context()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
}

// ── The cues ───────────────────────────────────────────────────────────────

function tone(c, { type = 'sine', from, to, start, dur, gain = 0.18 }) {
  const osc = c.createOscillator()
  const amp = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, start)
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + dur)
  // Ramps rather than steps: a gain that jumps to zero clicks audibly, and a
  // click is the one artefact people notice in a cue this short.
  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(amp).connect(c.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

function noise(c, { start, dur, gain = 0.25 }) {
  const frames = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, frames, c.sampleRate)
  const data = buf.getChannelData(0)
  // Decaying white noise — the body of an impact. Shaped in the buffer rather
  // than with a gain ramp so the tail is genuinely quieter, not just faded.
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2
  }
  const src = c.createBufferSource()
  const amp = c.createGain()
  amp.gain.value = gain
  src.buffer = buf
  src.connect(amp).connect(c.destination)
  src.start(start)
}

const CUES = {
  // A hit and a downward tail.
  [EXPLODE](c, t) {
    noise(c, { start: t, dur: 0.4, gain: 0.3 })
    tone(c, { type: 'triangle', from: 420, to: 90, start: t, dur: 0.38, gain: 0.2 })
  },
  // One continuous climb, because that is what the picture does.
  [ROCKET](c, t) {
    tone(c, { type: 'sawtooth', from: 180, to: 1400, start: t, dur: 0.75, gain: 0.14 })
    tone(c, { type: 'sine', from: 360, to: 2200, start: t, dur: 0.75, gain: 0.09 })
    noise(c, { start: t, dur: 0.75, gain: 0.06 })
  },
  // A major triad arpeggiated up, then held. The only cue that resolves.
  [ATH](c, t) {
    const notes = [523.25, 659.25, 783.99, 1046.5]  // C5 E5 G5 C6
    notes.forEach((f, i) => {
      tone(c, { type: 'sine', from: f, start: t + i * 0.09, dur: 0.5, gain: 0.16 })
    })
  },
}

function render(effect) {
  const c = context()
  if (!c || !CUES[effect]) return false
  try {
    CUES[effect](c, c.currentTime + 0.01)
    return true
  } catch { return false }
}

function releaseHeld() {
  if (!held) return detach()
  const fresh = Date.now() - heldAt < HOLD_MS
  const cue = held
  held = null
  detach()
  unlock()
  // resume() has not settled yet, so playing immediately would be silent.
  // One frame later the context is running and the cue is audible.
  if (fresh) setTimeout(() => { if (canPlay()) render(cue) }, 60)
}

function detach() {
  if (!armed) return
  armed = false
  try {
    document.removeEventListener('pointerdown', releaseHeld, true)
    document.removeEventListener('keydown', releaseHeld, true)
  } catch { /* no document */ }
}

function attach() {
  if (armed || typeof document === 'undefined') return
  armed = true
  document.addEventListener('pointerdown', releaseHeld, true)
  document.addEventListener('keydown', releaseHeld, true)
}

/**
 * Play a cue, or hold it for the next gesture if the page may not make noise.
 *
 * @returns {boolean} whether it played immediately. False means held or
 *                    unavailable — never that something went wrong.
 */
export function playEffectSound(effect) {
  if (!CUES[effect]) return false
  if (canPlay()) return render(effect)
  held = effect
  heldAt = Date.now()
  attach()
  return false
}

/** For tests and for teardown; drops a held cue and detaches listeners. */
export function resetEffectAudio() {
  held = null
  heldAt = 0
  detach()
  ctx = null
}
