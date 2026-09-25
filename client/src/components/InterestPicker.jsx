import { useState, useEffect } from 'react'
import Icon from './Icon'
import { track } from '../analytics'
import sfx from '../sfx'
import { ASSET_CATEGORIES } from '../data/assets'
import { THEMES } from '../ThemeContext'
import { useLanguage } from '../LanguageContext'
import { INTERESTS_EVENT } from '../data/interestsEvent'
import './SetupScreens.css'

// Metal bar logos ("Au" / "Ag") so gold & silver match the trade category.
const GOLD_LOGO = THEMES.find(t => t.id === 'gold')?.logo || ''
const SILVER_LOGO = THEMES.find(t => t.id === 'silver')?.logo || ''
// Tether ₮ coin for stablecoins (self-contained, matches the balances step).
const USDT_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%2326a17b'/%3E%3Crect x='9' y='11' width='22' height='4.2' rx='1' fill='white'/%3E%3Crect x='17.4' y='11' width='5.2' height='20' rx='1.2' fill='white'/%3E%3Crect x='12.5' y='16.4' width='15' height='3.4' rx='1' fill='white'/%3E%3C/svg%3E"

// ── First-run "what do you track?" ──────────────────────────────────────────
// A friendly chip-cloud where a new user taps the asset classes they care
// about. The choice is stored in `wl_interests` and used to tailor the
// dashboard quick-add chips. Fully skippable.

const INTERESTS_KEY = 'wl_interests'
const DONE_KEY = 'wl_interests_done'

// Icons mirror the dashboard / trade "asset category" icons (ASSET_CATEGORIES)
// so the app feels consistent, each in its own colour, with a line of
// examples under the name so a tile says what it covers.
const C = ASSET_CATEGORIES
// id must line up with INTEREST_TO_CAT in the dashboard quick-add ordering.
const OPTIONS = [
  { id: 'crypto',      emoji: C.crypto.icon, color: '#f7931a', labelKey: 'catCrypto', ex: 'BTC, ETH, SOL…' },
  { id: 'stablecoins', img: USDT_LOGO, labelKey: 'catStablecoins', ex: 'USDT, USDC' },
  { id: 'stocks',      emoji: C.stock.icon, color: '#60a5fa', labelKey: 'catStocks', ex: 'AAPL, NVDA…' },
  { id: 'etfs',        emoji: 'package', color: '#a78bfa', labelKey: 'catEtfs', ex: 'VOO, QQQ…' },
  { id: 'gold',        img: GOLD_LOGO, emoji: C.gold.icon, labelKey: 'catGold', exKey: 'ipExMetal' },
  { id: 'silver',      img: SILVER_LOGO, emoji: C.silver.icon, labelKey: 'catSilver', exKey: 'ipExMetal' },
  { id: 'cash',        emoji: C.fiat.icon, color: '#34d399', labelKey: 'catCash', exKey: 'ipExCash' },
  { id: 'realestate',  emoji: 'home', color: '#fbbf24', labelKey: 'catRealEstate', exKey: 'ipExRealEstate' },
  { id: 'bonds',       emoji: C.bond.icon, color: '#f472b6', labelKey: 'catBonds', exKey: 'ipExBonds' },
  { id: 'commodities', emoji: 'droplet', color: '#22d3ee', labelKey: 'catCommodities', exKey: 'ipExCommodities' },
]

export default function InterestPicker({ onDone, onClose, editMode = false }) {
  const { t } = useLanguage()
  // Pre-load any existing choice so re-opening (e.g. from Settings) shows the
  // current selection. New users have nothing stored → empty, as before.
  const [selected, setSelected] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(INTERESTS_KEY) || 'null')
      return new Set(Array.isArray(v) ? v : [])
    } catch { return new Set() }
  })
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [canSkip, setCanSkip] = useState(false)

  // Delay the Skip link so users see the step before they can bail on it.
  useEffect(() => {
    const t = setTimeout(() => setCanSkip(true), 4000)
    return () => clearTimeout(t)
  }, [])

  // The welcome slides' pad carries on through setup. Not when this is
  // re-opened from Settings, where music would come out of nowhere.
  useEffect(() => (editMode ? undefined : sfx.holdAmbient()), [editMode])

  const [popped, setPopped] = useState(null)
  function toggle(id) {
    const on = !selected.has(id)
    const next = new Set(selected)
    on ? next.add(id) : next.delete(id)
    setSelected(next)
    setPopped(id + ':' + Date.now())
    // Each pick one note higher than the last.
    try { sfx.playSelect(next.size - 1, on) } catch {}
    sfx.haptic(on ? 9 : 5)
  }

  function finish(list) {
    try {
      localStorage.setItem(INTERESTS_KEY, JSON.stringify(list))
      localStorage.setItem(DONE_KEY, '1')
    } catch {}
    // Announce the change. The price strip lives in the header, which never
    // unmounts and is not re-rendered by anything that happens in here, so a
    // localStorage write is invisible to it: someone who picked stocks went on
    // watching the crypto strip until its next 60-second poll came round. That
    // is the first minute of the app, immediately after the only question it
    // asked. The same applies to re-opening this from Settings.
    //
    // An event rather than shared state because the two components have no
    // common owner short of App, and a context for one string that changes
    // twice in a lifetime is the more expensive answer.
    try {
      window.dispatchEvent(new CustomEvent(INTERESTS_EVENT, { detail: list }))
    } catch { /* very old WebView with no CustomEvent constructor */ }
    onDone?.(list)
  }

  function getStarted() {
    sfx.haptic([10, 30, 12])
    if (!editMode) { try { sfx.playWhoosh() } catch {} }
    const list = OPTIONS.filter(o => selected.has(o.id)).map(o => o.id)
    track('interests_selected', { count: list.length, interests: list.join(',') })
    finish(list)
  }

  function skip() {
    track('interests_skip')
    finish([])
  }
  function askSkip() { track('interests_skip_prompt'); setConfirmSkip(true) }

  const count = selected.size

  return (
    <div className="su-screen" role="dialog" aria-modal="true" aria-label={t('ipTitle')}>
      <div className="su-inner">
        <header className="su-hero">
          {editMode && (
            <button className="su-close" onClick={onClose || skip} aria-label={t('close')} title={t('close')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
            </button>
          )}
          <div className="su-eyebrow"><Icon name="sparkles" size={13} /> {t('ipEyebrow')}</div>
          <h1 className="su-title">{t('ipTitle')}</h1>
          <p className="su-sub">{t('ipSub')}</p>
        </header>

        <div className="su-body">
          <div className="su-tiles">
            {OPTIONS.map(o => {
              const on = selected.has(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`su-tile${on ? ' on' : ''}${popped?.startsWith(o.id + ':') ? ' pop' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggle(o.id)}
                >
                  <span className="su-tile-ck" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10"/></svg>
                  </span>
                  <span className="su-tile-ic" aria-hidden="true" style={o.color ? { color: o.color } : undefined}>
                    {o.img ? <img src={o.img} alt="" /> : <Icon name={o.emoji} size={20} />}
                  </span>
                  <span className="su-tile-name">{t(o.labelKey)}</span>
                  <span className="su-tile-ex">{o.exKey ? t(o.exKey) : o.ex}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="su-foot">
          <button className="su-cta" onClick={getStarted}>
            <span>{editMode ? t('ipSave') : t('ipGetStarted')}</span>
            {count > 0 && <span className="su-count" aria-label={t('ipSelected')(count)}>{count}</span>}
            <Icon name="arrow-right" size={17} className="su-cta-arrow" />
          </button>
          {editMode ? (
            <button className="su-ghost" onClick={onClose}>{t('cancel')}</button>
          ) : (
            <button
              className="su-ghost"
              onClick={askSkip}
              style={{ opacity: canSkip ? 1 : 0, pointerEvents: canSkip ? 'auto' : 'none' }}
            >{t('ipSkip')}</button>
          )}
        </div>
      </div>

      {confirmSkip && (
        <div className="bs-confirm-overlay" onClick={() => setConfirmSkip(false)}>
          <div className="bs-confirm-card" onClick={e => e.stopPropagation()}>
            <h4 className="bs-confirm-title">Skip personalizing?</h4>
            <p className="bs-confirm-text">
              It takes about <strong>20 seconds</strong> and tailors WalletLens to what you
              actually hold — quick-add shortcuts, the right asset types, and a dashboard that
              feels like yours. You can still change everything later.
            </p>
            <div className="bs-confirm-actions">
              <button className="bs-confirm-go" style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                onClick={() => setConfirmSkip(false)}>
                Keep setting up
              </button>
              <button className="bs-confirm-switch" onClick={skip}>Skip anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function interestsDone() {
  try { return localStorage.getItem(DONE_KEY) === '1' } catch { return false }
}
