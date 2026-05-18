import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { track } from '../analytics'
import CoinLogo from './CoinLogo'

// ── Storage ────────────────────────────────────────────────────────────────
const SK_ALERTS  = 'wl_smart_alerts'
const SK_CONFIG  = 'wl_smart_alerts_config'
const SK_SEEN    = 'wl_smart_alerts_seen'
const POLL_MS    = 90_000   // 90s between correlation checks
const MAX_STORED = 50       // keep last 50 alerts

function loadAlerts()  { try { return JSON.parse(localStorage.getItem(SK_ALERTS) || '[]') } catch { return [] } }
function saveAlerts(a) { try { localStorage.setItem(SK_ALERTS, JSON.stringify(a.slice(0, MAX_STORED))) } catch {} }
function loadConfig()  { try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(SK_CONFIG) || '{}') } } catch { return DEFAULT_CONFIG } }
function saveConfig(c) { try { localStorage.setItem(SK_CONFIG, JSON.stringify(c)) } catch {} }
function markSeen(id)  { try { const s = new Set(JSON.parse(localStorage.getItem(SK_SEEN) || '[]')); s.add(id); localStorage.setItem(SK_SEEN, JSON.stringify([...s].slice(-200))) } catch {} }
function loadSeen()    { try { return new Set(JSON.parse(localStorage.getItem(SK_SEEN) || '[]')) } catch { return new Set() } }

const DEFAULT_CONFIG = {
  enabled: true,
  minSignals: 2,           // fire when this many signals align
  minWhaleUsd: 500_000,    // minimum whale transfer USD
  watchBtc: true,
  watchEth: true,
  momentumPct: 4,          // price moved >X% in 24h
  volumeRatio: 0.08,       // vol/marketcap > X (anomalous volume)
  newsHours: 4,            // news published within X hours
  watchAllHoldings: true,  // monitor all held coins
}

// ── Notifications ──────────────────────────────────────────────────────────
function reqPermission() {
  if (!('Notification' in window)) return Promise.resolve('denied')
  if (Notification.permission === 'granted') return Promise.resolve('granted')
  return Notification.requestPermission()
}
function fireNotif(title, body) {
  if (Notification.permission !== 'granted') return
  try { new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico' }) } catch {}
}
function playAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[660, 880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      const t = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0.18, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      osc.start(t); osc.stop(t + 0.36)
    })
  } catch {}
}

// ── Signal helpers ──────────────────────────────────────────────────────────
function fmtUsd(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

const SIGNAL_META = {
  whale:      { icon: '🐋', color: '#38bdf8', label: 'Whale Move'   },
  momentum:   { icon: '🚀', color: '#a78bfa', label: 'Momentum'     },
  volume:     { icon: '📊', color: '#fb923c', label: 'Vol Anomaly'  },
  news:       { icon: '📰', color: '#4ade80', label: 'Breaking News' },
}

// ── Correlation engine (pure function, no side-effects) ────────────────────
function correlate({ holdings, whales, marketSnap, newsArticles, cfg, seenIds }) {
  if (!holdings.length) return []

  const now = Date.now()
  const newsMaxAge = cfg.newsHours * 3_600_000
  const newAlerts = []

  // Build a map of coinId → market data
  const marketMap = {}
  for (const m of (marketSnap || [])) marketMap[m.id] = m

  // Which coins to watch
  const watchCoins = holdings.map(h => ({
    id: h.coin_id,
    symbol: (h.coin_symbol || '').toUpperCase(),
    name: h.coin_name || h.coin_id,
    image: h.image,
  }))

  for (const coin of watchCoins) {
    const signals = []
    const mkt = marketMap[coin.id]

    // ── Signal 1: Whale move (BTC or ETH only from on-chain data) ──
    if (cfg.watchBtc && coin.symbol === 'BTC') {
      const bigWhales = (whales || []).filter(w => w.chain === 'BTC' && w.usd >= cfg.minWhaleUsd)
      if (bigWhales.length > 0) {
        const biggest = bigWhales[0]
        signals.push({
          type: 'whale',
          desc: `Whale moved ${fmtUsd(biggest.usd)} BTC on-chain`,
          usd: biggest.usd,
          extra: `${biggest.amount.toFixed(2)} BTC`,
        })
      }
    }
    if (cfg.watchEth && coin.symbol === 'ETH') {
      const bigWhales = (whales || []).filter(w => w.chain === 'ETH' && w.usd >= cfg.minWhaleUsd)
      if (bigWhales.length > 0) {
        const biggest = bigWhales[0]
        signals.push({
          type: 'whale',
          desc: `Whale moved ${fmtUsd(biggest.usd)} ETH on-chain`,
          usd: biggest.usd,
          extra: `${biggest.amount.toFixed(2)} ETH`,
        })
      }
    }

    // ── Signal 2: Price momentum ──
    if (mkt) {
      const chg24 = mkt.price_change_percentage_24h || 0
      const chg1h = mkt.price_change_percentage_1h_in_currency || 0
      if (Math.abs(chg24) >= cfg.momentumPct) {
        const dir = chg24 > 0 ? '🟢' : '🔴'
        signals.push({
          type: 'momentum',
          desc: `${dir} ${chg24 > 0 ? '+' : ''}${chg24.toFixed(1)}% in 24h`,
          chg: chg24,
          chg1h,
          price: mkt.current_price,
        })
      } else if (Math.abs(chg1h) >= cfg.momentumPct / 2) {
        // 1h momentum is worth half the threshold
        const dir = chg1h > 0 ? '🟢' : '🔴'
        signals.push({
          type: 'momentum',
          desc: `${dir} ${chg1h > 0 ? '+' : ''}${chg1h.toFixed(1)}% in 1h`,
          chg: chg1h,
          chg1h,
          price: mkt.current_price,
        })
      }
    }

    // ── Signal 3: Volume anomaly ──
    if (mkt && mkt.market_cap > 0) {
      const ratio = mkt.total_volume / mkt.market_cap
      if (ratio >= cfg.volumeRatio) {
        signals.push({
          type: 'volume',
          desc: `Volume ${(ratio * 100).toFixed(0)}% of market cap`,
          ratio,
          volume: mkt.total_volume,
        })
      }
    }

    // ── Signal 4: Breaking news ──
    const coinKeywords = [
      coin.symbol.toLowerCase(),
      coin.name.toLowerCase(),
      coin.id.toLowerCase(),
    ]
    const recentNews = (newsArticles || []).filter(a => {
      const age = now - new Date(a.pubDate).getTime()
      if (age > newsMaxAge || age < 0) return false
      const text = `${a.title} ${a.description || ''}`.toLowerCase()
      return coinKeywords.some(kw => kw.length > 2 && text.includes(kw))
    })
    if (recentNews.length > 0) {
      signals.push({
        type: 'news',
        desc: recentNews[0].title.slice(0, 72) + (recentNews[0].title.length > 72 ? '…' : ''),
        source: recentNews[0].source,
        url: recentNews[0].link,
        count: recentNews.length,
      })
    }

    // ── Fire if enough signals align ──
    if (signals.length < cfg.minSignals) continue

    // Dedupe: hash = coinId + signal types
    const hash = `${coin.id}:${signals.map(s => s.type).sort().join(',')}`
    if (seenIds.has(hash)) continue

    newAlerts.push({
      id: hash,
      coinId: coin.id,
      coinSymbol: coin.symbol,
      coinName: coin.name,
      coinImage: coin.image,
      signals,
      signalCount: signals.length,
      firedAt: new Date().toISOString(),
      dismissed: false,
      price: marketMap[coin.id]?.current_price,
    })
  }

  return newAlerts
}

// Top coins to watch when no holdings are provided (market-wide mode)
const TOP_COINS = [
  { id: 'bitcoin',  coin_id: 'bitcoin',  coin_symbol: 'BTC', coin_name: 'Bitcoin',  image: '' },
  { id: 'ethereum', coin_id: 'ethereum', coin_symbol: 'ETH', coin_name: 'Ethereum', image: '' },
  { id: 'solana',   coin_id: 'solana',   coin_symbol: 'SOL', coin_name: 'Solana',   image: '' },
  { id: 'ripple',   coin_id: 'ripple',   coin_symbol: 'XRP', coin_name: 'XRP',      image: '' },
  { id: 'binancecoin', coin_id: 'binancecoin', coin_symbol: 'BNB', coin_name: 'BNB', image: '' },
  { id: 'dogecoin', coin_id: 'dogecoin', coin_symbol: 'DOGE', coin_name: 'Dogecoin', image: '' },
]

// ── Main component ─────────────────────────────────────────────────────────
export default function SmartAlerts({ enriched = [], prices = {} }) {
  const marketMode = enriched.length === 0
  const [alerts, setAlerts]       = useState(loadAlerts)
  const [cfg, setCfg]             = useState(loadConfig)
  const [showCfg, setShowCfg]     = useState(false)
  const [toast, setToast]         = useState(null)
  const [checking, setChecking]   = useState(false)
  const [lastCheck, setLastCheck] = useState(null)
  const timerRef = useRef(null)
  const seenRef  = useRef(loadSeen())

  const unread = alerts.filter(a => !a.dismissed).length

  // Persist config
  useEffect(() => { saveConfig(cfg) }, [cfg])

  const runCheck = useCallback(async () => {
    if (!cfg.enabled) return
    const watchList = enriched.length > 0 ? enriched : TOP_COINS
    setChecking(true)
    try {
      const [whales, marketSnap] = await Promise.all([
        api.getWhaleAlertFeed(cfg.minWhaleUsd).catch(() => []),
        api.getWhaleMarketSnapshot().catch(() => []),
      ])

      let newsArticles = []
      try {
        const r = await fetch(`/news.json?t=${Math.floor(Date.now() / 3_600_000)}`)
        if (r.ok) newsArticles = (await r.json()).articles || []
      } catch {}

      const newOnes = correlate({
        holdings: watchList,
        whales,
        marketSnap,
        newsArticles,
        cfg,
        seenIds: seenRef.current,
      })

      if (newOnes.length > 0) {
        for (const a of newOnes) {
          seenRef.current.add(a.id)
          markSeen(a.id)
        }
        setAlerts(prev => {
          const merged = [...newOnes, ...prev].slice(0, MAX_STORED)
          saveAlerts(merged)
          return merged
        })
        const top = newOnes[0]
        const title = `⚡ ${top.coinSymbol} — ${top.signalCount}-Signal Alert`
        const body  = top.signals.map(s => s.desc).join(' · ')
        fireNotif(title, body)
        playAlarm()
        setToast({ title, body })
        setTimeout(() => setToast(null), 6000)
        track('smart_alert_fired', { coin: top.coinId, signals: top.signalCount })
      }

      setLastCheck(new Date())
    } catch {}
    setChecking(false)
  }, [cfg, enriched])

  // Poll on mount and interval
  useEffect(() => {
    reqPermission()
    runCheck()
    timerRef.current = setInterval(runCheck, POLL_MS)
    return () => clearInterval(timerRef.current)
  }, [runCheck])

  function dismiss(id) {
    setAlerts(prev => {
      const next = prev.map(a => a.id === id ? { ...a, dismissed: true } : a)
      saveAlerts(next)
      return next
    })
  }
  function dismissAll() {
    setAlerts(prev => {
      const next = prev.map(a => ({ ...a, dismissed: true }))
      saveAlerts(next)
      return next
    })
  }
  function deleteAlert(id) {
    setAlerts(prev => { const next = prev.filter(a => a.id !== id); saveAlerts(next); return next })
  }
  function clearAll() {
    setAlerts([]); saveAlerts([])
  }

  const active    = alerts.filter(a => !a.dismissed)
  const dismissed = alerts.filter(a => a.dismissed)

  return (
    <div className="sa-root">

      {/* ── Toast ── */}
      {toast && (
        <div className="sa-toast">
          <span className="sa-toast-icon">⚡</span>
          <div>
            <div className="sa-toast-title">{toast.title}</div>
            <div className="sa-toast-body">{toast.body}</div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="sa-header">
        <div className="sa-header-left">
          <span className="sa-header-icon">⚡</span>
          <div>
            <h3 className="sa-title">Smart Alerts 2.0</h3>
            <p className="sa-subtitle">{marketMode ? 'Watching BTC · ETH · SOL · XRP · BNB · DOGE' : 'Fires when whale + price + news + volume align'}</p>
          </div>
          {unread > 0 && <span className="sa-badge">{unread}</span>}
        </div>
        <div className="sa-header-actions">
          <button
            className={`sa-check-btn ${checking ? 'sa-checking' : ''}`}
            onClick={runCheck}
            disabled={checking}
            title="Check now"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={checking ? 'sa-spin' : ''}>
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {checking ? 'Checking…' : 'Check Now'}
          </button>
          <button className="sa-cfg-btn" onClick={() => setShowCfg(v => !v)} title="Settings">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      {lastCheck && (
        <div className="sa-last-check">Last checked {lastCheck.toLocaleTimeString()} · Auto-checks every 90s</div>
      )}

      {/* ── Config panel ── */}
      {showCfg && (
        <div className="sa-cfg glass-card">
          <h4 className="sa-cfg-title">Alert Settings</h4>
          <div className="sa-cfg-grid">
            <label className="sa-cfg-row">
              <span>Enabled</span>
              <button className={`settings-toggle ${cfg.enabled ? 'on' : ''}`} onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}>
                <span className="settings-toggle-thumb"/>
              </button>
            </label>
            <label className="sa-cfg-row">
              <span>Min signals to fire</span>
              <div className="sa-cfg-chips">
                {[2,3,4].map(n => (
                  <button key={n} className={`sa-chip ${cfg.minSignals === n ? 'active' : ''}`} onClick={() => setCfg(c => ({ ...c, minSignals: n }))}>{n}</button>
                ))}
              </div>
            </label>
            <label className="sa-cfg-row">
              <span>Min whale size</span>
              <div className="sa-cfg-chips">
                {[500_000, 1_000_000, 5_000_000].map(v => (
                  <button key={v} className={`sa-chip ${cfg.minWhaleUsd === v ? 'active' : ''}`} onClick={() => setCfg(c => ({ ...c, minWhaleUsd: v }))}>{fmtUsd(v)}</button>
                ))}
              </div>
            </label>
            <label className="sa-cfg-row">
              <span>Momentum threshold</span>
              <div className="sa-cfg-chips">
                {[2,4,7].map(v => (
                  <button key={v} className={`sa-chip ${cfg.momentumPct === v ? 'active' : ''}`} onClick={() => setCfg(c => ({ ...c, momentumPct: v }))}>{v}%</button>
                ))}
              </div>
            </label>
            <label className="sa-cfg-row">
              <span>News recency</span>
              <div className="sa-cfg-chips">
                {[2,4,8].map(v => (
                  <button key={v} className={`sa-chip ${cfg.newsHours === v ? 'active' : ''}`} onClick={() => setCfg(c => ({ ...c, newsHours: v }))}>{v}h</button>
                ))}
              </div>
            </label>
            <label className="sa-cfg-row">
              <span>Watch BTC whales</span>
              <button className={`settings-toggle ${cfg.watchBtc ? 'on' : ''}`} onClick={() => setCfg(c => ({ ...c, watchBtc: !c.watchBtc }))}>
                <span className="settings-toggle-thumb"/>
              </button>
            </label>
            <label className="sa-cfg-row">
              <span>Watch ETH whales</span>
              <button className={`settings-toggle ${cfg.watchEth ? 'on' : ''}`} onClick={() => setCfg(c => ({ ...c, watchEth: !c.watchEth }))}>
                <span className="settings-toggle-thumb"/>
              </button>
            </label>
          </div>
        </div>
      )}

      {/* ── Signal legend ── */}
      <div className="sa-legend">
        {Object.entries(SIGNAL_META).map(([type, m]) => (
          <div key={type} className="sa-legend-item">
            <span>{m.icon}</span>
            <span style={{ color: m.color, fontSize: '0.72rem', fontWeight: 700 }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* ── Active alerts ── */}
      {active.length === 0 && dismissed.length === 0 && (
        <div className="sa-empty">
          <div className="sa-empty-icon">⚡</div>
          <p>No correlated signals yet.</p>
          <p className="sa-empty-sub">Smart Alerts fires when whale activity, price momentum, volume anomaly, or breaking news align for a coin you hold.</p>
          {marketMode && <p className="sa-empty-sub" style={{ color: 'var(--g)' }}>Watching BTC, ETH, SOL, XRP, BNB, DOGE market-wide.</p>}
        </div>
      )}

      {active.length > 0 && (
        <div className="sa-section">
          <div className="sa-section-hd">
            <span>⚡ Active Alerts</span>
            <button className="sa-clear-btn" onClick={dismissAll}>Dismiss all</button>
          </div>
          {active.map(a => <AlertCard key={a.id} alert={a} onDismiss={dismiss} onDelete={deleteAlert} />)}
        </div>
      )}

      {dismissed.length > 0 && (
        <div className="sa-section">
          <div className="sa-section-hd">
            <span className="sa-muted">Dismissed ({dismissed.length})</span>
            <button className="sa-clear-btn" onClick={clearAll}>Clear all</button>
          </div>
          {dismissed.map(a => <AlertCard key={a.id} alert={a} onDismiss={dismiss} onDelete={deleteAlert} dim />)}
        </div>
      )}
    </div>
  )
}

// ── Alert card ─────────────────────────────────────────────────────────────
function AlertCard({ alert: a, onDismiss, onDelete, dim }) {
  const ago = useAgo(a.firedAt)
  return (
    <div className={`sa-card glass-card ${dim ? 'sa-card-dim' : ''}`}>
      <div className="sa-card-top">
        <div className="sa-card-coin">
          <CoinLogo coinId={a.coinId} symbol={a.coinSymbol} size={34} />
          <div>
            <span className="sa-card-symbol">{a.coinSymbol}</span>
            <span className="sa-card-name">{a.coinName}</span>
          </div>
          {a.price && <span className="sa-card-price">${a.price >= 1000 ? a.price.toLocaleString('en', { maximumFractionDigits: 0 }) : a.price.toPrecision(4)}</span>}
        </div>
        <div className="sa-card-meta">
          <span className="sa-signal-count">{a.signalCount} signals</span>
          <span className="sa-ago">{ago}</span>
          {!dim && <button className="sa-dismiss" onClick={() => onDismiss(a.id)} title="Dismiss">✕</button>}
          <button className="sa-dismiss sa-delete" onClick={() => onDelete(a.id)} title="Delete">🗑</button>
        </div>
      </div>
      <div className="sa-signals">
        {a.signals.map((s, i) => {
          const m = SIGNAL_META[s.type] || {}
          return (
            <div key={i} className="sa-signal-pill" style={{ '--sc': m.color || '#fff' }}>
              <span className="sa-signal-icon">{m.icon}</span>
              <span className="sa-signal-desc">
                {s.url
                  ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{s.desc}</a>
                  : s.desc}
              </span>
              {s.extra && <span className="sa-signal-extra">{s.extra}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function useAgo(iso) {
  const [txt, setTxt] = useState(() => fmt(iso))
  useEffect(() => {
    const t = setInterval(() => setTxt(fmt(iso)), 30_000)
    return () => clearInterval(t)
  }, [iso])
  return txt
}
function fmt(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
