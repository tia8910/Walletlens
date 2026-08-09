import { describe, it, expect } from 'vitest'
import { LANGUAGES } from '../LanguageContext'
import {
  ACHIEVEMENT_TEXT, HACK_TEXT, HACK_META,
  QUESTION_TEXT, QUESTION_META, CATEGORY_KEYS,
  GUESSR_META, GUESSR_CLUES,
  achievementText, hacks, questions, guessrCoins,
} from './academyContent'
import { translations } from '../i18n'

// The failure this file exists to prevent is not a missing string — it is a
// question whose translated options got reordered, leaving `a` pointing at the
// wrong one. The app would look perfectly fine and mark the right answer
// wrong. Nothing about that is visible in a screenshot, and nobody would think
// to check it while reviewing a translation.
//
// So: shape parity first, and only then the "is anything empty" checks.

const LANGS = LANGUAGES.map(l => l.code)

describe('shape parity across languages', () => {
  it('covers every language the picker offers', () => {
    for (const l of LANGS) {
      expect(Object.keys(ACHIEVEMENT_TEXT), 'badges').toContain(l)
      expect(Object.keys(HACK_TEXT), 'hacks').toContain(l)
      expect(Object.keys(QUESTION_TEXT), 'questions').toContain(l)
      expect(Object.keys(GUESSR_CLUES), 'guessr clues').toContain(l)
    }
  })

  it('every language defines the same badge ids', () => {
    const en = Object.keys(ACHIEVEMENT_TEXT.en).sort()
    for (const l of LANGS) {
      expect(Object.keys(ACHIEVEMENT_TEXT[l]).sort(), l).toEqual(en)
    }
  })

  it('hacks line up with their metadata', () => {
    for (const l of LANGS) {
      expect(HACK_TEXT[l].length, l).toBe(HACK_META.length)
    }
  })

  it('questions line up with their metadata', () => {
    for (const l of LANGS) {
      expect(QUESTION_TEXT[l].length, l).toBe(QUESTION_META.length)
    }
  })

  it('every question offers the same number of options in every language', () => {
    // This is the one that matters: QUESTION_META.a indexes into the options
    // array, so a translation with three options where English has four moves
    // the correct answer onto a different string.
    const bad = []
    QUESTION_TEXT.en.forEach((q, i) => {
      for (const l of LANGS) {
        const opts = QUESTION_TEXT[l][i]?.[1]
        if (opts?.length !== q[1].length) bad.push(`${l}[${i}]`)
      }
    })
    expect(bad).toEqual([])
  })

  it('the answer index is inside the options array', () => {
    QUESTION_META.forEach((m, i) => {
      expect(m.a, `question ${i}`).toBeGreaterThanOrEqual(0)
      expect(m.a, `question ${i}`).toBeLessThan(QUESTION_TEXT.en[i][1].length)
    })
  })

  it('every question category has a translation key', () => {
    const unknown = [...new Set(QUESTION_META.map(m => m.cat))].filter(c => !CATEGORY_KEYS[c])
    expect(unknown).toEqual([])
  })

  it('every category key resolves in every language', () => {
    const missing = []
    for (const key of [...Object.values(CATEGORY_KEYS), ...HACK_META.map(h => h.catKey)]) {
      for (const l of LANGS) {
        if (!translations[l]?.[key]) missing.push(`${l}.${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('guessr clues line up with their coins', () => {
    for (const l of LANGS) {
      expect(GUESSR_CLUES[l].length, l).toBe(GUESSR_META.length)
      GUESSR_CLUES[l].forEach((clues, i) => {
        expect(clues.length, `${l} coin ${i}`).toBe(GUESSR_CLUES.en[i].length)
      })
    }
  })

  it('every guessr coin has enough decoys for four options', () => {
    for (const c of GUESSR_META) expect(c.wrong.length, c.name).toBeGreaterThanOrEqual(3)
  })
})

describe('nothing is blank', () => {
  for (const l of LANGS) {
    it(`${l}: no empty text anywhere`, () => {
      const blank = []
      for (const [id, [title, desc]] of Object.entries(ACHIEVEMENT_TEXT[l])) {
        if (!title?.trim()) blank.push(`badge ${id} title`)
        if (!desc?.trim()) blank.push(`badge ${id} desc`)
      }
      HACK_TEXT[l].forEach(([title, body], i) => {
        if (!title?.trim()) blank.push(`hack ${i} title`)
        if (!body?.trim()) blank.push(`hack ${i} body`)
      })
      QUESTION_TEXT[l].forEach(([q, opts, exp], i) => {
        if (!q?.trim()) blank.push(`question ${i} stem`)
        if (!exp?.trim()) blank.push(`question ${i} explanation`)
        opts.forEach((o, j) => { if (!o?.trim()) blank.push(`question ${i} option ${j}`) })
      })
      GUESSR_CLUES[l].forEach((clues, i) => {
        clues.forEach((c, j) => { if (!c?.trim()) blank.push(`coin ${i} clue ${j}`) })
      })
      expect(blank).toEqual([])
    })
  }
})

describe('the translations are actually translations', () => {
  // A file copied from English would satisfy every structural check above.
  for (const l of LANGS.filter(l => l !== 'en')) {
    it(`${l}: question stems differ from English`, () => {
      const same = QUESTION_TEXT[l]
        .map((q, i) => (q[0] === QUESTION_TEXT.en[i][0] ? i : -1))
        .filter(i => i >= 0)
      expect(same).toEqual([])
    })

    it(`${l}: hack bodies differ from English`, () => {
      const same = HACK_TEXT[l]
        .map((h, i) => (h[1] === HACK_TEXT.en[i][1] ? i : -1))
        .filter(i => i >= 0)
      expect(same).toEqual([])
    })
  }
})

describe('accessors', () => {
  it('recombine text with metadata', () => {
    for (const l of LANGS) {
      const qs = questions(l)
      expect(qs).toHaveLength(QUESTION_META.length)
      qs.forEach((q, i) => {
        expect(q.a).toBe(QUESTION_META[i].a)
        expect(q.cat).toBe(QUESTION_META[i].cat)
        expect(q.opts).toHaveLength(QUESTION_TEXT.en[i][1].length)
      })
      expect(hacks(l)).toHaveLength(HACK_META.length)
      expect(guessrCoins(l)).toHaveLength(GUESSR_META.length)
      expect(Object.keys(achievementText(l))).toHaveLength(Object.keys(ACHIEVEMENT_TEXT.en).length)
    }
  })

  it('fall back to English for an unknown language', () => {
    // The picker validates its input, but a stale localStorage value or a
    // half-added language must not blank the Academy.
    expect(questions('de')[0].q).toBe(QUESTION_TEXT.en[0][0])
    expect(hacks('de')[0].title).toBe(HACK_TEXT.en[0][0])
    expect(guessrCoins('de')[0].clues[0]).toBe(GUESSR_CLUES.en[0][0])
  })

  it('keep coin names untranslated', () => {
    // The player picks the name from a list of four; a translated name would
    // not match the decoys, which are proper nouns too.
    for (const l of LANGS) {
      expect(guessrCoins(l).map(c => c.name)).toEqual(GUESSR_META.map(c => c.name))
    }
  })

  it('give every day of the year a question', () => {
    const bank = questions('ar')
    for (let day = 0; day < 366; day++) {
      expect(bank[day % bank.length]).toBeTruthy()
    }
  })
})
