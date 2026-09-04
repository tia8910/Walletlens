import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Every capitalised JSX tag must resolve to something in its own file.
 *
 * This exists because <GitHubStarButton /> shipped to production in App.jsx
 * with no import line. Vite does not resolve JSX identifiers at build time, so
 * the bundle built clean, passed the dist guard, deployed, and only then threw
 * "GitHubStarButton is not defined" on first paint — taking down the site and
 * the Android shell together, because the crash was above the router and no
 * route could render past it.
 *
 * There is no ESLint in this project, so nothing else catches an undefined
 * identifier. This is the cheapest thing that does.
 */

const SRC = dirname(fileURLToPath(import.meta.url))

// Opening or closing tag with a capitalised, non-dotted name. Dotted tags
// (<Foo.Bar />) are skipped: the head identifier is what needs binding and it
// appears bare elsewhere in the file anyway.
const TAG = /<\/?([A-Z][A-Za-z0-9_]*)(?=[\s/>])/g

/**
 * Drop comments, so prose like "wraps the whole <Routes> tree" is not read as
 * a render. Deliberately line-based: pairing block delimiters looked tidier
 * and was wrong — a `/*` inside a regex literal or string swallowed two thirds
 * of SmartImport.jsx and reported five of its real components as missing.
 */
function stripComments(source) {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trimStart()
      return !t.startsWith('*') && !t.startsWith('/*')
    })
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

function jsxFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...jsxFiles(p))
    else if (name.endsWith('.jsx')) out.push(p)
  }
  return out
}

describe('JSX component bindings', () => {
  it('every capitalised tag is bound in the file that renders it', () => {
    const unbound = []

    for (const file of jsxFiles(SRC)) {
      const source = stripComments(readFileSync(file, 'utf8'))

      for (const name of new Set(Array.from(source.matchAll(TAG), (m) => m[1]))) {
        // Remove this name's own tag uses, then ask whether the identifier
        // survives anywhere else — an import, a const, a function declaration.
        // Cheaper than parsing, and it cannot miss a missing import.
        const rest = source.replace(new RegExp(`</?${name}(?=[\\s/>])`, 'g'), '')
        if (!new RegExp(`\\b${name}\\b`).test(rest)) {
          unbound.push(`${relative(SRC, file)}: <${name} />`)
        }
      }
    }

    expect(unbound).toEqual([])
  })
})
