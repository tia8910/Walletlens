import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The instrument, not a feature.
//
// Five faults this month were one cause, and they surfaced one per deploy
// because each was only visible once the one in front of it was fixed. Every
// round cost a build, an upload and a screenshot to learn one bit. This page
// asks every question at once, so the next round learns all of them.

const here = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(here, 'pages/Diagnostics.jsx'), 'utf8')
const app = readFileSync(join(here, 'App.jsx'), 'utf8')

describe('the diagnostics page', () => {
  it('is routed, lazily, at a path nothing links to', () => {
    expect(app).toContain('<Route path="/diag" element={<Diagnostics />} />')
    expect(app).toMatch(/const Diagnostics\s*= lazy\(\(\) => import\('\.\/pages\/Diagnostics'\)\)/)
    // Linking it would put it in front of users, for whom it means nothing.
    const links = app.match(/to="\/diag"/g) || []
    expect(links).toHaveLength(0)
  })

  it('never reads a credential out onto the screen', () => {
    // The page reports whether a token exists and how old it is. Printing the
    // token itself would put a live Drive credential in every screenshot taken
    // of this page — which is the one thing it exists to invite.
    expect(page).not.toMatch(/raw\.token[^s]/)
    expect(page).not.toMatch(/detail:.*\braw\.token\b/)
    expect(page).toMatch(/left > 0 \? `valid \$\{left\}m`/)
  })

  it('probes reachability without CORS, so the probe cannot fail the way the request did', () => {
    expect(page).toMatch(/mode: 'no-cors'/)
  })

  it('treats a 401 from Drive as success, because that is what it is', () => {
    // Receiving a 401 proves the preflight passed and the response carried
    // CORS headers. A rejected fetch cannot be told apart from an unreachable
    // host, which is the ambiguity that cost a week.
    expect(page).toMatch(/res\.status === 401 \? 'ok' : 'warn'/)
    expect(page).toContain('401 expected')
  })

  it('sends an invalid token on purpose, never the real one', () => {
    expect(page).toContain('diagnostic-probe-not-a-real-token')
    expect(page).not.toMatch(/Authorization: `Bearer \$\{(?!FAKE_TOKEN)/)
  })

  it('checks the site routes, Google, and every worker host', () => {
    for (const name of ['drive route', 'push route', 'news dataset',
      'drive host reachable', 'drive CORS', 'drive token',
      'workers.dev direct', 'voice worker', 'data worker', 'service worker']) {
      expect(page, `${name} missing`).toContain(`'${name}'`)
    }
  })

  it('shows the build, so a screenshot proves which build produced it', () => {
    // Two builds printing the same sentence for the same failure is how a
    // deploy that had not landed looked exactly like a fix that had not worked.
    expect(page).toContain('__WL_BUILD__')
    expect(page).toMatch(/Build <strong>\{build\}<\/strong>/)
  })

  it('lets the result be copied as text rather than photographed', () => {
    expect(page).toMatch(/navigator\.clipboard\.writeText\(report\)/)
    expect(page).toMatch(/`\$\{MARK\[r\.state\]\} \$\{r\.name\}/)
  })

  it('survives one check failing, and renders each answer as it lands', () => {
    // A single throw must not blank the other nine, and a slow host must not
    // hold back the ones that already answered.
    expect(page).toMatch(/catch \(e\) \{\s*return \{ name, state: 'fail'/)
    expect(page).toMatch(/AbortSignal\.timeout\(8000\)/)
  })
})
