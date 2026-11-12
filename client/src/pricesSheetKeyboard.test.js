import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Market prices sheet sat behind the keyboard: its search field and
// results could not be seen while typing.
const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/PricesSheet.jsx'), 'utf8')
const css = readFileSync(join(here, 'v3.css'), 'utf8')

describe('Market prices sheet and the keyboard', () => {
  it('fits the sheet to the area the keyboard leaves, where the browser reports it', () => {
    expect(src).toMatch(/window\.visualViewport/)
    expect(src).toMatch(/setProperty\('--nl-vvh'/)
    expect(css).toMatch(/\.nl-sheet-bg \{ top: var\(--nl-vvt, 0px\); bottom: auto; height: var\(--nl-vvh, 100%\); \}/)
  })
  it('docks to the top while the search has focus on a touch device, where the app reports nothing', () => {
    expect(src).toMatch(/const blind = !shrunk && typing\.current && touch/)
    expect(src).toMatch(/onFocus=\{onSearchFocus\} onBlur=\{onSearchBlur\}/)
    expect(css).toMatch(/\.nl-sheet-bg\.nl-kb \{ align-items: flex-start;/)
  })
  it('waits before moving back, so a tap on a result lands', () => {
    expect(src).toMatch(/onSearchBlur = \(\) => \{ typing\.current = false; setTimeout\(\(\) => fitRef\.current\(\), 300\) \}/)
  })
  it('keeps one height while the list filters, and closes the keyboard on Search', () => {
    expect(css).toMatch(/\.nl-sheet \{ height: min\(680px, 86vh\);/)
    expect(src).toMatch(/enterKeyHint="search"/)
    expect(src).toMatch(/if \(e\.key === 'Enter'\) e\.currentTarget\.blur\(\)/)
  })
})
