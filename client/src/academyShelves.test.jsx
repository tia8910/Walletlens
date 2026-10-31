// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from './LanguageContext'
import AcademyWatch from './components/AcademyWatch'
import { lessonOrder } from './data/academyVideos'

// Full-length channel videos have no course and were left out of every
// shelf: the progress bar counted them, but nothing on the page showed them.

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('Academy shelves', () => {
  it('shows every lesson the progress bar counts', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    await act(async () => {
      createRoot(host).render(createElement(LanguageProvider, null, createElement(AcademyWatch)))
    })
    const onShelves = new Set([...host.querySelectorAll('.aw-tile b, .aw-tile [dir="auto"]')].map(e => e.textContent))
    const missing = lessonOrder('en').filter(v => !onShelves.has(v.name)).map(v => v.name)
    expect(missing).toEqual([])
  })
})
