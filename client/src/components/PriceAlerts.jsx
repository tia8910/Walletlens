import { useState, useEffect, useRef, useCallback } from 'react'
import { track } from '../analytics'

const STORAGE_KEY = 'walletlens_price_alerts'

function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveAlerts(alerts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
}

function bumpId() {
  const n = (parseInt(localStorage.getItem('wl_alert_id') || '0', 10) + 1)
  localStorage.setItem('wl_alert_id', String(n))
  return n
}

function requestNotificationPermission() {
  if (!('Notification' in window)) return Promise.resolve('denied')
  if (Notification.permission === 'granted') return Promise.resolve('granted')
  return Notification.requestPermission()
}

function fireNotification(title, body) {
  if (Notification.permission !== 'granted') return
  try { new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico' }) } catch {}
}

// Generate an alert beep using the Web Audio API — no file needed
function playAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    // Three ascending tones
    const notes = [880, 1100, 1320]
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.4, start + 0.04)
      gain.gain.linearRampToValueAtTime(0, start + 0.16)
      osc.start(start)
      osc.stop(start + 0.18)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch {}
}

// Progress bar showing current price vs target
function AlertProgress({ currentPrice, alert }) {
  if (!currentPrice || !alert.targetPrice) return null
  const { condition, targetPrice } = alert
  // For 'above': progress = currentPrice / targetPrice (100% = reached)
  // For 'below': progress = targetPrice / currentPrice (100% = reached), capped
  let pct
  if (condition === 'above') {
    pct = Math.min((currentPrice / targetPrice) * 100, 100)
  } else {
    pct = currentPrice <= targetPrice ? 100 : Math.min((targetPrice / currentPrice) * 100, 100)
  }
  const reached = alert.triggered
  const color = reached ? '#34d399' : pct >= 80 ? '#f59e0b' : '#3b82f6'
  const dist = condition === 'above'
    ? ((targetPrice - currentPrice) / currentPrice * 100)
    : ((currentPrice - targetPrice) / currentPrice * 100)
  return (
    <div className="pal-progress-wrap">
      <div className="pal-progress-track">
        <div className="pal-progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="pal-progress-pct" style={{ color }}>
        {reached ? '✓ Reached' : `${Math.abs(dist).toFixed(1)}% away`}
      </span>
    </div>
  )
}

export default function PriceAlerts({ enriched, prices }) {
  const [alerts, setAlerts]         = useState(loadAlerts)
  const [showForm, setShowForm]     = useState(false)
  const [coinId, setCoinId]         = useState('')
  const [condition, setCondition]   = useState('above')
  const [targetInput, setTargetInput] = useState('')
  const [notifPerm, setNotifPerm]   = useState(Notification?.permission ?? 'default')
  const [toasts, setToasts]         = useState([])
  const prevPricesRef               = useRef({})
  const alertsRef                   = useRef(alerts)
  alertsRef.current = alerts

  const addToast = useCallback((msg) => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6000)
  }, [])

  // Sync to localStorage whenever alerts change
  useEffect(() => { saveAlerts(alerts) }, [alerts])

  // Check alerts on every price update
  useEffect(() => {
    if (!prices || !Object.keys(prices).length) return
    const prev = prevPricesRef.current
    const updated = [...alertsRef.current]
    let changed = false

    for (let i = 0; i < updated.length; i++) {
      const a = updated[i]
      if (a.triggered || a.snoozed) continue
      const cur = prices[a.coin_id]?.usd ?? prices[a.coin_id]?.price ?? 0
      if (!cur) continue
      const hit = a.condition === 'above' ? cur >= a.targetPrice : cur <= a.targetPrice
      if (hit) {
        updated[i] = { ...a, triggered: true, triggeredAt: new Date().toISOString(), triggeredPrice: cur }
        changed = true
        const dir = a.condition === 'above' ? '🚀 Hit target ↑' : '🔻 Hit target ↓'
        const body = `${a.coin_symbol} is now $${cur.toLocaleString(undefined, { maximumFractionDigits: 4 })} — target was $${a.targetPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
        fireNotification(`${dir} ${a.coin_symbol}`, body)
        playAlarm()
        addToast(`${dir} ${a.coin_symbol?.toUpperCase()} — ${body}`)
        track('alert_triggered', { coin_id: a.coin_id, coin_symbol: a.coin_symbol, condition: a.condition, target_price: a.targetPrice, triggered_price: cur })
      }
    }
    if (changed) setAlerts(updated)
    prevPricesRef.current = prices
  }, [prices, addToast])

  function addAlert(e) {
    e.preventDefault()
    const price = parseFloat(targetInput)
    if (!coinId || isNaN(price) || price <= 0) return
    const holding = enriched.find(h => h.coin_id === coinId)
    const newAlert = {
      id: bumpId(),
      coin_id: coinId,
      coin_symbol: holding?.coin_symbol || coinId,
      condition,
      targetPrice: price,
      triggered: false,
      createdAt: new Date().toISOString(),
    }
    setAlerts(prev => [newAlert, ...prev])
    setShowForm(false)
    setTargetInput('')
    track('alert_created', { coin_id: coinId, condition, target_price: price })
  }

  function deleteAlert(id) {
    const a = alerts.find(x => x.id === id)
    track('alert_deleted', { coin_id: a?.coin_id, coin_symbol: a?.coin_symbol })
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  function resetAlert(id) {
    track('alert_reset', { coin_id: alerts.find(a => a.id === id)?.coin_id })
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, triggered: false, snoozed: false, triggeredAt: null, triggeredPrice: null } : a))
  }

  async function requestPerm() {
    const p = await requestNotificationPermission()
    setNotifPerm(p)
  }

  const active    = alerts.filter(a => !a.triggered)
  const triggered = alerts.filter(a => a.triggered)

  return (
    <div className="pal-root">
      {/* Toast stack */}
      <div className="pal-toasts">
        {toasts.map(t => (
          <div key={t.id} className="pal-toast">{t.msg}</div>
        ))}
      </div>

      {/* Notification permission banner */}
      {notifPerm !== 'granted' && (
        <div className="pal-notif-banner glass-card">
          <div className="pal-notif-icon">🔔</div>
          <div>
            <strong>Enable notifications</strong>
            <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
              Get alerted even when you're on a different tab.
            </p>
          </div>
          <button className="dvx-btn dvx-btn-primary pal-notif-btn" onClick={requestPerm}>
            Enable
          </button>
        </div>
      )}

      {/* Header */}
      <div className="pal-header">
        <div>
          <h3 className="pal-title">Price Alerts</h3>
          <p className="muted pal-sub">{active.length} active · {triggered.length} triggered</p>
        </div>
        <button className="dvx-btn dvx-btn-primary pal-add-btn" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ Cancel' : '+ New Alert'}
        </button>
      </div>

      {/* Add alert form */}
      {showForm && (
        <form className="glass-card pal-form" onSubmit={addAlert}>
          <h4 className="pal-form-title">Set a Price Alert</h4>
          <div className="pal-form-row">
            <label className="pal-label">Asset</label>
            <select className="pal-select" value={coinId} onChange={e => setCoinId(e.target.value)} required>
              <option value="">— Select —</option>
              {enriched.map(h => {
                const cur = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
                return (
                  <option key={h.coin_id} value={h.coin_id}>
                    {h.coin_symbol?.toUpperCase()} {cur > 0 ? `($${cur.toLocaleString(undefined, { maximumFractionDigits: 4 })})` : ''}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="pal-form-row">
            <label className="pal-label">Condition</label>
            <div className="pal-cond-toggle">
              <button type="button" className={`pal-cond-btn ${condition === 'above' ? 'active' : ''}`} onClick={() => setCondition('above')}>
                ↑ Rises above
              </button>
              <button type="button" className={`pal-cond-btn ${condition === 'below' ? 'active' : ''}`} onClick={() => setCondition('below')}>
                ↓ Falls below
              </button>
            </div>
          </div>
          <div className="pal-form-row">
            <label className="pal-label">Target Price (USD)</label>
            <div className="pal-price-row">
              <span className="pal-dollar">$</span>
              <input
                type="number"
                className="pal-price-input"
                placeholder="0.00"
                value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
                min="0"
                step="any"
                required
              />
            </div>
            {coinId && targetInput && prices[coinId] && (() => {
              const cur = prices[coinId]?.usd ?? prices[coinId]?.price ?? 0
              const tgt = parseFloat(targetInput)
              if (!cur || !tgt) return null
              const dist = ((tgt - cur) / cur * 100).toFixed(1)
              return (
                <p className="pal-hint muted">
                  Current: ${cur.toLocaleString(undefined, { maximumFractionDigits: 4 })} ·{' '}
                  <span style={{ color: dist >= 0 ? '#34d399' : '#f87171' }}>
                    {dist >= 0 ? '+' : ''}{dist}% away
                  </span>
                </p>
              )
            })()}
          </div>
          <button type="submit" className="dvx-btn dvx-btn-primary" style={{ width: '100%' }}>
            Set Alert
          </button>
        </form>
      )}

      {/* Active alerts */}
      {active.length > 0 && (
        <div className="pal-section">
          <p className="pal-section-label">ACTIVE</p>
          {active.map(a => {
            const cur = prices[a.coin_id]?.usd ?? prices[a.coin_id]?.price ?? 0
            return (
              <div key={a.id} className="glass-card pal-card">
                <div className="pal-card-top">
                  <div className="pal-card-left">
                    <span className="pal-sym">{a.coin_symbol?.toUpperCase()}</span>
                    <span className="pal-cond-badge" style={{ color: a.condition === 'above' ? '#34d399' : '#f87171' }}>
                      {a.condition === 'above' ? '↑ above' : '↓ below'} ${a.targetPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </span>
                  </div>
                  <div className="pal-card-right">
                    {cur > 0 && <span className="pal-cur-price muted">${cur.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>}
                    <button className="pal-del-btn" onClick={() => deleteAlert(a.id)} title="Delete">✕</button>
                  </div>
                </div>
                <AlertProgress currentPrice={cur} alert={a} />
              </div>
            )
          })}
        </div>
      )}

      {/* Triggered alerts */}
      {triggered.length > 0 && (
        <div className="pal-section">
          <p className="pal-section-label">TRIGGERED</p>
          {triggered.map(a => (
            <div key={a.id} className="glass-card pal-card pal-card-triggered">
              <div className="pal-card-top">
                <div className="pal-card-left">
                  <span className="pal-sym">{a.coin_symbol?.toUpperCase()}</span>
                  <span className="pal-cond-badge" style={{ color: '#34d399' }}>
                    ✓ {a.condition === 'above' ? '↑' : '↓'} ${a.targetPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="pal-card-right">
                  <button className="pal-reset-btn" onClick={() => resetAlert(a.id)} title="Reset alert">↺ Reset</button>
                  <button className="pal-del-btn" onClick={() => deleteAlert(a.id)} title="Delete">✕</button>
                </div>
              </div>
              {a.triggeredAt && (
                <p className="muted pal-triggered-at">
                  Triggered at ${a.triggeredPrice?.toLocaleString(undefined, { maximumFractionDigits: 4 })} · {new Date(a.triggeredAt).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {alerts.length === 0 && !showForm && (
        <div className="glass-card pal-empty">
          <div className="pal-empty-icon">🔔</div>
          <p className="pal-empty-title">No alerts yet</p>
          <p className="muted pal-empty-sub">Set a price target on any of your holdings and get notified the moment it's hit.</p>
          <button className="dvx-btn dvx-btn-primary" onClick={() => setShowForm(true)}>Create First Alert</button>
        </div>
      )}
    </div>
  )
}
