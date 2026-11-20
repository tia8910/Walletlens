import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Home's holdings were one flat list, gold among the coins. With every
// holding showing, they are split by category under foldable headers.
const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/NlHoldings.jsx'), 'utf8')
const css = readFileSync(join(here, 'v3.css'), 'utf8')

describe('Home holdings split by category', () => {
  it('groups only the full list; a search, chip or selection stays flat', () => {
    expect(src).toMatch(/if \(filtered \|\| cats\.length < 2\) return null/)
    expect(src).toMatch(/\{groups \? groups\.map\(/)
    expect(src).toMatch(/: shown\.map\(renderRow\)\}/)
  })
  it('gives each group a header with its name, count, value and share, that folds', () => {
    expect(src).toMatch(/className="nl-ghead" aria-expanded=\{open\} onClick=\{\(\) => toggleFold\(g\.cat\)\}/)
    expect(src).toMatch(/<span className="nl-ghead-n">\{g\.rows\.length\}<\/span>/)
    // Value, then today's move for the group, then its share.
    expect(src).toMatch(/\{mask\(cv\(g\.value\)\)\}[\s\S]{0,300}<small>\{Math\.round\(g\.pct\)\}%<\/small>/)
    expect(css).toMatch(/\.nl-ghead \{/)
  })
  it('puts the biggest class first when sorted by value', () => {
    expect(src).toMatch(/if \(sort === 'value'\) out\.sort/)
  })
})
