import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// A single missing "}" in a static page swallows every rule after it into the
// open block. On the tour that left the FAQ and the footer links unstyled,
// which ran the links together into one line.

const pub = join(dirname(fileURLToPath(import.meta.url)), '../public')
const pages = (dir) => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? pages(p) : n.endsWith('.html') ? [p] : []
})

describe('static page styles', () => {
  it('closes every block it opens', () => {
    for (const file of pages(pub)) {
      for (const [, css] of readFileSync(file, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
        const bare = css.replace(/"[^"]*"|'[^']*'/g, '')
        let depth = 0
        for (const ch of bare) {
          if (ch === '{') depth++
          else if (ch === '}') depth--
          expect(depth, file).toBeGreaterThanOrEqual(0)
        }
        expect(depth, file).toBe(0)
      }
    }
  })

  it('keeps the tour FAQ and footer rules at the top level', () => {
    const html = readFileSync(join(pub, 'tour/index.html'), 'utf8')
    expect(html).toMatch(/\n\.feats\{display:grid/)
    expect(html).toMatch(/\nfooter nav\{display:flex;flex-wrap:wrap;gap:6px 16px\}/)
  })

  it('keeps llms.txt out of sight: a head link for crawlers, no footer link', () => {
    for (const file of pages(pub)) {
      const html = readFileSync(file, 'utf8')
      expect(html, file).not.toMatch(/>llms\.txt</)
    }
    expect(readFileSync(join(pub, 'tour/index.html'), 'utf8')).toContain('<link rel="alternate" type="text/plain" title="LLM summary" href="https://walletlens.live/llms.txt">')
  })
})
