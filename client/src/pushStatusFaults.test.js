import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// pushStatus() is the only thing that tells a user why notifications are quiet,
// and for one release it told everyone the same thing: "can't reach the
// notification server". It said that with the worker verified healthy from the
// outside — /health answering db:true, vapid:true — because the whole function
// sat inside one try/catch, so an exception from reading Notification.permission
// or importing the native bridge came out as a network fault. A diagnosis aimed
// at the wrong side of the wire costs a day, so the attribution is asserted
// here rather than left to the next person reading the screenshot.

const here = dirname(fileURLToPath(import.meta.url))
const push = readFileSync(join(here, 'push.js'), 'utf8')
const toggle = readFileSync(join(here, 'components/PushToggle.jsx'), 'utf8')

function pushStatusBody() {
  const start = push.indexOf('export async function pushStatus()')
  expect(start).toBeGreaterThan(-1)
  const next = push.indexOf('\nexport ', start + 1)
  return push.slice(start, next === -1 ? push.length : next)
}

describe('pushStatus fault attribution', () => {
  it('no longer wraps the whole function in a catch that blames the network', () => {
    expect(pushStatusBody()).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*return \{ supported: true, reachable: false \}/)
  })

  it('never reports reachable:false without saying which fault it was', () => {
    // A bare `reachable: false` is the old bug exactly: unreadable from the
    // screen, and indistinguishable from the three faults that are not ours.
    for (const m of pushStatusBody().matchAll(/reachable: false[^}]*/g)) {
      expect(m[0]).toMatch(/serverFault/)
    }
  })

  it('puts only the fetch inside the try that can report a network fault', () => {
    const start = push.indexOf('async function askServer(')
    expect(start).toBeGreaterThan(-1)
    const body = push.slice(start, push.indexOf('export async function pushStatus()'))
    const guarded = body.slice(body.indexOf('try {'), body.indexOf('} catch'))
    expect(guarded).toMatch(/await fetch\(`\$\{PUSH_API\}\/status\?/)
    // Nothing else belongs in there — a permission read or a dynamic import
    // here is how the misattribution got in the first time.
    expect(guarded).not.toMatch(/Notification\.permission|import\(|getSubscription\(/)
  })

  it('reports a local failure as ours, not as an unreachable server', () => {
    expect(pushStatusBody()).toMatch(/serverFault: 'client_error'/)
  })
})

describe('the settings copy carries no notes to the developer', () => {
  // The diagnostics that found tonight's fault did their job and are gone from
  // the screen. Every distinction they drew still exists in the code and in
  // what gets logged; none of it is put in front of a reader, because none of
  // it names something a reader can do.
  const surfaces = { 'PushToggle.jsx': toggle, 'push.js': push }

  it('prints no build identifier', () => {
    expect(toggle).not.toMatch(/__WL_BUILD__|build \{/)
  })

  it('prints no raw exception text', () => {
    expect(toggle).not.toMatch(/\{(status|repair)\.detail\}/)
    for (const [name, src] of Object.entries(surfaces)) {
      expect(src, `${name} still interpolates detailOf`).not.toMatch(/new Error\([^)]*detailOf\(/)
    }
  })

  it('prints no status code, reason code or fault code', () => {
    expect(toggle).not.toMatch(/repair\.httpStatus|lastError\.code|fault\.slice/)
    expect(push).not.toMatch(/new Error\(`[^`]*\$\{res\.(status|reason)/)
  })

  it('has no diagnostic instrument left on the page', () => {
    expect(toggle).not.toMatch(/ConnectionCheck|Run a connection check/)
  })

  it('says one thing for a fault on our side and one for a missing connection', () => {
    expect(toggle).toMatch(/const SERVER_FAULTS = new Set\(/)
    expect(toggle).toMatch(/Nothing to fix on your side/)
    expect(toggle).toMatch(/Notifications are offline right now/)
  })

  it('still distinguishes every reason in code, even though the copy does not', () => {
    // The branches are what make the logs worth reading. Collapsing the
    // SENTENCES must not collapse the logic behind them.
    const shell = push.slice(push.indexOf('async function enablePushInShell'))
    for (const reason of ['no-token', 'not-in-shell', 'unreachable', 'payload', 'http-']) {
      expect(shell, `${reason} branch`).toContain(`'${reason}'`)
    }
    expect(shell).toMatch(/res\.reachedServer/)
  })

  it('uses no dash as punctuation in anything the reader sees', () => {
    for (const [name, src] of Object.entries(surfaces)) {
      const code = src
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')   // JSX comments
        .replace(/\/\*[\s\S]*?\*\//g, '')         // block comments
        .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
      expect(code, `${name} has an em dash in visible copy`).not.toMatch(/\u2014/)
    }
  })
})

describe('a refused delivery is not put in front of the user', () => {
  it('does not render lastError on the card', () => {
    // It read as "notifications are broken" to someone who had eleven arrive
    // the same day: the field is cleared by the next SUCCESSFUL send, so a
    // quiet afternoon leaves the last failure on screen long after it stopped
    // meaning anything.
    expect(toggle).not.toMatch(/\{status\.lastError\.code\}/)
    expect(toggle).not.toMatch(/could not be delivered/)
    expect(toggle).not.toMatch(/function timeAgo/)
  })

  it('still records it on the server, for anyone diagnosing a device', () => {
    const worker = readFileSync(join(here, '../../workers/push/index.js'), 'utf8')
    expect(worker).toMatch(/lastError: sub\.lastError/)
    expect(worker).toMatch(/function noteError\(sub, code, now\)/)
  })
})

describe('nothing is withheld for being the nth notification', () => {
  const logic = readFileSync(join(here, '../../push-api/notify-logic.js'), 'utf8')

  it('counts sends without capping them', () => {
    const fn = logic.slice(logic.indexOf('export function bumpSent'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    // A counter, not a budget: no comparison against a ceiling anywhere in it.
    expect(body).toMatch(/return \{ day, n: \(sent\.n \|\| 0\) \+ 1 \}/)
    expect(body).not.toMatch(/>=|<=|MAX|LIMIT|CAP/)
  })

  it('has no daily ceiling left to trip over', () => {
    expect(logic).not.toMatch(/MAX_PER_DAY|DAILY_CAP|MAX_DAILY/)
  })

  it('keeps the per-reason cooldowns, which are what hold the volume', () => {
    // These cannot stack into a stream from one event, and unlike a global cap
    // they can only ever delay the reason that just fired, never a different
    // one.
    for (const gate of ['MOVE_COOLDOWN_MS', 'NEWS_COOLDOWN_MS', 'FEATURE_TIP_GAP_MS']) {
      expect(logic, gate).toContain(gate)
    }
  })

  it('treats an exhausted per-run budget as retry, not as drop', () => {
    const worker = readFileSync(join(here, '../../workers/push/index.js'), 'utf8')
    // The only remaining limit is Cloudflare's subrequest ceiling for one cron
    // invocation. Hitting it must leave the channel state untouched so the
    // next tick sends it, rather than counting as delivered.
    expect(worker).toMatch(/if \(budget && !budget\.take\(\)\) return false/)
  })
})
