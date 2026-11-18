import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The app mount used to cost a 0.2 CLS on every app route: twice the
// "good" budget. These pin the two causes shut.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')
const rule = (css, selector) => {
  const i = css.indexOf(selector + ' {')
  expect(i).toBeGreaterThan(-1)
  return css.slice(i, css.indexOf('}', i)).replace(/\/\*[^]*?\*\//g, '')
}

describe('no layout shift when the app mounts', () => {
  it('body::before keeps one box before and after html.wl-v2: the bleed is a transform, not an inset', () => {
    // A full-screen layer whose inset changes between the boot frame and the
    // mounted frame is scored as a shift over the whole viewport.
    const base = rule(read('index.css'), '\nbody::before')
    const v2 = rule(read('v2.css'), 'html.wl-v2 body::before')
    expect(base).toMatch(/inset:\s*0;/)
    expect(base).not.toMatch(/inset:\s*-/)
    expect(v2).toMatch(/inset:\s*0;/)
  })

  it('the v2 and v3 classes go on <html> in a layout effect, before the first frame', () => {
    expect(read('v2Preview.js')).toMatch(/export function useV2Class[^]*?useLayoutEffect\(/)
    expect(read('newLook.js')).toMatch(/export function useNewLookClass[^]*?useLayoutEffect\(/)
  })
})
