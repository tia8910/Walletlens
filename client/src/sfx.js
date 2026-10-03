// ── Ambient background sound + onboarding SFX (Web Audio) ────────────────
// Synthesized pad + chimes — no audio files, no network, works offline.

let ctx = null
let master = null
let enabled = true
let bg = null

try { const v = localStorage.getItem('wl_sfx_enabled'); enabled = v === null ? true : v === '1' } catch {}

function ensure() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') { ctx.resume().catch(() => {}) }
  return ctx
}

if (typeof window !== 'undefined') {
  const onGesture = () => { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}) }
  ;['pointerdown', 'touchend', 'mousedown', 'keydown'].forEach(e => window.addEventListener(e, onGesture, { passive: true }))
}

// ── Rich ambient pad ─────────────────────────────────────────────────────
function startAmbient() {
  if (!enabled) return
  const c = ensure(); if (!c || !master || bg) return
  const now = c.currentTime

  const out = c.createGain()
  out.gain.setValueAtTime(0.0001, now)
  out.gain.exponentialRampToValueAtTime(0.35, now + 4)

  // Warm lowpass with breathing LFO
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = 0.8
  const lfo = c.createOscillator(); const lfoGain = c.createGain()
  lfo.frequency.value = 0.04; lfoGain.gain.value = 350
  lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start()
  filter.connect(out); out.connect(master)

  // Lush chord: Am9 voicing with slow shimmer
  const freqs = [110, 164.81, 220, 261.63, 329.63, 392]
  const voices = freqs.map((f, i) => {
    const o = c.createOscillator(); const g = c.createGain()
    o.type = i < 2 ? 'sine' : 'triangle'
    o.frequency.value = f * (1 + (i % 2 ? 0.003 : -0.003))
    g.gain.value = 0.12
    const alfo = c.createOscillator(); const ag = c.createGain()
    alfo.frequency.value = 0.035 + i * 0.01; ag.gain.value = 0.05
    alfo.connect(ag); ag.connect(g.gain); alfo.start()
    o.connect(g); g.connect(filter); o.start()
    return { o, alfo }
  })

  bg = { out, filter, lfo, voices }
}

function stopAmbient() {
  const c = ctx; if (!c || !bg) return
  const now = c.currentTime
  const b = bg; bg = null
  try {
    b.out.gain.cancelScheduledValues(now)
    b.out.gain.setValueAtTime(Math.max(0.0001, b.out.gain.value || 0.18), now)
    b.out.gain.exponentialRampToValueAtTime(0.0001, now + 1.8)
  } catch {}
  setTimeout(() => {
    try {
      b.voices.forEach(v => { try { v.o.stop() } catch {} ; try { v.alfo.stop() } catch {} })
      b.lfo.stop(); b.out.disconnect(); b.filter.disconnect()
    } catch {}
  }, 2000)
}

// ── Onboarding chime: soft ascending arpeggio ────────────────────────────
function playChime() {
  if (!enabled) return
  const c = ensure(); if (!c) return
  const now = c.currentTime

  // Pentatonic arpeggio — C E G A C' — warm and inviting
  const notes = [261.63, 329.63, 392, 440, 523.25]
  notes.forEach((freq, i) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    const t = now + i * 0.08
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + 0.7)
  })
}

// ── Slide transition: soft whoosh + sparkle ──────────────────────────────
function playWhoosh() {
  if (!enabled) return
  const c = ensure(); if (!c) return
  const now = c.currentTime

  // Filtered noise burst (whoosh)
  const bufSize = c.sampleRate * 0.3
  const buf = c.createBuffer(1, bufSize, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3
  const src = c.createBufferSource()
  src.buffer = buf

  const f = c.createBiquadFilter()
  f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 1.2
  const fLfo = c.createOscillator(); const fG = c.createGain()
  fLfo.frequency.value = 8; fG.gain.value = 800
  fLfo.connect(fG); fG.connect(f.frequency); fLfo.start()

  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.08, now + 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)

  src.connect(f); f.connect(g); g.connect(master)
  src.start(now); src.stop(now + 0.3)

  // Sparkle tones
  ;[1200, 1800, 2400].forEach((freq, i) => {
    const o = c.createOscillator()
    const og = c.createGain()
    o.type = 'sine'; o.frequency.value = freq
    const t = now + 0.05 + i * 0.03
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(0.06, t + 0.02)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    o.connect(og); og.connect(master)
    o.start(t); o.stop(t + 0.25)
  })

  setTimeout(() => { try { fLfo.stop() } catch {} }, 350)
}

// ── Final "go" chime: triumphant ascending ───────────────────────────────
function playTriumph() {
  if (!enabled) return
  const c = ensure(); if (!c) return
  const now = c.currentTime

  const notes = [261.63, 329.63, 392, 523.25, 659.25]
  notes.forEach((freq, i) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = i < 3 ? 'triangle' : 'sine'
    o.frequency.value = freq
    const t = now + i * 0.1
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + 0.9)
  })
}

// ── Selection note: one step up the scale per pick ───────────────────────
// Picking assets plays a rising pentatonic line, so choosing three things
// sounds like progress; unpicking plays one low, soft note instead.
const PICK_SCALE = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880]
function playSelect(n = 0, on = true) {
  if (!enabled) return
  const c = ensure(); if (!c) return
  const now = c.currentTime
  const note = (freq, t, type, peak, dur) => {
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type; o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + dur + 0.05)
  }
  if (on) {
    const f = PICK_SCALE[Math.max(0, Math.min(n, PICK_SCALE.length - 1))]
    note(f, now, 'sine', 0.16, 0.55)
    note(f * 2, now + 0.03, 'sine', 0.04, 0.35)
  } else {
    note(196, now, 'triangle', 0.07, 0.25)
  }
}

// ── Unlock: a latch clicks open, then a bright gold shimmer ──────────────
// Plays as the lock screen lets go, so the sound lands with the portfolio
// appearing: a short filtered tick for the latch, then a rising fifth with an
// octave sparkle on top.
function playUnlock() {
  if (!enabled) return
  const c = ensure(); if (!c) return
  const now = c.currentTime

  // Latch: 40ms of band-passed noise, closer to a click than a hiss.
  const len = Math.floor(c.sampleRate * 0.04)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource(); src.buffer = buf
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 2.5
  const cg = c.createGain(); cg.gain.value = 0.22
  src.connect(bp); bp.connect(cg); cg.connect(master)
  src.start(now); src.stop(now + 0.05)

  const note = (freq, t, type, peak, dur) => {
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type; o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + dur + 0.05)
  }
  // E5 then B5, each with a quiet octave above it.
  note(659.25, now + 0.06, 'sine', 0.15, 0.5)
  note(1318.5, now + 0.07, 'sine', 0.035, 0.35)
  note(987.77, now + 0.16, 'sine', 0.16, 0.9)
  note(1975.5, now + 0.17, 'sine', 0.04, 0.6)
  note(2637, now + 0.24, 'triangle', 0.02, 0.45)
}

// ── Keeping the pad going across screens ─────────────────────────────────
// The setup screens follow one another, and each one holds the ambient pad
// while it is up. Releasing waits a moment before fading, so the pad carries
// straight on into the next screen instead of dipping between them.
let ambientHolds = 0
let ambientStopTimer = null
function holdAmbient() {
  ambientHolds++
  clearTimeout(ambientStopTimer)
  startAmbient()
  let released = false
  return () => {
    if (released) return
    released = true
    ambientHolds = Math.max(0, ambientHolds - 1)
    clearTimeout(ambientStopTimer)
    ambientStopTimer = setTimeout(() => { if (!ambientHolds) stopAmbient() }, 400)
  }
}

// ── Onboarding story sounds ──────────────────────────────────────────────
// The first-run story has its own sound, matched to its pictures: a deep
// space drone under the particle field, an airy rise between scenes, a
// wooden tick as the language drum turns, a bell bloom for each colour, a
// charge that climbs while the launch ring is held, and a warp on launch.

let drone = null
function startDrone() {
  if (!enabled) return
  const c = ensure(); if (!c || !master || drone) return
  const now = c.currentTime
  const out = c.createGain()
  out.gain.setValueAtTime(0.0001, now)
  out.gain.exponentialRampToValueAtTime(0.28, now + 3)
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 3
  const sweep = c.createOscillator(); const sg = c.createGain()
  sweep.frequency.value = 0.05; sg.gain.value = 260
  sweep.connect(sg); sg.connect(lp.frequency); sweep.start()
  lp.connect(out); out.connect(master)
  // A low D with a fifth and a soft ninth: open, calm, a little cosmic.
  const parts = [[73.42, 'sine', 0.5], [110, 'sawtooth', 0.06], [146.83, 'sawtooth', 0.05], [164.81, 'triangle', 0.08], [220, 'sine', 0.05]]
  const oscs = parts.map(([f, type, gain], i) => {
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type; o.frequency.value = f; o.detune.value = (i % 2 ? 6 : -6)
    g.gain.value = gain
    o.connect(g); g.connect(lp); o.start()
    return o
  })
  drone = { out, lp, sweep, oscs }
}
function stopDrone() {
  const c = ctx; if (!c || !drone) return
  const d = drone; drone = null
  const now = c.currentTime
  try { d.out.gain.cancelScheduledValues(now); d.out.gain.setValueAtTime(Math.max(0.0001, d.out.gain.value), now); d.out.gain.exponentialRampToValueAtTime(0.0001, now + 1.2) } catch {}
  setTimeout(() => { try { d.oscs.forEach(o => o.stop()); d.sweep.stop(); d.out.disconnect() } catch {} }, 1400)
}

function noiseBuffer(c, secs) {
  const len = Math.floor(c.sampleRate * secs)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}
function tone(c, freq, t, type, peak, dur, dest = master) {
  const o = c.createOscillator(); const g = c.createGain()
  o.type = type; o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05)
  return o
}

/** Between scenes: air rising through a filter, with a soft upward glide. */
function playRise(up = true) {
  if (!enabled) return
  const c = ensure(); if (!c) return
  const now = c.currentTime
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.6)
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9
  bp.frequency.setValueAtTime(up ? 500 : 3000, now)
  bp.frequency.exponentialRampToValueAtTime(up ? 3200 : 500, now + 0.45)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.09, now + 0.18)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)
  src.connect(bp); bp.connect(g); g.connect(master); src.start(now); src.stop(now + 0.6)
  const o = c.createOscillator(); const og = c.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(up ? 293.66 : 440, now + 0.05)
  o.frequency.exponentialRampToValueAtTime(up ? 440 : 293.66, now + 0.4)
  og.gain.setValueAtTime(0.0001, now + 0.05)
  og.gain.exponentialRampToValueAtTime(0.07, now + 0.15)
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
  o.connect(og); og.connect(master); o.start(now + 0.05); o.stop(now + 0.55)
}

/** The language drum turning one notch: a short wooden tick. */
function playTick(n = 0) {
  if (!enabled) return
  const c = ensure(); if (!c) return
  const now = c.currentTime
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.03)
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + (n % 6) * 120; bp.Q.value = 6
  const g = c.createGain(); g.gain.value = 0.25
  src.connect(bp); bp.connect(g); g.connect(master); src.start(now); src.stop(now + 0.04)
  tone(c, 880 + (n % 6) * 55, now, 'sine', 0.05, 0.12)
}

/** A colour picked: a bell that blooms, pitched by the colour's place. */
const BLOOM = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1046.5]
function playBloom(i = 0) {
  if (!enabled) return
  const c = ensure(); if (!c) return
  const now = c.currentTime
  const f = BLOOM[Math.abs(i) % BLOOM.length]
  tone(c, f, now, 'sine', 0.16, 1.1)
  tone(c, f * 2.01, now + 0.01, 'sine', 0.05, 0.7)
  tone(c, f * 3.02, now + 0.02, 'triangle', 0.02, 0.4)
  tone(c, f / 2, now, 'sine', 0.06, 0.9)
}

/** Holding the launch ring: a tone climbing with the fill. */
let charge = null
function startCharge(ms = 1100) {
  if (!enabled || charge) return
  const c = ensure(); if (!c) return
  const now = c.currentTime, secs = ms / 1000
  const o = c.createOscillator(); const o2 = c.createOscillator(); const g = c.createGain()
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6
  o.type = 'sawtooth'; o2.type = 'sine'
  o.frequency.setValueAtTime(110, now); o.frequency.exponentialRampToValueAtTime(440, now + secs)
  o2.frequency.setValueAtTime(220, now); o2.frequency.exponentialRampToValueAtTime(880, now + secs)
  lp.frequency.setValueAtTime(300, now); lp.frequency.exponentialRampToValueAtTime(4000, now + secs)
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.08, now + secs)
  o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master)
  o.start(now); o2.start(now)
  charge = { o, o2, g }
}
function stopCharge() {
  const c = ctx; if (!c || !charge) return
  const ch = charge; charge = null
  const now = c.currentTime
  try { ch.g.gain.cancelScheduledValues(now); ch.g.gain.setValueAtTime(Math.max(0.0001, ch.g.gain.value), now); ch.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15) } catch {}
  try { ch.o.stop(now + 0.2); ch.o2.stop(now + 0.2) } catch {}
}

/** Launch: a rushing sweep, a sub drop and a bright major chord on top. */
function playWarp() {
  if (!enabled) return
  const c = ensure(); if (!c) return
  const now = c.currentTime
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 1.4)
  const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.Q.value = 0.7
  hp.frequency.setValueAtTime(300, now); hp.frequency.exponentialRampToValueAtTime(7000, now + 1.1)
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.0001, now); ng.gain.exponentialRampToValueAtTime(0.18, now + 0.5); ng.gain.exponentialRampToValueAtTime(0.0001, now + 1.3)
  src.connect(hp); hp.connect(ng); ng.connect(master); src.start(now); src.stop(now + 1.4)
  const sub = c.createOscillator(); const sg = c.createGain()
  sub.type = 'sine'; sub.frequency.setValueAtTime(110, now); sub.frequency.exponentialRampToValueAtTime(38, now + 0.9)
  sg.gain.setValueAtTime(0.0001, now); sg.gain.exponentialRampToValueAtTime(0.35, now + 0.05); sg.gain.exponentialRampToValueAtTime(0.0001, now + 1)
  sub.connect(sg); sg.connect(master); sub.start(now); sub.stop(now + 1.05)
  ;[587.33, 739.99, 880, 1174.66].forEach((f, i) => tone(c, f, now + 0.35 + i * 0.07, i < 2 ? 'triangle' : 'sine', 0.12, 1.4))
}

const sfx = {
  startAmbient,
  stopAmbient,
  playChime,
  playWhoosh,
  playTriumph,
  playSelect,
  playUnlock,
  holdAmbient,
  startDrone,
  stopDrone,
  playRise,
  playTick,
  playBloom,
  startCharge,
  stopCharge,
  playWarp,
  /** Opens the audio context inside a tap, so a sound that follows later
   *  (after a native prompt returns) is allowed to play. */
  prime() { ensure() },
  isPlaying() { return !!bg },
  haptic(pattern) { try { if (enabled && navigator.vibrate) navigator.vibrate(pattern) } catch {} },
  isEnabled() { return enabled },
  setEnabled(v) {
    enabled = !!v
    try { localStorage.setItem('wl_sfx_enabled', enabled ? '1' : '0') } catch {}
    if (!enabled) { stopAmbient(); stopDrone(); stopCharge() }
  },
}

export default sfx
