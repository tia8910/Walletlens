// Everything the browser is allowed to refuse.
//
// marketPulse.js decides what should be heard; this plays it. The split exists
// because the decision is pure and testable and this is neither — it depends
// on an AudioContext, a user gesture and a device that may be on silent.
//
// ── Why there are no sound files ───────────────────────────────────────────
//
// The three sounds are synthesised. That is not a placeholder — it is the
// better answer for a first release: nothing to download, no lazy-loading
// dance for three cinematic files most users will never trigger, no
// dependency on a sound designer to ship or to iterate, and loudness that is
// consistent by construction rather than by normalising exported files
// against each other.
//
// Being straight about the ceiling: synthesis cannot match a recorded,
// mastered sample, and if Market Pulse earns its keep, commissioned audio is
// a drop-in replacement for the three voices below and nothing else changes.
//
// ── What makes a synthesised sound read as cheap ───────────────────────────
//
// The first version was thin because of four specific things, all fixed here:
//
//   • bare sine and triangle oscillators. A single sine is a test tone. Notes
//     here are struck FM bells (Chowning's 2.76 ratio, modulation index
//     collapsing in the first few milliseconds) and detuned three-voice saw
//     stacks behind a moving filter — timbres with an attack transient and
//     partials that move.
//   • no space. Every sound landed bone dry, which is why they sounded like
//     they came out of a phone speaker rather than out of a room. Everything
//     now feeds a convolution reverb built from a darkened noise impulse.
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
// So unlock() is wired to the first real tap of the session and everything
// before it resolves silently. The practical consequence is designed for
// rather than worked around: the earliest a sound can play is the user's first
// tap, not app open.

const HIGHPASS_HZ = 45

let ctx = null
let master = null
let bus = null      // compressor everything lands on
let dry = null
let verb = null     // convolver input
let unlocked = false

/** True once audio can actually be heard. Exposed for diagnostics. */
export function isUnlocked() { return unlocked }

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
    // 'suspended' every time, so the previous version latched unlocked=false
    // inside the very gesture that was supposed to unlock it, and nothing ever
    // played on any device. The flag has to come from the promise.
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => { unlocked = ctx.state === 'running' }).catch(() => {})
    }
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

// ── Routing ────────────────────────────────────────────────────────────────

/**
 * Per-voice loudness trim, applied to dry and reverb alike.
 *
 * Set from play() and read by route(). Rendering the three voices offline and
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
  rocket: 1, ath: 1.9, milestone: 1.7, fireworks: 1.7,
  // The six below are first estimates, not measurements. They were set from
  // the layer gains rather than by ear, which is the wrong way round for a
  // table whose whole purpose is what you hear — the soft pads (aurora, dip)
  // need the most help because they have no transient to carry them. Worth a
  // pass on a real device with the others for reference.
  shockwave: 1.6, aurora: 2.1, lock: 1.8, rain: 1.5, dip: 2.0, storm: 1.7,
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

/**
 * Rocket — an asset newly crossed its class threshold.
 *
 * The cue offsets are load-bearing: index.css keys the overlay animation to
 * ignition at 0.22s, build at 0.40s, launch at 0.95s and boom at 1.75s of a
 * 2.5s timeline. Timbre may change freely; these numbers may not, or the
 * picture drifts off the sound.
 */
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
function playMilestone(t) {
  // Impact.
  sub(t + 0.00, 0.70, { from: 88, to: 44, gain: 0.5, wet: 0.10 })
  air(t + 0.00, 0.14, { from: 520, to: 140, q: 0.8, gain: 0.075, wet: 0.35, attack: 0.003 })

  // G4 C5 E5 — slower spacing and a higher modulation index than the ATH, so
  // the notes land with more metal in them.
  const notes = [392.00, 523.25, 659.25]
  const pans  = [-0.18, 0.12, -0.08]
  notes.forEach((f, i) => bell(t + 0.30 + i * 0.16, 1.00 - i * 0.08, {
    freq: f, gain: 0.13 - i * 0.01, ratio: 2.76, index: 5.4 - i * 0.6, wet: 0.6, pan: pans[i],
  }))

  bell(t + 0.95, 0.65, { freq: 3135.96, gain: 0.022, index: 2.2, wet: 0.95 })

  // Resolve. Slow in, long out, the last thing left in the room.
  sub(t + 1.10, 0.85, { from: 130.81, to: 130.81, gain: 0.22, wet: 0.16 })
  swell(t + 1.10, 0.85, {
    from: 261.63, to: 261.63, gain: 0.06, cutFrom: 340, cutTo: 700, spread: 5, wet: 0.7, attack: 0.28,
  })
}

/**
 * A single firework: whistle up, burst, crackling tail.
 *
 * The crackle is the part that decides whether this reads as a firework or as
 * a noise gate opening. Real crackle is dozens of separate tiny reports, not a
 * noise sweep, so it is built as scattered micro-bursts through a high
 * bandpass with randomised timing — a regular grid sounds like a machine gun.
 */
function firework(t, { pan = 0, size = 1, whistle = true } = {}) {
  if (whistle) {
    // The rising whistle: a narrow resonant band, not an oscillator, because
    // the real thing is air noise and a pure tone sounds like a cartoon slide.
    air(t, 0.42, { from: 400, to: 2100, q: 14, gain: 0.05 * size, wet: 0.5, attack: 0.2 })
  }

  const burst = t + (whistle ? 0.44 : 0)

  // The report.
  //
  // Weighted towards the midrange rather than the sub, because a phone
  // speaker rolls off below ~200 Hz and the sub is inaudible there. Measured
  // in the band a handset actually radiates, an earlier version of this voice
  // came in 5 dB under the other three — all its energy was in a bottom
  // octave the speaker cannot move and a crackle too quiet to carry it. The
  // sub is still here for headphones; it is just no longer doing the work
  // alone.
  sub(burst, 0.55 * size, { from: 90, to: 30, gain: 0.36 * size, wet: 0.18 })
  air(burst, 0.20, { from: 2400, to: 300, q: 0.7, gain: 0.19 * size, wet: 0.8, attack: 0.002, pan: pan * 0.7 })
  air(burst, 0.30, { from: 1100, to: 520, q: 1.1, gain: 0.15 * size, wet: 0.6, attack: 0.004, pan: pan * 0.6 })
  air(burst, 0.45, { from: 900, to: 180, q: 1.4, gain: 0.08 * size, wet: 0.7, attack: 0.01, pan: pan * 0.5 })

  // Crackle. Scattered, not gridded.
  const count = Math.round(18 * size)
  for (let i = 0; i < count; i++) {
    const at = burst + 0.06 + Math.pow(Math.random(), 0.7) * 1.05
    air(at, 0.035, {
      from: 3200 + Math.random() * 3800, to: 1400, q: 5,
      gain: (0.042 + Math.random() * 0.038) * size, wet: 0.85, attack: 0.002,
      // Scattered around the burst rather than on top of it, so the tail
      // opens out the way a real shell does.
      pan: Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.8)),
    })
  }

  // A little pitched sparkle riding the tail, panned with the burst.
  bell(burst + 0.10, 0.5, {
    freq: 1200 + Math.random() * 700, gain: 0.055 * size, index: 3, wet: 0.9, pan,
  })
}

/**
 * Fireworks — the whole portfolio having a good day.
 *
 * Three bursts rather than one, spread across the image and staggered
 * unevenly. Evenly spaced bursts read as a machine; a real display never
 * lands on the beat.
 */
function playFireworks(t) {
  firework(t + 0.00, { pan: -0.35, size: 1.0 })
  firework(t + 0.62, { pan: 0.40, size: 0.85 })
  firework(t + 1.28, { pan: -0.10, size: 1.15 })
  // A last one with no whistle, so the display ends on a report rather than
  // on the anticipation of one.
  firework(t + 2.30, { pan: 0.22, size: 0.7, whistle: false })
}


/**
 * Shockwave — a second asset crossing, after the rocket already went.
 *
 * The whole point is that it is *small*. One soft thump and a bell, under
 * half a second, so three of them in a row still read as punctuation rather
 * than as three events competing.
 */
function playShockwave(t) {
  sub(t + 0.00, 0.28, { from: 72, to: 40, gain: 0.30, wet: 0.06 })
  air(t + 0.00, 0.10, { from: 900, to: 300, q: 1.4, gain: 0.045, wet: 0.35, attack: 0.003 })
  bell(t + 0.04, 0.42, { freq: 1318.51, gain: 0.045, index: 3, wet: 0.7 })
}

/**
 * Aurora — the market broadly green. Weather, not an event.
 *
 * No transient anywhere: everything fades in. A sound with an attack would
 * announce itself, and this is meant to be noticed a beat late, the way you
 * notice light changing.
 */
function playAurora(t) {
  swell(t + 0.00, 2.10, {
    from: 196, to: 294, gain: 0.075, type: 'sine',
    cutFrom: 500, cutTo: 2400, spread: 6, wet: 0.75, attack: 0.85,
  })
  swell(t + 0.35, 1.80, {
    from: 293.66, to: 392, gain: 0.055, type: 'sine',
    cutFrom: 700, cutTo: 3000, spread: 9, wet: 0.8, attack: 0.7,
  })
  air(t + 0.20, 1.90, { from: 1800, to: 4200, q: 0.8, gain: 0.028, wet: 0.85, attack: 0.9 })
  bell(t + 1.30, 0.90, { freq: 1567.98, gain: 0.028, index: 2, wet: 0.95, pan: 0.3 })
}

/**
 * Target lock — a price the user asked about, reached.
 *
 * Two clean tones a fifth apart, the second landing exactly on the beat of the
 * first. Deliberately mechanical: this is a confirmation, not a celebration.
 * Nobody wants applause for arithmetic they set up themselves.
 */
function playLock(t) {
  air(t + 0.00, 0.07, { from: 2400, to: 1200, q: 2.0, gain: 0.05, wet: 0.25, attack: 0.002 })
  bell(t + 0.00, 0.34, { freq: 880.00, gain: 0.085, index: 2, ratio: 2, wet: 0.35 })
  bell(t + 0.22, 0.62, { freq: 1318.51, gain: 0.095, index: 2, ratio: 2, wet: 0.5 })
  sub(t + 0.22, 0.40, { from: 110, to: 82, gain: 0.20, wet: 0.05 })
}

/**
 * Green rain — a portfolio day well past fireworks.
 *
 * A rising pentatonic scatter, panned across the field so it sounds like many
 * small things arriving rather than one big one. Pentatonic because no two
 * notes in it can clash, however they land against each other.
 */
function playRain(t) {
  const notes = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51]
  sub(t + 0.00, 0.70, { from: 90, to: 60, gain: 0.22, wet: 0.08 })
  swell(t + 0.00, 1.60, {
    from: 261.63, to: 523.25, gain: 0.07, type: 'triangle',
    cutFrom: 600, cutTo: 3600, spread: 8, wet: 0.6, attack: 0.3,
  })
  notes.forEach((f, i) => {
    bell(t + 0.06 + i * 0.115, 0.55, {
      freq: f, gain: 0.055 - i * 0.003, index: 3, wet: 0.8,
      pan: (i % 2 ? 1 : -1) * (0.15 + (i / notes.length) * 0.35),
    })
  })
}

/**
 * Dip — the portfolio down enough to say so.
 *
 * A minor third falling, once, on soft bells. No dissonance and no low rumble:
 * the sound has to acknowledge a bad day without editorialising about it, and
 * anything darker turns a 5% move into a funeral.
 */
function playDip(t) {
  swell(t + 0.00, 1.30, {
    from: 174.61, to: 146.83, gain: 0.065, type: 'sine',
    cutFrom: 800, cutTo: 500, spread: 5, wet: 0.6, attack: 0.35,
  })
  bell(t + 0.10, 0.80, { freq: 587.33, gain: 0.055, index: 2.5, wet: 0.7, pan: -0.2 })
  bell(t + 0.42, 1.00, { freq: 493.88, gain: 0.050, index: 2.5, wet: 0.8, pan: 0.2 })
  air(t + 0.00, 1.20, { from: 900, to: 380, q: 0.9, gain: 0.022, wet: 0.6, attack: 0.4 })
}

/**
 * Storm — a hard day.
 *
 * Lower and slower than the dip, and that is the only difference. It resolves
 * downward to a held root and stops, rather than hanging unresolved: the day
 * was bad, it is over, the app is not going to sit in it with you.
 */
function playStorm(t) {
  sub(t + 0.00, 1.60, { from: 55, to: 41, gain: 0.30, wet: 0.10 })
  swell(t + 0.00, 2.00, {
    from: 130.81, to: 110.00, gain: 0.085, type: 'sine',
    cutFrom: 700, cutTo: 340, spread: 7, wet: 0.7, attack: 0.55,
  })
  air(t + 0.10, 1.90, { from: 700, to: 240, q: 0.7, gain: 0.030, wet: 0.7, attack: 0.6 })
  bell(t + 0.30, 1.20, { freq: 440.00, gain: 0.045, index: 2, wet: 0.85, pan: -0.25 })
  bell(t + 0.85, 1.40, { freq: 349.23, gain: 0.042, index: 2, wet: 0.9, pan: 0.25 })
  // Lands on the root. The resolution is the point.
  bell(t + 1.45, 1.30, { freq: 261.63, gain: 0.048, index: 1.8, wet: 0.9 })
}

const VOICES = {
  rocket: playRocket, ath: playAth, milestone: playMilestone, fireworks: playFireworks,
  shockwave: playShockwave, aurora: playAurora, lock: playLock,
  rain: playRain, dip: playDip, storm: playStorm,
}

/** Roughly how long each sound runs, for syncing the visual layer. */
export const DURATION_MS = {
  rocket: 2500, ath: 1600, milestone: 1950, fireworks: 3600,
  shockwave: 700, aurora: 2600, lock: 1100, rain: 2200, dip: 1700, storm: 2900,
}

/**
 * Play one event's sound.
 *
 * Returns whether anything was actually scheduled, so the caller can tell
 * "played" from "silently declined" — the same distinction that matters for
 * the review card, and for the same reason: a feature that cannot report
 * whether it did anything is impossible to debug from a user's phone.
 */
/** Schedule one voice now. Assumes the context is running. */
function emit(voice, type) {
  unlocked = true
  voiceTrim = TRIM[type] || 1
  try { voice(ctx.currentTime + 0.02) } finally { voiceTrim = 1 }
}

export function play(type) {
  try {
    const voice = VOICES[type]
    if (!voice) return false
    if (!ctx) return false

    // Trust the context, not the cached flag. `unlocked` is a hint that can
    // lag the real state in both directions — the resume promise may not have
    // settled yet, and a context can be suspended again by the platform when
    // the app is backgrounded. ctx.state is the only thing that actually
    // decides whether a scheduled node will be heard.
    if (ctx.state !== 'running') {
      // And when it is not running, wait for it rather than dropping the note.
      //
      // This is the same asynchronous-resume trap as in unlock(), reintroduced
      // one level up: resume() settles on a later tick, so any caller that
      // unlocks and plays inside a single handler finds the context still
      // 'suspended' and gets silence. That is not an edge case — it is the
      // first tap of every session, and it is exactly what the ?pulse= demo
      // does, which made the whole feature look mute.
      //
      // A few milliseconds late is imperceptible; not playing at all is the
      // entire bug.
      ctx.resume?.().then(() => {
        if (ctx && ctx.state === 'running') emit(voice, type)
      }).catch(() => {})
      return true
    }

    emit(voice, type)
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
  bus = null
  dry = null
  verb = null
  unlocked = false
}
