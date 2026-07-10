import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'
import Icon from '../components/Icon'
import { BiometricToggle } from '../components/BiometricLock'
import { applySettings as _applySettings } from '../settingsUtils'
import { useTheme, THEMES as COLOR_THEMES } from '../ThemeContext'
import InstallExtension from '../components/InstallExtension'

const SETTINGS_KEY = 'wl_settings'

const FONT_SIZES = [
  { id: 'sm',  label: 'Small',  size: '14px' },
  { id: 'md',  label: 'Medium', size: '16px' },
  { id: 'lg',  label: 'Large',  size: '18px' },
]

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } catch { return {} }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

export { applySettings } from '../settingsUtils'

export default function Settings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(loadSettings)
  const { theme: colorTheme, mode: colorMode, setTheme: setColorTheme, setMode: setColorMode } = useTheme()
  useEffect(() => { track('settings_view') }, [])

  function update(key, val) {
    const next = { ...settings, [key]: val }
    setSettings(next)
    saveSettings(next)
    _applySettings()
    track('settings_change', { key, val })
  }

  const fontSize = settings.fontSize || 'md'
  const compactMode = settings.compactMode ?? false
  const hideValues  = settings.hideValues  ?? false
  const showTicker  = !(settings.hideTicker ?? false)

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <h2 style={{ margin:0, fontSize:'1.2rem', display:'inline-flex', alignItems:'center', gap:'0.45rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Settings
        </h2>
      </div>

      {/* ── Browser extension ── */}
      <InstallExtension variant="banner" source="settings" style={{ marginBottom: '1rem' }} />

      {/* ── Appearance ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="sliders" size={16} />Appearance</h3>

        {/* Color Theme */}
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.6rem' }}>
          <div className="settings-label">
            <span>Color Theme</span>
            <span className="settings-hint">Changes accent colors across the app</span>
          </div>
          <div className="settings-chips" style={{ flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-start' }}>
            {COLOR_THEMES.map(t => (
              <button key={t.id}
                className={`settings-chip ${colorTheme === t.id ? 'active' : ''}`}
                onClick={() => { setColorTheme(t.id); track('theme_changed', { theme: t.id, source: 'settings' }) }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="settings-chip-swatch" style={{
                  background: `radial-gradient(circle at 35% 35%, ${t.light}, ${t.swatch})`,
                  border: colorTheme === t.id ? '2px solid white' : '2px solid transparent',
                  fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', padding: 0,
                }}>
                  {t.logo
                    ? <img src={t.logo} alt={t.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : null}
                </span>
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider"/>

        {/* Light / Dark mode */}
        <div className="settings-row">
          <div className="settings-label">
            <span>Mode</span>
            <span className="settings-hint">Light or dark background</span>
          </div>
          <div className="settings-chips">
            {[{ id: 'dark', label: 'Dark', icon: 'moon' }, { id: 'light', label: 'Light', icon: 'sun' }].map(m => (
              <button key={m.id}
                className={`settings-chip ${colorMode === m.id ? 'active' : ''}`}
                onClick={() => { setColorMode(m.id); track('mode_changed', { mode: m.id, source: 'settings' }) }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Icon name={m.icon} size={15} />
                {m.label}
              </button>
            ))}
          </div>
        </div>


        <div className="settings-divider"/>

        <div className="settings-row">
          <div className="settings-label">
            <span>Font Size</span>
            <span className="settings-hint">Text scale across the app</span>
          </div>
          <div className="settings-chips">
            {FONT_SIZES.map(f => (
              <button key={f.id}
                className={`settings-chip ${fontSize === f.id ? 'active' : ''}`}
                onClick={() => update('fontSize', f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider"/>

        <div className="settings-row settings-row-toggle">
          <div className="settings-label">
            <span>Compact Mode</span>
            <span className="settings-hint">Tighter spacing, more on screen</span>
          </div>
          <button className={`settings-toggle ${compactMode ? 'on' : ''}`} onClick={() => update('compactMode', !compactMode)}>
            <span className="settings-toggle-thumb"/>
          </button>
        </div>

        <div className="settings-divider"/>

        <div className="settings-row settings-row-toggle">
          <div className="settings-label">
            <span>Hide Values</span>
            <span className="settings-hint">Blur portfolio amounts by default</span>
          </div>
          <button className={`settings-toggle ${hideValues ? 'on' : ''}`} onClick={() => update('hideValues', !hideValues)}>
            <span className="settings-toggle-thumb"/>
          </button>
        </div>

        <div className="settings-divider"/>

        <div className="settings-row settings-row-toggle">
          <div className="settings-label">
            <span>Price Ticker</span>
            <span className="settings-hint">Scrolling live prices at the top</span>
          </div>
          <button className={`settings-toggle ${showTicker ? 'on' : ''}`} onClick={() => update('hideTicker', showTicker)}>
            <span className="settings-toggle-thumb"/>
          </button>
        </div>
      </div>

      {/* ── Security ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="lock" size={16} />Security</h3>
        <BiometricToggle />
      </div>

      {/* ── About ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>About</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem', fontSize:'0.85rem', color:'var(--text-muted)' }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span>Version</span><span style={{ color:'var(--text)' }}>1.0.0</span>
          </div>
          <div className="settings-divider"/>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span>Data storage</span><span style={{ color: 'var(--g-ink)', fontWeight: 700 }}>100% local · never uploaded</span>
          </div>
          <div className="settings-divider"/>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span>API keys</span><span style={{ color:'var(--text)' }}>Stored in your browser only</span>
          </div>
          <div className="settings-divider"/>
          <div style={{ display:'flex', gap:'1rem', marginTop:'0.25rem' }}>
            <a href="/privacy" style={{ color: 'var(--g-ink)', fontWeight: 700, textDecoration:'none' }}>Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  )
}
