import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Screenshot, Voice and Tap on the empty Home looked like buttons and only
// switched the animation; a tap on the one already showing did nothing.
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'components/EmptyVault.jsx'), 'utf8')

describe('empty Home method pills', () => {
  it('do what they say when tapped', () => {
    expect(src).toMatch(/onClick=\{\(\) => \{ pick\(i\); ctas\[s\.id\]\.run\?\.\(\) \}\}/)
  })
  it('are buttons that show which method is on screen, not tabs', () => {
    const pills = src.slice(src.indexOf('className="ev-pills"'), src.indexOf('className="ev-cap"'))
    expect(pills).toMatch(/aria-pressed=\{i === k\}/)
    expect(pills).not.toMatch(/role="tab"/)
  })
})
