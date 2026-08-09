import { describe, it, expect } from 'vitest'
import { FAQ_TEXT, FAQ_SECTIONS, faqSections, aboutFaqs, FNG_FAQ_TEXT, fngFaqs } from './faqContent'
import { ABOUT_TEXT, aboutContent } from './aboutContent'
import { FNG_TEXT, fngContent, FNG_ZONE_RANGES, FNG_ZONE_COLORS } from './fngContent'

// The public FAQ and About page are long-form prose rather than short labels,
// so they sit in their own tables instead of i18n.js. That means the key-parity
// test does not cover them, and these checks stand in for it.

const LANGS = ['en', 'ar', 'fr', 'es']
const OTHERS = ['ar', 'fr', 'es']

describe('FAQ content parity', () => {
  it('has all four languages', () => {
    expect(Object.keys(FAQ_TEXT).sort()).toEqual([...LANGS].sort())
  })

  it('every language has the same sections, with the same question counts', () => {
    // A section that lost a question would render an FAQ that no longer
    // matches the FAQPage structured data describing the same page.
    const shape = lang => FAQ_TEXT[lang].map(([, faqs]) => faqs.length)
    for (const lang of OTHERS) expect(shape(lang)).toEqual(shape('en'))
  })

  it('every question and answer is a non-empty string', () => {
    const bad = []
    for (const lang of LANGS) {
      FAQ_TEXT[lang].forEach(([title, faqs], s) => {
        if (!title?.trim()) bad.push(`${lang}[${s}] title`)
        faqs.forEach(([q, a], i) => {
          if (!q?.trim()) bad.push(`${lang}[${s}][${i}] q`)
          if (!a?.trim()) bad.push(`${lang}[${s}][${i}] a`)
        })
      })
    }
    expect(bad).toEqual([])
  })

  it('translations actually differ from English', () => {
    // Catches a block copied across without being translated.
    const same = []
    for (const lang of OTHERS) {
      FAQ_TEXT[lang].forEach(([, faqs], s) => {
        faqs.forEach(([q, a], i) => {
          const [enQ, enA] = FAQ_TEXT.en[s][1][i]
          if (q === enQ) same.push(`${lang}[${s}][${i}] q`)
          if (a === enA) same.push(`${lang}[${s}][${i}] a`)
        })
      })
    }
    expect(same).toEqual([])
  })

  it('FAQ_SECTIONS keeps the English object shape the prerenderer mirrors', () => {
    // client/scripts/prerender.mjs and legal.test.js both depend on this shape.
    expect(FAQ_SECTIONS.length).toBe(FAQ_TEXT.en.length)
    for (const s of FAQ_SECTIONS) {
      expect(typeof s.title).toBe('string')
      for (const f of s.faqs) {
        expect(typeof f.q).toBe('string')
        expect(typeof f.a).toBe('string')
      }
    }
  })

  it('an unknown language falls back to English rather than throwing', () => {
    expect(faqSections('de')).toEqual(FAQ_SECTIONS)
  })

  for (const lang of LANGS) {
    it(`About reuses seven real FAQ answers in ${lang}`, () => {
      const picks = aboutFaqs(lang)
      expect(picks).toHaveLength(7)
      const all = faqSections(lang).flatMap(s => s.faqs)
      for (const p of picks) expect(all).toContainEqual(p)
    })
  }
})

describe('About content parity', () => {
  it('has all four languages', () => {
    expect(Object.keys(ABOUT_TEXT).sort()).toEqual([...LANGS].sort())
  })

  it('every language has the same block structure', () => {
    // Kinds must line up too: an h2 that became a p would detach a heading
    // from the section it introduces.
    const kinds = lang => ABOUT_TEXT[lang].blocks.map(b => b[0])
    for (const lang of OTHERS) expect(kinds(lang)).toEqual(kinds('en'))
  })

  it('list blocks keep the same number of bullets', () => {
    const bullets = lang => ABOUT_TEXT[lang].blocks.filter(b => b[0] === 'ul').map(b => b[1].length)
    for (const lang of OTHERS) expect(bullets(lang)).toEqual(bullets('en'))
  })

  it('has exactly one faq block per language', () => {
    for (const lang of LANGS) {
      expect(ABOUT_TEXT[lang].blocks.filter(b => b[0] === 'faq')).toHaveLength(1)
    }
  })

  it('bold and link markers are balanced', () => {
    // inline() renders an unpaired ** literally, so a dropped marker shows up
    // as asterisks in the page rather than as bold text.
    const bad = []
    for (const lang of LANGS) {
      for (const [kind, body] of ABOUT_TEXT[lang].blocks) {
        const texts = kind === 'ul' ? body : kind === 'faq' ? [] : [body]
        for (const s of texts) {
          if ((s.match(/\*\*/g) || []).length % 2 !== 0) bad.push(`${lang}: ** in "${s.slice(0, 40)}"`)
          const open = (s.match(/\]\(/g) || []).length
          const close = (s.match(/\)/g) || []).length
          if (open > close) bad.push(`${lang}: link in "${s.slice(0, 40)}"`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('every link target survives translation', () => {
    // A translator can move a link but must not invent or drop a destination.
    const hrefs = lang => ABOUT_TEXT[lang].blocks
      .flatMap(([kind, body]) => (kind === 'ul' ? body : kind === 'faq' ? [] : [body]))
      .flatMap(s => [...s.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]))
      .sort()
    for (const lang of OTHERS) expect(hrefs(lang)).toEqual(hrefs('en'))
  })

  it('an unknown language falls back to English', () => {
    expect(aboutContent('de').title).toBe(ABOUT_TEXT.en.title)
  })
})

describe('Fear & Greed page parity', () => {
  it('has all four languages, in both tables', () => {
    expect(Object.keys(FNG_FAQ_TEXT).sort()).toEqual([...LANGS].sort())
    expect(Object.keys(FNG_TEXT).sort()).toEqual([...LANGS].sort())
  })

  it('every language has the same question count', () => {
    for (const lang of OTHERS) expect(FNG_FAQ_TEXT[lang].length).toBe(FNG_FAQ_TEXT.en.length)
    for (const lang of LANGS) expect(fngFaqs(lang)).toHaveLength(7)
  })

  it('every language has the same block structure and five zones', () => {
    const kinds = lang => FNG_TEXT[lang].blocks.map(b => b[0])
    for (const lang of OTHERS) expect(kinds(lang)).toEqual(kinds('en'))
    for (const lang of LANGS) expect(FNG_TEXT[lang].zones).toHaveLength(5)
  })

  it('the zone tables line up', () => {
    // The badge picks a zone by index across three parallel arrays; a length
    // mismatch would colour a zone with its neighbour's colour.
    expect(FNG_ZONE_RANGES).toHaveLength(5)
    expect(FNG_ZONE_COLORS).toHaveLength(5)
  })

  // Words that are genuinely identical in the target language. Listed rather
  // than pattern-matched, so a real untranslated string still fails.
  const IDENTICAL_BY_DESIGN = new Set(['es zone 2'])   // "Neutral" is Spanish too

  it('translations actually differ from English', () => {
    const same = []
    for (const lang of OTHERS) {
      FNG_FAQ_TEXT[lang].forEach(([q, a], i) => {
        if (q === FNG_FAQ_TEXT.en[i][0]) same.push(`${lang}[${i}] q`)
        if (a === FNG_FAQ_TEXT.en[i][1]) same.push(`${lang}[${i}] a`)
      })
      FNG_TEXT[lang].zones.forEach(([label], i) => {
        if (label === FNG_TEXT.en.zones[i][0]) same.push(`${lang} zone ${i}`)
      })
    }
    expect(same.filter(x => !IDENTICAL_BY_DESIGN.has(x))).toEqual([])
  })

  it('the identical-by-design list still describes real collisions', () => {
    // A stale entry would silently excuse a string that later did get
    // translated — or worse, one that regressed.
    for (const entry of IDENTICAL_BY_DESIGN) {
      const [lang, , i] = entry.split(' ')
      expect(FNG_TEXT[lang].zones[Number(i)][0]).toBe(FNG_TEXT.en.zones[Number(i)][0])
    }
  })

  it('an unknown language falls back to English', () => {
    expect(fngContent('de').title).toBe(FNG_TEXT.en.title)
    expect(fngFaqs('de')).toEqual(fngFaqs('en'))
  })
})
