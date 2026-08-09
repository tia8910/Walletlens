import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { translations } from './i18n'

// Three producers now emit `[key, ...args]` descriptors instead of sentences,
// because they run at module scope where there is no hook to translate from:
//
//   • computeAI()   — the dashboard's insight list
//   • runEngine()   — the decision engine's local rules
//   • correlate()   — the smart-alert signals
//
// A typo in one of those keys is invisible at runtime. t() falls back to
// returning the key itself, which is a perfectly good string, so the row
// renders "insDominates" and nothing throws. That is exactly the failure this
// checks for — and it has to check all four languages, because a key present
// in English and missing in Arabic fails only for Arabic readers.

const SRC = dirname(fileURLToPath(import.meta.url))
const LANGS = ['en', 'ar', 'fr', 'es']

const FILES = {
  'pages/Dashboard.jsx': /\btext: \['(\w+)'/g,
  'components/AIDecisionEngine.jsx': /(?:reasons\.push|headline = |summary  = )\['(\w+)'/g,
  'components/SmartAlerts.jsx': /\bdesc: \['(\w+)'/g,
}

function keysIn(rel, re) {
  const src = readFileSync(join(SRC, rel), 'utf8')
  return [...new Set([...src.matchAll(re)].map(m => m[1]))]
}

describe('module-scope descriptors resolve to real copy', () => {
  for (const [rel, re] of Object.entries(FILES)) {
    const keys = keysIn(rel, re)

    it(`${rel} still emits descriptors`, () => {
      // If a refactor turns these back into template literals the checks below
      // would pass vacuously on an empty list.
      expect(keys.length).toBeGreaterThan(3)
    })

    for (const lang of LANGS) {
      it(`${rel} keys all exist in ${lang}`, () => {
        const missing = keys.filter(k => translations[lang][k] === undefined)
        expect(missing).toEqual([])
      })
    }
  }

  it('every descriptor key differs from English in every other language', () => {
    // A key copied across the four blocks without being translated is the
    // quiet failure mode of the insertion scripts.
    const all = Object.entries(FILES).flatMap(([rel, re]) => keysIn(rel, re))
    const untranslated = []
    for (const k of all) {
      for (const lang of ['ar', 'fr', 'es']) {
        const en = translations.en[k]
        const other = translations[lang][k]
        if (typeof en === 'string' && typeof other === 'string' && en === other) {
          untranslated.push(`${k}/${lang}`)
        }
      }
    }
    expect(untranslated).toEqual([])
  })

  it('function-valued descriptor keys take the same arity in every language', () => {
    // Arabic plural forms are written as a different expression from English,
    // and dropping an argument there produces "undefined" inside a sentence.
    const all = Object.entries(FILES).flatMap(([rel, re]) => keysIn(rel, re))
    const mismatched = []
    for (const k of all) {
      const en = translations.en[k]
      if (typeof en !== 'function') continue
      for (const lang of ['ar', 'fr', 'es']) {
        const other = translations[lang][k]
        if (typeof other !== 'function') { mismatched.push(`${k}/${lang}: not a function`); continue }
        if (other.length !== en.length) mismatched.push(`${k}/${lang}: ${other.length} vs ${en.length}`)
      }
    }
    expect(mismatched).toEqual([])
  })
})

describe('the import tree flips with the page', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')
  const block = css.slice(css.indexOf('.wl-import-tree {'), css.indexOf('/* ── Knowledge Wheel'))

  it('reads the right block', () => {
    expect(block).toContain('.wl-import-node-label')
    expect(block.length).toBeGreaterThan(400)
  })

  it('uses logical properties, not physical ones', () => {
    // padding-left/left/border-left pinned the trunk and its connectors to the
    // left while the rows themselves flipped, so the connectors ran away from
    // the nodes. Anything physical here is the same bug coming back.
    const physical = block
      .split('\n')
      .filter(l => /(?:^|[\s;{])(?:padding-left|padding-right|border-left|border-right)\s*:/.test(l)
                || /(?:^|[\s;{])(?:left|right)\s*:\s*[-\d]/.test(l))
    expect(physical).toEqual([])
  })

  it('pins the label edge so a Latin product name matches its Arabic siblings', () => {
    // Under `unicode-bidi: plaintext` a Latin-first paragraph resolves to LTR
    // and `text-align: start` follows that, not the page — which left
    // "Excel / CSV" alone on the wrong side of the list.
    expect(block).toMatch(/\[dir="rtl"\][^{]*\.wl-import-node-label[^{]*\{[^}]*text-align:\s*right/s)
  })
})

describe('the wallet evaluation flips with the page', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')
  // The diagnosis layout only — Coach still uses the older .eval-cat-* rows,
  // which live further down and are deliberately not held to this.
  const block = css.slice(css.indexOf('.eval-tone-good'), css.indexOf('.eval-pass-row-tip'))

  it('reads the right block', () => {
    expect(block).toContain('.eval-gap-action')
    expect(block).toContain('.eval-chip')
  })

  it('uses logical properties for the accent rail and padding', () => {
    // The rail is a 4px stripe down the leading edge. As border-left or left:0
    // it would sit on the wrong side of every card in Arabic — the same bug
    // the import tree had.
    const physical = block
      .split('\n')
      .filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .filter(l => /(?:^|[\s;{])(?:padding-left|padding-right|margin-left|margin-right|border-left|border-right)\s*:/.test(l)
                || /(?:^|[\s;{])(?:left|right)\s*:\s*[-\d]/.test(l))
    expect(physical).toEqual([])
  })

  it('turns the action arrow around under RTL', () => {
    // "Set a target →" points at the button it sits in. Left alone it would
    // point away from the reading direction in Arabic.
    expect(block).toMatch(/\[dir="rtl"\][^{]*\.eval-gap-arrow[^{]*\{[^}]*scaleX\(-1\)/s)
  })
})

describe('the wallet evaluation copy is fully keyed', () => {
  const src = readFileSync(join(SRC, 'pages/Dashboard.jsx'), 'utf8')
  const section = src.slice(src.indexOf('function EvalGapCard'), src.indexOf('const TIMEFRAMES'))

  it('reads the right section', () => {
    expect(section).toContain('EvalPassStrip')
    expect(section.length).toBeGreaterThan(1000)
  })

  it('has no English literals left in the markup', () => {
    // The old header rendered `{missing.length} gap{s} found — tap each to fix`
    // as a literal. It was the one line in this section that never got keyed,
    // and it survived several full translation passes.
    const prose = [...section.matchAll(/>\s*([A-Z][a-z]+(?:\s+[a-z]+){1,})/g)].map(m => m[1])
    expect(prose).toEqual([])
  })

  for (const lang of LANGS) {
    it(`layout keys resolve in ${lang}`, () => {
      const keys = [...new Set([...section.matchAll(/t\('(eval[A-Z]\w+)'\)/g)].map(m => m[1]))]
      expect(keys.length).toBeGreaterThan(3)
      expect(keys.filter(k => translations[lang][k] === undefined)).toEqual([])
    })
  }
})
