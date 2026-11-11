import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// index.css is the one render-blocking stylesheet: every route waits for it
// before its first paint. It used to carry every page's styles, so a visit to
// /blog downloaded the Vision, Landing and TradeSheet rules first.
//
// Rules that only one lazily loaded page or component uses now live beside
// that file (Vision.css next to Vision.jsx, and so on). Vite emits them with
// the file's own chunk and waits for them before the chunk renders, so the
// page is never painted unstyled; they just stop blocking every other route.
//
// Two things keep that working:
//  - each of those stylesheets must be imported by its owner, or its rules are
//    silently dropped from the build;
//  - index.css must not grow back. Page-only rules belong in the page's CSS.

const here = dirname(fileURLToPath(import.meta.url))
const MARK = 'Moved out of index.css'

const routeCss = ['components', 'pages'].flatMap((d) =>
  readdirSync(join(here, d))
    .filter((f) => f.endsWith('.css'))
    .map((f) => join(here, d, f))
    .filter((p) => readFileSync(p, 'utf8').includes(MARK)),
)

describe('per-route stylesheets', () => {
  it('found the split-out stylesheets', () => {
    expect(routeCss.length).toBeGreaterThan(20)
  })

  it.each(routeCss.map((p) => [basename(p), p]))('%s is imported by its owner', (name, p) => {
    const owner = p.replace(/\.css$/, '.jsx')
    expect(existsSync(owner)).toBe(true)
    expect(readFileSync(owner, 'utf8')).toContain(`import './${name}'`)
  })

  it('keeps index.css lean', () => {
    // 644 KB before the split, ~412 KB after. Room to grow, not to double back.
    const size = readFileSync(join(here, 'index.css'), 'utf8').length
    expect(size).toBeLessThan(460_000)
  })
})
