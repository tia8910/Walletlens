import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Source-level guarantees about the screen effects that no unit test of the
// decision logic can reach: where the overlay is mounted, that it cannot
// swallow a tap, and that the sound is held rather than dropped.
//
// The predecessor of this file existed because the old overlay was mounted
// inside `activeTab === 'overview' && (...)`. The effect was decided from
// prices, the active tab was restored from sessionStorage, and so a user whose
// last tab was Backup spent the event on a picture that was never drawn. Five
// of the six tabs could not show it. That is not a bug a unit test sees.

const SRC = dirname(fileURLToPath(import.meta.url))
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8')

/**
 * Source with comments stripped.
 *
 * Both assertions below search for a phrase that these files also DISCUSS in
 * prose — `activeTab ===` and `Math.random()` are named in the very comments
 * explaining why they must not appear in the code. Matching the raw text fails
 * on a file that is entirely correct, which is a test that can only be
 * satisfied by deleting the explanation.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

const dashboard = code(read('pages', 'Dashboard.jsx'))
const overlay = read('components', 'ScreenEffect.jsx')
const overlayCode = code(overlay)
const audio = read('screenEffectsAudio.js')
const audioCode = code(audio)
const runtime = read('screenEffectsRuntime.js')
const css = read('index.css')

describe('where the overlay is mounted', () => {
  it('renders once', () => {
    const uses = dashboard.match(/<ScreenEffect\b/g) || []
    expect(uses).toHaveLength(1)
  })

  it('is not inside a tab block', () => {
    // The whole reason this file exists. Take the text between the render's
    // `return (` and the <ScreenEffect> tag: any unclosed `activeTab === '…'`
    // guard opened in that span encloses the overlay.
    const start = dashboard.lastIndexOf('return (', dashboard.indexOf('<ScreenEffect'))
    const span = dashboard.slice(start, dashboard.indexOf('<ScreenEffect'))
    expect(span).not.toMatch(/activeTab\s*===/)
  })

  it('is mounted before the tab navigation, not after the tab bodies', () => {
    // Position is the cheap proxy for "outside every tab": the tab grid is
    // rendered before any tab's contents.
    expect(dashboard.indexOf('<ScreenEffect')).toBeLessThan(dashboard.indexOf('dvx-tabgrid'))
  })
})

describe('an effect cannot get in the way', () => {
  it('turns pointer events off on the layer and everything in it', () => {
    // These fire without the user asking. One that ate the tap the user was
    // in the middle of making would be worse than no effect at all.
    const layer = /\.fx-layer \{[^}]*\}/.exec(css)?.[0] || ''
    expect(layer).toMatch(/pointer-events:\s*none/)
    expect(css).toMatch(/\.fx-layer \* \{ pointer-events: none; \}/)
  })

  it('is hidden from assistive technology', () => {
    expect(overlayCode).toMatch(/className=\{`fx-layer fx-\$\{effect\}[^`]*`\} aria-hidden="true"/)
  })

  it('clears itself after a bounded time', () => {
    // Without onDone the overlay would sit on the screen until the next
    // render happened to change `effect`, which on a quiet day is never.
    expect(overlayCode).toMatch(/setTimeout\(\(\) => doneRef\.current\?\.\(\), ms\)/)
    expect(dashboard).toMatch(/onDone=\{\(\) => setEffect\(null\)\}/)
  })
})

describe('the particles hold still', () => {
  it('keeps randomness out of the React render path', () => {
    // Math.random() called during render re-rolls on every re-render, and the
    // dashboard re-renders on every price poll — so the particles would jump
    // mid-flight. The burst canvas is allowed it: its field is seeded once
    // inside a useEffect and animated imperatively, so React never touches it
    // again. The distinction is where the call sits, not whether it exists.
    const effects = [...overlayCode.matchAll(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\)/g)]
      .map(m => m[0]).join('\n')
    const outsideEffects = overlayCode.split('\n')
      .filter(line => /Math\.random/.test(line) && !effects.includes(line))
    expect(outsideEffects).toEqual([])
    // …and the DOM-particle helper is still index-derived, with no RNG at all.
    const helper = /function particle\(i, total\) \{[\s\S]*?\n\}/.exec(overlayCode)[0]
    expect(helper).not.toMatch(/Math\.random/)
  })
})

describe('the sound', () => {
  it('reads the context rather than a cached unlocked flag', () => {
    // resume() is asynchronous. Reading ctx.state on the following line
    // returns 'suspended' every time, and caching that read as "locked"
    // disabled audio permanently once already.
    expect(audioCode).toMatch(/ctx\.state === 'running'/)
    expect(audioCode).not.toMatch(/\bunlocked\b/)
  })

  it('holds a cue it cannot play instead of dropping it', () => {
    // The effect that matters most — the burst on the first open of the day —
    // is the one guaranteed to arrive before any gesture, so dropping means
    // the sound is never heard on the occasion it was written for.
    expect(audio).toMatch(/held = effect/)
    expect(audio).toMatch(/addEventListener\('pointerdown', releaseHeld, true\)/)
  })

  it('waits for the resume to settle before playing, rather than dropping the cue', () => {
    // Same asynchrony one level up: a caller that unlocks and plays inside a
    // single handler finds the context still 'suspended'. That is not an edge
    // case — it is the first tap of every session. Playing from the resume's
    // own promise is what makes it audible; a few milliseconds late is
    // imperceptible, not playing at all is the entire bug.
    expect(audioCode).toMatch(/ctx\.resume\?\.\(\)\.then\(\(\) => \{/)
    expect(audioCode).toMatch(/if \(ctx && ctx\.state === 'running'\) emit\(voice, effect\)/)
  })

  it('gives up on a cue that has gone stale', () => {
    expect(audio).toMatch(/Date\.now\(\) - heldAt < HOLD_MS/)
  })

  it('is primed from taps, never from the poll that decides an effect', () => {
    // observe() runs on a timer, where resume() is refused.
    const observeBody = /export function observe\(\{[\s\S]*?\n\}/.exec(runtime)[0]
    expect(observeBody).not.toMatch(/unlock\(/)
  })
})

describe('settings', () => {
  it('defaults to on', () => {
    expect(runtime).toMatch(/DEFAULT_SETTINGS = \{ enabled: true, sound: true \}/)
  })

  it('stops deciding entirely when switched off', () => {
    // Not "decide and then hide": a disabled user must not have their day
    // marker or all-time high advanced by an effect they never saw, or
    // switching effects back on would find every occasion already spent.
    expect(runtime).toMatch(/if \(!settings\.enabled\) return null/)
    const body = /export function observe\(\{[\s\S]*?\n\}/.exec(runtime)[0]
    expect(body.indexOf('!settings.enabled')).toBeLessThan(body.indexOf('decideEffect'))
  })

  it('mutes without suppressing the picture', () => {
    expect(runtime).toMatch(/settings\.sound \? payload : \{ \.\.\.payload, muted: true \}/)
  })
})

describe('reduced motion', () => {
  it('stops the particles travelling rather than removing the moment', () => {
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.fx-champ, \.fx-flash, \.fx-canvas, \.fx-rocket-track, \.fx-celebrate \{ display: none; \}/)
    expect(reduced).toMatch(/fx-quiet-fade/)
  })
})

describe('nothing is left of the system this replaced', () => {
  it('mentions no pulse module anywhere in the client source', () => {
    // The old system was nine files and a dozen localStorage keys. A stale
    // import of a deleted module is a white screen, not a build error.
    for (const f of ['pages/Settings.jsx', 'pages/Dashboard.jsx',
                     'components/NativeOnboarding.jsx', 'backupCore.js']) {
      expect(code(read(...f.split('/'))), `${f} still references the old system`)
        .not.toMatch(/marketPulse|pulseAudio|pulseSettings|wl_pulse_/)
    }
  })
})
