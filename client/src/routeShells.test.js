import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AR_FEATURES } from './data/arabic.js'

// Every route React Router knows about needs a file at that path.
//
// Cloudflare serves a prerendered directory if one exists and 404.html if one
// does not, and a cold navigation — a typed URL, a tapped notification, an
// OAuth redirect — never reaches React Router at all. So a route the app
// handles perfectly still 404s unless the build wrote a shell for it.
//
// This has now happened five times: /guardian (every Android notification),
// /drive-callback (every Drive sign-in), /calendar and /grow (two more
// notification targets), and /diag, which was shipped without one and
// reproduced the very bug it exists to diagnose. Each was found in
// production, one at a time, by someone tapping the thing that was broken.
//
// It is a build-time fact, so it is checkable at build time.

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, 'App.jsx'), 'utf8')
const prerender = readFileSync(join(here, '../scripts/prerender.mjs'), 'utf8')

/** Every path React Router claims, minus the parameterised ones. */
const routed = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1])
  // A parameterised path cannot have a shell — the segment is data. Those are
  // covered by the explicit splat in public/_redirects instead.
  .filter((p) => !p.includes(':') && !p.includes('*') && p !== '/')

/**
 * Every path the prerender writes.
 *
 * Two of these are composed at build time — write('/ar/' + f.slug) — so a
 * scan for string literals reports them missing when the shells are in fact
 * written. Reading the slugs from the same module the script imports keeps
 * the two in step instead of hardcoding them here.
 */
const written = new Set([
  ...[...prerender.matchAll(/write\(\s*'([^']+)'/g)].map((m) => m[1]),
  ...[...prerender.matchAll(/\{\s*path:\s*'([^']+)'/g)].map((m) => m[1]),
  ...Object.values(AR_FEATURES).map((f) => `/ar/${f.slug}`),
])

describe('every route has somewhere to land', () => {
  it('finds the routes and the shells at all', () => {
    // A parser that silently matches nothing would make every assertion below
    // pass while checking nothing.
    expect(routed.length).toBeGreaterThan(20)
    expect(written.size).toBeGreaterThan(20)
  })

  it('writes a shell for every non-parameterised route', () => {
    const missing = routed.filter((p) => !written.has(p))
    // A failure here names a URL that 404s on a cold navigation — typed,
    // tapped from a notification, or redirected to by Google.
    expect(missing).toEqual([])
  })

  it('keeps a shell for every cold-arrival path that has broken before', () => {
    // Named individually because each one cost a production bug report, and a
    // refactor that quietly drops one would otherwise only show up the next
    // time somebody taps a notification.
    for (const p of ['/guardian', '/drive-callback', '/calendar', '/grow', '/diag']) {
      expect(written.has(p), `${p} lost its shell`).toBe(true)
    }
  })

  it('agrees with what the build actually produced', () => {
    // The scan above reads intent out of the script. This reads the result.
    // They can disagree — a write() the script skips at runtime, a path
    // composed in a way the regex cannot see — and the directory is the one
    // the server serves, so it is the one that decides.
    const dist = join(here, '../dist')
    if (!existsSync(dist)) return                       // no build in this run
    const missing = routed.filter((p) => !existsSync(join(dist, p, 'index.html')))
    expect(missing).toEqual([])
  })

  it('keeps the splat for /asset/:coinId, which cannot have one', () => {
    // The target of every price alert. The id is a holding, not a route, so a
    // shell is impossible and the rewrite is the only thing standing between a
    // tapped alert and 404.html.
    const redirects = readFileSync(join(here, '../public/_redirects'), 'utf8')
    expect(redirects).toMatch(/^\/asset\/\*\s+\/index\.html\s+200$/m)
  })
})
