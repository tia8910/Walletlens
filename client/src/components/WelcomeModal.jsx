import { useState, useEffect, useMemo, useRef } from 'react'
import { track } from '../analytics'
import sfx from '../sfx'
import Logo from './Logo'
import { useTheme, THEMES } from '../ThemeContext'
import { useLanguage, LANGUAGES } from '../LanguageContext'
import { useBiometricLock } from './BiometricLock'
import './WelcomeFlow.css'

const KEY = 'wl_welcomed_v2'

// A full-screen welcome: each step is a short motion graphic of the thing it
// describes, drawn in the user's own theme, so the first minute in the app
// already looks like their app. The words underneath stay short.
const STEPS = [
  { id: 'welcome',  eyebrowKey: 'obWelcomeEyebrow', titleKey: 'wxWelcomeTitle', descKey: 'wxWelcomeDesc', ctaKey: 'wmWelcomeCta' },
  { id: 'theme',    eyebrowKey: 'obThemeEyebrow',   titleKey: 'obThemeTitle',   descKey: 'wmThemeDesc',   ctaKey: 'wmThemeCta', isThemeStep: true },
  { id: 'import',   eyebrowKey: 'wxImportEyebrow',  titleKey: 'wxImportTitle',  descKey: 'wxImportDesc',  ctaKey: 'wmPortfolioCta' },
  { id: 'ai',       eyebrowKey: 'wmSmartEyebrow',   titleKey: 'wxSmartTitle',   descKey: 'wxSmartDesc',   ctaKey: 'wmSmartCta' },
  { id: 'security', eyebrowKey: 'wmSecEyebrow',     titleKey: 'wmSecTitle',     descKey: 'wmSecDesc',     ctaKey: 'wmSecCta', isSecurityStep: true },
  { id: 'go',       eyebrowKey: 'wmGoEyebrow',      titleKey: 'wmGoTitle',      descKey: 'wmGoDesc',      ctaKey: 'wmGoCta', final: true },
]

// App Lock needs the native prompt; where there is none the step is a dead end.
const stepsFor = (canLock) => canLock ? STEPS : STEPS.filter(s => !s.isSecurityStep)

const themeOf = (id) => THEMES.find(x => x.id === id) || THEMES[0]
// Emerald's swatch is a neon meant for small dots; the stage wants the app's green.
const accentOf = (th) => th.id === 'emerald' ? '#10d98a' : th.swatch

function useCount(to, dur = 1500, delay = 0) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return }
    let raf, t0
    const tm = setTimeout(() => {
      const step = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / dur); setV(to * (1 - Math.pow(1 - k, 4))); if (k < 1) raf = requestAnimationFrame(step) }
      raf = requestAnimationFrame(step)
    }, delay)
    return () => { clearTimeout(tm); cancelAnimationFrame(raf) }
  }, [to, dur, delay])
  return v
}

const money = (v) => '$' + Math.round(v).toLocaleString('en-US')

const SPARK = (() => {
  const pts = Array.from({ length: 28 }, (_, i) => [i * 300 / 27, 50 - i * 1.15 - 8 * Math.sin(i * .7) - 4 * Math.sin(i * 1.9)])
  const line = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')
  return { line, area: line + ' L300 70 L0 70 Z' }
})()

function Token({ th, children, style, className = '' }) {
  return <span className={`wx-token ${className}`} style={style}>{th?.logo ? <img src={th.logo} alt="" /> : children}</span>
}

/* ── Stage 1: everything you own, flying into one number ── */
function StageNetWorth() {
  const { t } = useLanguage()
  const total = useCount(248390, 1700, 500)
  const alloc = [
    { k: 'catCrypto', p: 38, th: themeOf('bitcoin') }, { k: 'catStocks', p: 24, label: 'AAPL' },
    { k: 'catRealEstate', p: 18, label: '⌂' }, { k: 'catGold', p: 14, th: themeOf('gold') }, { k: 'catCash', p: 6, label: '$' },
  ]
  let off = 0
  return (
    <div className="wx-stage wx-nw">
      {[themeOf('bitcoin'), themeOf('ethereum'), themeOf('solana'), themeOf('gold'), null, null].map((th, i) => (
        <Token key={i} th={th} className="wx-fly" style={{ '--i': i }}>{i === 4 ? 'AAPL' : '⌂'}</Token>
      ))}
      <div className="wx-card">
        <i className="wx-motif" />
        <div className="wx-card-h"><Logo size={20} /><span>{t('totalPortfolioValue')}</span></div>
        <div className="wx-big">{money(total)}</div>
        <div className="wx-up">▲ +$5,812 · 2.4%</div>
        <svg className="wx-spark" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true">
          <path className="ar" d={SPARK.area} /><path className="ln" d={SPARK.line} pathLength="1" />
        </svg>
        <div className="wx-alloc">
          <svg className="wx-donut" viewBox="0 0 42 42" aria-hidden="true">
            <circle className="bg" cx="21" cy="21" r="15.9" />
            {alloc.map((a, i) => { const el = <circle key={a.k} cx="21" cy="21" r="15.9" style={{ '--l': a.p, '--o': -off, '--d': `${1 + i * .15}s`, opacity: [1, .72, .5, .34, .2][i] }} />; off += a.p; return el })}
          </svg>
          <ul>{alloc.map((a, i) => (
            <li key={a.k} style={{ '--k': i }}><Token th={a.th}>{a.label}</Token><span>{t(a.k)}</span><b>{a.p}%</b></li>
          ))}</ul>
        </div>
      </div>
    </div>
  )
}

/* ── Stage 2: a live preview that repaints as you pick ── */
function StageTheme({ th }) {
  const { t } = useLanguage()
  const total = useCount(248390, 900)
  return (
    <div className="wx-stage wx-th">
      <div className="wx-phone" key={th.id}>
        <div className="wx-card wx-card-sm">
          <i className="wx-motif" />
          <div className="wx-card-h"><Logo size={16} /><span>{t('totalPortfolioValue')}</span><b className="wx-tn">{t('themeNames')?.[th.id] || th.name}</b></div>
          <div className="wx-big">{money(total)}</div>
          <svg className="wx-spark" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true">
            <path className="ar" d={SPARK.area} /><path className="ln" d={SPARK.line} pathLength="1" />
          </svg>
        </div>
        <div className="wx-ripple" />
      </div>
    </div>
  )
}

/* ── Stage 3: a screenshot read row by row, and a sentence heard ── */
function StageImport() {
  const rows = [['bitcoin', 'BTC', '0.4200'], ['ethereum', 'ETH', '3.1000'], ['solana', 'SOL', '24.00'], [null, 'AAPL', '20']]
  return (
    <div className="wx-stage wx-imp">
      <div className="wx-shot">
        <div className="wx-shot-h"><span>BINANCE</span><span>Assets</span></div>
        {rows.map(([id, sym, amt], i) => (
          <div key={sym} className="wx-row" style={{ '--i': i }}>
            <Token th={id ? themeOf(id) : null}>{sym}</Token><span>{sym}</span><b>{amt}</b><em>✓</em>
          </div>
        ))}
        <div className="wx-beam" />
        <div className="wx-found">+4 ✓</div>
      </div>
      <div className="wx-voice">
        <div className="wx-mic"><svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="2.6" width="6" height="11" rx="3" /><path d="M5.4 11.6a6.6 6.6 0 0 0 13.2 0M12 18.2v3.2" /></g></svg></div>
        <div className="wx-wave">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
        <div className="wx-said"><span>"Half a Bitcoin and 20 Apple"</span></div>
        <div className="wx-said wx-said-ar" dir="rtl" lang="ar"><span>«عندي ٥٠ جرام ذهب»</span></div>
      </div>
    </div>
  )
}

/* ── Stage 4: a chart that draws its own signals and exits ── */
const CANDLES = (() => {
  let p = 58
  return Array.from({ length: 24 }, (_, i) => {
    const o = p, c = p + (i < 9 ? 2.2 : -1.6) + Math.sin(i * 1.3) * 5
    p = c
    return { i, o, c, h: Math.max(o, c) + 3 + (i % 3), l: Math.min(o, c) - 3 - (i % 2) }
  })
})()
function StageSignals() {
  const lo_ = Math.min(...CANDLES.map(c => c.l)), hi_ = Math.max(...CANDLES.map(c => c.h))
  const y = (v) => 132 - (v - lo_) / (hi_ - lo_) * 84
  const x = (i) => 12 + i * 12.4
  const ema = 'M' + CANDLES.map(c => `${x(c.i).toFixed(1)} ${y((c.o + c.c) / 2 + 2).toFixed(1)}`).join(' L')
  const lo = CANDLES.reduce((a, b) => b.c < a.c ? b : a, CANDLES[0])
  return (
    <div className="wx-stage wx-sig">
      <svg viewBox="0 0 310 150" className="wx-chart" aria-hidden="true">
        {[['TP3', 12], ['TP2', 24], ['TP1', 36]].map(([n, yy], i) => (
          <g key={n} className="wx-lvl" style={{ '--i': i }}><line x1="0" x2="310" y1={yy} y2={yy} /><text x="304" y={yy - 4}>{n}</text></g>
        ))}
        <g className="wx-lvl wx-stop" style={{ '--i': 3 }}><line x1="0" x2="310" y1="143" y2="143" /><text x="304" y="139">STOP</text></g>
        {CANDLES.map(c => (
          <g key={c.i} className={`wx-c ${c.c >= c.o ? 'up' : 'dn'}`} style={{ '--i': c.i }}>
            <line x1={x(c.i)} x2={x(c.i)} y1={y(c.h)} y2={y(c.l)} />
            <rect x={x(c.i) - 3.8} width="7.6" y={y(Math.max(c.o, c.c))} height={Math.max(1.5, Math.abs(y(c.c) - y(c.o)))} rx="1" />
          </g>
        ))}
        <path className="wx-ema" d={ema} pathLength="1" />
        <g className="wx-pin wx-buy" style={{ '--x': `${x(4)}px`, '--y': `${y(CANDLES[4].l) + 16}px` }}><rect x="-17" y="-9" width="34" height="18" rx="9" /><text y="4">BUY</text></g>
        <g className="wx-pin wx-sell" style={{ '--x': `${x(10)}px`, '--y': `${y(CANDLES[10].h) - 16}px` }}><rect x="-19" y="-9" width="38" height="18" rx="9" /><text y="4">SELL</text></g>
        <circle className="wx-dot" cx={x(lo.i)} cy={y(lo.c)} r="4" />
      </svg>
      <div className="wx-sig-chips"><span>EMA 21/55/200</span><span>RSI</span><span>ATR</span></div>
    </div>
  )
}

/* ── Stage 5: a fingerprint drawn and scanned ── */
function StageFingerprint({ on }) {
  const arcs = [10, 17, 24, 31, 38, 45]
  return (
    <div className="wx-stage wx-fp">
      <div className={`wx-fp-ring${on ? ' ok' : ''}`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          {arcs.map((r, i) => (
            <path key={r} style={{ '--i': i }} pathLength="1"
              d={`M${60 - r} ${66 + i * 1.5} a${r} ${r * 1.12} 0 0 1 ${r * 2} 0${i % 2 ? ` v${6 + i * 2}` : ''}`} />
          ))}
          <path style={{ '--i': 6 }} pathLength="1" d="M60 58 v34" />
        </svg>
        {!on && <div className="wx-scan" />}
        {on && <div className="wx-ok">✓</div>}
      </div>
    </div>
  )
}

/* ── Stage 6: lift-off ── */
function StageLaunch() {
  return (
    <div className="wx-stage wx-go">
      {[0, 1, 2].map(i => <div key={i} className="wx-ring" style={{ '--i': i }} />)}
      <div className="wx-rocket" aria-hidden="true">🚀<i className="wx-trail" /></div>
      {Array.from({ length: 22 }, (_, i) => (
        <i key={i} className="wx-conf" style={{ '--a': `${i * 16.4}deg`, '--r': `${90 + (i * 37) % 70}px`, '--c': ['var(--ac)', '#fff', '#e8b825', '#627eea', '#f7931a', '#9945ff'][i % 6], '--d': `${.9 + (i % 5) * .08}s` }} />
      ))}
    </div>
  )
}

export default function WelcomeModal() {
  const [step, setStep]       = useState(0)
  const [visible, setVisible] = useState(false)
  const [dir, setDir]         = useState(1)
  const [bioBusy, setBioBusy] = useState(false)
  const [bioError, setBioError] = useState('')
  const [showcase, setShowcase] = useState(0)
  const touch = useRef(null)
  const { theme, mode, setTheme, setMode } = useTheme()
  const { lang, setLang, t } = useLanguage()
  const { enabled: bioEnabled, available: bioAvailable, enable: enableBio } = useBiometricLock()

  const steps = useMemo(() => stepsFor(bioAvailable), [bioAvailable])
  const s = steps[Math.min(step, steps.length - 1)]
  const total = steps.length

  // The welcome step shows off all six themes; from the theme step on, it is yours.
  const th = s.id === 'welcome' ? THEMES[showcase % THEMES.length] : themeOf(theme)
  const ac = accentOf(th)

  useEffect(() => {
    if (localStorage.getItem(KEY)) return
    const tm = setTimeout(() => setVisible(true), 700)
    return () => clearTimeout(tm)
  }, [])

  useEffect(() => {
    if (!visible || s.id !== 'welcome' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const iv = setInterval(() => setShowcase(n => n + 1), 2600)
    return () => clearInterval(iv)
  }, [visible, s.id])

  // Full screen means the page behind must not scroll under a swipe.
  useEffect(() => {
    if (!visible) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [visible])

  // Fade out the ambient pad when the welcome flow closes or unmounts.
  useEffect(() => () => sfx.stopAmbient(), [])

  async function enableBiometric() {
    if (bioBusy) return
    setBioBusy(true)
    setBioError('')
    try {
      const ok = await enableBio()
      if (ok) { track('biometric_enabled_onboarding'); next() }
      else setBioError(t('obBioSetupFailed'))
    } finally {
      setBioBusy(false)
    }
  }

  function finish() {
    localStorage.setItem(KEY, '1')
    setVisible(false)
    sfx.stopAmbient(); sfx.haptic([12, 40, 18]); sfx.playChime()
    track('welcome_modal_finished', { steps_seen: step + 1 })
    try { window.dispatchEvent(new Event('wl-welcome-done')) } catch {}
  }

  function next() {
    if (step >= total - 1) { finish(); return }
    sfx.startAmbient(); sfx.haptic(9); sfx.playWhoosh()
    setDir(1)
    setStep(n => n + 1)
    track('welcome_modal_step', { step: step + 1 })
  }

  function back() {
    if (step === 0) return
    sfx.haptic(6); sfx.playWhoosh()
    setDir(-1)
    setStep(n => n - 1)
  }

  function skip() {
    localStorage.setItem(KEY, '1')
    setVisible(false)
    sfx.stopAmbient()
    track('welcome_modal_skipped', { at_step: step })
    try { window.dispatchEvent(new Event('wl-welcome-done')) } catch {}
  }

  useEffect(() => {
    if (!visible) return
    const onKey = (e) => {
      if (e.key === 'Escape') skip()
      else if (e.key === 'ArrowRight') (document.dir === 'rtl' ? back : next)()
      else if (e.key === 'ArrowLeft') (document.dir === 'rtl' ? next : back)()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  if (!visible) return null

  const onTouchStart = (e) => { touch.current = [e.touches[0].clientX, e.touches[0].clientY] }
  const onTouchEnd = (e) => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current[0], dy = e.changedTouches[0].clientY - touch.current[1]
    touch.current = null
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return
    const forward = document.dir === 'rtl' ? dx > 0 : dx < 0
    forward ? next() : back()
  }

  const Stage = { welcome: StageNetWorth, theme: StageTheme, import: StageImport, ai: StageSignals, security: StageFingerprint, go: StageLaunch }[s.id]

  return (
    <div
      className={`wx wx-step-${s.id}`}
      role="dialog" aria-modal="true" aria-labelledby="wx-title"
      data-bar={th.id === 'gold' || th.id === 'silver' ? '' : undefined}
      style={{ '--ac': ac, '--mark': `url("${th.mark}")` }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
    >
      <div className="wx-bg" aria-hidden="true"><i /><i /><i className="wx-grid" /><i className="wx-mark" /></div>

      <div className="wx-top">
        <div className="wx-bars">
          {steps.map((_, i) => <span key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />)}
        </div>
        <div className="wx-nav">
          {step > 0 ? <button type="button" className="wx-back" onClick={back} aria-label={t('back')}>‹</button> : <span className="wx-brand"><Logo size={22} /> WalletLens</span>}
          {!s.final && <button type="button" className="wx-skip" onClick={skip}>{t('wmSkip')}</button>}
        </div>
      </div>

      <div className="wx-main" key={s.id} style={{ '--dir': dir }}>
        <Stage th={th} on={bioEnabled} />

        <div className="wx-copy">
          <div className="wx-eyebrow">{t(s.eyebrowKey)}{s.id === 'welcome' && ' WalletLens'}</div>
          <h2 id="wx-title" className="wx-title">{t(s.titleKey)}</h2>
          <p className="wx-desc">{t(s.descKey)}</p>

          {s.id === 'welcome' && (
            <div className="wx-chips">
              {['wxChipScreenshot', 'wxChipVoice', 'wxChipSignals', 'statFree'].map((k, i) => <span key={k} style={{ '--i': i }}>{t(k)}</span>)}
            </div>
          )}

          {s.isThemeStep && (
            <div className="wx-pick">
              {/* Each language is labelled in itself and carries its own dir,
                  so Arabic reads correctly while the rest is still English. */}
              <div className="wx-langs">
                {LANGUAGES.map(l => (
                  <button key={l.code} type="button" lang={l.code} dir={l.rtl ? 'rtl' : 'ltr'} aria-label={l.label} aria-pressed={lang === l.code}
                    className={lang === l.code ? 'on' : ''}
                    onClick={() => { sfx.haptic(6); sfx.playSelect(); setLang(l.code); track('language_changed', { lang: l.code, source: 'welcome' }) }}>
                    <span aria-hidden="true">{l.flag}</span>{l.native}
                  </button>
                ))}
              </div>
              <div className="wx-row2">
                <div className="wx-modes">
                  {['dark', 'light'].map(m => (
                    <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? 'on' : ''}
                      onClick={() => { sfx.startAmbient(); sfx.haptic(6); setMode(m) }}>
                      <span aria-hidden="true">{m === 'dark' ? '🌙' : '☀️'}</span>{t(m === 'dark' ? 'modeDark' : 'modeLight')}
                    </button>
                  ))}
                </div>
                <div className="wx-swatches">
                  {THEMES.map(x => (
                    <button key={x.id} type="button" aria-label={x.name} aria-pressed={theme === x.id}
                      className={theme === x.id ? 'on' : ''} style={{ '--c': accentOf(x) }}
                      onClick={() => { sfx.startAmbient(); sfx.haptic(6); sfx.playSelect(); setTheme(x.id) }}>
                      {x.logo ? <img src={x.logo} alt="" /> : <span>✦</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {s.isSecurityStep && (
            bioEnabled
              ? <div className="wx-bio-on">✓ {t('wmBioOn')}</div>
              : <button type="button" className="wx-bio" onClick={enableBiometric} disabled={bioBusy}>
                  {bioBusy ? t('obSettingUp') : t('wmEnableBio')}
                </button>
          )}
          {s.isSecurityStep && bioError && <div className="wx-err">{bioError}</div>}
        </div>
      </div>

      <div className="wx-foot">
        <button type="button" className="wx-cta" onClick={next}>
          {s.isSecurityStep && bioEnabled ? t('wsNext') : t(s.ctaKey)}
          <span aria-hidden="true" className="wx-arrow">→</span>
        </button>
      </div>
    </div>
  )
}
