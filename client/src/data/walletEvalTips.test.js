import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGUAGES } from '../LanguageContext'
import { translations, loadLanguage } from '../i18n'
import { CLASS_LABEL_KEYS, renderTip } from './walletEvalTips'

// ar/fr/es load lazily at runtime (see i18n.js); pull all three into memory
// before any assertion below reads translations[lang] directly.
beforeAll(() => Promise.all(['ar', 'fr', 'es'].map(loadLanguage)))

// Two wallet evaluations exist — Coach's and the Dashboard's — with
// overlapping pillars and, until now, two copies of the same English tips.
// They emit shared keys instead, which is only safe if the keys are real: a
// typo renders the key itself, so the user sees "cchTipDivFew" where a
// sentence should be. Nothing else catches that, because a missing key is a
// perfectly valid string.

const SRC = dirname(fileURLToPath(import.meta.url))
const LANGS = LANGUAGES.map(l => l.code)

const FILES = {
  Coach: join(SRC, '..', 'pages', 'Coach.jsx'),
  Dashboard: join(SRC, '..', 'pages', 'Dashboard.jsx'),
}

/** Every key used as a labelKey or as the head of a tip descriptor. */
function keysIn(src) {
  const labels = [...src.matchAll(/labelKey:\s*'([^']+)'/g)].map(m => m[1])
  const tips = [...src.matchAll(/tip:\s*\['([^']+)'/g)].map(m => m[1])
  return { labels, tips }
}

describe('wallet-evaluation keys resolve', () => {
  for (const [name, file] of Object.entries(FILES)) {
    const src = readFileSync(file, 'utf8')
    const { labels, tips } = keysIn(src)

    it(`${name} declares pillars`, () => {
      expect(labels.length).toBeGreaterThan(3)
      expect(tips.length).toBeGreaterThan(5)
    })

    it(`${name}: every label key exists in every language`, () => {
      const missing = []
      for (const k of labels) {
        for (const l of LANGS) if (!translations[l]?.[k]) missing.push(`${l}.${k}`)
      }
      expect(missing).toEqual([])
    })

    it(`${name}: every tip key exists in every language`, () => {
      const missing = []
      for (const k of tips) {
        for (const l of LANGS) if (!translations[l]?.[k]) missing.push(`${l}.${k}`)
      }
      expect(missing).toEqual([])
    })

    it(`${name}: no English sentence is left inline as a tip`, () => {
      // The old shape was `tip: \`Only ${n} holdings…\``. Anything that is not
      // an array literal is a tip that never goes through the translator.
      // Anchored with [ \t]* rather than \s*, which can backtrack to zero and
      // then "match" the space it was meant to skip.
      const inline = [...src.matchAll(/tip:[ \t]*([^[\s])/g)].map(m => m[1])
      expect(inline).toEqual([])
    })
  }

  it('every asset-class noun resolves', () => {
    const missing = []
    for (const k of Object.values(CLASS_LABEL_KEYS)) {
      for (const l of LANGS) if (!translations[l]?.[k]) missing.push(`${l}.${k}`)
    }
    expect(missing).toEqual([])
  })
})

describe('renderTip', () => {
  const t = (k) => translations.en[k] ?? k

  it('applies arguments to a function key', () => {
    expect(renderTip(['cchTipDivFew', 3], t)).toContain('3')
  })

  it('resolves a nested { k } argument rather than printing the key', () => {
    // The asset-class name in "Everything is in crypto" was being printed as
    // the internal mix key before this existed.
    const out = renderTip(['cchTipMixSingle', { k: 'clsCrypto' }], t)
    expect(out).toContain(translations.en.clsCrypto)
    expect(out).not.toContain('clsCrypto')
  })

  it('handles a key that takes no arguments', () => {
    expect(renderTip(['cchTipCashNone'], t)).toBe(translations.en.cchTipCashNone())
  })

  it('returns empty for a missing or malformed tip', () => {
    expect(renderTip(undefined, t)).toBe('')
    expect(renderTip([], t)).toBe('')
  })

  it('does not throw on a key that is a plain string', () => {
    // Better to show something odd than to crash a render.
    expect(renderTip(['appName'], t)).toBe(translations.en.appName ?? 'appName')
  })

  it('produces a different sentence in each language', () => {
    const seen = LANGS.map(l => renderTip(['cchTipDivFew', 3], (k) => translations[l][k] ?? k))
    expect(new Set(seen).size).toBe(LANGS.length)
  })
})
