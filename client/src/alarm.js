// The alarm: the WalletLens alarm sound, a vibration, the user's settings,
// and a queue the full-screen AlarmOverlay rings from.
//
// The sound is the app's own and is about money: two coins clinking, a cash
// register's "ka-ching", then a short market motif that RISES for good news
// (a Buy signal, a price above its target, a goal reached), FALLS for bad
// news (a Sell signal, a price below, a loss limit) and holds for the rest.
// The same three recordings ring on Android (res/raw/wl_alarm_*.ogg) and on
// the web (public/sounds/alarm-*.mp3), so it sounds the same everywhere.
//
// In the Android app the alarm is native (the bridge's showAlarm): a
// notification that pops up and keeps ringing until it is snoozed or
// dismissed, even with the app in the background. The page shows its own
// full-screen card on top while it is open, silently, so it does not ring
// twice.

export const TONES = ['up', 'down', 'neutral']
export const ALARM_PREFS_KEY = 'wl_alarm_prefs'

/** { fullscreen, sound }: both on unless the user turned them off. */
export function getAlarmPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(ALARM_PREFS_KEY) || '{}') || {}
    return { fullscreen: p.fullscreen !== false, sound: p.sound !== false }
  } catch { return { fullscreen: true, sound: true } }
}

export function setAlarmPrefs(next) {
  const p = { ...getAlarmPrefs(), ...next }
  try { localStorage.setItem(ALARM_PREFS_KEY, JSON.stringify(p)) } catch { /* private mode */ }
  // The app reads them too, for alarms that arrive while it is closed.
  try { nativeBridge()?.setAlarmPrefs?.(!!p.fullscreen, !!p.sound) } catch { /* old app */ }
  return p
}

/** The Android app's bridge, when it can ring native alarms. */
export function nativeBridge() {
  try {
    const b = typeof window !== 'undefined' ? window.AndroidBridge : null
    return b && typeof b.showAlarm === 'function' ? b : null
  } catch { return null }
}

let clip = null
/** Ring the WalletLens alarm sound once, in its rising, falling or neutral form. */
export function playAlarmFile(tone = 'neutral') {
  const t = TONES.includes(tone) ? tone : 'neutral'
  try {
    clip?.pause()
    clip = new Audio(`/sounds/alarm-${t}.mp3`)
    clip.volume = 0.9
    const p = clip.play()
    // Blocked (no tap on the page yet) or missing: the synthesized ring.
    if (p?.catch) p.catch(() => playAlarmSound(t === 'up' ? 'buy' : t === 'down' ? 'sell' : 'price'))
  } catch { playAlarmSound('price') }
}

export function stopAlarmFile() {
  try { clip?.pause() } catch { /* nothing playing */ }
}

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

// ── Delivering an alarm ─────────────────────────────────────────────────────

/**
 * Ring an alert as the user set alarms up: in the Android app, the native
 * alarm plus the page's silent card; elsewhere, the page's card with sound.
 * Returns how it went: 'native', 'page' or 'off' (alarms turned off, the
 * caller shows a plain notification instead).
 */
export function deliverAlarm(alarm) {
  const prefs = getAlarmPrefs()
  if (!prefs.fullscreen) return 'off'
  const b = nativeBridge()
  let native = false
  if (b) {
    try { native = !!b.showAlarm(alarm.title || '', alarm.body || '', alarm.tone || 'neutral', alarm.url || '', alarm.id || 'alarm') } catch { native = false }
  }
  raiseAlarm({ ...alarm, native, sound: prefs.sound })
  return native ? 'native' : 'page'
}

/** Take a native alarm down too, when the page's card is dismissed. */
export function dismissNative(alarm) {
  if (!alarm?.native) return
  try { nativeBridge()?.dismissAlarm?.(alarm.id || 'alarm') } catch { /* old app */ }
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
