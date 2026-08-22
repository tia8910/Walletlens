import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Everything reachable by a STATIC import from main.jsx lands in the entry
// chunk's graph, and Vite modulepreloads that graph in every prerendered page.
// So one `import x from './y'` at the top of App.jsx is paid for by every
// visitor to all ~230 marketing pages, before first paint, whether or not the
// feature is ever used.
//
// Not hypothetical: App.jsx statically imported startAutoBackup, which reached
// driveSync -> backupCore -> qrcode, putting the 156 KB qr-libs chunk on the
// critical path to run a background task that no-ops until the user has made a
// manual backup. manualChunks had already split qr-libs out with a comment
// saying it loads "only when the user opens the backup/scan panel" — splitting
// a chunk does not make a static import lazy, and nothing caught the gap
// between that intent and the built output.

const src = resolve(dirname(fileURLToPath(import.meta.url)))

/** Static (non-`import()`) specifiers of one file. */
function staticImports(file) {
  const code = readFileSync(file, 'utf8')
    // Strip comments first: this file's own prose names 'qrcode', and a
    // specifier mentioned in a comment is not an import.
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
  const out = []
  for (const m of code.matchAll(/(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    out.push(m[1])
  }
  return out
}

function resolveLocal(spec, fromFile) {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec)
  for (const c of [base, `${base}.js`, `${base}.jsx`, join(base, 'index.js'), join(base, 'index.jsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

/** Every local module and bare package reachable statically from an entry. */
function staticGraph(entry) {
  const files = new Set()
  const packages = new Set()
  const stack = [entry]
  while (stack.length) {
    const file = stack.pop()
    if (files.has(file)) continue
    files.add(file)
    for (const spec of staticImports(file)) {
      if (spec.startsWith('.')) {
        const next = resolveLocal(spec, file)
        if (next) stack.push(next)
      } else if (!spec.startsWith('/')) {
        packages.add(spec.replace(/^(@[^/]+\/[^/]+|[^/]+).*$/, '$1'))
      }
    }
  }
  return { files, packages }
}

describe('the critical path stays lean', () => {
  const graph = staticGraph(join(src, 'main.jsx'))

  // Each of these is genuinely needed somewhere. The point is that "somewhere"
  // must sit behind a dynamic import or a lazy route, not in the graph every
  // visitor downloads before first paint.
  const heavy = {
    qrcode: 'QR encoding — backup/transfer panel only',
    jsqr: 'QR decoding — scan panel only',
    xlsx: 'spreadsheet export — Import/Export only',
    recharts: 'charts — Dashboard and analysis pages only',
  }

  for (const [pkg, why] of Object.entries(heavy)) {
    it(`does not statically reach ${pkg} (${why})`, () => {
      expect(graph.packages.has(pkg)).toBe(false)
    })
  }

  it('walks a real graph, so the assertions above are not vacuous', () => {
    expect(graph.files.size).toBeGreaterThan(15)
    expect(graph.packages.has('react')).toBe(true)
    expect(graph.packages.has('react-router-dom')).toBe(true)
  })

  it('loads the Drive auto-backup dynamically', () => {
    const app = readFileSync(join(src, 'App.jsx'), 'utf8')
    expect(app).toMatch(/import\('\.\/driveAutoBackup'\)/)
    expect(app).not.toMatch(/^import .*from '\.\/driveAutoBackup'/m)
  })
})
