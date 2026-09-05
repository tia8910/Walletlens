import { describe, it, expect } from 'vitest'
import { THEMES, paletteFor } from './ThemeContext'

// The selected theme paints a coin mark behind the portfolio card. Two things
// have to hold for that to look like a watermark rather than a mistake.

describe('the coin marks', () => {
  it('exists for every theme', () => {
    for (const t of THEMES) {
      expect(t.mark, `${t.id} has no mark`).toMatch(/^data:image\/svg\+xml,/)
    }
  })

  it('has its tile stripped, so a silhouette is the coin and not a box', () => {
    // The picker logos draw the glyph on a filled rounded rect. index.css
    // silhouettes the mark with brightness(0), which would turn that tile into
    // a plain black rectangle — this is the whole reason `mark` exists next to
    // `logo` rather than the logo being reused.
    for (const t of THEMES) {
      expect(decodeURIComponent(t.mark), `${t.id}`).not.toMatch(/<rect width='40' height='40'/)
    }
  })

  it('leaves the picker logos alone', () => {
    // The tiled logo is what the theme picker shows; only the watermark layer
    // wanted a bare glyph.
    const tiled = THEMES.filter(t => t.logo)
    expect(tiled.length).toBeGreaterThan(0)
    for (const t of tiled) {
      expect(t.logo).not.toBe(t.mark)
    }
  })
})

describe('the palette is untouched by it', () => {
  // The mark is a background layer and nothing else. Every colour below is
  // what shipped before it existed; a diff here means the watermark work
  // leaked into the theme system, which is exactly what it must not do.
  it('keeps the neutral graphite base in dark', () => {
    const p = paletteFor('bitcoin', 'dark')
    expect(p.bg).toBe('#0a0b0d')
    expect(p.cardBg).toBe('rgba(20,22,26,0.88)')
    expect(p.border).toBe('rgba(255,255,255,0.08)')
    expect(p.text).toBe('#f5f6f7')
    expect(p.accent).toBe('#f7931a')
  })

  it('keeps the neutral base in light', () => {
    const p = paletteFor('solana', 'light')
    expect(p.bg).toBe('#f7f8f9')
    expect(p.cardBg).toBe('rgba(255,255,255,0.96)')
    expect(p.text).toBe('#16181b')
    expect(p.accent).toBe('#7c22e8')
  })

  it('falls back rather than throwing on a theme id it does not know', () => {
    expect(paletteFor('dogecoin', 'dark')).toEqual(paletteFor('emerald', 'dark'))
  })
})
