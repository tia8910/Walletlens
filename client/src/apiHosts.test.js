import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VOICE_HOST, PUSH_HOST, DATA_HOST, DRIVE_AUTH_HOST, SITE_ORIGIN, VOICE_API, PUSH_API, DATA_API, DRIVE_API, voiceProxy, dataUrl } from './apiHosts.js'

// The backend hosts were string literals in twenty-odd files. Moving off Deno
// Deploy was therefore a search-and-replace, where missing one site fails at
// runtime, in production, for whichever feature was missed — and three of the
// places that name a host cannot import a JS constant at all.
//
// The worst of those three is the CSP. A `connect-src` that still lists only
// the old host blocks every request to the new one, and the browser reports it
// as a policy violation rather than as a wrong URL, so the console points away
// from the change that caused it.
//
// These tests are the reason the cutover can be a one-file edit: change
// apiHosts.js, run them, and they name whatever else has to move.

const here = dirname(fileURLToPath(import.meta.url))
const SRC = here
const CLIENT = join(here, '..')

const read = (p) => readFileSync(join(CLIENT, p), 'utf8')

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full))
    else if (/\.(js|jsx)$/.test(e.name)) out.push(full)
  }
  return out
}

/**
 * Whether a CSP source list admits `host`, by exact match or by a wildcard.
 *
 * `*.deno.net` admits any depth of subdomain, so a naive equality check would
 * report a false failure against the policy that is actually shipping.
 */
function cspAdmits(policy, host) {
  const connect = /connect-src ([^;]*)/.exec(policy)
  if (!connect) return false
  return connect[1].trim().split(/\s+/).some((src) => {
    const bare = src.replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (bare === host) return true
    if (bare.startsWith('*.')) return host.endsWith(bare.slice(1))
    return false
  })
}

describe('apiHosts', () => {
  it('builds the two endpoint shapes the call sites expected', () => {
    // One has a trailing slash and the other does not. That asymmetry is
    // inherited from the call sites, and normalising it here would silently
    // change the URLs every one of them builds.
    expect(VOICE_API).toBe(`https://${VOICE_HOST}/`)
    // Both now go through the app's own origin rather than workers.dev: a
    // connection check from the app showed every workers.dev host throwing
    // "Failed to fetch" on a device that loaded the site fine, which is what a
    // DNS or ISP blocklist looks like from a browser. Worker routes on the
    // zone carry these the rest of the way.
    expect(PUSH_API).toBe(`${SITE_ORIGIN}/api/push`)
    expect(PUSH_API.endsWith('/')).toBe(false)
    expect(DATA_API).toBe(SITE_ORIGIN)
    // And the Drive token exchange, for the same reason: a sign-in that cannot
    // reach workers.dev fails with nothing to show but "Sign-in did not
    // complete".
    expect(DRIVE_API).toBe(`${SITE_ORIGIN}/api/drive`)
  })

  it('builds a dataset URL under the filename it had as a static asset', () => {
    // Call sites fetched '/market.json' when this was a file the build
    // shipped. Only the origin moved, so a changed filename here would
    // silently 404 against a service that still serves the old name.
    expect(dataUrl('market.json')).toBe(`${SITE_ORIGIN}/market.json`)
  })

  it('builds a proxy URL with the target encoded', () => {
    expect(voiceProxy('https://x.com/a?b=1&c=2'))
      .toBe(`https://${VOICE_HOST}/proxy?url=https%3A%2F%2Fx.com%2Fa%3Fb%3D1%26c%3D2`)
  })
})

describe('no call site hardcodes a backend host', () => {
  it('leaves apiHosts.js as the only source of the hostnames', () => {
    const offenders = []
    for (const file of walk(SRC)) {
      const rel = relative(CLIENT, file)
      if (rel.endsWith('src/apiHosts.js') || rel.endsWith('src/apiHosts.test.js')) continue
      const text = readFileSync(file, 'utf8')
      if (text.includes(VOICE_HOST) || text.includes(PUSH_HOST)
        || text.includes(DATA_HOST) || text.includes(DRIVE_AUTH_HOST)) {
        offenders.push(rel)
      }
    }
    // A failure here means a new call site hardcoded a host, and will keep
    // talking to the old service after the next move.
    expect(offenders).toEqual([])
  })

  it('names the server in the privacy policy from the constant, in every language', () => {
    // The policy tells users which server their data reaches. Left as a
    // literal, it would keep naming a host the app no longer talks to — a
    // legal document quietly going out of date.
    const policy = read('src/legal/privacy.js')
    expect(policy).not.toContain('deno.net')
    expect(policy.match(/\$\{VOICE_HOST\}/g) || []).toHaveLength(6)
  })
})

describe('the places that cannot import apiHosts.js', () => {
  it('admits both hosts in the index.html CSP', () => {
    const html = read('index.html')
    expect(cspAdmits(html, VOICE_HOST)).toBe(true)
    expect(cspAdmits(html, PUSH_HOST)).toBe(true)
    expect(cspAdmits(html, DATA_HOST)).toBe(true)
  })

  it('admits both hosts in the _headers CSP that Pages actually serves', () => {
    // index.html carries a meta CSP, but the header from public/_headers is
    // the one that applies to the deployed site. They are separate files and
    // updating only one is the easy mistake.
    const headers = read('public/_headers')
    expect(cspAdmits(headers, VOICE_HOST)).toBe(true)
    expect(cspAdmits(headers, PUSH_HOST)).toBe(true)
    expect(cspAdmits(headers, DATA_HOST)).toBe(true)
  })

  it('caches the proxy in the service worker under the current host', () => {
    // sw.js caches proxy responses so repeat price polls are served locally.
    // A stale host here does not break the app — it silently stops caching,
    // and every price poll round-trips instead.
    expect(read('public/sw.js')).toContain(VOICE_HOST)
  })

  it('matches the data origin in the service worker', () => {
    // The runtime cache for the scheduled datasets is gated on this origin.
    // These used to be same-origin files, so a stale constant here does not
    // error — it just stops matching, and every feed poll round-trips.
    expect(read('public/sw.js')).toContain(`const DATA_ORIGIN = '${SITE_ORIGIN}'`)
  })

  it('preconnects to the host the app actually calls', () => {
    const html = read('index.html')
    expect(html).toContain(`<link rel="preconnect" href="https://${VOICE_HOST}"`)
    expect(html).toContain(`<link rel="preconnect" href="https://${DATA_HOST}"`)
  })

  it('keeps the voice worker\'s own SELF_ORIGIN on the same host', () => {
    // The worker builds guardian-reset links from SELF_ORIGIN and mails them.
    // Left behind, those links point at the dead service, and the failure
    // surfaces days later in someone's inbox rather than in a request log.
    const worker = readFileSync(join(CLIENT, '..', 'workers/voice/index.js'), 'utf8')
    expect(worker).toContain(`const SELF_ORIGIN = "https://${VOICE_HOST}"`)
  })

  it('has no preconnect or prefetch left pointing at a host nothing calls', () => {
    // A dns-prefetch for walletlens.tia8910.deno.net outlived whatever used
    // it, costing every visitor a DNS lookup for a service the client never
    // contacts.
    const html = read('index.html')
    const hinted = [...html.matchAll(/rel="(?:preconnect|dns-prefetch)" href="https:\/\/([^"]+)"/g)]
      .map((m) => m[1])
      .filter((h) => h.endsWith('deno.net') || h.endsWith('deno.dev') || h.endsWith('workers.dev'))
    for (const h of hinted) expect([VOICE_HOST, PUSH_HOST, DATA_HOST]).toContain(h)
  })
})
