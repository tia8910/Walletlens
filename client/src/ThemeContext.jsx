import { createContext, useContext, useEffect, useState } from 'react'

const GOLD_BAR_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect x='3' y='15' width='34' height='13' rx='2' fill='%23c49a08'/%3E%3Crect x='3' y='15' width='34' height='7' rx='2' fill='%23f7d44a'/%3E%3Crect x='7' y='18' width='26' height='7' rx='1' fill='none' stroke='rgba(0,0,0,0.18)' stroke-width='0.7'/%3E%3Ctext x='20' y='25' font-size='7' fill='rgba(0,0,0,0.55)' text-anchor='middle' font-family='Georgia,serif' font-weight='bold'%3EAu%3C/text%3E%3C/svg%3E`

const SILVER_BAR_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect x='3' y='15' width='34' height='13' rx='2' fill='%23808898'/%3E%3Crect x='3' y='15' width='34' height='7' rx='2' fill='%23e8ecf4'/%3E%3Crect x='7' y='18' width='26' height='7' rx='1' fill='none' stroke='rgba(0,0,0,0.14)' stroke-width='0.7'/%3E%3Ctext x='20' y='25' font-size='7' fill='rgba(0,0,0,0.5)' text-anchor='middle' font-family='Georgia,serif' font-weight='bold'%3EAg%3C/text%3E%3C/svg%3E`

const SOLANA_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%231a0a2e'/%3E%3Cpath d='M6,31L28,31L34,25L12,25Z' fill='%239945ff'/%3E%3Cpath d='M6,23L28,23L34,17L12,17Z' fill='%239945ff'/%3E%3Cpath d='M6,15L28,15L34,9L12,9Z' fill='%239945ff'/%3E%3C/svg%3E`

export const THEMES = [
  { id: 'emerald',  name: 'Emerald',  swatch: '#00ffaa', light: '#a7f3d0', icon: '🟢' },
  { id: 'gold',     name: 'Gold',     swatch: '#f5c542', light: '#fde68a', icon: '🥇', logo: GOLD_BAR_SVG },
  { id: 'silver',   name: 'Silver',   swatch: '#c0c8d8', light: '#e8ecf4', icon: '🥈', logo: SILVER_BAR_SVG },
  { id: 'bitcoin',  name: 'Bitcoin',  swatch: '#f7931a', light: '#fed7aa', icon: '₿'  },
  { id: 'ethereum', name: 'Ethereum', swatch: '#627eea', light: '#c7d2fe', icon: 'Ξ',  logo: 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/eth.svg' },
  { id: 'solana',   name: 'Solana',   swatch: '#9945ff', light: '#d8b4fe', icon: '◎',  logo: SOLANA_SVG },
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
    dark:  variant(DARK_BASE,  '#f5c542', '#d4a017', '245,197,66', '212,160,23'),
    light: variant(LIGHT_BASE, '#b45309', '#92400e', '180,83,9', '146,64,14'),
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

function buildCSS(p) {
  return `:root {
    --g:${p.g};--gd:${p.gd};--g-rgb:${p.gRgb};--gd-rgb:${p.gdRgb};
    --gl:${p.gl};--ink3:${p.ink3};
    --bg:${p.bg};--card-bg:${p.cardBg};--bg2:${p.cardBg};--bg3:${p.bg3};--bg4:${p.bg4};
    --border:${p.border};--ink:${p.ink};--ink2:${p.ink2};
    --text:${p.text};--text2:${p.text2};
    --text-muted:${p.textMuted};--text-sub:${p.textSub};
    --surface-1:${p.surface1};--surface-2:${p.surface2};--surface-3:${p.surface3};
    --accent:${p.accent};--accent2:${p.accent2};--accent3:${p.accent};
    --accent-bg:${p.accentBg};--accent2-bg:${p.accentBg};--accent3-bg:${p.accentBg};
    --green:${p.green};--green-bg:${p.greenBg};
    --header-gradient:${p.hg};--header-gradient-alt:${p.hga};
    --mesh-1:${p.mesh1};--mesh-2:${p.mesh2};--mesh-3:${p.mesh3};
    --shadow-glow:${p.glow};
  }`
}

function applyTheme(id, mode) {
  const theme = PALETTE[id] || PALETTE.emerald
  const p = theme[mode] || theme.dark
  let el = document.getElementById('wl-theme-vars')
  if (!el) {
    el = document.createElement('style')
    el.id = 'wl-theme-vars'
    document.head.appendChild(el)
  }
  el.textContent = buildCSS(p)
  // index.css defines fallback :root vars — inline styles must override them.
  const r = document.documentElement
  const vars = {
    '--g': p.g, '--gd': p.gd, '--g-rgb': p.gRgb, '--gd-rgb': p.gdRgb,
    '--gl': p.gl, '--ink3': p.ink3,
    '--bg': p.bg, '--card-bg': p.cardBg, '--bg2': p.cardBg, '--bg3': p.bg3, '--bg4': p.bg4,
    '--border': p.border, '--ink': p.ink, '--ink2': p.ink2,
    '--text': p.text, '--text2': p.text2,
    '--text-muted': p.textMuted, '--text-sub': p.textSub,
    '--surface-1': p.surface1, '--surface-2': p.surface2, '--surface-3': p.surface3,
    '--accent': p.accent, '--accent2': p.accent2, '--accent3': p.accent,
    '--accent-bg': p.accentBg, '--green': p.green, '--green-bg': p.greenBg,
    '--shadow-glow': p.glow,
    '--header-gradient': p.hg, '--header-gradient-alt': p.hga,
    '--mesh-1': p.mesh1, '--mesh-2': p.mesh2, '--mesh-3': p.mesh3,
  }
  for (const [k, v] of Object.entries(vars)) r.style.setProperty(k, v)
  document.body.style.background = p.bg
  document.body.style.color = p.text
  document.body.style.transition = 'background 0.35s,color 0.35s'
  if (mode === 'light') {
    r.setAttribute('data-wl-light', 'true')
  } else {
    r.removeAttribute('data-wl-light')
  }
  // Notify consumers (e.g. canvas animations) that the palette has changed.
  document.dispatchEvent(new CustomEvent('wl-theme'))
}

const ThemeContext = createContext({ theme: 'emerald', mode: 'light', setTheme: () => {}, setMode: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('wl_theme') || 'emerald')
  const [mode, setModeState]   = useState(() => localStorage.getItem('wl_mode')  || 'dark')

  const setTheme = (id) => {
    setThemeState(id)
    localStorage.setItem('wl_theme', id)
    applyTheme(id, mode)
  }

  const setMode = (m) => {
    setModeState(m)
    localStorage.setItem('wl_mode', m)
    applyTheme(theme, m)
  }

  useEffect(() => { applyTheme(theme, mode) }, []) // eslint-disable-line

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
