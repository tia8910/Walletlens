import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// A React hook used without being imported is a ReferenceError at module
// evaluation — a white screen for the whole route — and nothing else in this
// project catches it. It is not a build error (Vite happily bundles an
// undefined identifier), the i18n binding suite only looks at t(), and no
// test renders most of these pages.
//
// THE NEAR MISS: consolidating the perf backlog left Transactions.jsx with a
// memo()'d row component and a useCallback()'d delete handler while its React
// import line still read `{ useState, useEffect, useRef, lazy, Suspense }`.
// The build was clean and all 1145 tests passed. Opening the Transactions tab
// would have thrown before the first render.

const SRC = dirname(fileURLToPath(import.meta.url))

// The named exports of `react` this codebase actually calls. Deliberately not
// every export — a name this list does not know about is simply not checked,
// which is better than failing on something like `use` appearing in prose.
const REACT_APIS = [
  'useState', 'useEffect', 'useLayoutEffect', 'useRef', 'useMemo',
  'useCallback', 'useReducer', 'useContext', 'useTransition',
  'useDeferredValue', 'useId', 'useSyncExternalStore',
  'memo', 'forwardRef', 'lazy', 'createContext', 'startTransition',
]

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.jsx?$/.test(name) && !/\.test\.jsx?$/.test(name)) out.push(p)
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
}

/** Names this file brings in from 'react', by any import form. */
function reactImports(src) {
  const names = new Set()
  for (const m of src.matchAll(/import\s+([\w*\s{},]+?)\s+from\s+['"]react['"]/g)) {
    const clause = m[1]
    // `import React from 'react'` / `import * as React from 'react'` puts
    // everything behind a namespace, so member calls are not bare identifiers
    // and this check does not apply to them.
    const named = /\{([^}]*)\}/.exec(clause)
    if (named) {
      for (const part of named[1].split(',')) {
        const local = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (local) names.add(local)
      }
    }
  }
  return names
}

describe('React APIs are imported where they are used', () => {
  const files = sourceFiles(SRC)

  it('finds the source tree', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('catches a hook used without its import', () => {
    // Proves the check can fail. A file that calls memo() with only useState
    // imported must be reported; without this, a regex that quietly matched
    // nothing would let the suite pass by doing no work.
    const broken = "import { useState } from 'react'\nconst Row = memo(function Row() {})\n"
    const used = REACT_APIS.filter(api => new RegExp(`(?<![.\\w$])${api}\\s*\\(`).test(code(broken)))
    const missing = used.filter(api => !reactImports(broken).has(api))
    expect(missing).toEqual(['memo'])
  })

  it('reports no file calling a React API it did not import', () => {
    const problems = []
    for (const full of files) {
      const raw = readFileSync(full, 'utf8')
      if (!/from\s+['"]react['"]/.test(raw)) continue
      const body = code(raw)
      const imported = reactImports(raw)
      for (const api of REACT_APIS) {
        // Bare identifier followed by a call. The lookbehind keeps
        // `React.memo(` and `obj.useState(` out.
        if (!new RegExp(`(?<![.\\w$])${api}\\s*\\(`).test(body)) continue
        if (imported.has(api)) continue
        // …and not something the file defines for itself.
        if (new RegExp(`(function|const|let|var)\\s+${api}\\b`).test(body)) continue
        problems.push(`${full.slice(SRC.length + 1)} calls ${api}() without importing it`)
      }
    }
    expect(problems).toEqual([])
  })
})
