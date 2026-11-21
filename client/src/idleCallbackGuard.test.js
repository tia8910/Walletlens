import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// requestIdleCallback does not exist in every browser the site serves (Safari
// and older WebViews among them). A bare reference to it there is a
// ReferenceError, not `undefined`: App.jsx's route-prefetch effect once tested
// `requestIdleCallback ? … : …`, which threw on mount and put the whole app
// behind the error boundary's "Something went wrong" on /dashboard.
//
// Every use must go through `typeof requestIdleCallback === 'function'` or
// `window.requestIdleCallback`.

const here = dirname(fileURLToPath(import.meta.url))

function sources(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== '__fixtures__') out.push(...sources(p)) }
    else if (/\.(jsx?|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe('idle-callback use is guarded', () => {
  it('never tests requestIdleCallback as a bare identifier', () => {
    const offenders = []
    for (const file of sources(here)) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      // `requestIdleCallback ?`, `requestIdleCallback &&`, `if (requestIdleCallback)`, `!requestIdleCallback`
      const bad = /(?<![.\w'"`])(requestIdleCallback|cancelIdleCallback)\s*(\?|&&|\|\||\))|!\s*(requestIdleCallback|cancelIdleCallback)\b/
      if (bad.test(code)) offenders.push(file.slice(here.length + 1))
    }
    expect(offenders).toEqual([])
  })
})
