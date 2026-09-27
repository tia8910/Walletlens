import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The text crawlers and AI readers get before JavaScript runs is built by
// scripts/prerender.mjs. These pin the parts an AI-visibility audit reads:
// landmarks, sections, and a stated modified date.

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '../scripts/prerender.mjs'), 'utf8')
const builder = src.slice(src.indexOf('function buildPage('), src.indexOf('\n}\n', src.indexOf('function buildPage(')))

// The helpers are plain functions; load them without running the script.
const helpers = src.slice(src.indexOf('const VOID'), src.indexOf('// Convenience: hreflang'))
const { sectioned, articled } = new Function(`${helpers}; return { sectioned, articled }`)()

describe('prerendered page structure', () => {
  it('wraps every page in a nav, one main article and a dated footer', () => {
    expect(builder).toMatch(/<header><nav aria-label="WalletLens">/)
    expect(builder).toMatch(/\$\{seoNav\}<main>\$\{articled\(slashedBody\)\}<\/main>\$\{seoFooter\}/)
    expect(builder).toMatch(/<time datetime="\$\{updated\}">/)
  })

  it('states dateModified on every non-article page', () => {
    expect(builder).toMatch(/'@type': 'WebPage'[^}]*dateModified: \(modified \|\| TODAY\)\.slice\(0, 10\)/)
  })

  it('never lets "$" in page text act as a replacement pattern', () => {
    // "$&" in an Arabic post once pasted a copy of <div id="root"> mid-sentence.
    expect(builder).not.toMatch(/`\$1\$\{/)
    expect(builder).toMatch(/html\.replace\('<div id="root">', \(\) =>/)
  })
})

describe('sectioning', () => {
  it('turns each top-level h2 into a section and keeps the intro', () => {
    const out = sectioned('<h1>T</h1><p>i</p><h2>A</h2><p>a</p><h2>B</h2><ul><li>b</li></ul>')
    expect(out).toBe('<h1>T</h1><p>i</p><section><h2>A</h2><p>a</p></section><section><h2>B</h2><ul><li>b</li></ul></section>')
  })

  it('does not cut at an h2 nested inside another element', () => {
    const out = sectioned('<h2>A</h2><p>a</p><nav><h2>Related</h2><a href="/x/">x</a></nav>')
    expect(out).toBe('<section><h2>A</h2><p>a</p><nav><h2>Related</h2><a href="/x/">x</a></nav></section>')
  })

  it('leaves unbalanced markup alone', () => {
    const html = '<h2>A</h2><div><p>open'
    expect(sectioned(html)).toBe(html)
  })

  it('sections inside an existing article instead of nesting a second one', () => {
    const out = articled('<article><h1>P</h1><h2>A</h2><p>a</p></article><p>back</p>')
    expect(out).toBe('<article><h1>P</h1><section><h2>A</h2><p>a</p></section></article><p>back</p>')
    expect(articled('<h2>A</h2>')).toBe('<article><section><h2>A</h2></section></article>')
  })
})
