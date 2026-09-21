import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

// Every source file parses.
//
// WHY THIS IS NOT ALREADY COVERED
//
// Vitest only ever loads the files a test imports. A page component that no
// test touches can contain an outright syntax error and the whole suite still
// reports green — which is exactly what happened: an import was spliced into
// the middle of a multi-line import statement in Academy.jsx, 1314 tests
// passed, and the Cloudflare Pages build was the first thing to notice.
//
// That build takes minutes and runs after a push. This takes about a second
// and runs before one.
//
// Parsing only, deliberately: this does not execute anything, so a file with
// side effects at module scope is safe to check and the test cannot be made
// slow or flaky by what the code does.

const SRC = dirname(fileURLToPath(import.meta.url))

function sources(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) { out.push(...sources(p)); continue }
    if (['.js', '.jsx'].includes(extname(entry))) out.push(p)
  }
  return out
}

describe('every source file parses', () => {
  const files = sources(SRC)

  it('finds the source tree at all', () => {
    // A path that silently matched nothing would make the case below pass by
    // checking no files whatsoever.
    expect(files.length).toBeGreaterThan(100)
  })

  it('has no syntax errors', () => {
    const broken = []
    for (const file of files) {
      try {
        transformSync(readFileSync(file, 'utf8'), {
          loader: file.endsWith('.jsx') ? 'jsx' : 'js',
          format: 'esm',
        })
      } catch (e) {
        broken.push(`${file.slice(SRC.length + 1)}: ${e.errors?.[0]?.text || e.message}`)
      }
    }
    expect(broken, 'these do not parse and will fail the production build').toEqual([])
  })
})

// The stylesheets parse too.
//
// Same hole, different language. The suite above reads index.css as text in a
// dozen places and asserts on what it finds, so a stylesheet can be
// syntactically broken and every one of those assertions still passes — the
// text is all still there. That is not hypothetical: a stray closing brace
// left behind by an edit sailed through 1995 green tests and was caught by the
// production build, minutes later, with the whole suite already reported clean.
//
// postcss is what vite itself parses CSS with, so this fails on exactly what
// the build would fail on, about a second after the edit instead of minutes.
describe('every stylesheet parses', () => {
  const styles = (function collect(dir) {
    const out = []
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) { out.push(...collect(p)); continue }
      if (extname(entry) === '.css') out.push(p)
    }
    return out
  })(SRC)

  it('finds the stylesheets at all', () => {
    expect(styles.length).toBeGreaterThan(0)
    expect(styles.some(f => f.endsWith('index.css'))).toBe(true)
  })

  it.each(styles.map(f => [f.slice(SRC.length + 1), f]))('%s has no syntax errors', async (_name, file) => {
    const { default: postcss } = await import('postcss')
    const css = readFileSync(file, 'utf8')
    let err = null
    try { postcss.parse(css, { from: file }) } catch (e) { err = e }
    expect(err && `${err.line}:${err.column} ${err.reason}`).toBeNull()
  })
})
