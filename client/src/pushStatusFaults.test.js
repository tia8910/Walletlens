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
