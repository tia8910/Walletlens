import { createContext, useContext, useEffect, useState } from 'react'

export const THEMES = [
  { id: 'emerald',  name: 'Emerald',  swatch: '#00ff84', light: '#a7f3d0', icon: '🟢' },
  { id: 'gold',     name: 'Gold',     swatch: '#f5c542', light: '#fde68a', icon: '🥇' },
  { id: 'silver',   name: 'Silver',   swatch: '#c0c8d8', light: '#e8ecf4', icon: '🥈' },
  { id: 'bitcoin',  name: 'Bitcoin',  swatch: '#f7931a', light: '#fed7aa', icon: '₿'  },
  { id: 'ethereum', name: 'Ethereum', swatch: '#627eea', light: '#c7d2fe', icon: 'Ξ' },
  { id: 'solana',   name: 'Solana',   swatch: '#9945ff', light: '#d8b4fe', icon: '◎' },
]

const PALETTE = {
  emerald: {
    dark: {
      g: '#00ff84', gd: '#00cc6a', gRgb: '0,255,132', gdRgb: '0,204,106',
      gl: 'rgba(0,255,132,0.10)', ink3: 'rgba(0,255,132,0.55)',
      bg: '#080f0c', cardBg: 'rgba(14,22,18,0.92)',
      bg3: '#0d1610', bg4: '#122018',
      border: 'rgba(0,255,132,0.35)',
      ink: '#050a07', ink2: '#0d1610',
      text: '#ffffff', text2: 'rgba(0,255,132,0.75)',
      textMuted: 'rgba(255,255,255,0.5)', textSub: 'rgba(255,255,255,0.3)',
      surface1: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.08)', surface3: 'rgba(255,255,255,0.13)',
      accent: '#00ff84', accent2: '#00cc6a', accentBg: 'rgba(0,255,132,0.09)',
      green: '#00ff84', greenBg: 'rgba(0,255,132,0.10)',
      hg: 'linear-gradient(135deg,#050a07 0%,#122018 50%,#00ff84 110%)',
      hga: 'linear-gradient(135deg,#00ff84 0%,#00cc6a 100%)',
      mesh1: 'rgba(0,255,132,0.05)', mesh2: 'rgba(0,204,106,0.03)', mesh3: 'rgba(0,255,132,0.04)',
      glow: '0 0 0 1px rgba(0,255,132,0.25),0 0 40px rgba(0,255,132,0.15)',
    },
    light: {
      g: '#00b85a', gd: '#008f45', gRgb: '0,184,90', gdRgb: '0,143,69',
      gl: 'rgba(0,184,90,0.08)', ink3: 'rgba(0,184,90,0.5)',
      bg: '#f0faf5', cardBg: 'rgba(255,255,255,0.95)',
      bg3: '#e4f4ec', bg4: '#d6ede3',
      border: 'rgba(0,184,90,0.28)',
      ink: '#daf0e5', ink2: '#e4f4ec',
      text: '#0f1a14', text2: 'rgba(0,184,90,0.85)',
      textMuted: 'rgba(15,26,20,0.5)', textSub: 'rgba(15,26,20,0.35)',
      surface1: 'rgba(0,0,0,0.04)', surface2: 'rgba(0,0,0,0.07)', surface3: 'rgba(0,0,0,0.11)',
      accent: '#00b85a', accent2: '#008f45', accentBg: 'rgba(0,184,90,0.07)',
      green: '#00b85a', greenBg: 'rgba(0,184,90,0.08)',
      hg: 'linear-gradient(135deg,#daf0e5 0%,#d6ede3 50%,#00b85a 110%)',
      hga: 'linear-gradient(135deg,#00b85a 0%,#008f45 100%)',
      mesh1: 'rgba(0,184,90,0.04)', mesh2: 'rgba(0,143,69,0.03)', mesh3: 'rgba(0,184,90,0.03)',
      glow: '0 0 0 1px rgba(0,184,90,0.2),0 0 32px rgba(0,184,90,0.12)',
    },
  },
  gold: {
    dark: {
      g: '#f5c542', gd: '#d4a017', gRgb: '245,197,66', gdRgb: '212,160,23',
      gl: 'rgba(245,197,66,0.12)', ink3: 'rgba(245,197,66,0.55)',
      bg: '#0d0a02', cardBg: 'rgba(20,16,4,0.94)',
      bg3: '#18130a', bg4: '#221c0e',
      border: 'rgba(245,197,66,0.35)',
      ink: '#080600', ink2: '#18130a',
      text: '#ffffff', text2: 'rgba(245,197,66,0.75)',
      textMuted: 'rgba(255,255,255,0.5)', textSub: 'rgba(255,255,255,0.3)',
      surface1: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.08)', surface3: 'rgba(255,255,255,0.13)',
      accent: '#f5c542', accent2: '#d4a017', accentBg: 'rgba(245,197,66,0.12)',
      green: '#f5c542', greenBg: 'rgba(245,197,66,0.14)',
      hg: 'linear-gradient(135deg,#080600 0%,#221c0e 50%,#f5c542 110%)',
      hga: 'linear-gradient(135deg,#f5c542 0%,#d4a017 100%)',
      mesh1: 'rgba(245,197,66,0.06)', mesh2: 'rgba(212,160,23,0.04)', mesh3: 'rgba(245,197,66,0.05)',
      glow: '0 0 0 1px rgba(245,197,66,0.25),0 0 40px rgba(245,197,66,0.15)',
    },
    light: {
      g: '#b45309', gd: '#92400e', gRgb: '180,83,9', gdRgb: '146,64,14',
      gl: 'rgba(180,83,9,0.12)', ink3: 'rgba(180,83,9,0.5)',
      bg: '#fef9ed', cardBg: 'rgba(255,255,255,0.95)',
      bg3: '#faf0d0', bg4: '#f5e5b8',
      border: 'rgba(180,83,9,0.28)',
      ink: '#fef3d0', ink2: '#faf0d0',
      text: '#1c1100', text2: 'rgba(180,83,9,0.85)',
      textMuted: 'rgba(28,17,0,0.5)', textSub: 'rgba(28,17,0,0.35)',
      surface1: 'rgba(0,0,0,0.04)', surface2: 'rgba(0,0,0,0.07)', surface3: 'rgba(0,0,0,0.11)',
      accent: '#b45309', accent2: '#92400e', accentBg: 'rgba(180,83,9,0.1)',
      green: '#b45309', greenBg: 'rgba(180,83,9,0.12)',
      hg: 'linear-gradient(135deg,#fef3d0 0%,#f5e5b8 50%,#b45309 110%)',
      hga: 'linear-gradient(135deg,#b45309 0%,#92400e 100%)',
      mesh1: 'rgba(180,83,9,0.07)', mesh2: 'rgba(146,64,14,0.04)', mesh3: 'rgba(180,83,9,0.05)',
      glow: '0 0 0 1px rgba(180,83,9,0.2),0 0 32px rgba(180,83,9,0.12)',
    },
  },
  silver: {
    dark: {
      g: '#c0c8d8', gd: '#8a96aa', gRgb: '192,200,216', gdRgb: '138,150,170',
      gl: 'rgba(192,200,216,0.12)', ink3: 'rgba(192,200,216,0.55)',
      bg: '#07080d', cardBg: 'rgba(12,13,20,0.94)',
      bg3: '#0d0f18', bg4: '#141724',
      border: 'rgba(192,200,216,0.30)',
      ink: '#040508', ink2: '#0d0f18',
      text: '#ffffff', text2: 'rgba(192,200,216,0.70)',
      textMuted: 'rgba(255,255,255,0.5)', textSub: 'rgba(255,255,255,0.3)',
      surface1: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.08)', surface3: 'rgba(255,255,255,0.13)',
      accent: '#c0c8d8', accent2: '#8a96aa', accentBg: 'rgba(192,200,216,0.10)',
      green: '#c0c8d8', greenBg: 'rgba(192,200,216,0.12)',
      hg: 'linear-gradient(135deg,#040508 0%,#141724 50%,#c0c8d8 110%)',
      hga: 'linear-gradient(135deg,#c0c8d8 0%,#8a96aa 100%)',
      mesh1: 'rgba(192,200,216,0.05)', mesh2: 'rgba(138,150,170,0.03)', mesh3: 'rgba(192,200,216,0.04)',
      glow: '0 0 0 1px rgba(192,200,216,0.20),0 0 40px rgba(192,200,216,0.12)',
    },
    light: {
      g: '#475569', gd: '#334155', gRgb: '71,85,105', gdRgb: '51,65,85',
      gl: 'rgba(71,85,105,0.12)', ink3: 'rgba(71,85,105,0.5)',
      bg: '#f2f4f8', cardBg: 'rgba(255,255,255,0.95)',
      bg3: '#e8ecf3', bg4: '#dde2ec',
      border: 'rgba(71,85,105,0.25)',
      ink: '#e8ecf3', ink2: '#dde2ec',
      text: '#0d1117', text2: 'rgba(71,85,105,0.85)',
      textMuted: 'rgba(13,17,23,0.5)', textSub: 'rgba(13,17,23,0.35)',
      surface1: 'rgba(0,0,0,0.04)', surface2: 'rgba(0,0,0,0.07)', surface3: 'rgba(0,0,0,0.11)',
      accent: '#475569', accent2: '#334155', accentBg: 'rgba(71,85,105,0.1)',
      green: '#475569', greenBg: 'rgba(71,85,105,0.12)',
      hg: 'linear-gradient(135deg,#e2e8f0 0%,#dde2ec 50%,#475569 110%)',
      hga: 'linear-gradient(135deg,#475569 0%,#334155 100%)',
      mesh1: 'rgba(71,85,105,0.07)', mesh2: 'rgba(51,65,85,0.04)', mesh3: 'rgba(71,85,105,0.05)',
      glow: '0 0 0 1px rgba(71,85,105,0.2),0 0 32px rgba(71,85,105,0.1)',
    },
  },
  bitcoin: {
    dark: {
      g: '#f7931a', gd: '#c97012', gRgb: '247,147,26', gdRgb: '201,112,18',
      gl: 'rgba(247,147,26,0.12)', ink3: 'rgba(247,147,26,0.55)',
      bg: '#0e0703', cardBg: 'rgba(22,12,4,0.94)',
      bg3: '#1a0f05', bg4: '#23160a',
      border: 'rgba(247,147,26,0.35)',
      ink: '#090400', ink2: '#1a0f05',
      text: '#ffffff', text2: 'rgba(247,147,26,0.75)',
      textMuted: 'rgba(255,255,255,0.5)', textSub: 'rgba(255,255,255,0.3)',
      surface1: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.08)', surface3: 'rgba(255,255,255,0.13)',
      accent: '#f7931a', accent2: '#c97012', accentBg: 'rgba(247,147,26,0.12)',
      green: '#f7931a', greenBg: 'rgba(247,147,26,0.14)',
      hg: 'linear-gradient(135deg,#090400 0%,#23160a 50%,#f7931a 110%)',
      hga: 'linear-gradient(135deg,#f7931a 0%,#c97012 100%)',
      mesh1: 'rgba(247,147,26,0.06)', mesh2: 'rgba(201,112,18,0.04)', mesh3: 'rgba(247,147,26,0.05)',
      glow: '0 0 0 1px rgba(247,147,26,0.25),0 0 40px rgba(247,147,26,0.15)',
    },
    light: {
      g: '#c2590a', gd: '#9a4508', gRgb: '194,89,10', gdRgb: '154,69,8',
      gl: 'rgba(194,89,10,0.12)', ink3: 'rgba(194,89,10,0.5)',
      bg: '#fdf5ec', cardBg: 'rgba(255,255,255,0.95)',
      bg3: '#faebd4', bg4: '#f5deba',
      border: 'rgba(194,89,10,0.28)',
      ink: '#faebd4', ink2: '#f5deba',
      text: '#1a0d00', text2: 'rgba(194,89,10,0.85)',
      textMuted: 'rgba(26,13,0,0.5)', textSub: 'rgba(26,13,0,0.35)',
      surface1: 'rgba(0,0,0,0.04)', surface2: 'rgba(0,0,0,0.07)', surface3: 'rgba(0,0,0,0.11)',
      accent: '#c2590a', accent2: '#9a4508', accentBg: 'rgba(194,89,10,0.1)',
      green: '#c2590a', greenBg: 'rgba(194,89,10,0.12)',
      hg: 'linear-gradient(135deg,#faebd4 0%,#f5deba 50%,#c2590a 110%)',
      hga: 'linear-gradient(135deg,#c2590a 0%,#9a4508 100%)',
      mesh1: 'rgba(194,89,10,0.07)', mesh2: 'rgba(154,69,8,0.04)', mesh3: 'rgba(194,89,10,0.05)',
      glow: '0 0 0 1px rgba(194,89,10,0.2),0 0 32px rgba(194,89,10,0.12)',
    },
  },
  ethereum: {
    dark: {
      g: '#627eea', gd: '#3a57d4', gRgb: '98,126,234', gdRgb: '58,87,212',
      gl: 'rgba(98,126,234,0.12)', ink3: 'rgba(98,126,234,0.55)',
      bg: '#05070f', cardBg: 'rgba(9,11,22,0.94)',
      bg3: '#0b0e1e', bg4: '#10152c',
      border: 'rgba(98,126,234,0.35)',
      ink: '#030410', ink2: '#0b0e1e',
      text: '#ffffff', text2: 'rgba(98,126,234,0.75)',
      textMuted: 'rgba(255,255,255,0.5)', textSub: 'rgba(255,255,255,0.3)',
      surface1: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.08)', surface3: 'rgba(255,255,255,0.13)',
      accent: '#627eea', accent2: '#3a57d4', accentBg: 'rgba(98,126,234,0.12)',
      green: '#627eea', greenBg: 'rgba(98,126,234,0.14)',
      hg: 'linear-gradient(135deg,#030410 0%,#10152c 50%,#627eea 110%)',
      hga: 'linear-gradient(135deg,#627eea 0%,#3a57d4 100%)',
      mesh1: 'rgba(98,126,234,0.06)', mesh2: 'rgba(58,87,212,0.04)', mesh3: 'rgba(98,126,234,0.05)',
      glow: '0 0 0 1px rgba(98,126,234,0.25),0 0 40px rgba(98,126,234,0.15)',
    },
    light: {
      g: '#3d5bcb', gd: '#2d47a8', gRgb: '61,91,203', gdRgb: '45,71,168',
      gl: 'rgba(61,91,203,0.12)', ink3: 'rgba(61,91,203,0.5)',
      bg: '#f0f3fd', cardBg: 'rgba(255,255,255,0.95)',
      bg3: '#e4eaf9', bg4: '#d6e0f5',
      border: 'rgba(61,91,203,0.28)',
      ink: '#e4eaf9', ink2: '#d6e0f5',
      text: '#080e1f', text2: 'rgba(61,91,203,0.85)',
      textMuted: 'rgba(8,14,31,0.5)', textSub: 'rgba(8,14,31,0.35)',
      surface1: 'rgba(0,0,0,0.04)', surface2: 'rgba(0,0,0,0.07)', surface3: 'rgba(0,0,0,0.11)',
      accent: '#3d5bcb', accent2: '#2d47a8', accentBg: 'rgba(61,91,203,0.1)',
      green: '#3d5bcb', greenBg: 'rgba(61,91,203,0.12)',
      hg: 'linear-gradient(135deg,#d6e0f5 0%,#e4eaf9 50%,#3d5bcb 110%)',
      hga: 'linear-gradient(135deg,#3d5bcb 0%,#2d47a8 100%)',
      mesh1: 'rgba(61,91,203,0.07)', mesh2: 'rgba(45,71,168,0.04)', mesh3: 'rgba(61,91,203,0.05)',
      glow: '0 0 0 1px rgba(61,91,203,0.2),0 0 32px rgba(61,91,203,0.12)',
    },
  },
  solana: {
    dark: {
      g: '#9945ff', gd: '#7c3aed', gRgb: '153,69,255', gdRgb: '124,58,237',
      gl: 'rgba(153,69,255,0.12)', ink3: 'rgba(153,69,255,0.55)',
      bg: '#0a070f', cardBg: 'rgba(22,10,40,0.90)',
      bg3: '#120a1e', bg4: '#180d28',
      border: 'rgba(153,69,255,0.38)',
      ink: '#060408', ink2: '#120a1e',
      text: '#ffffff', text2: 'rgba(153,69,255,0.80)',
      textMuted: 'rgba(255,255,255,0.5)', textSub: 'rgba(255,255,255,0.3)',
      surface1: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.08)', surface3: 'rgba(255,255,255,0.13)',
      accent: '#9945ff', accent2: '#7c3aed', accentBg: 'rgba(153,69,255,0.12)',
      green: '#9945ff', greenBg: 'rgba(153,69,255,0.14)',
      hg: 'linear-gradient(135deg,#060408 0%,#180d28 50%,#9945ff 110%)',
      hga: 'linear-gradient(135deg,#9945ff 0%,#14f195 100%)',
      mesh1: 'rgba(153,69,255,0.07)', mesh2: 'rgba(20,241,149,0.04)', mesh3: 'rgba(153,69,255,0.05)',
      glow: '0 0 0 1px rgba(153,69,255,0.28),0 0 40px rgba(153,69,255,0.18)',
    },
    light: {
      g: '#7c22e8', gd: '#6418c4', gRgb: '124,34,232', gdRgb: '100,24,196',
      gl: 'rgba(124,34,232,0.12)', ink3: 'rgba(124,34,232,0.5)',
      bg: '#f5f0fd', cardBg: 'rgba(255,255,255,0.95)',
      bg3: '#ece5fa', bg4: '#e0d5f7',
      border: 'rgba(124,34,232,0.28)',
      ink: '#ece5fa', ink2: '#e0d5f7',
      text: '#110820', text2: 'rgba(124,34,232,0.85)',
      textMuted: 'rgba(17,8,32,0.5)', textSub: 'rgba(17,8,32,0.35)',
      surface1: 'rgba(0,0,0,0.04)', surface2: 'rgba(0,0,0,0.07)', surface3: 'rgba(0,0,0,0.11)',
      accent: '#7c22e8', accent2: '#6418c4', accentBg: 'rgba(124,34,232,0.1)',
      green: '#7c22e8', greenBg: 'rgba(124,34,232,0.12)',
      hg: 'linear-gradient(135deg,#e0d5f7 0%,#ece5fa 50%,#7c22e8 110%)',
      hga: 'linear-gradient(135deg,#7c22e8 0%,#6418c4 100%)',
      mesh1: 'rgba(124,34,232,0.07)', mesh2: 'rgba(100,24,196,0.04)', mesh3: 'rgba(124,34,232,0.05)',
      glow: '0 0 0 1px rgba(124,34,232,0.22),0 0 32px rgba(124,34,232,0.14)',
    },
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
  // Toggle light-mode attribute for CSS overrides
  if (mode === 'light') {
    r.setAttribute('data-wl-light', 'true')
  } else {
    r.removeAttribute('data-wl-light')
  }
}

const ThemeContext = createContext({ theme: 'emerald', mode: 'light', setTheme: () => {}, setMode: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('wl_theme') || 'emerald')
  const [mode, setModeState]   = useState(() => localStorage.getItem('wl_mode')  || 'light')

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
