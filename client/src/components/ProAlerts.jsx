import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import CoinLogo from './CoinLogo'
import { raiseAlarm } from '../alarm'
import {
  loadProAlerts, saveProAlerts, makeRule, rearm, portfolioSummary, alarmKind,
  SIGNAL_EVENTS, GOAL_KINDS, SIGNAL_FRAMES, MAX_PRO_ALERTS,
} from '../alertRules'
import './ProAlerts.css'

// Alerts → "Signals & goals": alerts on what the chart says (Buy or Sell
// signal, golden or death cross, RSI overbought or oversold) and on the
// portfolio as a whole (its value, its all-time P&L, one asset's share).
// AlertEngine checks them on every page; AlarmOverlay rings them.

const EVENT_KIND = { buy: 'buy', sell: 'sell', golden: 'cross', death: 'cross', rsi_high: 'rsi', rsi_low: 'rsi' }
const money = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

/** Only assets with a chart can have signal alerts. */
const chartable = (h) => !!h?.coin_id && (api.hasLiveCandles?.(h.coin_id, h.coin_symbol) || !!api.candleTicker?.(h.coin_id))

export function describeRule(r, t) {
  const sym = String(r.symbol || r.coin_id || '').toUpperCase()
  if (r.type === 'signal') return t('alRuleSignal')(sym, t(`alEv_${r.event}`), t(r.tf === '4h' ? 'alTf4h' : 'alTf1d'))
  const x = r.kind.startsWith('value') ? money(r.target) : `${Math.abs(Number(r.target))}%`
  return t(`alRuleGoal_${r.kind}`)(x, sym)
}

export default function ProAlerts({ enriched = [], prices = {} }) {
  const { t, lang } = useLanguage()
  const [rules, setRules] = useState(loadProAlerts)
  const [mode, setMode] = useState('signal')
  const assets = useMemo(() => (enriched || []).filter(chartable), [enriched])
  const [coinId, setCoinId] = useState('')
  const [event, setEvent] = useState('buy')
  const [tf, setTf] = useState('1d')
  const [kind, setKind] = useState('value_above')
  const [weightCoin, setWeightCoin] = useState('')
  const [target, setTarget] = useState('')

  useEffect(() => {
    const onChange = () => setRules(loadProAlerts())
    window.addEventListener('wl-alerts-changed', onChange)
    return () => window.removeEventListener('wl-alerts-changed', onChange)
  }, [])

  const summary = useMemo(() => portfolioSummary(enriched, prices), [enriched, prices])
  const sigCoin = assets.find(a => a.coin_id === coinId) || assets[0]
  const wCoin = (enriched || []).find(a => a.coin_id === weightCoin) || enriched?.[0]

  const update = (next) => { setRules(next); saveProAlerts(next) }
  const full = rules.length >= MAX_PRO_ALERTS

  function create(e) {
    e.preventDefault()
    if (full) return
    let rule
    if (mode === 'signal') {
      if (!sigCoin) return
      rule = makeRule({ type: 'signal', coin_id: sigCoin.coin_id, symbol: sigCoin.coin_symbol, name: sigCoin.coin_name, event, tf })
    } else {
      const x = parseFloat(String(target).replace(/,/g, ''))
      if (!Number.isFinite(x) || x <= 0) return
      if (kind === 'weight_above' && !wCoin) return
      rule = makeRule({ type: 'goal', kind, target: x, ...(kind === 'weight_above' ? { coin_id: wCoin.coin_id, symbol: wCoin.coin_symbol } : {}) })
    }
    update([rule, ...rules])
    setTarget('')
    track('pro_alert_created', { type: rule.type, what: rule.event || rule.kind })
  }

  function test() {
    const k = mode === 'signal' ? EVENT_KIND[event] : 'goal'
    raiseAlarm({ id: `test:${Date.now()}`, kind: k, title: t('alTestTitle'), body: t('alTestBody') })
    track('pro_alert_test', { kind: k })
  }

  const nowHint = (() => {
    if (mode !== 'goal' || !summary.complete) return null
    if (kind.startsWith('value')) return money(summary.total)
    if (kind.startsWith('pnl')) return `${summary.pnlPct >= 0 ? '+' : ''}${summary.pnlPct.toFixed(1)}%`
    return wCoin ? `${(summary.weights[wCoin.coin_id] || 0).toFixed(1)}%` : null
  })()
  const when = (ms) => new Date(ms).toLocaleString(lang || undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="pra">
      <form className="pra-form" onSubmit={create}>
        <div className="pra-seg" role="tablist" aria-label={t('alTab')}>
          {['signal', 'goal'].map(m => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {t(m === 'signal' ? 'alNewSignal' : 'alNewGoal')}
            </button>
          ))}
        </div>

        {mode === 'signal' ? (
          assets.length ? (
            <>
              <label className="pra-l">{t('alAsset')}</label>
              <div className="pra-assets">
                {assets.map(a => (
                  <button key={a.coin_id} type="button" className={`pra-asset${sigCoin?.coin_id === a.coin_id ? ' on' : ''}`} onClick={() => setCoinId(a.coin_id)} aria-pressed={sigCoin?.coin_id === a.coin_id}>
                    <CoinLogo coinId={a.coin_id} symbol={a.coin_symbol} image={a.coin_image} size={22} />
                    <span>{String(a.coin_symbol || '').toUpperCase()}</span>
                  </button>
                ))}
              </div>
              <label className="pra-l">{t('alWhen')}</label>
              <div className="pra-chips">
                {SIGNAL_EVENTS.map(ev => (
                  <button key={ev} type="button" className={`pra-chip pra-k-${EVENT_KIND[ev]}${event === ev ? ' on' : ''}`} aria-pressed={event === ev} onClick={() => setEvent(ev)}>{t(`alEv_${ev}`)}</button>
                ))}
              </div>
              <label className="pra-l">{t('alTimeframe')}</label>
              <div className="pra-chips">
                {SIGNAL_FRAMES.map(f => (
                  <button key={f} type="button" className={`pra-chip${tf === f ? ' on' : ''}`} aria-pressed={tf === f} onClick={() => setTf(f)}>{t(f === '4h' ? 'alTf4h' : 'alTf1d')}</button>
                ))}
              </div>
            </>
          ) : <p className="pra-note">{t('alNoChartAssets')}</p>
        ) : (
          <>
            <label className="pra-l">{t('alWhen')}</label>
            <div className="pra-chips">
              {GOAL_KINDS.map(k => (
                <button key={k} type="button" className={`pra-chip pra-k-goal${kind === k ? ' on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{t(`alGoal_${k}`)}</button>
              ))}
            </div>
            {kind === 'weight_above' && (
              <div className="pra-assets">
                {(enriched || []).map(a => (
                  <button key={a.coin_id} type="button" className={`pra-asset${wCoin?.coin_id === a.coin_id ? ' on' : ''}`} onClick={() => setWeightCoin(a.coin_id)} aria-pressed={wCoin?.coin_id === a.coin_id}>
                    <CoinLogo coinId={a.coin_id} symbol={a.coin_symbol} image={a.coin_image} size={22} />
                    <span>{String(a.coin_symbol || '').toUpperCase()}</span>
                  </button>
                ))}
              </div>
            )}
            <label className="pra-l" htmlFor="pra-target">{t('alTarget')} <small>{kind.startsWith('value') ? t('alInUsd') : t('alPct')}</small></label>
            <div className="pra-target">
              <span aria-hidden="true">{kind.startsWith('value') ? '$' : kind === 'pnl_below' ? '−' : kind === 'pnl_above' ? '+' : ''}</span>
              <input id="pra-target" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder={kind.startsWith('value') ? '25,000' : '20'} />
              {!kind.startsWith('value') && <span aria-hidden="true">%</span>}
            </div>
            {nowHint && <p className="pra-now">{t('alNow')(nowHint)}</p>}
          </>
        )}

        <div className="pra-actions">
          <button type="submit" className="pra-create" disabled={full || (mode === 'signal' && !assets.length) || (mode === 'goal' && !(parseFloat(target) > 0))}>{t('alCreate')}</button>
          <button type="button" className="pra-test" onClick={test}>{t('alTest')}</button>
        </div>
        {full && <p className="pra-note">{t('alLimit')}</p>}
        <p className="pra-note">{t('alHowItWorks')}</p>
      </form>

      {rules.length ? (
        <ul className="pra-list">
          {rules.map(r => {
            const k = alarmKind(r)
            return (
              <li key={r.id} className={`pra-rule pra-k-${k}${r.triggered ? ' fired' : ''}`}>
                <span className="pra-dot" aria-hidden="true" />
                <div className="pra-rule-t">
                  <b>{describeRule(r, t)}</b>
                  <small>{r.triggered ? t('alFired')(when(r.triggeredAt)) : t('alWatching')}</small>
                </div>
                {r.triggered && <button type="button" className="pra-mini" onClick={() => update(rules.map(x => x.id === r.id ? rearm(x) : x))}>{t('alRearm')}</button>}
                <button type="button" className="pra-mini pra-del" aria-label={t('alDelete')} title={t('alDelete')} onClick={() => { update(rules.filter(x => x.id !== r.id)); track('pro_alert_deleted') }}>✕</button>
              </li>
            )
          })}
        </ul>
      ) : <p className="pra-empty">{t('alEmpty')}</p>}
    </div>
  )
}
