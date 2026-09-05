import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'

const GOLD_BAR_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect x='3' y='15' width='34' height='13' rx='2' fill='%23c49a1a'/%3E%3Crect x='3' y='15' width='34' height='7' rx='2' fill='%23e8b825'/%3E%3Crect x='7' y='18' width='26' height='7' rx='1' fill='none' stroke='rgba(0,0,0,0.18)' stroke-width='0.7'/%3E%3Ctext x='20' y='25' font-size='7' fill='rgba(0,0,0,0.55)' text-anchor='middle' font-family='Georgia,serif' font-weight='bold'%3EAu%3C/text%3E%3C/svg%3E`

const SILVER_BAR_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect x='3' y='15' width='34' height='13' rx='2' fill='%23808898'/%3E%3Crect x='3' y='15' width='34' height='7' rx='2' fill='%23e8ecf4'/%3E%3Crect x='7' y='18' width='26' height='7' rx='1' fill='none' stroke='rgba(0,0,0,0.14)' stroke-width='0.7'/%3E%3Ctext x='20' y='25' font-size='7' fill='rgba(0,0,0,0.5)' text-anchor='middle' font-family='Georgia,serif' font-weight='bold'%3EAg%3C/text%3E%3C/svg%3E`

const ETH_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%23161b33'/%3E%3Cpath d='M20 5L20 16.1 29 20.2Z' fill='%23627eea' opacity='0.75'/%3E%3Cpath d='M20 5L11 20.2 20 16.1Z' fill='%238fa4f3'/%3E%3Cpath d='M20 17.9L11 22 20 27.3 29 22Z' fill='%23627eea'/%3E%3Cpath d='M20 29.2L11 23.9 20 36 29 23.9Z' fill='%238fa4f3' opacity='0.9'/%3E%3C/svg%3E`
const SOLANA_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%231a0a2e'/%3E%3Cpath d='M6,31L28,31L34,25L12,25Z' fill='%239945ff'/%3E%3Cpath d='M6,23L28,23L34,17L12,17Z' fill='%239945ff'/%3E%3Cpath d='M6,15L28,15L34,9L12,9Z' fill='%239945ff'/%3E%3C/svg%3E`
// Bitcoin ₿ drawn as a vector path (not a font glyph) so it always renders on
// the orange tile, matching the ETH/Solana logo treatment.
const BTC_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%23f7931a'/%3E%3Cpath fill='%23ffffff' d='M28.2 18c.3-2.3-1.4-3.5-3.8-4.3l.8-3.1-1.9-.5-.8 3c-.5-.1-1-.2-1.5-.4l.8-3-1.9-.5-.8 3.1c-.4-.1-.8-.2-1.2-.3l-2.6-.7-.5 2.1s1.4.3 1.4.4c.8.2.9.7.9 1.1l-1 3.9c.1 0 .1 0 .2.1h-.2l-1.3 5.4c-.1.3-.4.6-.9.5 0 0-1.4-.4-1.4-.4l-1 2.3 2.5.6c.5.1.9.2 1.3.4l-.8 3.2 1.9.5.8-3.1c.5.1 1 .3 1.5.4l-.8 3.1 1.9.5.8-3.2c3.3.6 5.7.4 6.8-2.6.9-2.4 0-3.8-1.7-4.7 1.2-.3 2.2-1.1 2.5-2.8zm-4.4 6.2c-.6 2.4-4.7 1.1-6 .8l1-4.1c1.3.3 5.6 1 5 3.3zm.6-6.2c-.6 2.2-4 1.1-5.1.8l.9-3.7c1.1.3 4.9.8 4.2 2.9z'/%3E%3C/svg%3E`


// Watermark marks for Colorful mode: the same artwork with its tile removed,
// so a silhouette reads as the coin itself and not as a rounded rectangle.
// index.css paints these through --wl-motif; Refined never sets that variable.
const MARK_BTC = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath fill='%23000' d='M28.2 18c.3-2.3-1.4-3.5-3.8-4.3l.8-3.1-1.9-.5-.8 3c-.5-.1-1-.2-1.5-.4l.8-3-1.9-.5-.8 3.1c-.4-.1-.8-.2-1.2-.3l-2.6-.7-.5 2.1s1.4.3 1.4.4c.8.2.9.7.9 1.1l-1 3.9c.1 0 .1 0 .2.1h-.2l-1.3 5.4c-.1.3-.4.6-.9.5 0 0-1.4-.4-1.4-.4l-1 2.3 2.5.6c.5.1.9.2 1.3.4l-.8 3.2 1.9.5.8-3.1c.5.1 1 .3 1.5.4l-.8 3.1 1.9.5.8-3.2c3.3.6 5.7.4 6.8-2.6.9-2.4 0-3.8-1.7-4.7 1.2-.3 2.2-1.1 2.5-2.8zm-4.4 6.2c-.6 2.4-4.7 1.1-6 .8l1-4.1c1.3.3 5.6 1 5 3.3zm.6-6.2c-.6 2.2-4 1.1-5.1.8l.9-3.7c1.1.3 4.9.8 4.2 2.9z'/%3E%3C/svg%3E`
const MARK_ETH = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cg fill='%23000'%3E%3Cpath d='M20 4L20 16.1 30 20.6Z'/%3E%3Cpath d='M20 4L10 20.6 20 16.1Z'/%3E%3Cpath d='M20 18.4L10 22.8 20 28.6 30 22.8Z'/%3E%3Cpath d='M20 30.8L10 25 20 36 30 25Z'/%3E%3C/g%3E%3C/svg%3E`
const MARK_SOL = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cg fill='%23000'%3E%3Cpath d='M4,32L28,32L36,25L12,25Z'/%3E%3Cpath d='M4,23.5L28,23.5L36,16.5L12,16.5Z'/%3E%3Cpath d='M4,15L28,15L36,8L12,8Z'/%3E%3C/g%3E%3C/svg%3E`
const MARK_BAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath fill='%23000' d='M2 17h36v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z'/%3E%3Cpath fill='%23000' d='M8 10h24l5 6H3z'/%3E%3C/svg%3E`
const MARK_GEM = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath fill='%23000' d='M20 5l12 10-12 21L8 15z'/%3E%3C/svg%3E`

export const THEMES = [
  { id: 'emerald',  name: 'Emerald',  swatch: '#00ffaa', light: '#a7f3d0', icon: 'sparkles', mark: MARK_GEM },
  { id: 'gold',     name: 'Gold',     swatch: '#e8b825', light: '#fde68a', icon: 'award', logo: GOLD_BAR_SVG,   mark: MARK_BAR },
  { id: 'silver',   name: 'Silver',   swatch: '#c0c8d8', light: '#e8ecf4', icon: 'award', logo: SILVER_BAR_SVG, mark: MARK_BAR },
  { id: 'bitcoin',  name: 'Bitcoin',  swatch: '#f7931a', light: '#fed7aa', icon: '₿', logo: BTC_SVG,    mark: MARK_BTC },
  { id: 'ethereum', name: 'Ethereum', swatch: '#627eea', light: '#c7d2fe', icon: 'Ξ',  logo: ETH_SVG,    mark: MARK_ETH },
  { id: 'solana',   name: 'Solana',   swatch: '#9945ff', light: '#d8b4fe', icon: '◎',  logo: SOLANA_SVG, mark: MARK_SOL },
]

// ── Mercury-style neutral-slate system ──────────────────────────────────────
// Premium discipline: the canvas, cards, borders and *all* metadata text are
// strictly NEUTRAL (graphite + white/gray). A theme's accent hue is reserved
// for disciplined pops only — gains, the logo, primary CTAs, focus rings.
// This is what separates a real fintech (Mercury, Ramp, Linear) from a neon
// "scam coin" site, where colored text bleeds everywhere.
// Text values are tuned for SOLID legibility in every mode/theme: a clear
// 3-step hierarchy (primary / secondary / tertiary) that always meets contrast
// on its own neutral surface — no dim, washed-out, or color-tinted body text.
const DARK_BASE = {
  bg: '#0a0b0d', cardBg: 'rgba(20,22,26,0.88)', bg3: '#111316', bg4: '#16181d',
  border: 'rgba(255,255,255,0.08)', ink: '#060708', ink2: '#111316',
  text: '#f5f6f7', text2: 'rgba(255,255,255,0.72)',
  textMuted: 'rgba(255,255,255,0.62)', textSub: 'rgba(255,255,255,0.46)',
  surface1: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.07)', surface3: 'rgba(255,255,255,0.11)',
}
const LIGHT_BASE = {
  bg: '#f7f8f9', cardBg: 'rgba(255,255,255,0.96)', bg3: '#f0f1f3', bg4: '#e6e8ea',
  border: 'rgba(0,0,0,0.09)', ink: '#f0f1f3', ink2: '#e6e8ea',
  text: '#16181b', text2: 'rgba(24,24,27,0.70)',
  textMuted: 'rgba(24,24,27,0.58)', textSub: 'rgba(24,24,27,0.42)',
  surface1: 'rgba(0,0,0,0.04)', surface2: 'rgba(0,0,0,0.06)', surface3: 'rgba(0,0,0,0.10)',
}

// Build a full palette variant from a neutral base + the theme's accent family.
// `a` = accent hex, `a2` = darker accent, `aRgb`/`a2Rgb` = their rgb triples.
function variant(base, a, a2, aRgb, a2Rgb) {
  return {
    ...base,
    g: a, gd: a2, gRgb: aRgb, gdRgb: a2Rgb,
    gl: `rgba(${aRgb},0.10)`, ink3: `rgba(${aRgb},0.45)`,
    accent: a, accent2: a2, accentBg: `rgba(${aRgb},0.10)`,
    green: a, greenBg: `rgba(${aRgb},0.12)`,
    hg: `linear-gradient(135deg,${base.bg} 0%,${base.bg4} 55%,${a} 135%)`,
    hga: `linear-gradient(135deg,${a} 0%,${a2} 100%)`,
    mesh1: `rgba(${aRgb},0.04)`, mesh2: `rgba(${a2Rgb},0.03)`, mesh3: `rgba(${aRgb},0.035)`,
    glow: `0 0 0 1px rgba(255,255,255,0.06),0 0 36px rgba(${aRgb},0.07)`,
  }
}

const PALETTE = {
  emerald: {
    dark:  variant(DARK_BASE,  '#10b981', '#059669', '16,185,129', '5,150,105'),
    light: variant(LIGHT_BASE, '#059669', '#047857', '5,150,105', '4,120,87'),
  },
  gold: {
    dark:  variant(DARK_BASE,  '#e8b825', '#c49a1a', '232,184,37', '196,154,26'),
    light: variant(LIGHT_BASE, '#8b6914', '#705210', '139,105,20', '112,82,16'),
  },
  silver: {
    dark:  variant(DARK_BASE,  '#c0c8d8', '#8a96aa', '192,200,216', '138,150,170'),
    light: variant(LIGHT_BASE, '#475569', '#334155', '71,85,105', '51,65,85'),
  },
  bitcoin: {
    dark:  variant(DARK_BASE,  '#f7931a', '#c97012', '247,147,26', '201,112,18'),
    light: variant(LIGHT_BASE, '#c2590a', '#9a4508', '194,89,10', '154,69,8'),
  },
  ethereum: {
    dark:  variant(DARK_BASE,  '#627eea', '#3a57d4', '98,126,234', '58,87,212'),
    light: variant(LIGHT_BASE, '#3d5bcb', '#2d47a8', '61,91,203', '45,71,168'),
  },
  solana: {
    dark:  variant(DARK_BASE,  '#9945ff', '#7c3aed', '153,69,255', '124,58,237'),
    light: variant(LIGHT_BASE, '#7c22e8', '#6418c4', '124,34,232', '100,24,196'),
  },
}


// ── Colorful mode ───────────────────────────────────────────────────────────
// Refined (above) is the default and does not change. Colorful is opt-in: it
// drops the neutral base entirely and repaints every surface from the SELECTED
// theme's own accent, so picking Bitcoin gives an orange room rather than a
// graphite one with orange accents.
//
// The accent hex is the only input. Hue and saturation are read out of it and
// the lightness of each surface is fixed per role, so all six themes stay in
// step and a seventh theme needs no extra work here.
//
// Light stays deliberately more conservative than dark: index.css carries
// hundreds of `data-wl-light` overrides written against a white card, so the
// hue goes into the page, the chrome and the chips while the card itself stays
// near-white. Dark has no such constraint and gets the full repaint.
function toHsl(rgbTriple) {
  const [r, g, b] = rgbTriple.split(',').map(n => Number(n) / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  const l = (mx + mn) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    if (mx === r)      h = 60 * (((g - b) / d) % 6)
    else if (mx === g) h = 60 * (((b - r) / d) + 2)
    else               h = 60 * (((r - g) / d) + 4)
  }
  return [(h + 360) % 360, s, l]
}
const hsl = (h, s, l, a = 1) =>
  `hsla(${Math.round(h)},${Math.round(s * 100)}%,${Math.round(l * 100)}%,${a})`

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
  return seg.map(v => v + m)
}
function relLuminance([r, g, b]) {
  const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

// A hue at a fixed HSL lightness is NOT a fixed brightness: emerald and gold
// read far lighter than orange or violet at the same L. In Colorful DARK that
// matters, because the text on those surfaces is light — a hue that comes out
// brighter than intended eats the contrast, and a palette written in HSL
// lightness passes in one theme and fails in another (emerald was the one that
// failed). So each dark surface names the perceived luminance it should land
// on and the lightness that hits it is solved for per hue, which a seventh
// theme then inherits without anyone re-tuning numbers.
function tint(h, s, targetLum, a = 1) {
  let lo = 0, hi = 1
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (relLuminance(hslToRgb(h, s, mid)) < targetLum) lo = mid
    else hi = mid
  }
  return hsl(h, s, (lo + hi) / 2, a)
}

function colorful(mode, a, a2, aRgb, a2Rgb) {
  const [h, sat] = toHsl(aRgb)
  // Silver is nearly grey; without a floor its "colorful" mode is just graphite
  // again, which reads as the switch being broken rather than as a choice.
  const S = Math.max(sat, 0.42)
  const accents = {
    g: a, gd: a2, gRgb: aRgb, gdRgb: a2Rgb,
    gl: `rgba(${aRgb},0.16)`, ink3: `rgba(${aRgb},0.55)`,
    accent: a, accent2: a2, accentBg: `rgba(${aRgb},0.16)`,
    green: a, greenBg: `rgba(${aRgb},0.18)`,
    hga: `linear-gradient(135deg,${a} 0%,${a2} 100%)`,
    mesh1: `rgba(${aRgb},0.16)`, mesh2: `rgba(${a2Rgb},0.12)`, mesh3: `rgba(${aRgb},0.13)`,
  }

  if (mode === 'light') {
    // Light keeps the near-white card on purpose: index.css carries hundreds of
    // `data-wl-light` overrides written against one, so the hue goes into the
    // page, the chrome and the chips instead.
    //
    // And unlike dark, these lightnesses are fixed rather than solved for. The
    // text here is dark, so a hue that lands BRIGHTER than expected only widens
    // the contrast — the risk runs one way, and pinning the lightness is what
    // keeps every theme pastel. Solving for luminance instead dragged emerald
    // down to a 50%-lightness neon green to hit the same brightness as orange.
    const bg = hsl(h, 0.92, 0.86)
    return {
      ...accents,
      bg, cardBg: 'rgba(255,255,255,0.94)',
      bg3: hsl(h, 0.86, 0.91), bg4: hsl(h, 0.82, 0.82),
      border: hsl(h, 0.55, 0.46, 0.26),
      ink: hsl(h, 0.80, 0.94), ink2: hsl(h, 0.78, 0.90),
      text: hsl(h, 0.62, 0.14), text2: hsl(h, 0.44, 0.26),
      textMuted: hsl(h, 0.40, 0.30), textSub: hsl(h, 0.34, 0.34),
      surface1: hsl(h, 0.82, 0.92), surface2: hsl(h, 0.82, 0.89), surface3: hsl(h, 0.78, 0.84),
      hg: `linear-gradient(135deg,${bg} 0%,${hsl(h, 0.86, 0.78)} 55%,${a} 135%)`,
      glow: `0 0 0 1px ${hsl(h, 0.60, 0.55, 0.22)},0 18px 44px ${hsl(h, 0.70, 0.40, 0.22)}`,
    }
  }

  // Dark is the full repaint: the ground is the hue, and the card goes DARKER
  // than the ground rather than lighter, which is what keeps a saturated room
  // from swallowing the figures printed on it.
  const bg = tint(h, S * 0.90, 0.055)
  return {
    ...accents,
    bg, cardBg: tint(h, S * 0.94, 0.018, 0.97),
    bg3: tint(h, S * 0.92, 0.030), bg4: tint(h, S * 0.90, 0.042),
    border: hsl(h, S * 0.70, 0.52, 0.34),
    ink: tint(h, S, 0.012), ink2: tint(h, S * 0.90, 0.024),
    text: tint(h, 0.30, 0.90), text2: tint(h, 0.38, 0.70),
    textMuted: tint(h, 0.44, 0.55), textSub: tint(h, 0.48, 0.45),
    surface1: tint(h, S * 0.70, 0.035), surface2: tint(h, S * 0.72, 0.048), surface3: tint(h, S * 0.74, 0.075),
    hg: `linear-gradient(135deg,${bg} 0%,${tint(h, S * 0.90, 0.038)} 55%,${a} 135%)`,
    glow: `0 0 0 1px ${hsl(h, 0.90, 0.62, 0.30)},0 20px 54px ${hsl(h, S, 0.10, 0.60)}`,
  }
}

// The accent arguments PALETTE was built from, so a Colorful palette can be
// derived from exactly the same source of truth rather than a second table.
const ACCENTS = {
  emerald:  { dark: ['#10b981', '#059669', '16,185,129', '5,150,105'],   light: ['#059669', '#047857', '5,150,105', '4,120,87'] },
  gold:     { dark: ['#e8b825', '#c49a1a', '232,184,37', '196,154,26'],  light: ['#8b6914', '#705210', '139,105,20', '112,82,16'] },
  silver:   { dark: ['#c0c8d8', '#8a96aa', '192,200,216', '138,150,170'], light: ['#475569', '#334155', '71,85,105', '51,65,85'] },
  bitcoin:  { dark: ['#f7931a', '#c97012', '247,147,26', '201,112,18'],  light: ['#c2590a', '#9a4508', '194,89,10', '154,69,8'] },
  ethereum: { dark: ['#627eea', '#3a57d4', '98,126,234', '58,87,212'],   light: ['#3d5bcb', '#2d47a8', '61,91,203', '45,71,168'] },
  solana:   { dark: ['#9945ff', '#7c3aed', '153,69,255', '124,58,237'],  light: ['#7c22e8', '#6418c4', '124,34,232', '100,24,196'] },
}

// Built on first use and kept: the maths is cheap but applyTheme runs on every
// theme, mode and intensity change and there is no reason to redo it.
const COLORFUL_CACHE = {}
function colorfulPalette(id, mode) {
  const key = `${id}:${mode}`
  if (!COLORFUL_CACHE[key]) {
    const acc = (ACCENTS[id] || ACCENTS.emerald)[mode] || (ACCENTS[id] || ACCENTS.emerald).dark
    COLORFUL_CACHE[key] = colorful(mode, acc[0], acc[1], acc[2], acc[3])
  }
  return COLORFUL_CACHE[key]
}

export const INTENSITIES = ['refined', 'colorful']

// CSS variables written as inline styles on <html> — these always win over any
// stylesheet rule including index.css fallbacks (inline style > specificity).
// The previous approach also wrote a <style> tag with a :root block, which was
// redundant (same vars, lower specificity) and caused a second style recalculation
// on every theme change. Dropped in favour of a single setProperty pass.
// The single place a look is resolved, exported so both branches are testable
// without exposing the palette tables themselves.
export function paletteFor(id, mode, intensity) {
  const m = mode === 'light' ? 'light' : 'dark'
  const known = PALETTE[id] ? id : 'emerald'
  return intensity === 'colorful' ? colorfulPalette(known, m) : PALETTE[known][m]
}

function applyTheme(id, mode, intensity) {
  const p = paletteFor(id, mode, intensity)
  const r = document.documentElement
  r.style.setProperty('--g',            p.g)
  r.style.setProperty('--gd',           p.gd)
  r.style.setProperty('--g-rgb',        p.gRgb)
  r.style.setProperty('--gd-rgb',       p.gdRgb)
  r.style.setProperty('--gl',           p.gl)
  r.style.setProperty('--ink3',         p.ink3)
  r.style.setProperty('--bg',           p.bg)
  r.style.setProperty('--card-bg',      p.cardBg)
  r.style.setProperty('--bg2',          p.cardBg)
  r.style.setProperty('--bg3',          p.bg3)
  r.style.setProperty('--bg4',          p.bg4)
  r.style.setProperty('--border',       p.border)
  r.style.setProperty('--ink',          p.ink)
  r.style.setProperty('--ink2',         p.ink2)
  r.style.setProperty('--text',         p.text)
  r.style.setProperty('--text2',        p.text2)
  r.style.setProperty('--text-muted',   p.textMuted)
  r.style.setProperty('--text-sub',     p.textSub)
  r.style.setProperty('--surface-1',    p.surface1)
  r.style.setProperty('--surface-2',    p.surface2)
  r.style.setProperty('--surface-3',    p.surface3)
  r.style.setProperty('--accent',       p.accent)
  r.style.setProperty('--accent2',      p.accent2)
  r.style.setProperty('--accent3',      p.accent)
  r.style.setProperty('--accent-bg',    p.accentBg)
  r.style.setProperty('--accent2-bg',   p.accentBg)
  r.style.setProperty('--accent3-bg',   p.accentBg)
  r.style.setProperty('--green',        p.green)
  r.style.setProperty('--green-bg',     p.greenBg)
  r.style.setProperty('--shadow-glow',  p.glow)
  r.style.setProperty('--header-gradient',     p.hg)
  r.style.setProperty('--header-gradient-alt', p.hga)
  r.style.setProperty('--mesh-1',       p.mesh1)
  r.style.setProperty('--mesh-2',       p.mesh2)
  r.style.setProperty('--mesh-3',       p.mesh3)
  document.body.style.background = p.bg
  document.body.style.color = p.text
  document.body.style.transition = 'background 0.35s,color 0.35s'
  if (mode === 'light') {
    r.setAttribute('data-wl-light', 'true')
  } else {
    r.removeAttribute('data-wl-light')
  }
  // Colorful's coin watermark is pure CSS keyed off these two attributes, so
  // no component changes and nothing at all renders for Refined users.
  if (intensity === 'colorful') {
    const mark = (THEMES.find(t => t.id === id) || THEMES[0]).mark
    r.setAttribute('data-wl-colorful', 'true')
    r.setAttribute('data-wl-theme', id)
    r.style.setProperty('--wl-motif', `url("${mark}")`)
  } else {
    r.removeAttribute('data-wl-colorful')
    r.removeAttribute('data-wl-theme')
    r.style.removeProperty('--wl-motif')
  }
  document.dispatchEvent(new CustomEvent('wl-theme'))
}

const ThemeContext = createContext({
  theme: 'emerald', mode: 'light', intensity: 'refined',
  setTheme: () => {}, setMode: () => {}, setIntensity: () => {},
})

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('wl_theme') || 'emerald')
  const [mode, setModeState]   = useState(() => localStorage.getItem('wl_mode')  || 'light')
  // Unset means Refined, so every existing user keeps exactly the interface
  // they have today and only an explicit opt-in turns Colorful on.
  const [intensity, setIntensityState] = useState(
    () => (localStorage.getItem('wl_intensity') === 'colorful' ? 'colorful' : 'refined'))

  // Refs hold the current state values so the stable callbacks below can read
  // them without closing over a stale value — avoids recreating setTheme/setMode
  // on every mode or theme change, which would force all useTheme() consumers
  // to re-render even when their own slice of state didn't change.
  const themeRef = useRef(theme)
  themeRef.current = theme
  const modeRef = useRef(mode)
  modeRef.current = mode
  const intensityRef = useRef(intensity)
  intensityRef.current = intensity

  const setTheme = useCallback((id) => {
    setThemeState(id)
    localStorage.setItem('wl_theme', id)
    applyTheme(id, modeRef.current, intensityRef.current)
  }, []) // stable — never recreated

  const setMode = useCallback((m) => {
    setModeState(m)
    localStorage.setItem('wl_mode', m)
    applyTheme(themeRef.current, m, intensityRef.current)
  }, []) // stable — never recreated

  const setIntensity = useCallback((i) => {
    const next = i === 'colorful' ? 'colorful' : 'refined'
    setIntensityState(next)
    localStorage.setItem('wl_intensity', next)
    applyTheme(themeRef.current, modeRef.current, next)
  }, []) // stable — never recreated

  useEffect(() => { applyTheme(theme, mode, intensity) }, []) // eslint-disable-line

  const value = useMemo(
    () => ({ theme, mode, intensity, setTheme, setMode, setIntensity }),
    [theme, mode, intensity, setTheme, setMode, setIntensity])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
