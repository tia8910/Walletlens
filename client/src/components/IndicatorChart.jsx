import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import SignalChart from './SignalChart'
import {
  computeChartSignals, loadChartParams, saveChartParams, normalizeParams,
  DEFAULT_CHART_PARAMS, CHART_TIMEFRAMES, DEFAULT_TIMEFRAME,
} from '../chartSignals'

// The indicator chart: timeframes, the candlestick chart with the on-device
// Buy/Sell signals and golden cross, the latest signal's levels, the
// indicator settings sheet and a full-screen view. The asset page and
// Technicals (Coach → Analysis) both show this same chart.

function fmtPrice(n) {
  const v = Number(n)
  if (!isFinite(v) || v === 0) return '0.00'
  if (Math.abs(v) >= 1) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v.toLocaleString(undefined, { maximumSignificantDigits: 6 })
}

const INTRADAY = ['15m', '1h', '4h']

export default function IndicatorChart({ coinId, symbol, name, price, source = 'asset', onLastClose }) {
  const { t, lang } = useLanguage()
  // Every visit opens on daily candles.
  const [tf, setTf] = useState(DEFAULT_TIMEFRAME)
  const [candleData, setCandleData] = useState({ candles: [], visible: 0, closeOnly: false, loading: true })
  const [chartParams, setChartParams] = useState(loadChartParams)
  const [paramsDraft, setParamsDraft] = useState(null)
  const [full, setFull] = useState(false)
  const [viewH, setViewH] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800))

  // Intraday candles only exist for exchange-traded crypto; the rest chart
  // from daily closes.
  const live = api.hasLiveCandles(coinId, symbol)
  const frames = Object.keys(CHART_TIMEFRAMES).filter(k => live || !INTRADAY.includes(k))
  useEffect(() => { if (!frames.includes(tf)) setTf(DEFAULT_TIMEFRAME) }, [live]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!coinId) return
    let alive = true
    setCandleData(d => ({ ...d, loading: true }))
    api.getCandles(coinId, symbol, tf)
      .then(r => { if (alive) { setCandleData({ ...r, loading: false }); onLastClose?.(r.candles.at(-1)?.c || 0) } })
      .catch(() => { if (alive) setCandleData({ candles: [], visible: 0, closeOnly: false, loading: false }) })
    return () => { alive = false }
  }, [coinId, symbol, tf])

  const calc = useMemo(
    () => (candleData.candles.length ? computeChartSignals(candleData.candles, chartParams) : null),
    [candleData.candles, chartParams])

  // Full screen: the page behind stops scrolling, Escape and Back close it.
  useEffect(() => {
    if (!full) return
    const onKey = (e) => { if (e.key === 'Escape') setFull(false) }
    const onResize = () => setViewH(window.innerHeight)
    onResize()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [full])

  const rel = (then) => {
    const ms = Date.now() - (typeof then === 'number' ? then : Date.parse(then))
    if (!isFinite(ms) || ms < 0) return ''
    const rtf = new Intl.RelativeTimeFormat(lang || undefined, { numeric: 'auto' })
    const mins = ms / 60000, hrs = mins / 60, dys = hrs / 24
    return dys >= 1 ? rtf.format(-Math.round(dys), 'day') : hrs >= 1 ? rtf.format(-Math.round(hrs), 'hour') : rtf.format(-Math.max(1, Math.round(mins)), 'minute')
  }

  const cs = candleData.candles
  const last = calc?.last
  const bigCross = calc?.crosses.filter(k => k.kind === 'golden' || k.kind === 'death').at(-1)
  const slowNow = calc?.ema.slow.at(-1)
  // The live quote can arrive after the candles; until then the last close stands in.
  const pNow = price || cs.at(-1)?.c || 0
  const P = calc?.params || chartParams
  const draft = paramsDraft
  const setD = (grp, key, val) => setParamsDraft(d => ({ ...d, [grp]: { ...d[grp], [key]: val } }))
  const toggle = (grp) => {
    const n = normalizeParams({ ...chartParams, [grp]: { ...chartParams[grp], on: !chartParams[grp].on } })
    setChartParams(n); saveChartParams(n)
  }
  const num = (grp, key, label, step = 1) => (
    <label className="ac-pm">
      <small>{label}</small>
      <input type="number" inputMode="decimal" step={step} value={draft[grp][key]}
        onChange={e => setD(grp, key, e.target.value)} aria-label={label} />
    </label>
  )

  const timeframes = (
    <div className="ac-tf" role="group" aria-label={t('acTimeframe')}>
      {frames.map(k => (
        <button key={k} className={tf === k ? 'on' : ''} aria-pressed={tf === k}
          onClick={() => { setTf(k); track('asset_chart_timeframe', { coin_id: coinId, timeframe: k, source }) }}>
          {CHART_TIMEFRAMES[k].label}
        </button>
      ))}
      <button className="ac-tf-full" onClick={() => { setFull(f => !f); if (!full) track('chart_fullscreen', { coin_id: coinId, source }) }}
        aria-label={full ? t('acExitFullScreen') : t('acFullScreen')} title={full ? t('acExitFullScreen') : t('acFullScreen')}>
        {full
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>}
      </button>
    </div>
  )

  const chart = (height) => (
    candleData.loading && !cs.length
      ? <div className="sc-empty">{t('tkFetching')}</div>
      : cs.length
        ? <SignalChart candles={cs} visible={candleData.visible} calc={calc} closeOnly={candleData.closeOnly} height={height}
            ariaLabel={`${name || symbol || ''} price chart with indicators`} />
        : <div className="sc-empty">{t('adNoChartData')}</div>
  )

  const chips = (
    <div className="ac-chips">
      <button className={`ac-chip${P.signals.on ? ' on' : ''}`} aria-pressed={P.signals.on} onClick={() => toggle('signals')}>
        <i className="ac-dot is-sig" />{t('acSignals')} {P.signals.fast}·{P.signals.slow}·{P.signals.rsi}
      </button>
      <button className={`ac-chip${P.cross.on ? ' on' : ''}`} aria-pressed={P.cross.on} onClick={() => toggle('cross')}>
        <i className="ac-dot is-gc" />{t('acGoldenCross')} {P.cross.fast}·{P.cross.mid}·{P.cross.slow}
      </button>
      <button className="ac-chip" onClick={() => setParamsDraft(JSON.parse(JSON.stringify(chartParams)))}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
        {t('acEdit')}
      </button>
    </div>
  )

  return (
    <div className="ic-root">
      <div className="ac-chart">
        {timeframes}
        {chart(260)}
        {chips}
        {candleData.closeOnly && cs.length > 0 && <p className="ac-note">{t('acCloseOnly')}</p>}
      </div>

      {calc && (P.signals.on || P.cross.on) && (
        <div className="ac-sig">
          {P.signals.on && (last ? (
            <>
              <div className="ac-sig-top">
                <span className={`ac-pill ${last.side === 'buy' ? 'is-buy' : 'is-sell'}`}>{last.side === 'buy' ? 'BUY' : 'SELL'}</span>
                <b>{last.side === 'buy' ? t('acBuySignal') : t('acSellSignal')} · {rel(cs[last.i].t)}</b>
                <small>${fmtPrice(last.entry)}</small>
              </div>
              <div className="ac-levels">
                <div className="ac-lv is-sl"><small>SL</small><b>{fmtPrice(last.stop)}</b></div>
                {last.targets.map((v, k) => <div key={k} className="ac-lv is-tp"><small>TP{k + 1}</small><b>{fmtPrice(v)}</b></div>)}
              </div>
            </>
          ) : <p className="ac-note">{t('acNoSignal')}</p>)}
          {P.cross.on && (
            <div className="ac-gc">
              <span className={`ac-tag${bigCross?.kind === 'death' ? ' is-bad' : ''}`}>{bigCross ? (bigCross.kind === 'golden' ? t('acGoldenCross') : t('acDeathCross')) : `EMA ${P.cross.mid}/${P.cross.slow}`}</span>
              <span>
                {bigCross ? `${rel(cs[bigCross.i].t)} · ` : ''}
                {slowNow != null && pNow > 0 ? `${pNow >= slowNow ? t('acPriceAbove') : t('acPriceBelow')} EMA ${P.cross.slow}` : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {full && (
        <div className="ic-full" role="dialog" aria-modal="true" aria-label={`${name || symbol || ''} ${t('acFullScreen')}`}>
          <div className="ic-full-h">
            <div className="ic-full-name"><b>{symbol}</b><span>${fmtPrice(pNow)}</span></div>
            <button className="ac-ib" onClick={() => setFull(false)} aria-label={t('acExitFullScreen')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          {timeframes}
          {chart(Math.max(260, viewH - 230))}
          {chips}
        </div>
      )}

      {draft && (
        <div className="ac-sheet-wrap" onClick={() => setParamsDraft(null)}>
          <div className="ac-sheet" role="dialog" aria-label={t('acIndicators')} onClick={e => e.stopPropagation()}>
            <div className="ac-sheet-h"><b>{t('acIndicators')}</b>
              <button className="ac-ib" onClick={() => setParamsDraft(null)} aria-label={t('close')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="ac-ind">
              <label className="ac-ind-top"><span><b>{t('acSignals')}</b><small>{t('acSignalsDesc')}</small></span>
                <input type="checkbox" className="ac-tog" checked={!!draft.signals.on} onChange={e => setD('signals', 'on', e.target.checked)} /></label>
              <div className="ac-params">
                {num('signals', 'fast', t('acFast'))}{num('signals', 'slow', t('acSlow'))}{num('signals', 'rsi', 'RSI')}
                {num('signals', 'atrMult', 'ATR ×', 0.1)}{num('signals', 'targets', t('acTargets'))}
              </div>
            </div>
            <div className="ac-ind">
              <label className="ac-ind-top"><span><b>{t('acGoldenCross')}</b><small>{t('acCrossDesc')}</small></span>
                <input type="checkbox" className="ac-tog" checked={!!draft.cross.on} onChange={e => setD('cross', 'on', e.target.checked)} /></label>
              <div className="ac-params ac-p3">
                {num('cross', 'fast', 'EMA')}{num('cross', 'mid', 'EMA')}{num('cross', 'slow', 'EMA')}
              </div>
            </div>
            <div className="ac-sheet-btns">
              <button className="ac-btn" onClick={() => setParamsDraft(JSON.parse(JSON.stringify(DEFAULT_CHART_PARAMS)))}>{t('acReset')}</button>
              <button className="ac-btn is-main" onClick={() => {
                const n = normalizeParams(draft); setChartParams(n); saveChartParams(n); setParamsDraft(null)
                track('chart_indicators_saved', { signals: n.signals.on, cross: n.cross.on, source })
              }}>{t('acSave')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
