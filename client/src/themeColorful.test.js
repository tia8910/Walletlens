import { describe, it, expect } from 'vitest'
import { THEMES, INTENSITIES, paletteFor } from './ThemeContext'

// Colorful mode repaints every surface from the selected theme's accent. Two
// things can go wrong that no amount of looking at one screen would catch:
//
//   1. It changes what Refined users see. Refined is the default and the thing
//      every existing install is already on, so its palette is frozen here.
//   2. One of the twelve theme/mode combinations lands on text that cannot be
//      read. In Colorful dark the page ground is LIGHTER than the card, which
//      inverts the usual margin — text that is comfortable on a card can be
//      marginal on the ground behind it. Both surfaces are checked.

/** hsla(h,s%,l%,a) | #rrggbb | rgba(r,g,b,a) → [r,g,b,a] on 0..255 / 0..1 */
function parse(c) {
  let m = /^#([0-9a-f]{6})$/i.exec(c)
  if (m) {
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  m = /^rgba?\(([^)]+)\)$/.exec(c)
  if (m) {
    const p = m[1].split(',').map(Number)
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
  }
  m = /^hsla?\(([^)]+)\)$/.exec(c)
  if (m) {
    const p = m[1].split(',')
    const h = Number(p[0]), s = parseFloat(p[1]) / 100, l = parseFloat(p[2]) / 100
    const a = p.length > 3 ? Number(p[3]) : 1
    const ch = (1 - Math.abs(2 * l - 1)) * s
    const x = ch * (1 - Math.abs(((h / 60) % 2) - 1))
    const mm = l - ch / 2
    const seg = [[ch, x, 0], [x, ch, 0], [0, ch, x], [0, x, ch], [x, 0, ch], [ch, 0, x]][Math.floor(h / 60) % 6]
    return [...seg.map(v => Math.round((v + mm) * 255)), a]
  }
  throw new Error(`unparsed colour: ${c}`)
}

/** Flatten a translucent colour onto an opaque one. */
function over(fg, bg) {
  const f = parse(fg), b = parse(bg)
  return [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3]))
}

function luminance(rgb) {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg, bgRgb) {
  const a = luminance(over(fg, `rgba(${bgRgb.join(',')},1)`))
  const b = luminance(bgRgb)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

const MODES = ['dark', 'light']

describe('Refined is frozen', () => {
  // Every value below is what shipped before Colorful existed. A diff here is
  // a change to the interface of every user who never opened the new control.
  it('keeps the neutral graphite base in dark', () => {
    const p = paletteFor('bitcoin', 'dark', 'refined')
    expect(p.bg).toBe('#0a0b0d')
    expect(p.cardBg).toBe('rgba(20,22,26,0.88)')
    expect(p.border).toBe('rgba(255,255,255,0.08)')
    expect(p.text).toBe('#f5f6f7')
    expect(p.accent).toBe('#f7931a')
  })

  it('keeps the neutral base in light', () => {
    const p = paletteFor('solana', 'light', 'refined')
    expect(p.bg).toBe('#f7f8f9')
    expect(p.cardBg).toBe('rgba(255,255,255,0.96)')
    expect(p.text).toBe('#16181b')
    expect(p.accent).toBe('#7c22e8')
  })

  it('is what an unset intensity resolves to', () => {
    for (const id of THEMES.map(t => t.id)) {
      for (const mode of MODES) {
        expect(paletteFor(id, mode, undefined)).toEqual(paletteFor(id, mode, 'refined'))
      }
    }
  })
})

describe('Colorful', () => {
  it('is offered as exactly two intensities', () => {
    expect(INTENSITIES).toEqual(['refined', 'colorful'])
  })

  it('returns every token Refined does, so applyTheme writes no undefined', () => {
    for (const id of THEMES.map(t => t.id)) {
      for (const mode of MODES) {
        const refined = paletteFor(id, mode, 'refined')
        const colorful = paletteFor(id, mode, 'colorful')
        for (const key of Object.keys(refined)) {
          expect(colorful[key], `${id}/${mode} is missing ${key}`).toBeDefined()
        }
      }
    }
  })

  it('actually leaves graphite behind', () => {
    for (const id of THEMES.map(t => t.id)) {
      for (const mode of MODES) {
        const p = paletteFor(id, mode, 'colorful')
        expect(p.bg, `${id}/${mode}`).not.toBe(paletteFor(id, mode, 'refined').bg)
        expect(p.bg).toMatch(/^hsla\(/)
      }
    }
  })

  it('tints Silver too, whose accent is nearly grey', () => {
    // Without the saturation floor this palette comes back as graphite and the
    // switch looks broken rather than deliberate.
    const [, s] = /^hsla\((\d+),(\d+)%/.exec(paletteFor('silver', 'dark', 'colorful').bg).slice(1)
    expect(Number(s)).toBeGreaterThanOrEqual(30)
  })

  it('gives each theme its own hue', () => {
    const hues = THEMES.map(t => /^hsla\((\d+)/.exec(paletteFor(t.id, 'dark', 'colorful').bg)[1])
    expect(new Set(hues).size).toBeGreaterThanOrEqual(5)
  })

  it('keeps every text role readable on the ground AND on the card', () => {
    for (const id of THEMES.map(t => t.id)) {
      for (const mode of MODES) {
        const p = paletteFor(id, mode, 'colorful')
        const ground = over(p.bg, '#000000')
        const card = over(p.cardBg, `rgba(${ground.join(',')},1)`)
        for (const role of ['text', 'text2', 'textMuted', 'textSub']) {
          expect(contrast(p[role], ground), `${id}/${mode} ${role} on the page`).toBeGreaterThanOrEqual(4.5)
          expect(contrast(p[role], card), `${id}/${mode} ${role} on a card`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('falls back rather than throwing on a theme id it does not know', () => {
    expect(paletteFor('dogecoin', 'dark', 'colorful')).toEqual(paletteFor('emerald', 'dark', 'colorful'))
  })
})

describe('the coin marks the CSS layer paints', () => {
  it('gives every theme a mark', () => {
    for (const t of THEMES) {
      expect(t.mark, `${t.id} has no mark`).toMatch(/^data:image\/svg\+xml,/)
    }
  })

  it('strips the tile, so a silhouette is the coin and not a rectangle', () => {
    // The picker logos draw the glyph on a filled rounded rect. Colorful
    // silhouettes the mark with brightness(0), which would turn that tile into
    // a plain black box.
    for (const t of THEMES) {
      expect(decodeURIComponent(t.mark), `${t.id}`).not.toMatch(/<rect width='40' height='40'/)
    }
  })
})
