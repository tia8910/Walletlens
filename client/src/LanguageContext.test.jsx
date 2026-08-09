import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider, useLanguage } from './LanguageContext'

// Without this, react-dom/test-utils' act() silently stops batching/flushing
// (a console warning, not a thrown error) and the dynamic-import-driven state
// update below never lands before assertions run.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// LanguageContext ships English in the main bundle and dynamically imports
// ar/fr/es one at a time, only for a visitor who actually needs that
// language (see the comment in LanguageContext.jsx for why). That async path
// is easy to get subtly wrong — e.g. `t()` throwing instead of falling back
// while the chunk is in flight, or a switch back to a cached language
// re-fetching instead of reusing the loaded dictionary — so it's covered
// directly rather than trusting the i18n.test.js key-parity checks alone,
// which only exercise the synchronous combined table.

let container
let root
let latest

function Probe() {
  // Destructured (not just `latest = useLanguage()`) so this file satisfies
  // the project's own t()-binding convention, checked by i18nBindings.test.js.
  const { t, lang, setLang, isRtl } = useLanguage()
  latest = { t, lang, setLang, isRtl }
  return null
}

beforeEach(() => {
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => { root?.unmount() })
  container.remove()
  latest = undefined
})

// Vitest's module runner resolves a dynamic import() over more than a
// couple of microtask turns, so flush a few real timer ticks rather than
// guessing a fixed number of Promise.resolve() hops.
async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
  }
}

async function mount() {
  root = createRoot(container)
  await act(async () => {
    root.render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    )
  })
}

describe('LanguageContext lazy dictionary loading', () => {
  it('serves English synchronously with no dynamic import', async () => {
    await mount()
    expect(latest.lang).toBe('en')
    expect(latest.t('watchlist')).toBe('Watchlist')
  })

  it('falls back to English immediately after switching, then resolves the real translation', async () => {
    await mount()
    act(() => { latest.setLang('ar') })
    // Synchronously after the state update, the ar dictionary has not
    // resolved yet — t() must fall back to English rather than throw or
    // return the raw key.
    expect(latest.t('watchlist')).toBe('Watchlist')

    // Flush the dynamic import.
    await flushAsync()
    expect(latest.t('watchlist')).toBe('قائمة المتابعة')
  })

  it('does not re-fetch a language dictionary already loaded', async () => {
    await mount()
    act(() => { latest.setLang('fr') })
    await flushAsync()
    expect(latest.t('watchlist')).toBe('Liste de suivi')

    act(() => { latest.setLang('en') })
    expect(latest.t('watchlist')).toBe('Watchlist')

    act(() => { latest.setLang('fr') })
    // Already cached from the first switch — available immediately, no
    // second round-trip through the dynamic import needed.
    expect(latest.t('watchlist')).toBe('Liste de suivi')
  })

  it('falls back to the English key text for a key missing everywhere', async () => {
    await mount()
    expect(latest.t('__no_such_key__')).toBe('__no_such_key__')
  })
})
