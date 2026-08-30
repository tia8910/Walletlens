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

  it('enable verifies the fingerprint before turning the lock on', () => {
    // It used to write the preference and finish, with no prompt at all. So
    // "Enable" on the onboarding slide asked for nothing and showed nothing,
    // which is how it was reported — and it armed a lock nobody had confirmed
    // the user could pass. One stale enrolled fingerprint and the next cold
    // start is a portfolio its owner cannot open.
    //
    // The branch now falls THROUGH to the prompt rather than returning, so it
    // must not settle anything itself.
    const body = branchFor('enable')
    expect(body).toMatch(/enabling = true/)
    expect(body, 'must not enable without a prompt').not.toMatch(/setEnabled\(this, true\)/)
    expect(body, 'must not finish before the prompt runs').not.toContain('finish()')
  })

  it('enable still does not relaunch the app', () => {
    // The invariant the previous version of this case protected, in its new
    // home: on success the activity finishes back to the page that asked.
    // redirectBack would cold-start the app and drop the user on slide one of
    // the onboarding they are standing in.
    const success = java().slice(java().indexOf('private void onAuthSuccess'))
    const enabled = success.slice(success.indexOf('if (enabling)'))
    const branch = enabled.slice(0, enabled.indexOf('return;'))
    expect(branch).toContain('setEnabled(this, true)')
    expect(branch).toContain('finish()')
    expect(branch).not.toContain('redirectBack')
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

// ── Arming the prompt ───────────────────────────────────────────────────────
//
// Reported as "the fingerprint doesn't respond the first time".
//
// BiometricPrompt is implemented as a headless Fragment, so authenticate()
// commits a fragment transaction and needs the host activity to be at least
// STARTED for it to be honoured. It used to be armed from the end of onCreate
// on a 400ms postDelayed — a guess at how long the window takes to be created,
// themed and focused. On a cold start this activity is launched while
// LauncherActivity is still tearing down, and on the first launch after
// install the guess is short: the transaction is dropped and no dialog is ever
// shown. A warm retry resumes in a fraction of the time, which is why it read
// as a slow sensor rather than a prompt that was never asked for.

describe('when the prompt is asked for', () => {
  // Comments stripped: the prose above the fix quotes the old timer verbatim
  // to explain it, so a raw match finds the very construct it must prove gone.
  const code = () => java()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

  /** The body of a method, from its signature to the matching close brace. */
  function methodBody(src, signature) {
    const start = src.indexOf(signature)
    if (start === -1) return ''
    let depth = 0, i = src.indexOf('{', start)
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1)
    }
    return ''
  }

  it('arms it from onResume, where the transaction is actually allowed', () => {
    const resume = methodBody(code(), 'protected void onResume()')
    expect(resume, 'an onResume override').not.toBe('')
    expect(resume).toMatch(/super\.onResume\(\)/)
    expect(resume).toMatch(/biometricPrompt\.authenticate\(promptInfo\)/)
  })

  it('does not arm it on a timer from onCreate', () => {
    // The regression in one assertion. onCreate builds the prompt; it must not
    // be the thing that shows it, because it cannot know when the window is
    // ready and a fixed delay is a guess that loses on the slowest launch.
    //
    // The bounded retry after a transient sensor error is a different thing
    // and stays: it lives inside onAuthenticationError, which is lexically
    // inside onCreate because the callback is an anonymous class. So the check
    // is that every authenticate() in onCreate is one of THOSE — not a blanket
    // "no authenticate here", which this assertion was at first and which the
    // retry tripped immediately.
    const create = methodBody(code(), 'protected void onCreate(')
    expect(create, 'onCreate still builds the prompt').toMatch(/new BiometricPrompt\(/)

    const retry = methodBody(create, 'public void onAuthenticationError(')
    expect(retry, 'the transient-error retry').toMatch(/authenticate\(promptInfo\)/)

    const outsideRetry = create.replace(retry, '')
    expect(outsideRetry, 'onCreate must not show the prompt itself')
      .not.toMatch(/authenticate\(/)
    expect(outsideRetry, 'and must not schedule it on a guessed delay')
      .not.toMatch(/postDelayed/)
  })

  it('asks only once however many times the activity resumes', () => {
    // onResume runs again on every return to the foreground — the shade being
    // dismissed, a screen off and on. Without the guard each one stacks
    // another prompt on the one already showing.
    const resume = methodBody(code(), 'protected void onResume()')
    expect(resume).toMatch(/promptShown/)
    expect(resume).toMatch(/promptShown\s*=\s*true/)
    expect(code()).toMatch(/boolean promptShown\s*=\s*false/)
  })

  it('does nothing on the paths that never built a prompt', () => {
    // enable/disable and an unavailable sensor all finish inside onCreate
    // without constructing one. onResume still runs on the way out, so an
    // unguarded authenticate() there is a null dereference on the single most
    // common intent the web app sends.
    const resume = methodBody(code(), 'protected void onResume()')
    expect(resume).toMatch(/biometricPrompt == null/)
    expect(resume).toMatch(/promptInfo == null/)
  })

  it('still guards against a window that has gone away', () => {
    const resume = methodBody(code(), 'protected void onResume()')
    expect(resume).toMatch(/isFinishing\(\)/)
    expect(resume).toMatch(/isDestroyed\(\)/)
  })
})
