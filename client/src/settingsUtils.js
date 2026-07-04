const SETTINGS_KEY = 'wl_settings'

const THEMES = [
  { id: 'dark',   bg: '#040d0a', card: 'rgba(13, 31, 20, 0.92)' },
  { id: 'amoled', bg: '#000000', card: 'rgba(10, 15, 10, 0.95)' },
  { id: 'navy',   bg: '#050a18', card: 'rgba(13, 22, 48, 0.92)' },
  { id: 'purple', bg: '#0d0714', card: 'rgba(21, 13, 36, 0.92)' },
]

const ACCENTS = [
  { id: 'green',  color: 'var(--g)' },
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
    const font   = FONT_SIZES.find(f => f.id === s.fontSize) || FONT_SIZES[1]
    // NOTE: theme colour, accent and background are owned entirely by
    // ThemeContext (applyTheme). This legacy helper used to also set --bg,
    // --card-bg and --accent from a separate accent picker, which fought
    // ThemeContext and reset the accent to gold / the background to dark on
    // every settings change (e.g. toggling the price ticker in light mode).
    // It now only handles what ThemeContext doesn't: font size, compact
    // spacing and ticker visibility.
    root.style.setProperty('--font-size-base', font.size)
    // The app is sized in rem, so scaling the root font-size scales all text at
    // once — this is what actually makes the Font Size setting take effect.
    root.style.fontSize = font.size
    // Compact spacing + ticker visibility are driven by CSS off these root
    // attributes, so toggling them applies instantly with no React re-render.
    root.toggleAttribute('data-compact', !!s.compactMode)
    root.toggleAttribute('data-hide-ticker', !!s.hideTicker)
  } catch {}
}
