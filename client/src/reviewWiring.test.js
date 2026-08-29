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
