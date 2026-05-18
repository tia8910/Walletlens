import { createContext, useContext, useEffect, useState } from 'react'

export const THEMES = [
  { id: 'emerald',  name: 'Emerald',  swatch: '#34d399', light: '#a7f3d0', icon: '🟢' },
  { id: 'gold',     name: 'Gold',     swatch: '#f5c542', light: '#fde68a', icon: '🥇' },
  { id: 'silver',   name: 'Silver',   swatch: '#c0c8d8', light: '#e8ecf4', icon: '🥈' },
  { id: 'bitcoin',  name: 'Bitcoin',  swatch: '#f7931a', light: '#fed7aa', icon: '₿'  },
  { id: 'ethereum', name: 'Ethereum', swatch: '#627eea', light: '#c7d2fe', icon: 'Ξ'  },
]

const ThemeContext = createContext({ theme: 'emerald', setTheme: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('wl_theme') || 'emerald')

  const setTheme = (id) => {
    setThemeState(id)
    localStorage.setItem('wl_theme', id)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Apply on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
