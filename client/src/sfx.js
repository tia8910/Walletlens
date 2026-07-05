// ── Premium UI sound effects (Web Audio) ──────────────────────────────────
// Synthesized on the fly — no audio files, no network, works offline. Soft,
// short, low-volume tones for an understated premium feel. Play from user-
// gesture handlers (clicks) so the audio context unlocks per autoplay policy.
// Currently wired into the welcome/onboarding flow; the engine is generic.

let ctx = null
let master = null
let enabled = true

try { const v = localStorage.getItem('wl_sfx_enabled'); enabled = v === null ? true : v === '1' } catch {}

function ac() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') { ctx.resume().catch(() => {}) }
  return ctx
}

function tone({ freq, type = 'sine', dur = 0.12, gain = 0.09, attack = 0.006, when = 0, glideTo }) {
  const c = ac(); if (!c || !master) return
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
  osc.start(t); osc.stop(t + dur + 0.03)
}

const SOUNDS = {
  // Soft rising pop when picking an option.
  select:   () => tone({ freq: 540, type: 'sine', dur: 0.08, gain: 0.06, glideTo: 760 }),
  // Two-note forward blip between steps.
  step:     () => { tone({ freq: 494, dur: 0.1, gain: 0.07 }); tone({ freq: 659.25, dur: 0.12, gain: 0.07, when: 0.06 }) },
  // Warm welcome (G4 → C5).
  welcome:  () => { tone({ freq: 392, dur: 0.15, gain: 0.07 }); tone({ freq: 523.25, dur: 0.18, gain: 0.07, when: 0.1 }) },
  // Celebratory rising arpeggio (C5 · E5 · G5 · C6) — setup complete.
  complete: () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.17, gain: 0.08, when: i * 0.085 })) },
  // Sparkle (E5 · G5 · B5 · E6) — asset added / milestone.
  coin:     () => { [659.25, 783.99, 987.77, 1318.51].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.13, gain: 0.08, when: i * 0.055 })) },
}

const sfx = {
  play(name) { if (!enabled) return; try { (SOUNDS[name] || SOUNDS.select)() } catch {} },
  haptic(pattern) { try { if (enabled && navigator.vibrate) navigator.vibrate(pattern) } catch {} },
  isEnabled() { return enabled },
  setEnabled(v) { enabled = !!v; try { localStorage.setItem('wl_sfx_enabled', enabled ? '1' : '0') } catch {} },
}

export default sfx
