import { describe, it, expect } from 'vitest'
import { privacy } from './privacy'
import { LANGUAGES } from '../LanguageContext'
import { inline } from '../components/DocProse'

// A legal document translated four ways can go wrong in ways a UI string
// cannot: a section quietly missing from one language, a bullet list that lost
// an item, a contact address mistyped so nobody can reach the owner. None of
// those look broken on screen — the page still renders, just saying something
// different from the English that governs it.

const OTHERS = LANGUAGES.map(l => l.code).filter(c => c !== 'en')
const en = privacy.en

describe('privacy policy', () => {
  it('exists in every language the picker offers', () => {
    for (const { code } of LANGUAGES) {
      expect(privacy[code], `no privacy policy for ${code}`).toBeTruthy()
    }
  })

  it.each(OTHERS)('%s has the same number of sections as English', (lang) => {
    expect(privacy[lang].sections).toHaveLength(en.sections.length)
  })

  it.each(OTHERS)('%s keeps every section in the same shape', (lang) => {
    en.sections.forEach((section, i) => {
      const other = privacy[lang].sections[i]
      expect(other.h, `${lang} section ${i} has no heading`).toBeTruthy()
      expect(other.p?.length ?? 0, `${lang} section ${i} paragraph count`).toBe(section.p?.length ?? 0)
      expect(other.ul?.length ?? 0, `${lang} section ${i} list length`).toBe(section.ul?.length ?? 0)
      expect(other.after?.length ?? 0, `${lang} section ${i} trailing paragraphs`).toBe(section.after?.length ?? 0)
    })
  })

  it.each(OTHERS)('%s leaves no passage empty', (lang) => {
    const blanks = []
    privacy[lang].sections.forEach((s, i) => {
      for (const key of ['p', 'ul', 'after']) {
        (s[key] || []).forEach((txt, j) => {
          if (!String(txt).trim()) blanks.push(`section ${i} ${key}[${j}]`)
        })
      }
    })
    expect(blanks).toEqual([])
  })

  it.each(OTHERS)('%s still points at the real contact address', (lang) => {
    // The deletion route in section 8 is only meaningful if this survives.
    const all = JSON.stringify(privacy[lang])
    expect(all).toContain('contact@walletlens.live')
  })

  it.each(OTHERS)('%s keeps the third-party providers it must disclose', (lang) => {
    // These names are the disclosure. A translation that localised "Binance"
    // or dropped a provider would make the policy inaccurate, which is the one
    // thing a privacy policy cannot be.
    const all = JSON.stringify(privacy[lang])
    for (const name of ['CoinGecko', 'Binance', 'Stooq', 'Anthropic', 'Google Analytics', 'GoPlus Labs']) {
      expect(all, `${lang} lost ${name}`).toContain(name)
    }
  })

  it.each(OTHERS)('%s has balanced inline markers', (lang) => {
    // An odd number of ** or ` means a marker was dropped mid-translation and
    // the page renders literal asterisks.
    const bad = []
    const walk = (txt, where) => {
      const bold = (txt.match(/\*\*/g) || []).length
      const code = (txt.match(/`/g) || []).length
      if (bold % 2) bad.push(`${where}: unbalanced **`)
      if (code % 2) bad.push(`${where}: unbalanced backtick`)
    }
    privacy[lang].sections.forEach((s, i) => {
      for (const key of ['p', 'ul', 'after']) {
        (s[key] || []).forEach((txt, j) => walk(String(txt), `section ${i} ${key}[${j}]`))
      }
    })
    expect(bad).toEqual([])
  })

  it('renders bold, code and links from the mini-syntax', () => {
    const nodes = inline('a **b** and `c` and [d](https://e.test)')
    const types = nodes.filter(n => typeof n === 'object').map(n => n.type)
    expect(types).toEqual(['strong', 'code', 'a'])
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
})
