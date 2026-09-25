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

const sfx = {
  startAmbient,
  stopAmbient,
  playChime,
  playWhoosh,
  playTriumph,
  playSelect,
  holdAmbient,
  isPlaying() { return !!bg },
  haptic(pattern) { try { if (enabled && navigator.vibrate) navigator.vibrate(pattern) } catch {} },
  isEnabled() { return enabled },
  setEnabled(v) {
    enabled = !!v
    try { localStorage.setItem('wl_sfx_enabled', enabled ? '1' : '0') } catch {}
    if (!enabled) stopAmbient()
  },
}

export default sfx
