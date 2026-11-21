import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchGoals, fold } from './pages/More.jsx'

const read = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), f), 'utf8')
const goals = [
  { id: 'track', q: 'Check my money', items: [{ label: 'Dashboard' }, { label: 'Watchlist' }] },
  { id: 'protect', q: 'Stay safe', items: [{ label: 'Price Alerts' }, { label: 'Risk Scanner' }] },
]

describe('More: goals with a search', () => {
  it('shows every goal while the search is empty', () => {
    expect(searchGoals(goals, '  ')).toBe(goals)
  })
  it('keeps only the matching tools, and drops goals with none', () => {
    const r = searchGoals(goals, 'alert')
    expect(r.map(g => g.id)).toEqual(['protect'])
    expect(r[0].items.map(i => i.label)).toEqual(['Price Alerts'])
  })
  it('a goal that matches by name keeps all its tools', () => {
    expect(searchGoals(goals, 'safe')[0].items).toHaveLength(2)
  })
  it('ignores case and accents', () => {
    expect(fold('Éléments')).toBe('elements')
    expect(searchGoals([{ q: 'x', items: [{ label: 'Préférences' }] }], 'prefer')).toHaveLength(1)
  })
  it('every goal title is translated in every language', () => {
    const keys = ['moreAsk', 'moreFind', 'moreNone', ...['Track', 'Plan', 'Markets', 'Protect', 'Learn', 'Data'].flatMap(k => [`moreQ${k}`, `moreS${k}`])]
    for (const l of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const src = read(`i18n/${l}.js`)
      for (const k of keys) expect(src, `${l}.${k}`).toMatch(new RegExp(`\\b${k}: "`))
    }
  })
})
