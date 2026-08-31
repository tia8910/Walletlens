// The web had no equivalent of the Android shell's launch prompt.
//
// NotificationPrimer returned early when the portfolio was empty, so a browser
// user who had not added a holding yet was never asked at all, and push simply
// stayed off with nothing on screen explaining why. On a fresh profile — every
// preview URL, every first visit — that was the only path there is.
//
// The component has no test harness here, so these read its source. That is
// weaker than rendering it, but it covers the two things that would silently
// undo the fix: the gate coming back, and the gate going without the copy that
// made removing it safe.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { translations, loadAllLanguages } from './i18n'

describe('the permission primer', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'components/NotificationPrimer.jsx'),
    'utf8',
  )

  // Non-English dictionaries are code-split and load on demand at runtime
  // (see src/i18n.js); the check below reads all four, so it needs them
  // loaded up front.
  beforeAll(loadAllLanguages)

  it('waits for the dashboard\u2019s own onboarding, not just its URL', () => {
    // THE REGRESSION THIS EXISTS FOR, reported twice from a device.
    //
    // The card was gated on being on the dashboard, and it was — the interest
    // picker ("What do you want to track?") and the opening-balances step are
    // overlays the DASHBOARD renders, at the dashboard's own URL. So the route
    // check passed while the first-run flow was still in front of the user and
    // the card landed on top of it: exactly the placement the route check was
    // added to prevent, one layer further in.
    //
    // A system permission dialog over a half-finished onboarding is the worst
    // moment to ask, and it is how the flow gets abandoned.
    expect(src).toMatch(/function onboardingSettled\(\)/)
    expect(src, 'the offer must check both').toMatch(/!onDashboard\(\) \|\| !onboardingSettled\(\)/)
  })

  it('uses the same predicate the dashboard ends its onboarding with', () => {
    // Not a copy of the storage key. The dashboard's step machine treats
    // hasStarted() as "the flow is done"; if the primer tested a key of its
    // own, the two would drift and the card would come back early with
    // nothing failing.
    expect(src).toMatch(/import \{ hasStarted \} from '\.\/WelcomeStart'/)
    const root = dirname(fileURLToPath(import.meta.url))
    const welcome = readFileSync(join(root, 'components/WelcomeStart.jsx'), 'utf8')
    expect(welcome, 'WelcomeStart must still export it').toMatch(/export function hasStarted\(\)/)
    const dash = readFileSync(join(root, 'pages/Dashboard.jsx'), 'utf8')
    expect(dash, 'and the dashboard must still end its flow on it')
      .toMatch(/if \(hasStarted\(\)\) return 'done'/)
  })

  it('does not refuse to ask an empty portfolio', () => {
    // The specific shape of the old gate: bail out before showing anything.
    expect(src).not.toMatch(/if\s*\(\s*watchFromStorage\(\)\.length\s*===\s*0\s*\)\s*return/)
  })

  it('says something different to an empty portfolio', () => {
    // Removing the gate without changing the copy would promise news about
    // holdings to someone who has none, which is the reason the gate existed.
    expect(src).toContain('npAskTitleEmpty')
    expect(src).toContain('npAskBodyEmpty')
    for (const lang of ['en', 'ar', 'fr', 'es']) {
      const table = translations[lang]
      expect(table.npAskTitleEmpty, lang).toBeTruthy()
      expect(table.npAskBodyEmpty, lang).toBeTruthy()
      expect(table.npAskBodyEmpty, lang).not.toBe(table.npAskBody)
    }
  })

  it('waits for the dashboard instead of giving up on it', () => {
    // The gate that moved this card onto the dashboard nearly stopped it
    // appearing at all. It asked once, four seconds after mount, and gave up
    // for the session if the answer was no — and the answer IS no at mount,
    // because the component mounts as onboarding finishes, before the router
    // has landed on the dashboard. So the card was shown to almost nobody.
    //
    // This component sits outside the router tree and is never told about a
    // navigation, so waiting means asking again.
    expect(src).toContain('onDashboard()')
    expect(src).toMatch(/setInterval\(/)
  })

  it('gives up eventually rather than lurking for the session', () => {
    // An unbounded interval would sit there for as long as the app is open,
    // waiting to interrupt whatever the user eventually does.
    expect(src).toMatch(/deadline/)
    expect(src).toMatch(/Date\.now\(\) > deadline/)
  })
})
