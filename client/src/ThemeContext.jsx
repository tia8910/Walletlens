import { createContext, useContext, useEffect, useState } from 'react'

export const THEMES = [
  { id: 'emerald',  name: 'Emerald',  swatch: '#34d399', light: '#a7f3d0', icon: '🟢' },
  { id: 'gold',     name: 'Gold',     swatch: '#f5c542', light: '#fde68a', icon: '🥇' },
  { id: 'silver',   name: 'Silver',   swatch: '#c0c8d8', light: '#e8ecf4', icon: '🥈' },
  { id: 'bitcoin',  name: 'Bitcoin',  swatch: '#f7931a', light: '#fed7aa', icon: '₿'  },
  { id: 'ethereum', name: 'Ethereum', swatch: '#627eea', light: '#c7d2fe', icon: 'Ξ', logo: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  { id: 'solana',   name: 'Solana',   swatch: '#9945ff', light: '#d8b4fe', icon: '◎', logo: 'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
]

const PALETTE = {
  emerald: {
    g: '#34d399', gd: '#10b981', gRgb: '52,211,153', gdRgb: '16,185,129',
    gl: 'rgba(52,211,153,0.12)', ink3: 'rgba(52,211,153,0.55)',
    bg: '#0e0f14', cardBg: 'rgba(10,28,18,0.88)',
    bg3: '#13141c', bg4: '#191a24',
    border: 'rgba(52,211,153,0.38)',
    ink: '#09090e', ink2: '#13141c', text2: 'rgba(52,211,153,0.75)',
    accent: '#34d399', accent2: '#10b981', accentBg: 'rgba(52,211,153,0.12)',
    green: '#34d399', greenBg: 'rgba(52,211,153,0.14)',
    hg: 'linear-gradient(135deg,#09090e 0%,#191a24 50%,#34d399 110%)',
    hga: 'linear-gradient(135deg,#34d399 0%,#10b981 100%)',
    mesh1: 'rgba(52,211,153,0.06)', mesh2: 'rgba(16,185,129,0.04)', mesh3: 'rgba(52,211,153,0.05)',
    glow: '0 0 0 1px rgba(52,211,153,0.25),0 0 40px rgba(52,211,153,0.15)',
  },
  gold: {
    g: '#f5c542', gd: '#d4a017', gRgb: '245,197,66', gdRgb: '212,160,23',
    gl: 'rgba(245,197,66,0.12)', ink3: 'rgba(245,197,66,0.55)',
    bg: '#0e0c07', cardBg: 'rgba(38,28,4,0.88)',
    bg3: '#16130a', bg4: '#1e1a0d',
    border: 'rgba(245,197,66,0.35)',
    ink: '#0a0802', ink2: '#16130a', text2: 'rgba(245,197,66,0.75)',
    accent: '#f5c542', accent2: '#d4a017', accentBg: 'rgba(245,197,66,0.12)',
    green: '#f5c542', greenBg: 'rgba(245,197,66,0.14)',
    hg: 'linear-gradient(135deg,#0a0802 0%,#1e1a0d 50%,#f5c542 110%)',
    hga: 'linear-gradient(135deg,#f5c542 0%,#d4a017 100%)',
    mesh1: 'rgba(245,197,66,0.06)', mesh2: 'rgba(212,160,23,0.04)', mesh3: 'rgba(245,197,66,0.05)',
    glow: '0 0 0 1px rgba(245,197,66,0.25),0 0 40px rgba(245,197,66,0.15)',
  },
  silver: {
    g: '#c0c8d8', gd: '#8a96aa', gRgb: '192,200,216', gdRgb: '138,150,170',
    gl: 'rgba(192,200,216,0.12)', ink3: 'rgba(192,200,216,0.55)',
    bg: '#0a0b0e', cardBg: 'rgba(16,20,36,0.88)',
    bg3: '#10111a', bg4: '#16182a',
    border: 'rgba(192,200,216,0.30)',
    ink: '#060608', ink2: '#10111a', text2: 'rgba(192,200,216,0.70)',
    accent: '#c0c8d8', accent2: '#8a96aa', accentBg: 'rgba(192,200,216,0.10)',
    green: '#c0c8d8', greenBg: 'rgba(192,200,216,0.12)',
    hg: 'linear-gradient(135deg,#060608 0%,#16182a 50%,#c0c8d8 110%)',
    hga: 'linear-gradient(135deg,#c0c8d8 0%,#8a96aa 100%)',
    mesh1: 'rgba(192,200,216,0.05)', mesh2: 'rgba(138,150,170,0.03)', mesh3: 'rgba(192,200,216,0.04)',
    glow: '0 0 0 1px rgba(192,200,216,0.20),0 0 40px rgba(192,200,216,0.12)',
  },
  bitcoin: {
    g: '#f7931a', gd: '#c97012', gRgb: '247,147,26', gdRgb: '201,112,18',
    gl: 'rgba(247,147,26,0.12)', ink3: 'rgba(247,147,26,0.55)',
    bg: '#0d0805', cardBg: 'rgba(36,18,4,0.88)',
    bg3: '#140e06', bg4: '#1c1209',
    border: 'rgba(247,147,26,0.35)',
    ink: '#090501', ink2: '#140e06', text2: 'rgba(247,147,26,0.75)',
    accent: '#f7931a', accent2: '#c97012', accentBg: 'rgba(247,147,26,0.12)',
    green: '#f7931a', greenBg: 'rgba(247,147,26,0.14)',
    hg: 'linear-gradient(135deg,#090501 0%,#1c1209 50%,#f7931a 110%)',
    hga: 'linear-gradient(135deg,#f7931a 0%,#c97012 100%)',
    mesh1: 'rgba(247,147,26,0.06)', mesh2: 'rgba(201,112,18,0.04)', mesh3: 'rgba(247,147,26,0.05)',
    glow: '0 0 0 1px rgba(247,147,26,0.25),0 0 40px rgba(247,147,26,0.15)',
  },
  ethereum: {
    g: '#627eea', gd: '#3a57d4', gRgb: '98,126,234', gdRgb: '58,87,212',
    gl: 'rgba(98,126,234,0.12)', ink3: 'rgba(98,126,234,0.55)',
    bg: '#07090f', cardBg: 'rgba(8,14,40,0.88)',
    bg3: '#0d1020', bg4: '#121628',
    border: 'rgba(98,126,234,0.35)',
    ink: '#040510', ink2: '#0d1020', text2: 'rgba(98,126,234,0.75)',
    accent: '#627eea', accent2: '#3a57d4', accentBg: 'rgba(98,126,234,0.12)',
    green: '#627eea', greenBg: 'rgba(98,126,234,0.14)',
    hg: 'linear-gradient(135deg,#040510 0%,#121628 50%,#627eea 110%)',
    hga: 'linear-gradient(135deg,#627eea 0%,#3a57d4 100%)',
    mesh1: 'rgba(98,126,234,0.06)', mesh2: 'rgba(58,87,212,0.04)', mesh3: 'rgba(98,126,234,0.05)',
    glow: '0 0 0 1px rgba(98,126,234,0.25),0 0 40px rgba(98,126,234,0.15)',
  },
  solana: {
    g: '#9945ff', gd: '#7c3aed', gRgb: '153,69,255', gdRgb: '124,58,237',
    gl: 'rgba(153,69,255,0.12)', ink3: 'rgba(153,69,255,0.55)',
    bg: '#0a070f', cardBg: 'rgba(22,10,40,0.90)',
    bg3: '#120a1e', bg4: '#180d28',
    border: 'rgba(153,69,255,0.38)',
    ink: '#060408', ink2: '#120a1e', text2: 'rgba(153,69,255,0.80)',
    accent: '#9945ff', accent2: '#7c3aed', accentBg: 'rgba(153,69,255,0.12)',
    green: '#9945ff', greenBg: 'rgba(153,69,255,0.14)',
    hg: 'linear-gradient(135deg,#060408 0%,#180d28 50%,#9945ff 110%)',
    hga: 'linear-gradient(135deg,#9945ff 0%,#14f195 100%)',
    mesh1: 'rgba(153,69,255,0.07)', mesh2: 'rgba(20,241,149,0.04)', mesh3: 'rgba(153,69,255,0.05)',
    glow: '0 0 0 1px rgba(153,69,255,0.28),0 0 40px rgba(153,69,255,0.18)',
  },
}

function buildCSS(p) {
  return `:root {
    --g:${p.g};--gd:${p.gd};--g-rgb:${p.gRgb};--gd-rgb:${p.gdRgb};
    --gl:${p.gl};--ink3:${p.ink3};
    --bg:${p.bg};--card-bg:${p.cardBg};--bg2:${p.cardBg};--bg3:${p.bg3};--bg4:${p.bg4};
    --border:${p.border};--ink:${p.ink};--ink2:${p.ink2};--text2:${p.text2};
    --accent:${p.accent};--accent2:${p.accent2};--accent3:${p.accent};
    --accent-bg:${p.accentBg};--accent2-bg:${p.accentBg};--accent3-bg:${p.accentBg};
    --green:${p.green};--green-bg:${p.greenBg};
    --header-gradient:${p.hg};--header-gradient-alt:${p.hga};
    --mesh-1:${p.mesh1};--mesh-2:${p.mesh2};--mesh-3:${p.mesh3};
    --shadow-glow:${p.glow};
  }`
}

function applyTheme(id) {
  const p = PALETTE[id] || PALETTE.emerald
  // Inject style tag for broad coverage
  let el = document.getElementById('wl-theme-vars')
  if (!el) {
    el = document.createElement('style')
    el.id = 'wl-theme-vars'
    document.head.appendChild(el)
  }
  el.textContent = buildCSS(p)
  // Also set directly on :root as inline style — highest specificity, cannot be overridden
  const r = document.documentElement
  r.style.setProperty('--g', p.g)
  r.style.setProperty('--gd', p.gd)
  r.style.setProperty('--g-rgb', p.gRgb)
  r.style.setProperty('--gd-rgb', p.gdRgb)
  r.style.setProperty('--gl', p.gl)
  r.style.setProperty('--ink3', p.ink3)
  r.style.setProperty('--bg', p.bg)
  r.style.setProperty('--card-bg', p.cardBg)
  r.style.setProperty('--bg2', p.cardBg)
  r.style.setProperty('--bg3', p.bg3)
  r.style.setProperty('--bg4', p.bg4)
  r.style.setProperty('--border', p.border)
  r.style.setProperty('--accent', p.accent)
  r.style.setProperty('--accent2', p.accent2)
  r.style.setProperty('--accent3', p.accent)
  r.style.setProperty('--accent-bg', p.accentBg)
  r.style.setProperty('--green', p.green)
  r.style.setProperty('--green-bg', p.greenBg)
  r.style.setProperty('--text2', p.text2)
  r.style.setProperty('--shadow-glow', p.glow)
  r.style.setProperty('--header-gradient', p.hg)
  r.style.setProperty('--header-gradient-alt', p.hga)
  r.style.setProperty('--mesh-1', p.mesh1)
  r.style.setProperty('--mesh-2', p.mesh2)
  r.style.setProperty('--mesh-3', p.mesh3)
  document.body.style.background = p.bg
  document.body.style.transition = 'background 0.35s'
}

const ThemeContext = createContext({ theme: 'emerald', setTheme: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('wl_theme') || 'emerald')

  const setTheme = (id) => {
    setThemeState(id)
    localStorage.setItem('wl_theme', id)
    applyTheme(id)
  }

  useEffect(() => { applyTheme(theme) }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
