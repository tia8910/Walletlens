import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Error and status messages never appear as a JSX text node — they are string
// arguments to showMsg / setError / alert. The extractor that found every
// other English string in this codebase walks JSX text and is blind to them,
// which is why 39 of them survived several full translation passes.
//
// They are also the worst ones to miss. A label in the wrong language is
// friction; "Camera access denied. Allow camera permission and try again." in
// a language you do not read, at the moment your import just failed, is the
// difference between recovering and giving up.

const SRC = dirname(fileURLToPath(import.meta.url))

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.(jsx|js)$/.test(name) && !name.endsWith('.test.js')) out.push(p)
  }
  return out
}

// Setters whose argument is rendered to the user verbatim.
const USER_FACING = 'showMsg|setError|setMsg|setStatus|alert|setNotice|setWarning'
const CALL = new RegExp(`\\b(?:${USER_FACING})\\s*\\(\\s*(['"])((?:[^'"\\\\]|\\\\.){12,}?)\\1`, 'g')

// Two lowercase words in a row: prose, rather than an id, a class name or a
// key. 'not_configured' and 'wl_lang' do not match; "Fill all fields." does.
const LOOKS_LIKE_PROSE = /[a-z]{3}\s+[a-z]{2}/

// Files where an English literal is not a translation bug.
const ALLOW = [
  /\/analytics\.js$/,          // event names, never rendered
  /\/data\/blogPosts\.js$/,    // English-authoritative content
  /\/legal\//,                 // ditto, with its own parity test
]

// The public marketing and SEO pages are still English on purpose.
//
// Translating them is not just a code change: they are what Google indexes,
// and serving four languages from one URL without hreflang or per-language
// routes hurts ranking rather than helping it. That needs a URL-scheme
// decision first (/ar/rebalancing or similar) plus matching meta tags in the
// prerender.
//
// Listed explicitly rather than pattern-matched so the gap stays visible: when
// the routing question is answered, delete an entry and this test tells you
// exactly what is left to translate on that page.
const MARKETING_PENDING_I18N_ROUTING = [
  'pages/Landing.jsx', 'pages/LandingTest.jsx', 'pages/About.jsx', 'pages/Blog.jsx',
  'pages/FAQ.jsx', 'pages/Rebalancing.jsx', 'pages/Calculator.jsx',
  'pages/FearAndGreedIndex.jsx', 'pages/MarketIndex.jsx', 'pages/PricePage.jsx',
  'pages/TrackCoin.jsx', 'pages/Compare.jsx', 'pages/Learn.jsx',
  'pages/GrowNetWorth.jsx', 'pages/AdminMail.jsx',
]

// placeholder / title / aria-label have the same blind spot: rendered to the
// user (or read aloud) but attributes, not text nodes. aria-label is the one
// that matters most — someone navigating by screen reader in Arabic was
// hearing English for every control in the app.
const ATTR = /\b(?:placeholder|title|aria-label)=(["'])((?:[^"'\\]|\\.){6,}?)\1/g

// A bare capitalised word is a label too ("Settings", "Refresh"), so accept
// either two lowercase words in a row or a single capitalised word.
const ATTR_PROSE = /[a-z]{3}\s+[a-z]{2}|^[A-Z][a-z]{3,}$/

describe('user-facing messages go through the translator', () => {
  const files = sourceFiles(SRC).filter(f => !ALLOW.some(re => re.test(f)))

  it('finds the source tree', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('no English prose is passed straight to a user-facing setter', () => {
    const offenders = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(CALL)) {
        if (!LOOKS_LIKE_PROSE.test(m[2])) continue
        const line = src.slice(0, m.index).split('\n').length
        offenders.push(`${f.slice(SRC.length + 1)}:${line} → ${m[2].slice(0, 60)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the marketing exclusion list points at real files', () => {
    // A renamed page would silently drop out of the check above.
    const missing = MARKETING_PENDING_I18N_ROUTING
      .filter(rel => !files.some(f => f.slice(SRC.length + 1) === rel))
    expect(missing).toEqual([])
  })

  it('no English prose is left in an in-app placeholder, title or aria-label', () => {
    const offenders = []
    const inApp = files.filter(f =>
      f.endsWith('.jsx') &&
      !MARKETING_PENDING_I18N_ROUTING.includes(f.slice(SRC.length + 1)))
    for (const f of inApp) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(ATTR)) {
        if (!ATTR_PROSE.test(m[2])) continue
        const line = src.slice(0, m.index).split('\n').length
        offenders.push(`${f.slice(SRC.length + 1)}:${line} → ${m[2].slice(0, 60)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
