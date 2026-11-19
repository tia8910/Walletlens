// The alarm: a sound of its own for each kind of alert, a vibration, and a
// queue the full-screen AlarmOverlay rings from.
//
// Sounds are synthesized with the Web Audio API, so there are no files to
// download, and each kind is recognisable without looking:
//   price  three rising tones (the sound price alerts always had)
//   buy    a bright rising arpeggio
//   sell   a falling minor line
//   cross  a bell struck twice
//   rsi    four quick pulses
//   goal   a short fanfare

// [frequency Hz, start s, length s] for each note.
const SOUNDS = {
  price: { wave: 'sine', notes: [[880, 0, 0.16], [1100, 0.18, 0.16], [1320, 0.36, 0.16]] },
  buy: { wave: 'triangle', notes: [[523, 0, 0.14], [659, 0.13, 0.14], [784, 0.26, 0.14], [1047, 0.39, 0.32]] },
  sell: { wave: 'triangle', notes: [[988, 0, 0.16], [784, 0.16, 0.16], [622, 0.32, 0.16], [494, 0.48, 0.34]] },
  cross: { wave: 'sine', notes: [[1318, 0, 0.9], [1975, 0, 0.6], [1318, 0.55, 0.9], [1975, 0.55, 0.6]], bell: true },
  rsi: { wave: 'square', notes: [[740, 0, 0.08], [740, 0.16, 0.08], [740, 0.32, 0.08], [988, 0.48, 0.14]], quiet: true },
  goal: { wave: 'triangle', notes: [[392, 0, 0.12], [523, 0.12, 0.12], [659, 0.24, 0.12], [784, 0.36, 0.4], [659, 0.5, 0.12], [784, 0.62, 0.5]] },
}
export const ALARM_KINDS = Object.keys(SOUNDS)

const VIBRATE = { price: [250, 120, 250], buy: [120, 80, 120, 80, 300], sell: [400, 150, 400], cross: [600, 200, 600], rsi: [90, 90, 90, 90, 90, 90, 200], goal: [200, 100, 200, 100, 500] }

let ctx = null
function audio() {
  try {
    if (!ctx || ctx.state === 'closed') ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch { return null }
}

/** Play one ring of a kind's sound. Never throws. */
export function playAlarmSound(kind = 'price') {
  const s = SOUNDS[kind] || SOUNDS.price
  const c = audio()
  if (!c) return
  try {
    const peak = s.quiet ? 0.22 : 0.38
    for (const [freq, at, len] of s.notes) {
      const osc = c.createOscillator(), gain = c.createGain()
      osc.type = s.wave
      osc.frequency.value = freq
      osc.connect(gain); gain.connect(c.destination)
      const t0 = c.currentTime + at
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(s.bell ? peak * 0.7 : peak, t0 + 0.02)
      // A bell rings out; the rest stop cleanly.
      if (s.bell) gain.gain.exponentialRampToValueAtTime(0.001, t0 + len)
      else gain.gain.linearRampToValueAtTime(0, t0 + len)
      osc.start(t0); osc.stop(t0 + len + 0.02)
    }
  } catch { /* no sound is better than a crash */ }
}

export function vibrateAlarm(kind = 'price') {
  try { navigator.vibrate?.(VIBRATE[kind] || VIBRATE.price) } catch { /* not supported */ }
}

export function stopVibration() {
  try { navigator.vibrate?.(0) } catch { /* not supported */ }
}

// ── The queue ───────────────────────────────────────────────────────────────
// One alarm on screen at a time; any that fire meanwhile wait their turn.

const queue = []
const listeners = new Set()
const emit = () => { for (const fn of listeners) { try { fn(queue[0] || null) } catch { /* a listener's problem */ } } }

/**
 * Ring an alarm. `alarm`: { kind, title, body, price?, url?, id? }.
 * The same id already waiting is not queued twice.
 */
export function raiseAlarm(alarm) {
  if (!alarm) return
  if (alarm.id && queue.some(a => a.id === alarm.id)) return
  queue.push({ ...alarm, raisedAt: Date.now() })
  emit()
}

/** Take the alarm on screen down, and show the next one if any. */
export function clearAlarm() {
  queue.shift()
  emit()
}

/** Called with the alarm on screen (or null) now and on every change. */
export function subscribeAlarms(fn) {
  listeners.add(fn)
  fn(queue[0] || null)
  return () => listeners.delete(fn)
}

// For the test.
export function _resetAlarms() { queue.length = 0; listeners.clear() }
