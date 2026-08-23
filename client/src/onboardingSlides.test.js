import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// App Lock is a feature of the Android app and only of the Android app: the
// lock is a native BiometricPrompt, and outside the app there is nothing to
// prompt with. On the web the security slide was therefore a step whose only
// content was a greyed-out box reading "Fingerprint not available on this
// device" — a dead end, and a lie, since the device is usually perfectly
// capable and it is the browser that cannot reach it.
//
// BiometricToggle already decided this for Settings, in its own words: hidden
// rather than disabled, because a greyed-out row invites "why can't I turn this
// on?" and the honest answer is "install the Android app". Onboarding is a
// worse place to make that argument than Settings.
//
// There is no component harness here, so this reads the source. Weaker than
// rendering, but it covers what actually went wrong.

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'components/NativeOnboarding.jsx'),
  'utf8',
)
const i18n = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'i18n.js'), 'utf8')

describe('onboarding only offers what this context can deliver', () => {
  it('drops the security slide when App Lock cannot work', () => {
    expect(src).toMatch(/function slidesFor\(canLock\)/)
    expect(src).toMatch(/canLock \? SLIDES : SLIDES\.filter\(sl => !sl\.isSecurity\)/)
  })

  it('renders and counts the visible slides, not the full list', () => {
    // Three places had to move together. Any one left on SLIDES gives a
    // different flavour of the same bug: a blank slide, a dot with nothing
    // behind it, or a progress bar that never reaches the end.
    expect(src).toMatch(/const s = slides\[Math\.min\(step, slides\.length - 1\)\]/)
    expect(src).toMatch(/const total = slides\.length/)
    expect(src).toMatch(/\{slides\.map\(\(_, i\) =>/)
    // The resume clamp too: a stored index from a longer list would land past
    // the end of the shorter one.
    expect(src).toMatch(/const max = slidesFor\(bioAvailable\)\.length - 1/)
  })

  it('has no unavailable branch left to render', () => {
    // Unreachable once the slide is filtered on exactly that condition, and
    // dead code that reads like a rule is worse than none.
    expect(src).not.toMatch(/obBioUnavailable/)
    expect(src).not.toMatch(/no-bio-unavailable/)
    expect(i18n).not.toMatch(/obBioUnavailable/)
  })
})
