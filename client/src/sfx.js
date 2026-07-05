// ── Ambient background sound (Web Audio) ──────────────────────────────────
// A soft, evolving synthesized pad — no audio files, no network, works
// offline. Plays quietly in the background during onboarding rather than
// firing a sound on every click. Mobile browsers start the AudioContext
// suspended, so we unlock on the first gesture, then fade the pad in.

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

// Re-arm the pad once the context is actually running (first gesture on mobile).
if (typeof window !== 'undefined') {
  const onGesture = () => { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}) }
  ;['pointerdown', 'touchend', 'mousedown', 'keydown'].forEach(e => window.addEventListener(e, onGesture, { passive: true }))
}

function startAmbient() {
  if (!enabled) return
  const c = ensure(); if (!c || !master || bg) return
  const now = c.currentTime

  const out = c.createGain()
  out.gain.setValueAtTime(0.0001, now)
  out.gain.exponentialRampToValueAtTime(0.22, now + 3.5) // slow fade-in

  // Gentle low-pass that "breathes" via a slow LFO — gives the pad movement.
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'; filter.frequency.value = 650; filter.Q.value = 0.7
  const lfo = c.createOscillator(); const lfoGain = c.createGain()
  lfo.frequency.value = 0.05; lfoGain.gain.value = 320
  lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start()

  filter.connect(out); out.connect(master)

  // Soft, warm chord (A minor add9 voicing) with a little detune + per-voice
  // amplitude shimmer so it never sounds static.
  const freqs = [110, 164.81, 220, 261.63, 329.63]
  const voices = freqs.map((f, i) => {
    const o = c.createOscillator(); const g = c.createGain()
    o.type = i < 2 ? 'sine' : 'triangle'
    o.frequency.value = f * (i % 2 ? 1.003 : 0.997)
    g.gain.value = 0.16
    const alfo = c.createOscillator(); const ag = c.createGain()
    alfo.frequency.value = 0.04 + i * 0.013; ag.gain.value = 0.06
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
    b.out.gain.setValueAtTime(Math.max(0.0001, b.out.gain.value || 0.22), now)
    b.out.gain.exponentialRampToValueAtTime(0.0001, now + 1.6)
  } catch {}
  setTimeout(() => {
    try {
      b.voices.forEach(v => { try { v.o.stop() } catch {} ; try { v.alfo.stop() } catch {} })
      b.lfo.stop(); b.out.disconnect(); b.filter.disconnect()
    } catch {}
  }, 1800)
}

const sfx = {
  startAmbient,
  stopAmbient,
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
