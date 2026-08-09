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
})
