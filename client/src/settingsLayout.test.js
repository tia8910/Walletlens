import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGUAGES } from './LanguageContext'

// The bug this file exists to prevent has now shipped twice.
//
// A settings row is `label | chips` with `.settings-label { flex: 1 1 0% }`.
// Flex basis 0 means the label's only defense against being squeezed to
// nothing is its automatic min-width, which resolves to the width of its
// longest word. Below 768px `.glass-card { word-break: break-word }` is
// inherited into the label and drops that floor to a single character — so
// the label collapses to ~10px and renders one letter per line.
//
// First time it was 'Accent Color' and the fix was to stack rows under 560px.
// That hid it rather than fixing it: the moment Language grew to six chips,
// the chips needed more room than the 561-768px band had, and the label went
// vertical again. Neither a screenshot test nor a render test was in place,
// and nothing else in the suite reads layout.
//
// This is a source check, which is weaker than measuring a real layout, but
// it pins the two properties that actually stop it: the label keeps a
// min-content floor, and Language never competes with its chips for a row.

const SRC = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(SRC, 'index.css'), 'utf8')
const settings = readFileSync(join(SRC, 'pages', 'Settings.jsx'), 'utf8')

describe('a settings label cannot collapse to vertical text', () => {
  it('resets the inherited word-break so min-content stays a whole word', () => {
    expect(css).toMatch(/\.settings-label\s*\{[^}]*word-break:\s*normal/)
  })

  it('still lets a genuinely long word break rather than overflow', () => {
    // overflow-wrap: break-word breaks the word without lowering min-content;
    // word-break: break-word lowers it. Only the latter is reset above, so
    // this asserts we did not reach for the blunt instrument instead.
    expect(css).not.toMatch(/\.settings-label\s*\{[^}]*overflow-wrap:\s*normal/)
  })
})

describe('the language row', () => {
  it('is stacked, so the chips never squeeze the label', () => {
    const row = settings.slice(settings.indexOf("t('setLanguage')") - 400)
    expect(row.slice(0, 400)).toMatch(/settings-row settings-row-stack/)
  })

  it('defines the stack with both classes so it beats .settings-row', () => {
    // `.settings-row` is defined later in the file and would otherwise win
    // align-items on source order alone, leaving the row column-direction but
    // flex-start aligned.
    expect(css).toMatch(/\.settings-row\.settings-row-stack\s*\{[^}]*flex-direction:\s*column/)
    expect(css).toMatch(/\.settings-row\.settings-row-stack\s*\{[^}]*align-items:\s*stretch/)
  })

  it('left-aligns the chips once they are on their own line', () => {
    expect(css).toMatch(/\.settings-row\.settings-row-stack\s+\.settings-chips\s*\{[^}]*justify-content:\s*flex-start/)
  })

  it('offers every language the picker knows about', () => {
    // Not layout, but the row is only worth stacking because the list grows:
    // this is what turns "six today" into a fact the next language inherits.
    expect(settings).toMatch(/LANGUAGES\.map/)
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(6)
  })
})
