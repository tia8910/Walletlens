import { describe, it, expect, beforeAll } from 'vitest'
import { LANGUAGES } from '../LanguageContext'
import { HACK_TEXT, HACK_META, hacks } from './academyContent'
import { translations, loadAllLanguages } from '../i18n'

// The hacks are the Academy's written lessons, one per language in the same
// order. The video catalog and the push worker's rotation index them by
// position, so a missing or reordered entry would put the wrong lesson under
// a video and in a notification.

const LANGS = LANGUAGES.map(l => l.code)

beforeAll(loadAllLanguages)

describe('hacks', () => {
  it('cover every language the picker offers, in the same number', () => {
    for (const l of LANGS) {
      expect(Object.keys(HACK_TEXT), 'hacks').toContain(l)
      expect(HACK_TEXT[l].length, l).toBe(HACK_META.length)
    }
  })

  it('have no blank title or body', () => {
    for (const l of LANGS) {
      const blank = []
      HACK_TEXT[l].forEach(([title, body], i) => {
        if (!title?.trim()) blank.push(`${l} hack ${i} title`)
        if (!body?.trim()) blank.push(`${l} hack ${i} body`)
      })
      expect(blank).toEqual([])
    }
  })

  it('are translations, not copies of the English', () => {
    for (const l of LANGS.filter(l => l !== 'en')) {
      const same = HACK_TEXT[l].map((h, i) => (h[1] === HACK_TEXT.en[i][1] ? i : -1)).filter(i => i >= 0)
      expect(same, l).toEqual([])
    }
  })

  it('name a category that resolves in every language', () => {
    const missing = []
    for (const key of HACK_META.map(h => h.catKey)) {
      for (const l of LANGS) if (!translations[l]?.[key]) missing.push(`${l}.${key}`)
    }
    expect(missing).toEqual([])
  })

  it('recombine with their metadata, and fall back to English', () => {
    for (const l of LANGS) expect(hacks(l)).toHaveLength(HACK_META.length)
    expect(hacks('zh')[0].title).toBe(HACK_TEXT.en[0][0])
  })
})
