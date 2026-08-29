// The stateful half of the screen effects: storage, settings, and the one
// call the dashboard makes.
//
// screenEffects.js decides; this remembers. Keeping the decision pure is what
// lets a day boundary and an all-time high be tested without a clock, and it
// is why this file has almost no logic of its own — if something here starts
// deciding anything, it belongs next door.

import { decideEffect, pickLeader, EMPTY_STATE } from './screenEffects'
import { unlock, resetEffectAudio } from './screenEffectsAudio'

const STATE_KEY = 'wl_fx_state'
const SETTINGS_KEY = 'wl_fx_settings'

const DEFAULT_SETTINGS = { enabled: true, sound: true }

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback }
  } catch { return { ...fallback } }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}

export function effectSettings() {
  return readJson(SETTINGS_KEY, DEFAULT_SETTINGS)
}

export function setEffectSettings(patch) {
  const next = { ...effectSettings(), ...patch }
  writeJson(SETTINGS_KEY, next)
  return next
}

/**
 * Ask whether this moment has earned an effect, and record the answer.
 *
 * Called from the dashboard whenever prices settle. Returns null far more
 * often than not, which is the point — three occasions, not a constant show.
 *
 * @returns {{ effect: string, payload: object }|null}
 */
export function observe({ totalValue, changePct, holdings, now = Date.now() } = {}) {
  const settings = effectSettings()
  if (!settings.enabled) return null

  let stored
  try { stored = readJson(STATE_KEY, EMPTY_STATE) } catch { stored = { ...EMPTY_STATE } }

  const tzOffsetMin = (() => {
    try { return -new Date().getTimezoneOffset() } catch { return 0 }
  })()

  const { effect, payload, nextState } = decideEffect({
    now,
    tzOffsetMin,
    totalValue,
    changePct,
    leader: pickLeader(holdings),
    state: stored,
  })

  // Written whether or not anything fired. The day marker and the running high
  // are what stop the same occasion being celebrated twice, so they have to
  // persist on the quiet path too.
  writeJson(STATE_KEY, nextState)

  if (!effect) return null
  return { effect, payload: settings.sound ? payload : { ...payload, muted: true } }
}

/**
 * Bring the audio context up from inside a real user gesture.
 *
 * Separate from observe() on purpose: observe runs on a timer, where there is
 * no activation and a resume() would be refused. This is called from the
 * places a tap is already happening.
 */
export function primeEffectAudio() {
  try { unlock() } catch { /* no audio on this device */ }
}

/** Test seam — clears stored state and any held sound. */
export function resetEffects() {
  try {
    localStorage.removeItem(STATE_KEY)
    localStorage.removeItem(SETTINGS_KEY)
  } catch { /* nothing to clear */ }
  resetEffectAudio()
}
