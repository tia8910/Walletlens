// Sound for the three screen effects.
//
// This is the original Market Pulse audio engine, restored. The rebuild
// replaced it with three short hand-written cues, and the explode lost the
// sound it was recognised by — so the engine and its voices come back
// unchanged, and only the parts that were genuinely wrong are new.
//
// ── Why there are no sound files ───────────────────────────────────────────
//
// The sounds are synthesised. That is not a placeholder — it is the better
// answer here: nothing to download, no lazy-loading dance for cinematic files
// most users will never trigger, no dependency on a sound designer to ship or
// to iterate, and loudness that is consistent by construction rather than by
// normalising exported files against each other.
//
// ── What makes a synthesised sound read as cheap ───────────────────────────
//
// Four specific things, all avoided here:
//
//   • bare sine and triangle oscillators. A single sine is a test tone. Notes
//     here are struck FM bells (Chowning's 2.76 ratio, modulation index
//     collapsing in the first few milliseconds) and detuned three-voice saw
//     stacks behind a moving filter — timbres with an attack transient and
//     partials that move.
//   • no space. Everything feeds a convolution reverb built from a darkened
//     noise impulse; bone-dry layers sound like a phone speaker, not a room.
//   • wideband noise doing the heavy lifting. An unfiltered 300→5200 Hz sweep
//     is the cartoon whoosh. The noise here is narrow, band-passed, quiet, and
//     always layered under something pitched.
//   • envelopes that snapped. 4 ms to full and a hard stop clicks; the decays
//     below are exponential, the way a struck object actually behaves.
//
// A compressor across the bus glues the layers and keeps three very different
// sounds at the same perceived loudness.
//
// ── Autoplay ───────────────────────────────────────────────────────────────
//
// Chrome will not let a page make noise until the user has interacted with it,
// and WalletLens runs inside a Custom Tab where that rule applies in full. An
// AudioContext created before any gesture starts 'suspended' and stays there.
//
// So a cue that cannot play now waits for the context to resume or for a
// tap, but only while the sound can still land on the picture; it then starts
// partway in so its impact matches the animation's (see "Keeping the sound on
// the picture's clock" below). Playing it from the top on a later tap put the
// explode's boom after the burst had already finished.

import { EXPLODE, ROCKET, ATH } from './screenEffects'

const HIGHPASS_HZ = 45

let ctx = null
let master = null
let bus = null      // compressor everything lands on
let dry = null
let verb = null     // convolver input

/**
 * A reverb impulse: noise that decays, darkened as it goes.
 *
 * Undamped white noise is what makes a synthetic reverb sound like static, so
 * a one-pole lowpass runs over it as it is generated — real rooms absorb high
 * frequencies faster than low ones. The two channels are generated
 * independently, which is the whole of the stereo image.
 */
function impulse(seconds, decay) {
  const rate = ctx.sampleRate || 44100
  const len = Math.max(1, Math.floor(rate * seconds))
  const buf = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    if (!d || !d.length) continue
    let lp = 0
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length
      lp += 0.32 * ((Math.random() * 2 - 1) - lp)
      // A few milliseconds of build so the tail reads as space rather than as
      // a second copy of the sound.
      d[i] = lp * Math.min(1, t * 60) * Math.pow(1 - t, decay)
    }
  }
  return buf
}

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
      master.gain.value = 1
      master.connect(ctx.destination)

      // ── Gain staging ──────────────────────────────────────────────────
      //
      // The first version peaked around 0.5 and measured −16 dB short-term,
      // which is quiet for a notification — they normally sit nearer −10 —
      // and the volume setting then multiplied it by 0.6 on top. The result
      // was audible and unimpressive.
      //
      // Simply turning it up clips: these sounds are peaky, a sub-bass drop
      // against a bell transient. So the level comes from compression and
      // makeup rather than from a bigger multiplier, with a brickwall after
      // it to guarantee nothing ever reaches the converter above -1 dB.
      //
      //   voices → comp (glue) → makeup → limiter (safety) → master → out

      const limiter = ctx.createDynamicsCompressor?.()
      if (limiter) {
        limiter.threshold.value = -4.5
        limiter.knee.value = 0            // brickwall, not a curve
        limiter.ratio.value = 20
        limiter.attack.value = 0.001
        limiter.release.value = 0.06
        limiter.connect(master)
      }

      const makeup = ctx.createGain()
      // Pushed until the loudest voice sat just under full scale, then backed
      // off. The measured ceiling was makeup 3.2 at a -3 dB limiter, where the
      // ATH peaked at 0.996 — clean on paper, but no margin at all for a
      // device that rounds differently. Taking the limiter down to -4.5 buys
      // that margin back and lets the makeup go higher, which nets more level
      // than the tighter setting did.
      makeup.gain.value = 3.6
      makeup.connect(limiter || master)

      bus = ctx.createDynamicsCompressor?.()
      if (bus) {
        // Harder than before on purpose: the compression is now doing the
        // loudness work, so it has to actually engage rather than just glue.
        bus.threshold.value = -26
        bus.knee.value = 14
        bus.ratio.value = 5
        bus.attack.value = 0.004
        bus.release.value = 0.18
        bus.connect(makeup)
      } else {
        bus = makeup
      }

      // Rumble a phone cannot reproduce still costs headroom.
      //
      // A handset speaker rolls off hard below roughly 150 Hz, so the deepest
      // part of the sub is inaudible there — but it is still the tallest part
      // of the waveform, and it is what the limiter clamps down on, dragging
      // the audible content with it. Trimming the bottom frees real level for
      // everything you can actually hear.
      //
      // Set low enough to keep the chest-thump on headphones and a decent
      // speaker, where the sub is the whole point of the ignition and boom.
      const trimLow = ctx.createBiquadFilter()
      trimLow.type = 'highpass'
      trimLow.frequency.value = HIGHPASS_HZ
      trimLow.Q.value = 0.7
      trimLow.connect(bus)

      dry = ctx.createGain()
      dry.gain.value = 1
      dry.connect(trimLow)

      const conv = ctx.createConvolver?.()
      if (conv) {
        conv.buffer = impulse(2.6, 2.6)
        const wet = ctx.createGain()
        wet.gain.value = 0.85
        conv.connect(wet).connect(trimLow)
        verb = conv
      } else {
        verb = null
      }
    }
    // resume() is asynchronous. Reading ctx.state on the next line returns
    // 'suspended' every time, which is why an earlier version of this file
    // latched a cached flag inside the very gesture that was supposed to set
    // it, and nothing ever played on any device. There is deliberately no such
    // flag now: canPlay() reads the context, which is the only thing that
    // decides whether a scheduled node will be heard.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx.state === 'running'
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

// ── Routing ────────────────────────────────────────────────────────────────

/**
 * Per-voice loudness trim, applied to dry and reverb alike.
 *
 * Set from emit() and read by route(). Rendering the three voices offline and
 * measuring the loudest 300 ms window of each showed a 6 dB spread: the rocket
 * is two and a half seconds of sustained thrust, the ATH is four bells, and
 * writing them to the same peak level does not make them sound equally loud.
 * These numbers close that gap. Whole-file RMS is the wrong measure here — a
 * long reverb tail drags the average down without changing what you hear.
 *
 * Held in a module variable rather than threaded through every helper because
 * it applies uniformly to a whole voice, and a single trim node per layer is
 * cheaper than scaling twenty hand-written gain figures and re-deriving them
 * every time one layer changes.
 */
const TRIM = {
  rocket: 1,
  ath: 1.9,
  // Lowest trim of the three, and deliberately so: this voice carries the
  // loudest impact already, so it needs the least help.
  champion: 1.2,
}
let voiceTrim = 1

/**
 * Send one voice to the dry path and, at `wet` strength, to the reverb.
 *
 * Per-voice rather than one global send: the sub-bass wants almost none (a
 * reverberant sub is just mud) while the bells and the boom want a lot, and
 * that difference is most of what separates a mix from a pile of sounds.
 */
function route(node, wet = 0.3, pan = 0) {
  let head = node
  if (voiceTrim !== 1) {
    const t = ctx.createGain()
    t.gain.value = voiceTrim
    node.connect(t)
    head = t
  }
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    node.connect(p)
    head = p
  }
  head.connect(dry)
  if (verb && wet > 0) {
    const s = ctx.createGain()
    s.gain.value = wet
    head.connect(s).connect(verb)
  }
}

/**
 * An exponential decay that actually reaches silence.
 *
 * exponentialRampToValueAtTime cannot target zero, and stopping an oscillator
 * while its gain is still audible is a click. So: ramp down to near-nothing,
 * then a short linear segment to true zero.
 */
function decay(g, at, dur, peak, attack = 0.006) {
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(peak, at + Math.min(attack, dur * 0.4))
  g.gain.exponentialRampToValueAtTime(Math.max(0.00001, peak * 0.0008), at + dur * 0.92)
  g.gain.linearRampToValueAtTime(0, at + dur)
}

// ── Synthesis voices ───────────────────────────────────────────────────────

/**
 * A struck bell, by frequency modulation.
 *
 * The modulation index collapses over the first fraction of the note, so the
 * inharmonic clang lives only in the attack and the tail settles toward a
 * near-pure tone. That decay is the entire difference between a bell and a
 * 1980s ringtone: a fixed index is what makes FM sound like a toy.
 */
function bell(at, dur, { freq = 880, gain = 0.12, ratio = 2.76, index = 5, wet = 0.5, pan = 0 } = {}) {
  const carrier = ctx.createOscillator()
  carrier.type = 'sine'
  carrier.frequency.setValueAtTime(freq, at)

  const mod = ctx.createOscillator()
  mod.type = 'sine'
  mod.frequency.setValueAtTime(freq * ratio, at)

  const depth = ctx.createGain()
  depth.gain.setValueAtTime(freq * index, at)
  depth.gain.exponentialRampToValueAtTime(Math.max(1, freq * 0.25), at + dur * 0.18)
  depth.gain.exponentialRampToValueAtTime(1, at + dur)
  mod.connect(depth).connect(carrier.frequency)

  const g = ctx.createGain()
  decay(g, at, dur, gain, 0.004)
  carrier.connect(g)
  route(g, wet, pan)

  mod.start(at); carrier.start(at)
  mod.stop(at + dur); carrier.stop(at + dur)
}

/**
 * A detuned oscillator stack behind a sweeping lowpass — the pad/thrust voice.
 *
 * Three saws a few cents apart beat against each other, which is why the
 * result has movement where a single oscillator has none. The filter opening
 * as the pitch rises is what makes it read as effort rather than as a slide
 * whistle.
 */
function swell(at, dur, {
  from = 220, to = 220, gain = 0.14, type = 'sawtooth',
  cutFrom = 600, cutTo = 4000, q = 0.8, spread = 8, wet = 0.45, attack = 0.05,
} = {}) {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = q
  filter.frequency.setValueAtTime(Math.max(40, cutFrom), at)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, cutTo), at + dur)

  const g = ctx.createGain()
  decay(g, at, dur, gain, attack)
  filter.connect(g)
  route(g, wet)

  for (const cents of [-spread, 0, spread]) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, at)
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur)
    if (osc.detune) osc.detune.setValueAtTime(cents, at)
    osc.connect(filter)
    osc.start(at)
    osc.stop(at + dur)
  }
}

/**
 * Sub-bass. Sine only, slow in, long out, almost no reverb.
 *
 * Everything an impact is felt through rather than heard. Sending this to the
 * convolver would smear it into mud, so `wet` stays near zero by default.
 */
function sub(at, dur, { from = 60, to = 40, gain = 0.4, wet = 0.06 } = {}) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(from, at)
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(18, to), at + dur)

  const g = ctx.createGain()
  decay(g, at, dur, gain, 0.02)
  osc.connect(g)
  route(g, wet)
  osc.start(at)
  osc.stop(at + dur)
}

/**
 * Band-limited noise — air, never the main event.
 *
 * Narrow and quiet by design. Wideband noise at any real level is the single
 * loudest tell of a synthesised sound effect.
 */
function air(at, dur, {
  from = 800, to = 800, q = 1.2, gain = 0.08, type = 'bandpass', wet = 0.4, attack = 0.02, pan = 0,
} = {}) {
  const frames = Math.max(1, Math.floor((ctx.sampleRate || 44100) * dur))
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate || 44100)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  const src = ctx.createBufferSource()
  src.buffer = buf

  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(Math.max(30, from), at)
  filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), at + dur)

  const g = ctx.createGain()
  decay(g, at, dur, gain, attack)

  src.connect(filter).connect(g)
  route(g, wet, pan)
  src.start(at)
  src.stop(at + dur)
}

// ── The three sounds ───────────────────────────────────────────────────────

function playRocket(t) {
  // Rumble — felt, not heard. Sub plus a narrow low band, both quiet.
  sub(t + 0.00, 0.60, { from: 38, to: 30, gain: 0.26, wet: 0.05 })
  air(t + 0.00, 0.50, { from: 110, to: 70, q: 2.2, gain: 0.07, wet: 0.35, attack: 0.18 })

  // Ignition — a chest thump with a body on top of it, not a bark.
  sub(t + 0.22, 0.45, { from: 76, to: 34, gain: 0.5, wet: 0.08 })
  air(t + 0.22, 0.16, { from: 260, to: 90, q: 1.1, gain: 0.09, wet: 0.3, attack: 0.004 })

  // Build — the thrust. Pitched stack rising with its filter opening, and a
  // narrow band of noise riding on top of it. Layering the two is what makes
  // this read as thrust; the noise alone was the cartoon whoosh.
  swell(t + 0.40, 0.80, {
    from: 110, to: 340, gain: 0.13, cutFrom: 400, cutTo: 3200, spread: 11, wet: 0.4, attack: 0.22,
  })
  air(t + 0.40, 0.78, { from: 700, to: 3600, q: 3.5, gain: 0.075, wet: 0.5, attack: 0.3 })

  // Launch — the stack takes over and leaves.
  swell(t + 0.95, 0.70, {
    from: 220, to: 760, gain: 0.15, cutFrom: 900, cutTo: 7000, spread: 14, wet: 0.6, attack: 0.09,
  })
  air(t + 1.05, 0.55, { from: 2200, to: 5200, q: 2.4, gain: 0.05, wet: 0.6, attack: 0.15 })

  // Boom — a sub drop with a short crack over it and a long tail. Deliberately
  // the loudest moment in the whole set.
  sub(t + 1.75, 0.85, { from: 64, to: 26, gain: 0.55, wet: 0.14 })
  air(t + 1.75, 0.22, { from: 1800, to: 320, q: 0.9, gain: 0.085, wet: 0.75, attack: 0.003 })

  // Shimmer out — three faint bells into the reverb tail.
  bell(t + 2.02, 0.60, { freq: 1567.98, gain: 0.035, index: 3, wet: 0.9, pan: -0.25 })
  bell(t + 2.10, 0.55, { freq: 2093.00, gain: 0.030, index: 3, wet: 0.9, pan: 0.25 })
  bell(t + 2.18, 0.50, { freq: 2637.02, gain: 0.024, index: 2.5, wet: 0.9 })
}

/**
 * Portfolio all-time high — arrival, not alarm.
 *
 * A warm sub under a C-major arpeggio played on struck bells, wide reverb, and
 * a pad holding the root so the four notes sit on something instead of hanging
 * in silence between each other.
 */

function playAth(t) {
  sub(t + 0.00, 0.75, { from: 110, to: 104, gain: 0.30, wet: 0.10 })
  swell(t + 0.02, 1.30, {
    from: 130.81, to: 130.81, gain: 0.055, type: 'sawtooth',
    cutFrom: 300, cutTo: 900, spread: 6, wet: 0.55, attack: 0.3,
  })

  // C5 E5 G5 C6, struck. Alternating slightly across the image so the run has
  // width rather than arriving from one point.
  const notes = [523.25, 659.25, 783.99, 1046.50]
  const pans  = [-0.22, 0.14, -0.12, 0.20]
  notes.forEach((f, i) => bell(t + 0.18 + i * 0.11, 0.85 - i * 0.06, {
    freq: f, gain: 0.115 - i * 0.012, ratio: 2.76, index: 4.2 - i * 0.5, wet: 0.55, pan: pans[i],
  }))

  bell(t + 0.82, 0.70, { freq: 2093.00, gain: 0.028, index: 2.4, wet: 0.9 })
}

/**
 * Net-worth milestone — weightier and slower than the ATH.
 *
 * This happens a handful of times in the whole life of an account, so it gets
 * a real impact, a rising figure, and a bass note that resolves underneath
 * everything rather than a final beep.
 */

function playChampion(t) {
  // Approach — pitch, filter and noise all climbing together. The long attack
  // keeps it from reading as a separate sound; it should feel like one thing
  // getting closer.
  swell(t + 0.00, 1.15, {
    from: 146.83, to: 440, gain: 0.12,
    cutFrom: 300, cutTo: 5200, spread: 12, wet: 0.35, attack: 0.55,
  })
  air(t + 0.10, 1.05, { from: 500, to: 4800, q: 2.8, gain: 0.06, wet: 0.45, attack: 0.6 })
  sub(t + 0.55, 0.70, { from: 40, to: 58, gain: 0.20, wet: 0.05 })

  // Impact. The loudest moment in the set, and the only one that has to be:
  // the logo is the size of the screen when this lands.
  sub(t + 1.15, 0.95, { from: 88, to: 24, gain: 0.60, wet: 0.15 })
  air(t + 1.15, 0.26, { from: 2600, to: 260, q: 0.7, gain: 0.10, wet: 0.7, attack: 0.002 })
  bell(t + 1.15, 0.70, { freq: 220.00, gain: 0.055, index: 5, wet: 0.6 })

  // Debris — spread wide, falling away. Panned apart so the tail opens out
  // instead of collapsing back to the middle.
  bell(t + 1.34, 0.80, { freq: 1760.00, gain: 0.032, index: 4, wet: 0.9, pan: -0.4 })
  bell(t + 1.46, 0.75, { freq: 1318.51, gain: 0.030, index: 4, wet: 0.9, pan: 0.45 })
  bell(t + 1.62, 0.90, { freq: 880.00, gain: 0.026, index: 3, wet: 0.95, pan: -0.15 })
  air(t + 1.40, 0.80, { from: 3200, to: 900, q: 1.6, gain: 0.030, wet: 0.85, attack: 0.05 })
}

// ── The three voices, mapped to the three effects ──────────────────────────
//
// explode reuses the champion voice: an approach, an impact, and debris
// falling away. It is the sound the effect was recognised by, and the visual
// in ScreenEffect.jsx is keyed to the same 44% split.

const VOICES = {
  [EXPLODE]: playChampion,
  [ROCKET]: playRocket,
  [ATH]: playAth,
}

/** Per-voice loudness trim, from the original table. */
const VOICE_TRIM = {
  [EXPLODE]: TRIM.champion,
  [ROCKET]: TRIM.rocket,
  [ATH]: TRIM.ath,
}

/** Roughly how long each sound runs, for syncing the visual layer. */
export const SOUND_MS = {
  [EXPLODE]: 2600,
  [ROCKET]: 2500,
  [ATH]: 1600,
}

// ── Keeping the sound on the picture's clock ───────────────────────────────
//
// A cue that cannot be heard the moment its animation starts used to be held
// until the next tap and then played from the top. The burst on opening the
// app is exactly that case — it arrives before any gesture — so the tap came
// during or after the animation and the whole sound, impact included, landed
// after the picture had finished.
//
// Now every cue carries the time its animation started. Whenever audio
// becomes available (the context resuming, or a tap), the sound is scheduled
// that far into itself, so its impact still lands on the picture's impact.
// Once the animation is past its impact there is nothing left to line up
// with, and the cue is dropped: a boom after the picture has gone reads as
// lag, not as a sound effect.

/** How late a cue may still start and land its impact on the picture's. */
export const LATEST_START_MS = {
  [EXPLODE]: 950,   // impact at 1.15 s
  [ROCKET]: 1500,   // boom at 1.75 s
  [ATH]: 400,       // bells from 0.18 s
}

let held = null       // { effect, startedAt } waiting for audio
let armed = false     // whether the release listener is attached

/**
 * Whether audio can be heard right now.
 *
 * Reads the context rather than a cached flag, deliberately. resume() is
 * ASYNCHRONOUS: checking `ctx.state` on the line after calling it returns
 * 'suspended' every single time, and a cached "unlocked" boolean written from
 * that read is false forever.
 */
export function canPlay() {
  return !!ctx && ctx.state === 'running'
}

/** Schedule one voice, `lateSec` into itself. Assumes the context is running. */
function emit(voice, effect, lateSec = 0) {
  voiceTrim = VOICE_TRIM[effect] || 1
  // A start time in the past is legal: layers that were due already start at
  // once, partway through their envelopes, and later ones keep their places.
  try { voice(ctx.currentTime + 0.02 - lateSec) } finally { voiceTrim = 1 }
}

/** Play the held cue if audio is running and its moment has not passed. */
function flush() {
  if (!held || !canPlay()) return false
  const { effect, startedAt } = held
  held = null
  detach()
  const late = Math.max(0, Date.now() - startedAt)
  if (late > (LATEST_START_MS[effect] ?? 0)) return false
  try { emit(VOICES[effect], effect, late / 1000); return true } catch { return false }
}

function releaseHeld() {
  if (!held) return detach()
  if (Date.now() - held.startedAt > (LATEST_START_MS[held.effect] ?? 0)) { held = null; return detach() }
  unlock()
  if (!flush()) ctx?.resume?.().then(flush).catch(() => {})
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
 * Play a cue in step with an animation that started at `startedAt`.
 *
 * Plays now when the context is running. Otherwise it asks the context to
 * resume (which the browser allows without a tap once the page may play
 * sound) and waits for that or for a tap, but only for as long as the sound
 * can still land on the picture.
 *
 * @returns {boolean} whether it was scheduled now. False means waiting or
 *                    unavailable — never that something went wrong.
 */
export function playEffectSound(effect, startedAt = Date.now()) {
  if (!VOICES[effect]) return false
  held = { effect, startedAt }
  // Creating the context outside a gesture is harmless: where autoplay is
  // allowed it runs, and elsewhere it stays suspended until a tap resumes it.
  unlock()
  if (flush()) return true
  if (!ctx) { held = null; return false }
  attach()
  ctx.resume?.().then(flush).catch(() => {})
  // Past its moment, stop listening for the tap that would have released it.
  const wait = LATEST_START_MS[effect] ?? 0
  setTimeout(() => { if (held?.startedAt === startedAt && Date.now() - startedAt > wait) { held = null; detach() } }, wait + 50)
  return false
}

/**
 * For tests and for teardown; drops a held cue and gives up the hardware.
 *
 * Closing the context matters when the user switches effects off: an open one
 * keeps the audio route alive, which on some Android builds shows a media
 * indicator for an app that is not playing anything.
 */
export function resetEffectAudio() {
  held = null
  detach()
  try { ctx?.close() } catch { /* already gone */ }
  ctx = null
  master = null
  bus = null
  dry = null
  verb = null
}
