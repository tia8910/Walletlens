import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { coverScreen, isScreenCovered, onScreenCover } from './screenCover'

const src = resolve(dirname(fileURLToPath(import.meta.url)))
const read = f => readFileSync(resolve(src, f), 'utf8')

describe('screenCover', () => {
  it('counts overlapping covers and tells listeners only on a change', () => {
    const seen = []
    const off = onScreenCover(c => seen.push(c))
    expect(isScreenCovered()).toBe(false)
    const a = coverScreen()
    const b = coverScreen()
    expect(isScreenCovered()).toBe(true)
    a()
    a() // releasing twice must not uncover the second layer
    expect(isScreenCovered()).toBe(true)
    b()
    expect(isScreenCovered()).toBe(false)
    expect(seen).toEqual([true, false])
    off()
    coverScreen()()
    expect(seen).toEqual([true, false])
  })

  // Every opaque full-screen first-run layer covers the app, so the empty
  // Home's animation loops stop behind it instead of running unseen.
  it.each(['components/WelcomeModal.jsx', 'components/WelcomeStart.jsx', 'components/InterestPicker.jsx'])(
    '%s covers the screen while it is up', f => {
      expect(read(f)).toMatch(/coverScreen\(\)/)
    })

  it.each(['components/EmptyVault.jsx', 'components/PriceTicker.jsx', 'components/DynamicBackground.jsx'])(
    '%s stops its frame loop while covered', f => {
      const code = read(f)
      expect(code).toMatch(/isScreenCovered\(\)/)
      expect(code).toMatch(/onScreenCover\(/)
    })
})

describe('per-frame DOM work on the empty Home', () => {
  // The orbs used to multiply every radius and font size by their depth
  // scale in render, rewriting ~35 attributes per orb per frame and
  // re-laying-out their text. Only the group transform may move now.
  it('scales each orb with one transform, not per-attribute sizes', () => {
    const code = read('components/EmptyVault.jsx')
    expect(code).toMatch(/scale\(\$\{s\.toFixed\(3\)\}\)/)
    expect(code).not.toMatch(/fontSize: `\$\{[^}]*o\.s/)
  })

  it('the ticker drift does not measure the strip every frame', () => {
    const code = read('components/PriceTicker.jsx')
    const step = code.slice(code.indexOf('const step = () => {'), code.indexOf('run()\n'))
      .replace(/\/\/.*$/gm, '')
    expect(step).not.toMatch(/scrollWidth|clientWidth|scrollLeft\s*[^=\s]/)
  })
})
