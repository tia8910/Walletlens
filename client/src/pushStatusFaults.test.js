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
