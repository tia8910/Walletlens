// Wires the pure event core to storage, settings and the audio layer.
//
// marketPulse.js decides, pulseAudio.js plays, and this holds the state
// between them. Kept separate from both so the decision logic stays free of
// localStorage and the audio layer stays free of product rules.

import {
  detectEvents, selectOne, applyFired, pruneState, seedRecords, emptyState,
} from './marketPulse'
import { unlock, play, setVolume, release, isUnlocked } from './pulseAudio'

const SETTINGS_KEY = 'wl_pulse_settings'
const STATE_KEY    = 'wl_pulse_state'
const MISSED_KEY   = 'wl_pulse_missed'
const SAMPLES_KEY  = 'wl_pulse_samples'

/**
 * How stale a stored snapshot may be and still be worth comparing against.
 *
 * The samples carry each asset's 24-hour change, so comparing today's figure
 * with one from last week is not comparing two points on the same curve — it
 * is two unrelated windows. Past this age the stored snapshot is used as a
 * baseline only: it re-seeds silently and the next refresh can fire.
 */
const MAX_BASELINE_AGE_MS = 48 * 60 * 60 * 1000

// How many times the discovery card may ever appear. Two is enough to catch
// someone who dismissed the first one without reading it; a third would be
// nagging, and the user has answered by then whether they said so or not.
const MAX_DISCOVERY_SHOWS = 2

const DEFAULTS = {
  // Off, deliberately.
  //
  // The original spec proposed defaulting this on. For an app positioned as
  // the serious, private tracker, unprompted audio on first open works against
  // the brand — and someone opening their portfolio in a meeting will not
  // forgive it twice. The discovery card below earns the opt-in instead, using
  // an event that really happened.
  enabled: false,
  volume: 0.6,
  haptics: true,
  visuals: true,
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback }
  } catch { return { ...fallback } }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}

export function pulseSettings() {
  return read(SETTINGS_KEY, DEFAULTS)
}

export function setPulseSettings(patch) {
  const next = { ...pulseSettings(), ...patch }
  write(SETTINGS_KEY, next)
  if (typeof patch.volume === 'number') setVolume(next.volume)
  if (patch.enabled === false) release()
  return next
}

function pulseState() {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    return raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState()
  } catch { return emptyState() }
}

// ── Audio unlock ───────────────────────────────────────────────────────────

let armed = false

/**
 * Prepare audio on the user's first deliberate tap.
 *
 * Chrome refuses to play anything until the page has been interacted with, so
 * there is no point creating the context earlier. A one-shot listener on the
 * first click is the whole mechanism — the same shape as the review prompt's
 * arming, and for the same underlying reason.
 *
 * Idempotent, and a no-op while Market Pulse is off so a disabled feature
 * never touches the audio hardware.
 */
export function armPulseAudio() {
  if (armed || typeof document === 'undefined') return
  if (!pulseSettings().enabled) return
  armed = true
  const once = () => {
    unlock()
    setVolume(pulseSettings().volume)
    document.removeEventListener('click', once)
  }
  document.addEventListener('click', once, { once: true })
}

// ── Discovery ──────────────────────────────────────────────────────────────

/**
 * The event a user missed because sound was off, if we should mention it.
 *
 * This is the honest version of a feature prompt: it names something that
 * actually happened to their portfolio rather than describing a capability in
 * the abstract. Returns null once they have enabled the feature, dismissed it
 * twice, or when nothing has happened worth mentioning.
 */
export function pendingDiscovery() {
  if (pulseSettings().enabled) return null
  const missed = read(MISSED_KEY, { shows: 0, event: null, dismissed: false })
  if (missed.dismissed || missed.shows >= MAX_DISCOVERY_SHOWS) return null
  return missed.event
}

export function noteDiscoveryShown() {
  const missed = read(MISSED_KEY, { shows: 0, event: null, dismissed: false })
  write(MISSED_KEY, { ...missed, shows: (missed.shows || 0) + 1 })
}

export function dismissDiscovery() {
  const missed = read(MISSED_KEY, { shows: 0, event: null, dismissed: false })
  write(MISSED_KEY, { ...missed, dismissed: true })
}

// ── The observation loop ───────────────────────────────────────────────────

/**
 * The previous market snapshot, persisted rather than held only in memory.
 *
 * This is what makes anything happen when the app opens. A crossing is only
 * visible by comparing two samples, so with an in-memory baseline the first
 * observation of every session had nothing to compare against and was thrown
 * away — the app could only react to moves that happened while you were
 * already watching, which is the opposite of useful.
 *
 * With the snapshot on disk, opening the app compares where things stood when
 * you last looked against where they stand now, which is the reaction the
 * spec asked for in its app-open section.
 */
function readSamples() {
  try {
    const raw = localStorage.getItem(SAMPLES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    if (!parsed.at || Date.now() - parsed.at > MAX_BASELINE_AGE_MS) return {}
    return parsed.samples || {}
  } catch { return {} }
}

function writeSamples(samples) {
  try { localStorage.setItem(SAMPLES_KEY, JSON.stringify({ at: Date.now(), samples })) } catch { /* private mode */ }
}

let lastSamples = readSamples()
let cooldown = { lastAt: 0, lastMajorAt: 0 }

/**
 * Feed a market snapshot in; get back the event that played, or null.
 *
 * Called on every price refresh. Almost every call does nothing, which is the
 * intended shape — the state still advances so the next one can be right.
 *
 * @param {object} o
 * @param {object} o.samples     assetId → { changePct, cls, symbol, source?, fresh? }
 * @param {number} o.totalValue  portfolio value in the display currency
 */
export function observeMarket({ samples = {}, totalValue = 0, now = Date.now() } = {}) {
  try {
    let state = pruneState(pulseState(), now)

    // First run on an existing portfolio: bank the current value as the
    // high-water mark and mark every milestone below it as passed. Without
    // this, a user who has held $120K for a year gets told they just hit an
    // all-time high and crossed $100K the first time they open the app.
    if (!state.ath && totalValue > 0) {
      state = seedRecords(state, totalValue)
      write(STATE_KEY, state)
      lastSamples = samples
      writeSamples(samples)
      return null
    }

    const events = detectEvents({ prev: lastSamples, next: samples, state, totalValue, now })
    lastSamples = samples
    writeSamples(samples)

    if (!events.length) {
      write(STATE_KEY, applyFired(state, null, totalValue))
      return null
    }

    const settings = pulseSettings()

    // Sound off: remember the best thing they missed, for the discovery card,
    // and still record the event so it cannot fire retroactively the moment
    // they turn sound on.
    if (!settings.enabled) {
      const best = selectOne(events, {}, now)
      if (best) {
        const missed = read(MISSED_KEY, { shows: 0, event: null, dismissed: false })
        if (!missed.dismissed) {
          write(MISSED_KEY, {
            ...missed,
            event: { type: best.type, symbol: best.symbol || '', changePct: best.changePct || 0, at: now },
          })
        }
      }
      let next = state
      for (const e of events) next = applyFired(next, e, totalValue)
      write(STATE_KEY, next)
      return null
    }

    const chosen = selectOne(events, cooldown, now)

    // Everything detected is recorded, including the ones that lost the
    // priority contest. They were real; they simply do not get a sound. Not
    // recording them would replay them on the next refresh.
    let next = state
    for (const e of events) next = applyFired(next, e, totalValue)
    write(STATE_KEY, next)

    if (!chosen) return null

    const played = play(chosen.type)
    if (played) {
      cooldown = {
        lastAt: now,
        lastMajorAt: chosen.priority <= 1 ? now : cooldown.lastMajorAt,
      }
      if (settings.haptics) {
        try { navigator.vibrate?.(chosen.type === 'rocket' ? [12, 40, 24] : [18]) } catch { /* unsupported */ }
      }
    }
    // Returned whether or not audio managed to play, because the visual layer
    // should still react — a user on silent has not opted out of seeing it.
    return chosen
  } catch {
    // A market reaction must never be able to break the dashboard.
    return null
  }
}

/** For diagnostics and tests. */
export function pulseDiagnostics() {
  return { ...pulseSettings(), audioUnlocked: isUnlocked(), state: pulseState() }
}

/** Test seam — clears the in-memory baseline between cases. */
export function __resetPulseRuntime() {
  lastSamples = {}
  try { localStorage.removeItem(SAMPLES_KEY) } catch { /* ignore */ }
  cooldown = { lastAt: 0, lastMajorAt: 0 }
  armed = false
}
