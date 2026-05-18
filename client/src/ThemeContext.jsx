import { createContext, useContext, useEffect, useState } from 'react'

export const THEMES = [
  { id: 'emerald',  name: 'Emerald',  swatch: '#34d399', light: '#a7f3d0', icon: '🟢' },
  { id: 'gold',     name: 'Gold',     swatch: '#f5c542', light: '#fde68a', icon: '🥇' },
  { id: 'silver',   name: 'Silver',   swatch: '#c0c8d8', light: '#e8ecf4', icon: '🥈' },
  { id: 'bitcoin',  name: 'Bitcoin',  swatch: '#f7931a', light: '#fed7aa', icon: '₿'  },
  { id: 'ethereum', name: 'Ethereum', swatch: '#627eea', light: '#c7d2fe', icon: 'Ξ'  },
]

const VARS = {
  emerald: {
    '--g': '#34d399', '--gd': '#10b981', '--gl': 'rgba(52,211,153,0.12)',
    '--ink3': 'rgba(52,211,153,0.55)',
    '--bg': '#0e0f14', '--card-bg': 'rgba(20,21,30,0.92)', '--bg2': 'rgba(20,21,30,0.92)',
    '--bg3': '#13141c', '--bg4': '#191a24',
    '--border': 'rgba(52,211,153,0.38)',
    '--ink': '#09090e', '--ink2': '#13141c',
    '--text2': 'rgba(52,211,153,0.75)',
    '--accent': '#34d399', '--accent2': '#10b981', '--accent3': '#34d399',
    '--accent-bg': 'rgba(52,211,153,0.12)', '--accent2-bg': 'rgba(16,185,129,0.12)', '--accent3-bg': 'rgba(52,211,153,0.12)',
    '--green': '#34d399', '--green-bg': 'rgba(52,211,153,0.14)',
    '--header-gradient': 'linear-gradient(135deg,#09090e 0%,#191a24 50%,#34d399 110%)',
    '--header-gradient-alt': 'linear-gradient(135deg,#34d399 0%,#10b981 100%)',
    '--mesh-1': 'rgba(52,211,153,0.06)', '--mesh-2': 'rgba(16,185,129,0.04)', '--mesh-3': 'rgba(52,211,153,0.05)',
    '--shadow-glow': '0 0 0 1px rgba(52,211,153,0.25),0 0 40px rgba(52,211,153,0.15)',
  },
  gold: {
    '--g': '#f5c542', '--gd': '#d4a017', '--gl': 'rgba(245,197,66,0.12)',
    '--ink3': 'rgba(245,197,66,0.55)',
    '--bg': '#0e0c07', '--card-bg': 'rgba(22,19,8,0.94)', '--bg2': 'rgba(22,19,8,0.94)',
    '--bg3': '#16130a', '--bg4': '#1e1a0d',
    '--border': 'rgba(245,197,66,0.35)',
    '--ink': '#0a0802', '--ink2': '#16130a',
    '--text2': 'rgba(245,197,66,0.75)',
    '--accent': '#f5c542', '--accent2': '#d4a017', '--accent3': '#f5c542',
    '--accent-bg': 'rgba(245,197,66,0.12)', '--accent2-bg': 'rgba(212,160,23,0.12)', '--accent3-bg': 'rgba(245,197,66,0.12)',
    '--green': '#f5c542', '--green-bg': 'rgba(245,197,66,0.14)',
    '--header-gradient': 'linear-gradient(135deg,#0a0802 0%,#1e1a0d 50%,#f5c542 110%)',
    '--header-gradient-alt': 'linear-gradient(135deg,#f5c542 0%,#d4a017 100%)',
    '--mesh-1': 'rgba(245,197,66,0.06)', '--mesh-2': 'rgba(212,160,23,0.04)', '--mesh-3': 'rgba(245,197,66,0.05)',
    '--shadow-glow': '0 0 0 1px rgba(245,197,66,0.25),0 0 40px rgba(245,197,66,0.15)',
  },
  silver: {
    '--g': '#c0c8d8', '--gd': '#8a96aa', '--gl': 'rgba(192,200,216,0.12)',
    '--ink3': 'rgba(192,200,216,0.55)',
    '--bg': '#0a0b0e', '--card-bg': 'rgba(16,17,22,0.94)', '--bg2': 'rgba(16,17,22,0.94)',
    '--bg3': '#10111a', '--bg4': '#16182a',
    '--border': 'rgba(192,200,216,0.30)',
    '--ink': '#060608', '--ink2': '#10111a',
    '--text2': 'rgba(192,200,216,0.70)',
    '--accent': '#c0c8d8', '--accent2': '#8a96aa', '--accent3': '#c0c8d8',
    '--accent-bg': 'rgba(192,200,216,0.10)', '--accent2-bg': 'rgba(138,150,170,0.10)', '--accent3-bg': 'rgba(192,200,216,0.10)',
    '--green': '#c0c8d8', '--green-bg': 'rgba(192,200,216,0.12)',
    '--header-gradient': 'linear-gradient(135deg,#060608 0%,#16182a 50%,#c0c8d8 110%)',
    '--header-gradient-alt': 'linear-gradient(135deg,#c0c8d8 0%,#8a96aa 100%)',
    '--mesh-1': 'rgba(192,200,216,0.05)', '--mesh-2': 'rgba(138,150,170,0.03)', '--mesh-3': 'rgba(192,200,216,0.04)',
    '--shadow-glow': '0 0 0 1px rgba(192,200,216,0.20),0 0 40px rgba(192,200,216,0.12)',
  },
  bitcoin: {
    '--g': '#f7931a', '--gd': '#c97012', '--gl': 'rgba(247,147,26,0.12)',
    '--ink3': 'rgba(247,147,26,0.55)',
    '--bg': '#0d0805', '--card-bg': 'rgba(20,14,6,0.94)', '--bg2': 'rgba(20,14,6,0.94)',
    '--bg3': '#140e06', '--bg4': '#1c1209',
    '--border': 'rgba(247,147,26,0.35)',
    '--ink': '#090501', '--ink2': '#140e06',
    '--text2': 'rgba(247,147,26,0.75)',
    '--accent': '#f7931a', '--accent2': '#c97012', '--accent3': '#f7931a',
    '--accent-bg': 'rgba(247,147,26,0.12)', '--accent2-bg': 'rgba(201,112,18,0.12)', '--accent3-bg': 'rgba(247,147,26,0.12)',
    '--green': '#f7931a', '--green-bg': 'rgba(247,147,26,0.14)',
    '--header-gradient': 'linear-gradient(135deg,#090501 0%,#1c1209 50%,#f7931a 110%)',
    '--header-gradient-alt': 'linear-gradient(135deg,#f7931a 0%,#c97012 100%)',
    '--mesh-1': 'rgba(247,147,26,0.06)', '--mesh-2': 'rgba(201,112,18,0.04)', '--mesh-3': 'rgba(247,147,26,0.05)',
    '--shadow-glow': '0 0 0 1px rgba(247,147,26,0.25),0 0 40px rgba(247,147,26,0.15)',
  },
  ethereum: {
    '--g': '#627eea', '--gd': '#3a57d4', '--gl': 'rgba(98,126,234,0.12)',
    '--ink3': 'rgba(98,126,234,0.55)',
    '--bg': '#07090f', '--card-bg': 'rgba(10,13,24,0.94)', '--bg2': 'rgba(10,13,24,0.94)',
    '--bg3': '#0d1020', '--bg4': '#121628',
    '--border': 'rgba(98,126,234,0.35)',
    '--ink': '#040510', '--ink2': '#0d1020',
    '--text2': 'rgba(98,126,234,0.75)',
    '--accent': '#627eea', '--accent2': '#3a57d4', '--accent3': '#627eea',
    '--accent-bg': 'rgba(98,126,234,0.12)', '--accent2-bg': 'rgba(58,87,212,0.12)', '--accent3-bg': 'rgba(98,126,234,0.12)',
    '--green': '#627eea', '--green-bg': 'rgba(98,126,234,0.14)',
    '--header-gradient': 'linear-gradient(135deg,#040510 0%,#121628 50%,#627eea 110%)',
    '--header-gradient-alt': 'linear-gradient(135deg,#627eea 0%,#3a57d4 100%)',
    '--mesh-1': 'rgba(98,126,234,0.06)', '--mesh-2': 'rgba(58,87,212,0.04)', '--mesh-3': 'rgba(98,126,234,0.05)',
    '--shadow-glow': '0 0 0 1px rgba(98,126,234,0.25),0 0 40px rgba(98,126,234,0.15)',
  },
}

function applyTheme(id) {
  const vars = VARS[id] || VARS.emerald
  const root = document.documentElement
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
}

const ThemeContext = createContext({ theme: 'emerald', setTheme: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('wl_theme') || 'emerald')

  const setTheme = (id) => {
    setThemeState(id)
    localStorage.setItem('wl_theme', id)
    applyTheme(id)
  }

  // Apply on mount
  useEffect(() => { applyTheme(theme) }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
