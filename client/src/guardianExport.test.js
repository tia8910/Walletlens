import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Guardian export reads a KV record that holds far more than an email
// address, so these checks are about what must NOT come out of it.
//
// A Guardian record contains the owner's private message to their heirs, the
// heirs' own names and addresses — people who never used WalletLens and never
// agreed to anything — a portfolio summary, and qrPng, an image encoding the
// owner's entire holdings snapshot. Anyone holding a full dump could scan that
// QR and load someone else's portfolio.
//
// An export is the most copied and least guarded artefact a service produces,
// so the projection is explicit and this test keeps it that way.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const API = readFileSync(join(ROOT, 'voice-api', 'main.ts'), 'utf8')

function exportBlock() {
  const start = API.indexOf('body?.mode === "guardian_export"')
  const end = API.indexOf('body?.mode === "send_campaign"', start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  return API.slice(start, end)
}

describe('guardian_export', () => {
  const block = exportBlock()

  it('is gated by the same admin token as the other export', () => {
    expect(block).toContain('SIGNUP_EXPORT_TOKEN')
    expect(block).toMatch(/body\.token !== expected/)
    expect(block).toContain('unauthorized')
  })

  it('reads the guardian prefix, not signups', () => {
    expect(block).toContain('kv.list({ prefix: ["guardian"] })')
  })

  const FORBIDDEN = [
    ['qrPng', "the owner's full holdings snapshot as a scannable image"],
    ['message', 'a private note meant for the heirs'],
    ['portfolioSummary', 'total value and asset symbols'],
    ['heirs:', 'names and addresses of non-users'],
  ]

  for (const [field, why] of FORBIDDEN) {
    it(`never emits ${field} — ${why}`, () => {
      // heirs is read for its length, which is fine; emitting the array is not.
      expect(block).not.toContain(`${field} r.${field.replace(':', '')}`)
      expect(block).not.toMatch(new RegExp(`\\b${field.replace(':', '')}\\s*:\\s*r\\.${field.replace(':', '')}`))
    })
  }

  it('spreads nothing from the record', () => {
    // `...r` would defeat every check above, and would silently pick up any
    // field added to the record later.
    expect(block).not.toMatch(/\.\.\.\s*r\b/)
    expect(block).not.toMatch(/\.\.\.\s*entry\.value/)
  })

  it('emits the fields the admin page actually renders', () => {
    for (const f of ['ownerEmail', 'active', 'intervalDays', 'heirCount', 'lastCheckin']) {
      expect(block).toContain(f)
    }
  })

  it('counts heirs rather than listing them', () => {
    expect(block).toMatch(/heirCount:\s*Array\.isArray\(r\.heirs\)\s*\?\s*r\.heirs\.length/)
  })
})

describe('guardian_setup keeps the subscribe date', () => {
  it('carries createdAt across an edit', () => {
    // The setup handler is reused for edits and overwrites the whole record,
    // so without this every edit would look like a fresh signup.
    const start = API.indexOf('kv.set(["guardian", deviceId], record)')
    const block = API.slice(Math.max(0, start - 1400), start)
    expect(block).toMatch(/priorCreatedAt/)
    expect(block).toMatch(/createdAt:\s*priorCreatedAt \|\| new Date\(\)\.toISOString\(\)/)
  })
})

describe('the admin page', () => {
  const PAGE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pages', 'AdminMail.jsx'), 'utf8')

  it('calls the export and offers a CSV', () => {
    expect(PAGE).toContain("mode: 'guardian_export'")
    expect(PAGE).toContain('downloadGuardianCsv')
  })

  it('quotes every CSV field', () => {
    // An owner name containing a comma would otherwise shift every later
    // column, silently corrupting the file the moment it is opened.
    expect(PAGE).toMatch(/replace\(\/"\/g, '""'\)/)
  })

  it('never renders a heir address or the personal message', () => {
    expect(PAGE).not.toMatch(/r\.heirs\b/)
    expect(PAGE).not.toMatch(/r\.message\b/)
    expect(PAGE).not.toMatch(/r\.qrPng\b/)
  })
})

// ── The browsable /subscribers page ────────────────────────────────────────
//
// This route predates the POST export and already listed newsletter and weekly
// subscribers; Guardian owners were missing because they live under their own
// KV prefix. The same withholding rules apply here and matter more, because
// this is a URL that gets pasted into chats and left open in tabs.
describe('/subscribers page', () => {
  const start = API.indexOf('reqUrl.pathname === "/subscribers"')
  const block = API.slice(start, API.indexOf('return new Response(JSON.stringify({ error: "not_found" })', start))

  it('reads the right block', () => {
    expect(start).toBeGreaterThan(0)
    expect(block).toContain('SIGNUP_EXPORT_TOKEN')
  })

  it('lists all three subscriber prefixes', () => {
    for (const prefix of ['["signups"]', '["weekly"]', '["guardian"]']) {
      expect(block).toContain(`kv.list<`)
      expect(block).toContain(prefix)
    }
  })

  it('withholds the same Guardian fields as the POST export', () => {
    expect(block).not.toMatch(/qrPng:\s*v\.qrPng/)
    expect(block).not.toMatch(/message:\s*v\.message/)
    expect(block).not.toMatch(/portfolioSummary:\s*v\.portfolioSummary/)
    expect(block).not.toMatch(/heirs:\s*v\.heirs/)
    expect(block).not.toMatch(/\.\.\.\s*v\b/)
  })

  it('counts heirs rather than listing them', () => {
    expect(block).toMatch(/heirCount:\s*Array\.isArray\(v\.heirs\)\s*\?\s*v\.heirs\.length/)
  })

  it('sends no-referrer, because the token is in the query string', () => {
    // Without it, any outbound link or remote image on the page hands the full
    // URL — token included — to a third-party server via the Referer header.
    expect(block).toMatch(/"referrer-policy":\s*"no-referrer"/)
    expect(block).toMatch(/"cache-control":\s*"no-store"/)
    expect(block).toMatch(/"x-robots-tag":\s*"noindex"/)
  })

  it('is rate limited', () => {
    expect(block).toMatch(/rateLimited\(ip, "subscribers"/)
  })
})

describe('the subscribers page markup', () => {
  const start = API.indexOf('function subscribersPage')
  const block = API.slice(start, API.indexOf('// ── Per-IP rate limiting', start))

  it('keeps Guardian owners out of "copy all emails"', () => {
    // They gave an address so Guardian could warn them before contacting their
    // heirs. One tap that drops them into a campaign paste is how a purpose
    // limit gets crossed by accident instead of by decision.
    const allEmails = block.slice(block.indexOf('const allEmails'), block.indexOf('const signupRows'))
    expect(allEmails).toContain('signups.map')
    expect(allEmails).toContain('weekly.map')
    expect(allEmails).not.toContain('guardians')
  })

  it('still offers Guardian its own deliberate copy button', () => {
    expect(block).toContain("copyCol('gd')")
  })

  it('renders no heir address, message or portfolio value', () => {
    expect(block).not.toMatch(/g\.heirs\b/)
    expect(block).not.toMatch(/g\.message\b/)
    expect(block).not.toMatch(/g\.qrPng\b/)
    expect(block).not.toMatch(/g\.portfolioSummary\b/)
  })

  it('escapes every owner-supplied string it prints', () => {
    // ownerName is free text straight from the setup form.
    expect(block).toMatch(/escapeHtml\(g\.ownerName/)
    expect(block).toMatch(/escapeHtml\(g\.ownerEmail/)
  })
})
