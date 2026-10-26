// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

// The bug: a logo swapped between two images many times a second. onLoad
// remembers the URL that loaded and re-renders; the source list was rebuilt
// from that memory on every render, moved the new URL to the front, and the
// ladder's index then named the other image, which loaded and swapped back.

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('a logo that loaded', () => {
  let CoinLogo
  beforeAll(async () => {
    // Last session remembered one URL; the holding row passes another.
    const RESOLVED_KEY = 'wl_logo_resolved'
    localStorage.setItem(RESOLVED_KEY, JSON.stringify({ aptos: 'https://img.example/remembered.png' }))
    CoinLogo = (await import('./components/CoinLogo')).default
  })

  it('keeps the same image however many times it reports loading', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(createElement(CoinLogo, { coinId: 'aptos', symbol: 'APT', image: 'https://img.example/from-row.png', size: 32 }))
    })
    // The remembered URL is gone (a CDN that moved, a blocked host): the
    // ladder moves on, and the next URL that loads becomes the remembered one.
    const first = host.querySelector('img')
    await act(async () => { first.dispatchEvent(new Event('error')) })
    const seen = new Set()
    for (let i = 0; i < 6; i++) {
      const img = host.querySelector('img')
      expect(img, 'an image is on screen').toBeTruthy()
      seen.add(img.getAttribute('src'))
      Object.defineProperty(img, 'naturalWidth', { value: 32, configurable: true })
      await act(async () => { img.dispatchEvent(new Event('load')) })
    }
    expect([...seen]).toHaveLength(1)
    await act(async () => root.unmount())
  })
})
