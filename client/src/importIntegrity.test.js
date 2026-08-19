// Catches a helper that is used but never imported.
//
// Settings.jsx once shipped a call to pulseSettings() with no import for it.
// The build passed — an undefined identifier is a runtime ReferenceError, not
// a bundling error — and the page crashed for every user who opened it. There
// is no linter in this project to catch it, so this stands in for one.
//
// Deliberately narrow. It only checks helpers exported by the small set of
// runtime modules below, which are the ones pages reach for and the ones whose
// absence takes a whole screen down. A general no-undef check is eslint's job,
// not a unit test's.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)))

/** Modules whose exports are used across pages and components. */
const WATCHED = [
  'marketPulseRuntime.js',
  'marketPulse.js',
  'reviewPrompt.js',
  'nativeBridge.js',
  'nativeWidgets.js',
  'pulseAudio.js',
]

function exportsOf(file) {
  const src = readFileSync(join(SRC, file), 'utf8')
  const names = new Set()
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1])
  for (const m of src.matchAll(/^export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1])
  return names
}

function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue }
    if (!/\.(jsx?|)$/.test(entry)) continue
    if (!/\.(js|jsx)$/.test(entry)) continue
    if (/\.test\.jsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

/** Strip comments and strings so a name in prose is not read as a call. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

describe('every used helper is imported', () => {
  const watched = new Map()
  for (const file of WATCHED) {
    for (const name of exportsOf(file)) {
      if (!watched.has(name)) watched.set(name, file)
    }
  }

  it('knows what it is looking for', () => {
    // A regex that silently matches nothing would make this suite pass by
    // doing no work at all.
    expect(watched.size).toBeGreaterThan(15)
    expect(watched.has('pulseSettings')).toBe(true)
    expect(watched.has('observeMarket')).toBe(true)
  })

  it('finds no helper called without an import', () => {
    const missing = []

    for (const full of sourceFiles(join(SRC, 'pages')).concat(sourceFiles(join(SRC, 'components')))) {
      const raw = readFileSync(full, 'utf8')
      const body = code(raw)
      const imported = new Set()
      for (const m of raw.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
        for (const part of m[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/)[0].trim()
          if (name) imported.add(name)
        }
      }

      for (const [name, from] of watched) {
        // Called as a bare identifier. The lookbehind matters: without it
        // `audio.play()` reads as a call to pulseAudio's exported play().
        if (!new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(body)) continue
        if (imported.has(name)) continue
        // …and not something this file defines for itself.
        if (new RegExp(`(function|const|let|var)\\s+${name}\\b`).test(body)) continue
        missing.push(`${full.slice(SRC.length + 1)} uses ${name}() from ${from} without importing it`)
      }
    }

    expect(missing).toEqual([])
  })
})
