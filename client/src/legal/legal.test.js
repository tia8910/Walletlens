import { describe, it, expect } from 'vitest'
import { privacy } from './privacy'
import { terms } from './terms'
import { LANGUAGES } from '../LanguageContext'
import { inline } from '../components/DocProse'
import { FAQ_SECTIONS } from '../pages/FAQ'

// A legal document translated four ways fails in ways a UI string cannot. A
// section quietly missing from one language, a bullet list that lost an item,
// the contact address mistyped so the deletion route leads nowhere, a provider
// name localised away — "Binance" translated is a disclosure that no longer
// discloses. None of these look broken on screen. The page renders perfectly
// well, just saying something other than the English that governs it.

const OTHERS = LANGUAGES.map(l => l.code).filter(c => c !== 'en')
const DOCS = { 'privacy policy': privacy, 'terms of service': terms }

// Names that carry meaning and must survive translation intact.
const MUST_KEEP = {
  'privacy policy': ['CoinGecko', 'Binance', 'Stooq', 'Anthropic', 'Google Analytics', 'GoPlus Labs'],
  'terms of service': ['CoinGecko', 'Binance', 'Stooq', 'Google Analytics'],
}

const passages = (doc) => {
  const out = []
  doc.sections.forEach((s, i) => {
    for (const key of ['p', 'ul', 'after']) {
      (s[key] || []).forEach((txt, j) => out.push([`section ${i} ${key}[${j}]`, String(txt)]))
    }
  })
  return out
}

describe.each(Object.entries(DOCS))('%s', (name, doc) => {
  const en = doc.en

  it('exists in every language the picker offers', () => {
    for (const { code } of LANGUAGES) {
      expect(doc[code], `no ${name} for ${code}`).toBeTruthy()
    }
  })

  it.each(OTHERS)('%s has a title and a date', (lang) => {
    expect(doc[lang].title?.trim()).toBeTruthy()
    expect(doc[lang].updated?.trim()).toBeTruthy()
  })

  it.each(OTHERS)('%s has the same number of sections as English', (lang) => {
    expect(doc[lang].sections).toHaveLength(en.sections.length)
  })

  it.each(OTHERS)('%s keeps every section in the same shape', (lang) => {
    en.sections.forEach((section, i) => {
      const other = doc[lang].sections[i]
      expect(other.h, `${lang} section ${i} has no heading`).toBeTruthy()
      expect(other.p?.length ?? 0, `${lang} section ${i} paragraphs`).toBe(section.p?.length ?? 0)
      expect(other.ul?.length ?? 0, `${lang} section ${i} list length`).toBe(section.ul?.length ?? 0)
      expect(other.after?.length ?? 0, `${lang} section ${i} trailing paragraphs`).toBe(section.after?.length ?? 0)
    })
  })

  it.each(OTHERS)('%s leaves no passage empty', (lang) => {
    const blanks = passages(doc[lang]).filter(([, txt]) => !txt.trim()).map(([where]) => where)
    expect(blanks).toEqual([])
  })

  it.each(OTHERS)('%s still points at the real contact address', (lang) => {
    expect(JSON.stringify(doc[lang])).toContain('contact@walletlens.live')
  })

  it.each(OTHERS)('%s keeps the names it must disclose', (lang) => {
    const all = JSON.stringify(doc[lang])
    for (const kept of MUST_KEEP[name]) {
      expect(all, `${lang} lost ${kept}`).toContain(kept)
    }
  })

  it.each(OTHERS)('%s has balanced inline markers', (lang) => {
    // An odd count means a marker was dropped mid-translation, and the page
    // renders literal asterisks or backticks.
    const bad = []
    for (const [where, txt] of passages(doc[lang])) {
      if ((txt.match(/\*\*/g) || []).length % 2) bad.push(`${where}: unbalanced **`)
      if ((txt.match(/`/g) || []).length % 2) bad.push(`${where}: unbalanced backtick`)
    }
    expect(bad).toEqual([])
  })

  it.each(OTHERS)('%s has well-formed links', (lang) => {
    // [text]( with no closing paren renders as visible punctuation.
    const bad = []
    for (const [where, txt] of passages(doc[lang])) {
      const opens = (txt.match(/\[[^\]]*\]\(/g) || []).length
      const full = (txt.match(/\[[^\]]+\]\([^)]+\)/g) || []).length
      if (opens !== full) bad.push(where)
    }
    expect(bad).toEqual([])
  })
})

describe('the public documents agree with each other', () => {
  // Three places described the app's business model and two of them were
  // wrong: the Terms named "advertising (Google AdSense)" and the FAQ said the
  // app was "sustained by unobtrusive advertising", while the Privacy Policy
  // said it carries none. Only a verification meta tag exists — no ad script,
  // no slot — so the Privacy Policy was the accurate one. These checks exist
  // because the claim survived in a third file after the first two were fixed.
  it('no legal document mentions AdSense', () => {
    for (const [name, doc] of Object.entries(DOCS)) {
      for (const { code } of LANGUAGES) {
        expect(JSON.stringify(doc[code]), `${name}/${code} mentions AdSense`).not.toMatch(/AdSense/i)
      }
    }
  })

  it('the FAQ does not claim the app is funded by advertising', () => {
    const all = JSON.stringify(FAQ_SECTIONS)
    expect(all).not.toMatch(/sustained by[^"]*advertis/i)
    expect(all).not.toMatch(/AdSense/i)
  })

  it('the FAQ lists the languages that actually ship', () => {
    // It claimed Arabic only, long after French and Spanish shipped.
    const answer = FAQ_SECTIONS
      .flatMap(s => s.faqs)
      .find(f => /languages other than English/i.test(f.q))
    expect(answer, 'the language question disappeared from the FAQ').toBeTruthy()
    for (const name of ['Arabic', 'French', 'Spanish']) {
      expect(answer.a, `FAQ does not mention ${name}`).toContain(name)
    }
  })
})

describe('DocProse mini-syntax', () => {
  it('renders bold, code and links', () => {
    const nodes = inline('a **b** and `c` and [d](https://e.test)')
    expect(nodes.filter(n => typeof n === 'object').map(n => n.type)).toEqual(['strong', 'code', 'a'])
  })

  it('opens external links safely but leaves mailto alone', () => {
    const [ext] = inline('[x](https://e.test)').filter(n => typeof n === 'object')
    expect(ext.props.target).toBe('_blank')
    expect(ext.props.rel).toBe('noreferrer')
    const [mail] = inline('[x](mailto:a@b.test)').filter(n => typeof n === 'object')
    expect(mail.props.target).toBeUndefined()
  })

  it('leaves plain text untouched', () => {
    expect(inline('nothing to mark up')).toEqual(['nothing to mark up'])
  })

  it('handles Arabic text with an embedded code span', () => {
    const nodes = inline('تُخزَّن في `localStorage` داخل متصفحك')
    expect(nodes.filter(n => typeof n === 'object').map(n => n.type)).toEqual(['code'])
  })
})
