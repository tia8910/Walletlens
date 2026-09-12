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

describe('the sentence each fault produces', () => {
  it('has a distinct message for every fault pushStatus can emit', () => {
    const emitted = [...push.matchAll(/serverFault: '([a-z_]+)'/g)].map(m => m[1])
    expect(emitted.length).toBeGreaterThan(0)
    for (const fault of emitted) {
      expect(toggle).toContain(`case '${fault}':`)
    }
  })

  it('still names the two server-side faults /health can report', () => {
    for (const fault of ['store_unavailable', 'server_error']) {
      expect(toggle).toContain(`case '${fault}':`)
    }
  })

  it('shows the browser’s own words when it has them', () => {
    // The detail is the whole point: "Failed to fetch" and a CSP refusal are
    // the same status object without it.
    expect(toggle).toMatch(/status\.detail/)
  })

  it('renders an HTTP status the server actually returned', () => {
    expect(toggle).toMatch(/startsWith\('http_'\)/)
  })
})

describe('turning push on says why it failed', () => {
  // The toggle's error line had the same disease as the status line: one
  // sentence about the network for every failure, including the ones where the
  // server answered. "Couldn't reach the notification server" was on screen
  // while /health returned db: true, vapid: true from outside.
  function enablePushBody() {
    const start = push.indexOf('export async function enablePush()')
    expect(start).toBeGreaterThan(-1)
    const next = push.indexOf('\n/**', start)
    return push.slice(start, next)
  }

  it('reports a refusal with the status the server returned', () => {
    const body = enablePushBody()
    expect(body).toMatch(/refused this device \(\$\{res\.status\}/)
    // The server's own error code too — invalid_endpoint and store_unavailable
    // need completely different responses from the reader.
    expect(body).toMatch(/body\?\.error/)
  })

  it('does not call a refusal an unreachable server', () => {
    const body = enablePushBody()
    // Code only — the comment above the branch quotes the old sentence to say
    // why it is gone, and that is the point of the comment.
    const refusal = body.slice(body.indexOf('if (!res.ok)'))
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(refusal).not.toMatch(/reach the notification server/)
  })

  it('still rolls the subscription back on both failures', () => {
    // A half-registered device reports itself enabled and never receives
    // anything, which is worse than a visible error.
    const body = enablePushBody()
    expect(body.match(/await rollback\(\)/g)?.length).toBe(2)
  })

  it('separates a request that never completed from every local fault', () => {
    const shell = push.slice(push.indexOf('async function enablePushInShell'))
    expect(shell).toMatch(/res\.reason === 'unreachable'/)
    expect(shell).toMatch(/res\.reason === 'not-in-shell'/)
    // And the catch-all names the reason rather than guessing at a cause.
    expect(shell).toMatch(/Registering this device failed \(\$\{res\.reason/)
  })

  it('shows the runtime\u2019s own words for a request that never left', () => {
    // Two failures wear "nothing was sent": the fetch threw, and the body
    // could not be serialised. Neither is diagnosable without the detail.
    const shell = push.slice(push.indexOf('async function enablePushInShell'))
    expect(shell).toMatch(/res\.detail \? ` \(\$\{res\.detail\}\)`/)
  })

  it('covers every reason registerNativePush can return', () => {
    const native = readFileSync(join(here, 'nativePush.js'), 'utf8')
    const reg = native.slice(native.indexOf('export async function registerNativePush'))
    const body = reg.slice(0, reg.indexOf('\n}'))
    const reasons = [...body.matchAll(/reason: '([a-z-]+)'/g)].map(m => m[1])
      .filter(r => r !== 'already')
    const shell = push.slice(push.indexOf('async function enablePushInShell'))
    for (const r of reasons) {
      expect(shell).toContain(`'${r}'`)
    }
  })
})

describe('writes to the push service do not need permission first', () => {
  const native = readFileSync(join(here, 'nativePush.js'), 'utf8')
  const hosts = readFileSync(join(here, 'apiHosts.js'), 'utf8')

  it('sends a content type that is CORS-safelisted', () => {
    // 'application/json' is not one of the three safelisted values, so every
    // write preflighted — an OPTIONS that had to be answered correctly, be
    // allowed by connect-src, and be understood by the browser, before the
    // real request was attempted. Reads never preflight, which is why they
    // worked from the Android WebView while registering a device did not.
    expect(hosts).toMatch(/export const SIMPLE_JSON = 'text\/plain;charset=UTF-8'/)
  })

  it('leaves no write still asking for a preflight', () => {
    for (const src of [push, native]) {
      expect(src).not.toMatch(/'Content-Type': 'application\/json'/)
    }
    expect(push).toMatch(/'Content-Type': SIMPLE_JSON/)
    expect(native).toMatch(/'Content-Type': SIMPLE_JSON/)
  })

  it('sends no other header, which would preflight just as surely', () => {
    // One safelisted content type and nothing else is what makes a request
    // simple. Any added header here puts the OPTIONS back.
    for (const m of push.matchAll(/fetch\(`\$\{PUSH_API\}[^`]*`,\s*\{[^}]*headers:\s*\{([^}]*)\}/g)) {
      expect(m[1].trim().replace(/,$/, '')).toBe("'Content-Type': SIMPLE_JSON")
    }
  })

  it('is still read as JSON by the worker, which ignores the header', () => {
    const worker = readFileSync(join(here, '../../workers/push/index.js'), 'utf8')
    expect(worker).toMatch(/async function readJson\(req\) \{\s*try \{ return await req\.json\(\)/)
    // And nothing READS the request's content type, which would now see
    // text/plain. (corsHeaders names Content-Type on the way out; that is the
    // response's own type and is unrelated.)
    expect(worker).not.toMatch(/req\.headers\.get\(['"]content-type/i)
  })
})
