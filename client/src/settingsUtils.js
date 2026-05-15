const SETTINGS_KEY = 'wl_settings'

const THEMES = [
  { id: 'dark',   bg: '#040d0a', card: '#0d1f14' },
  { id: 'amoled', bg: '#000000', card: '#0a0f0a' },
  { id: 'navy',   bg: '#050a18', card: '#0d1630' },
  { id: 'purple', bg: '#0d0714', card: '#150d24' },
]

const ACCENTS = [
  { id: 'green',  color: '#34d399' },
  { id: 'blue',   color: '#38bdf8' },
  { id: 'purple', color: '#a78bfa' },
  { id: 'gold',   color: '#fbbf24' },
  { id: 'red',    color: '#f87171' },
  { id: 'white',  color: '#e2e8f0' },
]

const FONT_SIZES = [
  { id: 'sm', size: '14px' },
  { id: 'md', size: '16px' },
  { id: 'lg', size: '18px' },
]

export function applySettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    const root = document.documentElement
    const theme  = THEMES.find(t => t.id === s.theme)  || THEMES[0]
    const accent = ACCENTS.find(a => a.id === s.accent) || ACCENTS[0]
    const font   = FONT_SIZES.find(f => f.id === s.fontSize) || FONT_SIZES[1]
    root.style.setProperty('--bg', theme.bg)
    root.style.setProperty('--card-bg', theme.card)
    root.style.setProperty('--accent', accent.color)
    root.style.setProperty('--accent-dim', accent.color + '22')
    root.style.setProperty('--font-size-base', font.size)
  } catch {}
}
