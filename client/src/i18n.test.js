import { describe, it, expect, beforeAll } from 'vitest'
import { translations, loadLanguage } from './i18n'
import { LANGUAGES } from './LanguageContext'

// t() falls back to English when a key is missing, which is the right runtime
// behaviour and a terrible development one: a forgotten key looks like working
// software until a user who reads Arabic opens the screen. Half the app being
// English next to Arabic is exactly how this shipped broken once already, so
// the parity check is a test rather than a convention.

const OTHERS = LANGUAGES.map(l => l.code).filter(c => c !== 'en')
const enKeys = Object.keys(translations.en)

// ar/fr/es load lazily at runtime (see i18n.js); pull all three into memory
// before any assertion below reads translations[lang] directly.
beforeAll(() => Promise.all(OTHERS.map(loadLanguage)))

describe('translation coverage', () => {
  it('ships a table for every language the picker offers', () => {
    for (const { code } of LANGUAGES) {
      expect(translations[code], `no translations for ${code}`).toBeTruthy()
    }
  })

  it.each(OTHERS)('%s defines every English key', (lang) => {
    const missing = enKeys.filter(k => !(k in translations[lang]))
    expect(missing, `${lang} is missing ${missing.length} keys`).toEqual([])
  })

  it.each(OTHERS)('%s has no keys English does not', (lang) => {
    // An extra key is usually a typo in one table that leaves the real key
    // falling back to English everywhere else.
    const extra = Object.keys(translations[lang]).filter(k => !(k in translations.en))
    expect(extra).toEqual([])
  })

  it.each(OTHERS)('%s keeps the same value shape as English', (lang) => {
    // A plural helper in English against a bare string elsewhere renders
    // "function (n) {…}" into the page.
    const wrong = enKeys.filter(k => typeof translations.en[k] !== typeof translations[lang][k])
    expect(wrong).toEqual([])
  })

  it.each(OTHERS)('%s leaves no value empty', (lang) => {
    const blank = enKeys.filter(k =>
      typeof translations[lang][k] === 'string' && !translations[lang][k].trim())
    expect(blank).toEqual([])
  })

  it.each(OTHERS)('%s plural helpers return a non-empty string for 0, 1, 2 and 11', (lang) => {
    // Arabic alone has singular, dual, a 3–10 plural and an 11+ form, so the
    // helpers carry real branching that a typo can drop through.
    const fns = enKeys.filter(k => typeof translations.en[k] === 'function')
    expect(fns.length).toBeGreaterThan(0)
    for (const k of fns) {
      for (const n of [0, 1, 2, 11]) {
        const out = translations[lang][k](n)
        expect(typeof out, `${lang}.${k}(${n})`).toBe('string')
        expect(out.trim(), `${lang}.${k}(${n}) is empty`).not.toBe('')
      }
    }
  })

  it('does not leave a literal escape sequence in any value', () => {
    // Guards a real bug: a translation written through a generator arrived
    // with """ in the text instead of the quote mark it stood for.
    const bad = []
    for (const { code } of LANGUAGES) {
      for (const [k, v] of Object.entries(translations[code])) {
        if (typeof v === 'string' && /\\[unx]/.test(v)) bad.push(`${code}.${k}`)
      }
    }
    expect(bad).toEqual([])
  })
})
