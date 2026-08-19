// Everything the browser is allowed to refuse.
//
// marketPulse.js decides what should be heard; this plays it. The split exists
// because the decision is pure and testable and this is neither — it depends
// on an AudioContext, a user gesture and a device that may be on silent.
//
// ── Why there are no sound files ───────────────────────────────────────────
//
// The three V1 sounds are synthesised from oscillators and filtered noise.
// That is not a placeholder for real assets — it is the better answer for a
// first release:
//
//   • nothing to download, so no first-load budget spent and no lazy-loading
//     dance for three cinematic files most users will never trigger
//   • no dependency on a sound designer to ship or to iterate
//   • loudness is consistent by construction rather than by normalising
//     exported files against each other
//
// If Market Pulse earns its keep, commissioned audio is a drop-in replacement
// for the three play* functions below and nothing else changes.
//
// ── Autoplay ───────────────────────────────────────────────────────────────
//
// Chrome will not let a page make noise until the user has interacted with it,
// and WalletLens runs inside a Custom Tab where that rule applies in full. An
// AudioContext created before any gesture starts 'suspended' and stays there.
//
// So unlock() is wired to the first real tap of the session and everything
// before it resolves silently. The practical consequence is designed for
// rather than worked around: the earliest a sound can play is the user's first
// tap, not app open.

let ctx = null
let master = null
let unlocked = false

/** True once audio can actually be heard. Exposed for diagnostics. */
export function isUnlocked() { return unlocked }

/**
 * Create and resume the audio context inside a user gesture.
 *
 * Safe to call repeatedly and safe to call when audio is disabled — it does
 * nothing until something actually wants to play. Returns whether audio is now
 * usable, which the caller may ignore.
 */
export function unlock() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    if (!ctx) {
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.6
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume()
    unlocked = ctx.state === 'running'
    return unlocked
  } catch {
    // A locked-down webview with no Web Audio at all. Nothing to do and
    // nothing worth telling the user.
    return false
  }
}

/** Volume, 0–1. Applied to everything. */
export function setVolume(v) {
  if (master) master.gain.value = Math.max(0, Math.min(1, Number(v) || 0))
}

// ── Synthesis helpers ──────────────────────────────────────────────────────

/** A short burst of filtered noise — the body of whooshes and impacts. */
function noise(at, dur, { type = 'lowpass', from = 400, to = 400, q = 1, gain = 0.3 } = {}) {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur))
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1

  const src = ctx.createBufferSource()
  src.buffer = buf

  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, at)
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur)

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.25)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)

  src.connect(filter).connect(g).connect(master)
  src.start(at)
  src.stop(at + dur)
}

/** A pitched tone. The clean, deliberate half of the palette. */
function tone(at, dur, { freq = 440, to = 0, type = 'sine', gain = 0.25 } = {}) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur)

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.04, dur * 0.2))
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)

  osc.connect(g).connect(master)
  osc.start(at)
  osc.stop(at + dur)
}

// ── The three V1 sounds ────────────────────────────────────────────────────

/**
 * Rocket — an asset newly crossed its class threshold.
 *
 * Beat-for-beat the timeline from the spec: rumble, ignition, accelerating
 * build, launch, sonic boom, shimmer out. The animation layer keys off the
 * same offsets, which is what keeps the two in sync.
 */
function playRocket(t) {
  noise(t + 0.00, 0.45, { from: 90, to: 60, gain: 0.22 })                       // rumble
  tone(t + 0.22, 0.30, { freq: 68, to: 40, type: 'sine', gain: 0.45 })          // ignition
  noise(t + 0.40, 0.75, { from: 300, to: 5200, q: 1.4, gain: 0.26 })            // build
  tone(t + 0.95, 0.55, { freq: 220, to: 900, type: 'triangle', gain: 0.20 })    // launch
  noise(t + 1.75, 0.35, { from: 1600, to: 120, gain: 0.16 })                    // boom
  tone(t + 2.05, 0.40, { freq: 2400, to: 3400, type: 'sine', gain: 0.05 })      // shimmer
}

/**
 * Portfolio all-time high — deep pulse, ascending notes, crystal shimmer.
 * A major chord walked upward, which reads as arrival rather than alarm.
 */
function playAth(t) {
  tone(t + 0.00, 0.40, { freq: 110, type: 'sine', gain: 0.35 })
  const notes = [523.25, 659.25, 783.99, 1046.5]   // C5 E5 G5 C6
  notes.forEach((f, i) => tone(t + 0.18 + i * 0.11, 0.42, { freq: f, type: 'triangle', gain: 0.16 }))
  tone(t + 0.80, 0.70, { freq: 2093, to: 2637, type: 'sine', gain: 0.045 })
}

/**
 * Net-worth milestone — impact, ascending premium notes, bass resolve.
 * Deliberately weightier and slower than the ATH: it happens a handful of
 * times in the whole life of an account.
 */
function playMilestone(t) {
  tone(t + 0.00, 0.50, { freq: 82, to: 55, type: 'sine', gain: 0.42 })
  noise(t + 0.02, 0.25, { from: 900, to: 200, gain: 0.14 })
  const notes = [392, 523.25, 659.25]              // G4 C5 E5
  notes.forEach((f, i) => tone(t + 0.30 + i * 0.16, 0.55, { freq: f, type: 'sine', gain: 0.18 }))
  tone(t + 0.95, 0.55, { freq: 3136, type: 'sine', gain: 0.04 })
  tone(t + 1.10, 0.80, { freq: 130.81, type: 'sine', gain: 0.22 })
}

const VOICES = { rocket: playRocket, ath: playAth, milestone: playMilestone }

/** Roughly how long each sound runs, for syncing the visual layer. */
export const DURATION_MS = { rocket: 2500, ath: 1600, milestone: 1950 }

/**
 * Play one event's sound.
 *
 * Returns whether anything was actually scheduled, so the caller can tell
 * "played" from "silently declined" — the same distinction that matters for
 * the review card, and for the same reason: a feature that cannot report
 * whether it did anything is impossible to debug from a user's phone.
 */
export function play(type) {
  try {
    if (!unlocked || !ctx || ctx.state !== 'running') return false
    const voice = VOICES[type]
    if (!voice) return false
    voice(ctx.currentTime + 0.02)
    return true
  } catch {
    return false
  }
}

/**
 * Give up the audio hardware.
 *
 * Worth doing when the user turns Market Pulse off: an open context keeps the
 * audio route alive, which on some Android builds shows a media indicator for
 * an app that is not playing anything.
 */
export function release() {
  try { ctx?.close() } catch { /* already gone */ }
  ctx = null
  master = null
  unlocked = false
}
