import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MOMENTS, FRICTIONS } from './reviewPrompt'

// reviewPrompt declares the moments worth asking after and the failures that
// must silence the ask. Declaring one costs nothing and does nothing: the sets
// are just data, and a name in them with no caller is a rule that reads as
// enforced and is not.
//
// Three were in exactly that state. `goal_reached` — the strongest positive
// moment the app has — was never fired by anything. `sync_failed` and
// `restore_failed` were never reported, so a user whose backup had just failed
// stayed fully eligible for a "rate us" card. That is a one-star generator, and
// because Play meters the review flow per user it also spends an ask that
// cannot be got back.
//
// This walks the source for real call sites so the next dead entry fails here
// rather than being discovered in the Play Console months later.

const src = dirname(fileURLToPath(import.meta.url))

function sourceFiles(dir = src, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) { sourceFiles(full, out); continue }
    if (!/\.(js|jsx)$/.test(e.name) || e.name.includes('.test.')) continue
    if (e.name === 'reviewPrompt.js') continue      // the declaration, not a use
    out.push(full)
  }
  return out
}

const all = sourceFiles().map(f => readFileSync(f, 'utf8')).join('\n')

/**
 * Every string literal passed to `fn`, anywhere in its argument list.
 *
 * Not `fn('name')`: the real Drive call site passes the name through a ternary,
 *
 *     noteFriction(which === 'backup' ? 'sync_failed' : 'restore_failed')
 *
 * and a matcher anchored to the opening paren calls that dead. It is a live
 * call site with two names in it, which is exactly what has to be recognised.
 * `m.noteFriction?.('exception')` has to keep matching too.
 */
function reported(fn) {
  const names = new Set()
  // The paren must follow the name directly (allowing `?.`), or the IMPORT
  // line matches too and `[^(]*` runs across newlines into the next unrelated
  // call in the file. That version reported an icon name, 'trend-up', as an
  // undeclared moment.
  for (const m of all.matchAll(new RegExp(`${fn}\\??\\.?\\(([^)]*)\\)`, 'g'))) {
    for (const lit of m[1].matchAll(/'([^']+)'/g)) names.add(lit[1])
  }
  return names
}

describe('every declared review hook is actually reported', () => {
  it('fires each positive moment somewhere', () => {
    const live = reported('noteMoment')
    expect([...MOMENTS].filter(m => !live.has(m)),
      'declared in MOMENTS but never fired').toEqual([])
  })

  it('reports each app failure somewhere', () => {
    // The costlier direction. A missing moment loses an ask; a missing friction
    // spends one on somebody who just watched the app fail them.
    const live = reported('noteFriction')
    expect([...FRICTIONS].filter(f => !live.has(f)),
      'declared in FRICTIONS but never reported').toEqual([])
  })

  it('reports nothing the sets do not declare', () => {
    // noteMoment/noteFriction silently ignore an unknown kind, so a typo at a
    // call site is a hook that looks wired and does nothing.
    //
    // Only DIRECT single-literal calls are checked. `reported()` collects every
    // literal in the argument list, which for the Drive ternary includes
    // 'backup' — a comparison operand, not a hook name. No regex can tell those
    // apart, and a typo is going to be in a plain call anyway.
    const direct = (fn) => [...all.matchAll(new RegExp(`${fn}\\??\\.?\\('([^']+)'\\)`, 'g'))].map(m => m[1])
    for (const m of direct('noteMoment')) expect(MOMENTS.has(m), `noteMoment('${m}')`).toBe(true)
    for (const f of direct('noteFriction')) expect(FRICTIONS.has(f), `noteFriction('${f}')`).toBe(true)
  })

  it('silences the ask on both halves of a Drive failure', () => {
    // Backup and restore fail through one shared catch, and the two carry very
    // different weight — a failed restore is someone who thinks they have lost
    // their portfolio. Both must report.
    const drive = readFileSync(join(src, 'components/DriveBackup.jsx'), 'utf8')
    expect(drive).toMatch(/noteFriction\(which === 'backup' \? 'sync_failed' : 'restore_failed'\)/)
  })

  it('celebrates a goal once, not on every render past the target', () => {
    // The crossing usually happens between sessions — the price moved while the
    // app was closed — so the first render that sees it is a fresh mount and a
    // ref would already be empty. Persisted, and keyed by goal id, so a target
    // hovering either side of its line is still one win.
    const goals = readFileSync(join(src, 'components/GoalTracker.jsx'), 'utf8')
    expect(goals).toMatch(/const GOALS_MET_KEY = 'wl_goals_met'/)
    expect(goals).toMatch(/localStorage\.setItem\(GOALS_MET_KEY/)
    expect(goals).toMatch(/const fresh = met\.filter\(id => !seen\.includes\(id\)\)/)
  })
})

describe('the ask waits for the app to be in front of the user', () => {
  // THE BUG: the dwell clock started at module load. With App Lock on, this
  // module evaluates behind the lock screen, so the wait was already spent by
  // the time the user passed the fingerprint check — and the rating card
  // arrived on the unlock itself, over a credential prompt, which is the one
  // moment the user is certainly not admiring the app.
  const prompt = readFileSync(join(src, 'reviewPrompt.js'), 'utf8')
  const app = readFileSync(join(src, 'App.jsx'), 'utf8')

  it('does not fix the dwell clock at module load', () => {
    expect(prompt).not.toMatch(/const startedAt = Date\.now\(\)/)
    expect(prompt).toMatch(/let startedAt = Date\.now\(\)/)
  })

  it('refuses outright while the app is locked', () => {
    // Before every other gate: there is no app on screen to have an opinion
    // about, so nothing else is worth evaluating.
    const evaluate = /function evaluate\(snap\) \{[\s\S]*?\n\}/.exec(prompt)[0]
    expect(evaluate).toMatch(/blocked: 'locked'/)
    expect(evaluate.indexOf("'locked'")).toBeLessThan(evaluate.indexOf("'busy'"))
  })

  it('restarts the dwell when the app becomes usable', () => {
    // Not just unblocking: coming back in has to reset the wait, or the ask
    // fires the moment the lock clears anyway.
    expect(prompt).toMatch(/if \(next && !interactive\) startedAt = Date\.now\(\)/)
  })

  it('is told about the lock state from App', () => {
    expect(app).toMatch(/import \{ setAppInteractive \} from '\.\/reviewPrompt'/)
    expect(app).toMatch(/setAppInteractive\(!locked\)/)
  })
})

describe('the native rating gate is actually called by something', () => {
  // THE BUG THIS EXISTS FOR. ReviewGate.noteLaunch() and ReviewGate.shouldAsk()
  // were written, documented in detail, reviewed and shipped — and no line of
  // code anywhere called either of them. The gate counted launches that were
  // never counted and consulted a date that was never stamped, so shouldAsk()
  // could not have returned true on any device, ever. Three rounds of "the rate
  // card still doesn't appear" went by with the answer sitting in plain sight
  // in a file that read as finished.
  //
  // A gate is not wired because it exists. These assert the call sites.
  const JAVA = join(src, '..', '..', 'walletlens_source/release_package/app/src/main/java/live/walletlens/twa')
  const shell = readFileSync(join(JAVA, 'AppShellActivity.java'), 'utf8')
  const gate = readFileSync(join(JAVA, 'ReviewGate.java'), 'utf8')
  const activity = readFileSync(join(JAVA, 'ReviewActivity.java'), 'utf8')

  it('counts every cold start', () => {
    expect(shell).toMatch(/ReviewGate\.noteLaunch\(this\)/)
  })

  it('counts a cold start, not a rotation', () => {
    // onCreate runs again on every configuration change. Counting there
    // unguarded turns "launches" into "times the user turned the phone", which
    // clears MIN_LAUNCHES for somebody who has opened the app exactly once.
    const create = /protected void onCreate\([\s\S]*?\n    \}/.exec(shell)[0]
    const guard = create.indexOf('if (savedInstanceState == null) {\n            // A cold start')
    expect(guard, 'noteLaunch must sit behind a savedInstanceState == null check').toBeGreaterThan(-1)
    expect(create.indexOf('ReviewGate.noteLaunch')).toBeGreaterThan(guard)
  })

  it('consults the gate and starts the card', () => {
    expect(shell).toMatch(/ReviewGate\.shouldAsk\(this\)/)
    expect(shell).toMatch(/ReviewGate\.markAsked\(this\)/)
    expect(shell).toMatch(/new Intent\(this, ReviewActivity\.class\)/)
  })

  it('spends the ask before starting the flow, never after', () => {
    // A flow that crashes or is killed must not come back on the next launch
    // and every launch after it. ReviewActivity hands the ask back when Play
    // shows nothing, so this ordering costs nothing in the case it guards.
    const ask = /private void maybeAskForReview\(\) \{[\s\S]*?\n    \}/.exec(shell)[0]
    expect(ask.indexOf('markAsked')).toBeLessThan(ask.indexOf('startActivity'))
  })

  it('waits for the app to be in front of the user first', () => {
    // A card drawn over a cold start lands on a screen the user has not read
    // yet, from an app they were trying to open.
    expect(shell).toMatch(/REVIEW_DWELL_MS = 60_000L/)
    expect(shell).toMatch(/postDelayed\(this::maybeAskForReview, remaining\)/)
  })

  it('cancels the pending ask when the app goes to the background', () => {
    // Android 10+ blocks a background activity launch outright, so a timer that
    // survives onPause is at best a no-op and at worst a rating card over
    // whatever the user switched to.
    const pause = /protected void onPause\(\) \{[\s\S]*?\n    \}/.exec(shell)[0]
    expect(pause).toMatch(/reviewTimer.*removeCallbacksAndMessages\(null\)/)
  })

  it('asks at most once per launch', () => {
    expect(shell).toMatch(/if \(reviewAsked.*\) return;/)
  })

  it('does not ask a first-install user during their first session', () => {
    expect(gate).toMatch(/MIN_LAUNCHES_FRESH = 2/)
    expect(gate).toMatch(/isUpdatedInstall\(c\) \? MIN_LAUNCHES_UPDATED : MIN_LAUNCHES_FRESH/)
  })

  it('times out the request, and only the request', () => {
    // The watchdog was armed for the launch hand-off alone — the one path
    // nothing ever took — leaving the path that IS taken with no timeout at
    // all. Arming it always is only safe if it stops the moment Play answers:
    // past that point the elapsed time belongs to a user reading a card, and
    // four seconds is not long to read one.
    expect(activity).toMatch(/watchdog\.postDelayed\(/)
    const create = /protected void onCreate\([\s\S]*?\n    \}\n/.exec(activity)[0]
    expect(create.indexOf('cancelWatchdog()')).toBeGreaterThan(create.indexOf('watchdog.postDelayed('))
    expect(create).toMatch(/addOnCompleteListener\(task -> \{\n(\s*\/\/.*\n)*\s*cancelWatchdog\(\);/)
  })

  it('only hands back an ask the native gate actually spent', () => {
    // The web path keeps its own ledger in localStorage and calls neither
    // markAsked nor rollbackAsk, so rolling back for a web-triggered flow
    // clears a native cooldown belonging to a different ask entirely.
    expect(activity).toMatch(/private void giveTheAskBack\(\) \{\s*\n\s*if \(fromGate\) ReviewGate\.rollbackAsk\(this\);/)
    expect(activity).not.toMatch(/^\s*ReviewGate\.rollbackAsk\(ReviewActivity\.this\)/m)
    expect(shell).toMatch(/putExtra\(ReviewActivity\.EXTRA_FROM_GATE, true\)/)
  })
})

describe('the native ask respects App Lock', () => {
  // The web gate learned this the expensive way — its dwell clock ran behind
  // the lock screen and the card landed on the fingerprint prompt. The native
  // gate has the same exposure, because the lock is drawn as a page inside the
  // shell and the shell stays resumed the whole time it is up.
  const JAVA = join(src, '..', '..', 'walletlens_source/release_package/app/src/main/java/live/walletlens/twa')
  const gate = readFileSync(join(JAVA, 'ReviewGate.java'), 'utf8')

  it('refuses while the app is locked', () => {
    expect(gate).toMatch(/BiometricActivity\.isEnabled\(c\) && !BiometricActivity\.isSessionValid\(c\)/)
  })
})
