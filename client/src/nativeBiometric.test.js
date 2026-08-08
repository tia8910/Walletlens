import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The web app and the Android shell are two codebases with one contract
// between them: a walletlens:// intent URL. Nothing type-checks across that
// boundary and there is no Java test harness in this repo, so a change on
// either side can silently break the other — which is exactly what happened.
//
// Enabling the lock relaunched the whole TWA, because BiometricActivity
// answered every action by starting LauncherActivity with NEW_TASK|CLEAR_TOP.
// The biometric toggle lives on slide 3 of first-run onboarding and onboarding
// only records completion on slide 4, so turning the lock on threw the user
// back to slide 1 and the app looked like it had reset itself.
//
// These read both sides of the contract as text. Crude, but it is the only
// check that spans the boundary at all.

const SRC = dirname(fileURLToPath(import.meta.url))
const JAVA = join(
  SRC, '..', '..',
  'walletlens_source/release_package/app/src/main/java/live/walletlens/twa/BiometricActivity.java',
)

const java = () => readFileSync(JAVA, 'utf8')

/** The body of a Java `if`/`else if` branch matching a query-parameter action. */
function branchFor(action) {
  const src = java()
  const at = src.indexOf(`"${action}".equals(action)`)
  if (at < 0) return ''
  const open = src.indexOf('{', at)
  let depth = 1, i = open + 1
  for (; i < src.length && depth; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
  }
  return src.slice(open, i)
}

describe('BiometricActivity ↔ web contract', () => {
  it('the Android source is where the build expects it', () => {
    // build-aab.yml compiles walletlens_source/release_package. If this file
    // moves, every assertion below would vacuously pass.
    expect(existsSync(JAVA)).toBe(true)
  })

  it('enable does not relaunch the app', () => {
    const body = branchFor('enable')
    expect(body).toContain('finish()')
    expect(body).not.toContain('redirectBack')
  })

  it('disable does not relaunch the app', () => {
    const body = branchFor('disable')
    expect(body).toContain('finish()')
    expect(body).not.toContain('redirectBack')
  })

  it('the redirect is read from the query string the web actually sends', () => {
    // sendNativeIntent appends "&redirect=<url>" to the URI. The Java side
    // originally read only getStringExtra("redirect_url"), which the web has
    // no way to set, so every unlock landed on the hard-coded /dashboard.
    expect(java()).toContain('getQueryParameter("redirect")')
  })

  it('only accepts a same-origin redirect', () => {
    // The intent filter is BROWSABLE, so any installed app can invoke this
    // activity with a redirect of its choosing — and the URL it redirects to
    // carries biometric_auth=success.
    expect(java()).toContain('https://walletlens.live/')
  })
})

describe('web side of the contract', () => {
  const lock = readFileSync(join(SRC, 'components', 'BiometricLock.jsx'), 'utf8')

  it('unlock tells the native side where to come back to', () => {
    // Without this the activity falls back to /dashboard, moving a user who
    // locked the app while reading an asset page.
    expect(lock).toMatch(/sendNativeIntent\('unlock', currentUrlForReturn\(\)\)/)
  })

  it('the return URL drops a stale biometric_auth result', () => {
    // Carrying the previous result forward would let the next unlock resolve
    // itself from the URL without ever prompting.
    expect(lock).toContain("searchParams.delete('biometric_auth')")
  })
})

describe('onboarding survives a reload', () => {
  const onboarding = readFileSync(join(SRC, 'components', 'NativeOnboarding.jsx'), 'utf8')

  it('remembers which slide the user reached', () => {
    expect(onboarding).toContain('ONBOARD_STEP_KEY')
    expect(onboarding).toMatch(/localStorage\.setItem\(ONBOARD_STEP_KEY/)
  })

  it('clears the saved slide once the flow completes', () => {
    // Otherwise re-entering onboarding after a reset would resume on the last
    // slide instead of starting over.
    expect(onboarding).toMatch(/localStorage\.removeItem\(ONBOARD_STEP_KEY\)/)
  })
})
