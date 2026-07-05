// ── Premium UI sound effects (Web Audio) ──────────────────────────────────
// Synthesized on the fly — no audio files, no network, works offline.
// Mobile browsers start the AudioContext SUSPENDED and only allow it to run
// after a user gesture, so we unlock (resume + prime with a silent buffer) on
// the very first touch/click anywhere in the app, then keep it warm.

let ctx = null
let master = null
let enabled = true
let unlocked = false

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
  return ctx
}

function unlock() {
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') { c.resume().catch(() => {}) }
  if (!unlocked) {
    // Prime the output with a 1-sample silent buffer — the classic trick that
    // fully unlocks Web Audio on iOS/Android after the first gesture.
    try {
      const b = c.createBuffer(1, 1, 22050)
      const s = c.createBufferSource()
      s.buffer = b; s.connect(c.destination); s.start(0)
    } catch {}
    unlocked = true
  }
}

// Attach the first-gesture unlock as soon as this module loads.
if (typeof window !== 'undefined') {
  const first = () => { unlock() }
  const evs = ['pointerdown', 'touchend', 'mousedown', 'keydown']
  const handler = () => { unlock(); if (ctx && ctx.state === 'running') evs.forEach(e => window.removeEventListener(e, handler)) }
  evs.forEach(e => window.addEventListener(e, handler, { passive: true }))
  void first
}

function tone({ freq, type = 'sine', dur = 0.14, gain = 0.2, attack = 0.006, when = 0, glideTo }) {
  const c = ensure(); if (!c || !master) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  const t = c.currentTime + when
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g); g.connect(master)
  osc.start(t); osc.stop(t + dur + 0.04)
}

const SOUNDS = {
  select:   () => tone({ freq: 560, type: 'sine', dur: 0.09, gain: 0.16, glideTo: 780 }),
  step:     () => { tone({ freq: 494, dur: 0.11, gain: 0.18 }); tone({ freq: 659.25, dur: 0.14, gain: 0.18, when: 0.06 }) },
  welcome:  () => { tone({ freq: 392, dur: 0.16, gain: 0.18 }); tone({ freq: 523.25, dur: 0.2, gain: 0.18, when: 0.1 }) },
  complete: () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.18, gain: 0.2, when: i * 0.085 })) },
  coin:     () => { [659.25, 783.99, 987.77, 1318.51].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.15, gain: 0.19, when: i * 0.055 })) },
}

const sfx = {
  play(name) {
    if (!enabled) return
    unlock()
    try { (SOUNDS[name] || SOUNDS.select)() } catch {}
  },
  haptic(pattern) { try { if (enabled && navigator.vibrate) navigator.vibrate(pattern) } catch {} },
  isEnabled() { return enabled },
  setEnabled(v) {
    enabled = !!v
    try { localStorage.setItem('wl_sfx_enabled', enabled ? '1' : '0') } catch {}
    if (enabled) { unlock(); this.play('select') }
  },
}

export default sfx
