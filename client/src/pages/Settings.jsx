import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'
import { BiometricToggle } from '../components/BiometricLock'
import { applySettings as _applySettings } from '../settingsUtils'

const SETTINGS_KEY = 'wl_settings'

const THEMES = [
  { id: 'dark',   label: 'Dark',   bg: '#040d0a' },
  { id: 'amoled', label: 'AMOLED', bg: '#000000' },
  { id: 'navy',   label: 'Navy',   bg: '#050a18' },
  { id: 'purple', label: 'Purple', bg: '#0d0714' },
]

const ACCENTS = [
  { id: 'green',  label: 'Green',  color: '#34d399' },
  { id: 'blue',   label: 'Blue',   color: '#38bdf8' },
  { id: 'purple', label: 'Purple', color: '#a78bfa' },
  { id: 'gold',   label: 'Gold',   color: '#fbbf24' },
  { id: 'red',    label: 'Red',    color: '#f87171' },
  { id: 'white',  label: 'White',  color: '#e2e8f0' },
]

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
  useEffect(() => { track('settings_view') }, [])

  function update(key, val) {
    const next = { ...settings, [key]: val }
    setSettings(next)
    saveSettings(next)
    _applySettings()
    track('settings_change', { key, val })
  }

  const theme  = settings.theme  || 'dark'
  const accent = settings.accent || 'green'
  const fontSize = settings.fontSize || 'md'
  const notifPrice  = settings.notifPrice  ?? true
  const notifNews   = settings.notifNews   ?? true
  const notifWhale  = settings.notifWhale  ?? false
  const notifWeekly = settings.notifWeekly ?? true
  const compactMode = settings.compactMode ?? false
  const hideValues  = settings.hideValues  ?? false

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <h2 style={{ margin:0, fontSize:'1.2rem' }}>⚙️ Settings</h2>
      </div>

      {/* ── Appearance ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title">🎨 Appearance</h3>

        <div className="settings-row">
          <div className="settings-label">
            <span>Theme</span>
            <span className="settings-hint">Background style</span>
          </div>
          <div className="settings-chips">
            {THEMES.map(t => (
              <button key={t.id}
                className={`settings-chip ${theme === t.id ? 'active' : ''}`}
                style={theme === t.id ? { '--chip-active': 'var(--accent)' } : {}}
                onClick={() => update('theme', t.id)}>
                <span className="settings-chip-swatch" style={{ background: t.bg, border: `2px solid ${theme === t.id ? 'var(--accent, #34d399)' : '#333'}` }}/>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider"/>

        <div className="settings-row">
          <div className="settings-label">
            <span>Accent Color</span>
            <span className="settings-hint">Highlights, buttons, charts</span>
          </div>
          <div className="settings-chips">
            {ACCENTS.map(a => (
              <button key={a.id}
                className={`settings-chip ${accent === a.id ? 'active' : ''}`}
                onClick={() => update('accent', a.id)}>
                <span className="settings-chip-swatch" style={{ background: a.color, border: accent === a.id ? `2px solid white` : '2px solid transparent' }}/>
                {a.label}
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
      </div>

      {/* ── Notifications ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title">🔔 Notifications</h3>

        {[
          { key:'notifPrice',  label:'Price Alerts',     hint:'When your target prices are hit',        val: notifPrice },
          { key:'notifNews',   label:'News Highlights',  hint:'Breaking crypto news for your coins',    val: notifNews },
          { key:'notifWhale',  label:'Whale Alerts',     hint:'Large transactions on coins you hold',   val: notifWhale },
          { key:'notifWeekly', label:'Weekly Report',    hint:'Sunday summary of your portfolio',       val: notifWeekly },
        ].map((item, i) => (
          <div key={item.key}>
            {i > 0 && <div className="settings-divider"/>}
            <div className="settings-row settings-row-toggle">
              <div className="settings-label">
                <span>{item.label}</span>
                <span className="settings-hint">{item.hint}</span>
              </div>
              <button className={`settings-toggle ${item.val ? 'on' : ''}`}
                onClick={() => update(item.key, !item.val)}>
                <span className="settings-toggle-thumb"/>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Security ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title">🔒 Security</h3>
        <BiometricToggle />
      </div>

      {/* ── About ── */}
      <div className="settings-section glass-card">
        <h3 className="settings-section-title">ℹ️ About</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem', fontSize:'0.85rem', color:'rgba(255,255,255,0.55)' }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span>Version</span><span style={{ color:'white' }}>1.0.0</span>
          </div>
          <div className="settings-divider"/>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span>Data storage</span><span style={{ color:'#34d399' }}>100% local · never uploaded</span>
          </div>
          <div className="settings-divider"/>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span>API keys</span><span style={{ color:'white' }}>Stored in your browser only</span>
          </div>
          <div className="settings-divider"/>
          <div style={{ display:'flex', gap:'1rem', marginTop:'0.25rem' }}>
            <a href="/privacy" style={{ color:'var(--accent, #34d399)', textDecoration:'none' }}>Privacy Policy</a>
            <a href="https://x.com/walletlenss" target="_blank" rel="noopener noreferrer" style={{ color:'var(--accent, #34d399)', textDecoration:'none' }}>@walletlenss</a>
          </div>
        </div>
      </div>
    </div>
  )
}
