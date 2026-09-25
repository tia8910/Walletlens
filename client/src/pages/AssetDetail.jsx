import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { api, ASSET_CATEGORIES, STOCK_PREFIX, GOLD_ID, SILVER_ID, assetClass } from '../api'
import { getAnnualDividend, getDividendYield } from '../data/assets'
import { track } from '../analytics'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import CoinLogo from '../components/CoinLogo'
import Icon from '../components/Icon'
import TradeSheet from '../components/TradeSheet'
import { useLanguage } from '../LanguageContext'
import { isV2Active } from '../v2Preview'
import SignalChart from '../components/SignalChart'
import { computeChartSignals, loadChartParams, saveChartParams, normalizeParams, DEFAULT_CHART_PARAMS } from '../chartSignals'

// assetClass() is the shared id-prefix classifier (api.js); these wrap it
// for the page's two flavours of "is it crypto" / "what category".
function isNonCryptoId(id) {
  if (!id) return false
  const k = assetClass(id)
  return k !== 'crypto'
}
// Technical analysis works for any asset with a daily price feed — crypto plus
// stocks, ETFs and precious metals (gold/silver/copper/platinum). Only truly
// feedless classes (fiat, bonds, real estate, cash, "other") have no chart.
function hasTechnicals(id) {
  if (!id) return false
  const k = assetClass(id)
  return k === 'crypto' || k === 'stock' ||
    k === 'gold' || k === 'silver' || k === 'copper' || k === 'platinum'
}
function categoryFor(id) {
  return assetClass(id)
}

// Dollar AMOUNTS — a holding's value, a P&L, proceeds. Two decimals is what
// money looks like and more would be noise.
function fmt(n) {
  return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Per-unit PRICES, which are a different problem below a dollar.
//
// Two decimals threw the number away: STONKBROKER rendered as $0.01, and so
// would a token at $0.0051 and one at $0.0149 — three different assets, one
// displayed price. Anything under half a cent rendered as $0.00, which reads
// as worthless rather than small.
//
// Significant digits rather than decimal places, so the precision follows the
// magnitude: $0.0087 keeps its digits and $0.00000234 keeps its own, without
// padding a $75,964 bitcoin with zeroes. Same rule PricePage already uses.
function fmtPrice(n) {
  const v = Number(n)
  if (!isFinite(v) || v === 0) return '0.00'
  if (Math.abs(v) >= 1) {
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return v.toLocaleString(undefined, { maximumSignificantDigits: 6 })
}

export default function AssetDetail() {
  const { t, lang } = useLanguage()
  const { coinId: paramCoinId } = useParams()
  // Notifications arrive as /asset/?id=… because that path resolves to a file
  // on a cold navigation; in-app links still use /asset/:coinId.
  const coinId = paramCoinId
    || (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('id') || undefined
      : undefined)
  const navigate = useNavigate()
  const [chartData, setChartData] = useState([])
  const [chartDays, setChartDays] = useState(7)
  const [coin, setCoin] = useState(null)
  const [holdings, setHoldings] = useState(null)
  // Full portfolio (this asset + everything else), so the trade sheet's
  // "Buy with" balance lookup can find USDT/USDC/BTC/USD — not just this coin.
  const [allHoldings, setAllHoldings] = useState([])
  const [loading, setLoading] = useState(false)
  const [targets, setTargets] = useState([])
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [tInputPrice, setTInputPrice] = useState('')
  const [tInputQty, setTInputQty] = useState('')
  const [signals, setSignals] = useState(null)
  const [ta, setTa] = useState(null)
  // v2 chart: real candles and the on-device indicators.
  const location = useLocation()
  const v2 = isV2Active(location.pathname)
  const [v2Days, setV2Days] = useState(90)
  const [candleData, setCandleData] = useState({ candles: [], visible: 0, closeOnly: false, loading: true })
  const [chartParams, setChartParams] = useState(loadChartParams)
  const [paramsDraft, setParamsDraft] = useState(null)
  const [wallets, setWallets] = useState([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetType, setSheetType] = useState('buy')
  const [note, setNote] = useState(() => api.getCoinNote(coinId))
  useEffect(() => { setNote(api.getCoinNote(coinId)) }, [coinId])
  const [noteEditing, setNoteEditing] = useState(false)

  // Route changes reuse this component instance (useParams updates coinId
  // without remounting), so a slower response for the previous coin can
  // resolve after a newer load started and overwrite the now-displayed
  // coin with stale data. Guard every setState with an alive flag scoped
  // to this effect run, same pattern as Technicals.jsx.
  useEffect(() => {
    const alive = { current: true }
    loadData(alive)
    return () => { alive.current = false }
  }, [coinId])
  useEffect(() => { api.getWallets().then(setWallets).catch(() => {}) }, [])
  useEffect(() => {
    if (v2) return
    const alive = { current: true }
    loadChart(alive)
    return () => { alive.current = false }
  }, [coinId, chartDays, v2])
  useEffect(() => {
    if (!v2 || !coinId) return
    let alive = true
    setCandleData(d => ({ ...d, loading: true }))
    api.getCandles(coinId, coin?.symbol, v2Days)
      .then(r => { if (alive) setCandleData({ ...r, loading: false }) })
      .catch(() => { if (alive) setCandleData({ candles: [], visible: 0, closeOnly: false, loading: false }) })
    return () => { alive = false }
  }, [v2, coinId, coin?.symbol, v2Days])
  const chartCalc = useMemo(
    () => (v2 && candleData.candles.length ? computeChartSignals(candleData.candles, chartParams) : null),
    [v2, candleData.candles, chartParams])
  useEffect(() => {
    if (coinId) track('asset_detail_view', { coin_id: coinId, asset_category: categoryFor(coinId) })
  }, [coinId])
  useEffect(() => {
    setSignals(null)
    if (!coinId || isNonCryptoId(coinId)) return
    api.getCoinSmartSignals(coinId, 30).then(setSignals).catch(() => {})
  }, [coinId])
  useEffect(() => {
    setTa(null)
    if (!coinId || !hasTechnicals(coinId)) return
    api.getBulkTechnicals([coinId]).then(res => setTa(res?.[coinId] || null)).catch(() => {})
  }, [coinId])

  async function loadData(alive = { current: true }) {
    // Render the shell immediately from sync localStorage data — never
    // block the page on a network call. Network results then fill in.
    const nonCrypto = isNonCryptoId(coinId)
    const cat = categoryFor(coinId)
    const catMeta = ASSET_CATEGORIES[cat]

    // Local-only sync data — instant
    let portfolio = []
    try { portfolio = (await api.getPortfolio()) || [] } catch {}
    if (!alive.current) return
    const h = portfolio.find(p => p.coin_id === coinId)
    setHoldings(h || null)
    // Enrich the whole portfolio with best-effort USD values (from the price
    // cache; USD-pegged assets default to $1) and hand it to the trade sheet.
    // Without this, buying from an asset page only saw THIS coin, so a "Buy
    // with USDT" leg reported "No USDT balance found" and the % quick-fill
    // (buy and sell) had no balance to work from.
    try {
      const cached = api.getCachedPrices(portfolio.map(p => p.coin_id).join(',')) || {}
      const STABLE = new Set(['tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd', 'frax'])
      setAllHoldings(portfolio.map(p => {
        let px = cached[p.coin_id]?.usd
        if (px == null && (STABLE.has(p.coin_id) || p.coin_id === 'fiat:usd')) px = 1
        const value = px != null ? p.amount * px : (p.total_invested || p.amount || 0)
        return { ...p, value }
      }))
    } catch { setAllHoldings(portfolio) }
    try {
      const allTargets = await api.getCoinTargets()
      if (!alive.current) return
      setTargets(allTargets[coinId]?.targets || [])
    } catch {}
    if (!alive.current) return

    // Initial coin shell from local + already-cached prices (priceCache
    // is hydrated synchronously from localStorage at module load)
    setCoin(prev => prev || {
      id: coinId,
      name: h?.coin_name || (h?.coin_symbol || coinId).toUpperCase(),
      symbol: (h?.coin_symbol || coinId.replace(STOCK_PREFIX, '').replace('metal:', '')).toUpperCase(),
      price: 0, change24: 0,
      image: h?.coin_image || '',
      category: cat,
      categoryLabel: catMeta?.label,
      categoryIcon: catMeta?.icon,
      categoryColor: catMeta?.color,
    })

    // Background — fetch prices + image + detail in parallel, fill in
    // as each resolves. Never throws to the caller; never blocks the UI.
    api.getPrices(coinId).then(prices => {
      if (!alive.current) return
      const p = prices?.[coinId]
      if (!p) return
      setCoin(prev => ({
        ...(prev || {}),
        price: p.usd || prev?.price || 0,
        change24: p.usd_24h_change ?? prev?.change24 ?? 0,
        name: p.name || prev?.name,
        symbol: (p.symbol || prev?.symbol || '').toUpperCase(),
      }))
    }).catch(() => {})

    if (!nonCrypto) {
      Promise.all([api.getCoinImages(coinId), api.getCoinDetail(coinId)])
        .then(([images, detail]) => {
          if (!alive.current) return
          const image = images?.[coinId] || h?.coin_image || ''
          const md = detail?.market_data
          setCoin(prev => ({
            ...(prev || {}),
            name: detail?.name || prev?.name,
            symbol: (detail?.symbol || prev?.symbol || coinId).toUpperCase(),
            image: image || prev?.image,
            ath: md?.ath?.usd ?? prev?.ath,
            atl: md?.atl?.usd ?? prev?.atl,
            high24: md?.high_24h?.usd ?? prev?.high24,
            low24: md?.low_24h?.usd ?? prev?.low24,
            marketCap: md?.market_cap?.usd ?? prev?.marketCap,
            volume: md?.total_volume?.usd ?? prev?.volume,
            change7d: md?.price_change_percentage_7d ?? prev?.change7d,
            change30d: md?.price_change_percentage_30d ?? prev?.change30d,
          }))
        })
        .catch(() => {})
    }
  }

  async function loadChart(alive = { current: true }) {
    try {
      const data = await api.getChartData(coinId, chartDays)
      if (!alive.current) return
      setChartData(data)
    } catch (e) { console.error(e) }
  }

  async function handleAddTarget(e) {
    e.preventDefault()
    const price = parseFloat(tInputPrice)
    if (!price || price <= 0) return
    const qty = tInputQty === '' ? null : parseFloat(tInputQty)
    await api.addCoinTarget(coinId, { price, quantity: qty })
    const currentPrice = coin?.price || 0
    const pctFromCurrent = currentPrice > 0 ? ((price - currentPrice) / currentPrice) * 100 : null
    // WAS: the coin, its ticker, the user's target price and the price at the
    // time — a named asset plus a stated expectation about where it is going.
    // Together those are an investment thesis with a name on it, which is more
    // than the holdings list gives away.
    //
    // What survives describes the FEATURE: how far out people set targets and
    // in which direction, which is the question a product decision here would
    // actually turn on, and neither one names an asset.
    track('target_set', {
      pct_from_current: pctFromCurrent !== null ? Math.round(pctFromCurrent * 10) / 10 : undefined,
      direction:       pctFromCurrent !== null ? (pctFromCurrent >= 0 ? 'above' : 'below') : undefined,
      has_quantity:    qty !== null ? 'yes' : 'no',
    })
    setTInputPrice(''); setTInputQty(''); setShowAddTarget(false)
    loadData()
  }

  async function handleRemoveTarget(targetId) {
    await api.removeCoinTargetItem(coinId, targetId)
    // asset_symbol dropped; coin_id stays because the path already carries it.
    track('target_removed', { coin_id: coinId })
    loadData()
  }

  const price = coin?.price || 0
  const amount = holdings?.amount || 0
  const invested = holdings?.total_invested || 0
  const value = amount * price
  const pnl = value - invested
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0
  const avgBuy = amount > 0 ? invested / amount : 0

  // ── v2 asset page (/v2test preview) ───────────────────────────────────
  const rel = (then) => {
    const ms = Date.now() - (typeof then === 'number' ? then : Date.parse(then))
    if (!isFinite(ms) || ms < 0) return ''
    const rtf = new Intl.RelativeTimeFormat(lang || undefined, { numeric: 'auto' })
    const mins = ms / 60000, hrs = mins / 60, dys = hrs / 24
    return dys >= 1 ? rtf.format(-Math.round(dys), 'day') : hrs >= 1 ? rtf.format(-Math.round(hrs), 'hour') : rtf.format(-Math.max(1, Math.round(mins)), 'minute')
  }
  const v2Hero = v2 && (() => {
    const cs = candleData.candles
    const last = chartCalc?.last
    const bigCross = chartCalc?.crosses.filter(k => k.kind === 'golden' || k.kind === 'death').at(-1)
    const slowNow = chartCalc?.ema.slow.at(-1)
    // The live quote can arrive after the candles; until then the last close stands in.
    const pNow = price || cs.at(-1)?.c || 0
    const P = chartCalc?.params || chartParams
    const draft = paramsDraft
    const setD = (grp, key, val) => setParamsDraft(d => ({ ...d, [grp]: { ...d[grp], [key]: val } }))
    const num = (grp, key, label, step = 1) => (
      <label className="ac-pm">
        <small>{label}</small>
        <input type="number" inputMode="decimal" step={step} value={draft[grp][key]}
          onChange={e => setD(grp, key, e.target.value)} aria-label={label} />
      </label>
    )
    return (
      <>
        <div className="ac-head">
          <button className="ac-ib" onClick={() => navigate(-1)} aria-label={t('back') || 'Back'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <CoinLogo image={coin?.image} symbol={coin?.symbol} coinId={coin?.id} size={40} className="coin-logo" />
          <div className="ac-name">
            <b>{coin?.name}</b>
            <small>{coin?.symbol}{coin?.categoryLabel && coin.category !== 'crypto' ? ` · ${coin.categoryLabel}` : ''}</small>
          </div>
        </div>

        <div className="ac-price">
          <div>
            <div className="ac-big">${fmtPrice(pNow)}</div>
            <span className={`ac-chg ${(coin?.change24 || 0) >= 0 ? 'is-up' : 'is-dn'}`}>
              {(coin?.change24 || 0) >= 0 ? '▲' : '▼'} {Math.abs(coin?.change24 || 0).toFixed(2)}% · 24h
            </span>
          </div>
          {holdings && (
            <div className="ac-hold"><small>{t('acYouHold')}</small><b>{parseFloat(amount.toFixed(6))} {coin?.symbol}</b><span>${fmt(amount * pNow)}</span></div>
          )}
        </div>

        <div className="ac-chart">
          <div className="ac-tf">
            {[{ d: 1, l: '1D' }, { d: 7, l: '1W' }, { d: 30, l: '1M' }, { d: 90, l: '3M' }, { d: 365, l: '1Y' }, { d: 1825, l: 'ALL' }].map(({ d, l }) => (
              <button key={d} className={v2Days === d ? 'on' : ''} onClick={() => { setV2Days(d); track('asset_chart_timeframe', { coin_id: coinId, days: d, label: l, v2: true }) }}>{l}</button>
            ))}
          </div>
          {candleData.loading && !cs.length
            ? <div className="sc-empty">{t('tkFetching')}</div>
            : cs.length
              ? <SignalChart candles={cs} visible={candleData.visible} calc={chartCalc} closeOnly={candleData.closeOnly}
                  ariaLabel={`${coin?.name || ''} price chart with indicators`} />
              : <div className="sc-empty">{t('adNoChartData')}</div>}
          <div className="ac-chips">
            <button className={`ac-chip${P.signals.on ? ' on' : ''}`} aria-pressed={P.signals.on}
              onClick={() => { const n = normalizeParams({ ...chartParams, signals: { ...chartParams.signals, on: !chartParams.signals.on } }); setChartParams(n); saveChartParams(n) }}>
              <i className="ac-dot is-sig" />{t('acSignals')} {P.signals.fast}·{P.signals.slow}·{P.signals.rsi}
            </button>
            <button className={`ac-chip${P.cross.on ? ' on' : ''}`} aria-pressed={P.cross.on}
              onClick={() => { const n = normalizeParams({ ...chartParams, cross: { ...chartParams.cross, on: !chartParams.cross.on } }); setChartParams(n); saveChartParams(n) }}>
              <i className="ac-dot is-gc" />{t('acGoldenCross')} {P.cross.fast}·{P.cross.mid}·{P.cross.slow}
            </button>
            <button className="ac-chip" onClick={() => setParamsDraft(JSON.parse(JSON.stringify(chartParams)))}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
              {t('acEdit')}
            </button>
          </div>
          {candleData.closeOnly && cs.length > 0 && <p className="ac-note">{t('acCloseOnly')}</p>}
        </div>

        {chartCalc && (P.signals.on || P.cross.on) && (
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
                  track('chart_indicators_saved', { signals: n.signals.on, cross: n.cross.on })
                }}>{t('acSave')}</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  })()

  const isUp = chartData.length > 1 && chartData[chartData.length - 1]?.price >= chartData[0]?.price
  const chartColor = isUp ? 'var(--gd)' : '#ef4444'


  return (
    <div className={`page${v2 ? ' ac-page' : ''}`}>
      {v2Hero}
      {!v2 && <>
      <button className="back-btn" onClick={() => navigate(-1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>

      {/* Asset header */}
      <div className="detail-hero">
        <div className="detail-hero-left">
          <CoinLogo image={coin?.image} symbol={coin?.symbol} coinId={coin?.id} size={48} className="coin-logo" badgeStyle={coin?.categoryColor ? { background: `${coin.categoryColor}22`, color: coin.categoryColor } : undefined} />
          <div>
            <h2 className="detail-name">{coin?.name}</h2>
            <div className="detail-sub">
              <span className="muted">{coin?.symbol}</span>
              {coin?.categoryLabel && coin.category !== 'crypto' && (
                <span className="category-badge" style={{ background: `${coin.categoryColor}22`, color: coin.categoryColor }}>
                  <Icon name={coin.categoryIcon} size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{coin.categoryLabel}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="detail-hero-right">
          <div className="detail-price-big">${fmtPrice(price)}</div>
          <span className={`detail-change ${(coin?.change24 || 0) >= 0 ? 'positive' : 'negative'}`}>
            {(coin?.change24 || 0) >= 0 ? '▲' : '▼'} {Math.abs(coin?.change24 || 0).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="chart-card">
        <div className="chart-tabs">
          {[{ d: 1, l: '24H' }, { d: 7, l: '7D' }, { d: 30, l: '1M' }, { d: 90, l: '3M' }, { d: 365, l: '1Y' }].map(({ d, l }) => (
            <button key={d} className={`chart-tab ${chartDays === d ? 'active' : ''}`} onClick={() => { setChartDays(d); track('asset_chart_timeframe', { coin_id: coinId, days: d, label: l }) }}>{l}</button>
          ))}
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="cGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                // Theme-aware surface + readable text (was a hardcoded dark box:
                // in light mode the label read dark-on-dark and clashed).
                contentStyle={{ background: 'var(--tooltip-bg, var(--card-bg))', border: '1px solid var(--border)', borderRadius: 10, fontSize: '0.82rem', color: 'var(--text)', boxShadow: '0 6px 24px rgba(0,0,0,0.18)' }}
                itemStyle={{ color: 'var(--text)', fontWeight: 700 }}
                labelStyle={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.15rem' }}
                cursor={{ stroke: 'var(--text-sub)', strokeWidth: 1, strokeDasharray: '4 3', opacity: 0.45 }}
                formatter={(val) => ['$' + fmtPrice(val), 'Price']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.time || ''}
              />
              <Area type="monotone" dataKey="price" stroke={chartColor} fill="url(#cGrad)" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text2)' }}>{t('adNoChartData')}</div>
        )}
      </div>
      </>}

      {/* Market stats */}
      <div className="detail-stats-grid">
        {coin?.high24 != null && <div className="dstat"><span className="dstat-label">{t('ad24hHigh')}</span><span>${fmtPrice(coin.high24)}</span></div>}
        {coin?.low24 != null && <div className="dstat"><span className="dstat-label">{t('ad24hLow')}</span><span>${fmtPrice(coin.low24)}</span></div>}
        {coin?.change7d != null && <div className="dstat"><span className="dstat-label">{t('ad7dChange')}</span><span className={coin.change7d >= 0 ? 'positive' : 'negative'}>{coin.change7d >= 0 ? '+' : ''}{coin.change7d.toFixed(2)}%</span></div>}
        {coin?.change30d != null && <div className="dstat"><span className="dstat-label">{t('ad30dChange')}</span><span className={coin.change30d >= 0 ? 'positive' : 'negative'}>{coin.change30d >= 0 ? '+' : ''}{coin.change30d.toFixed(2)}%</span></div>}
        {coin?.ath != null && <div className="dstat"><span className="dstat-label">{t('adAllTimeHigh')}</span><span>${fmtPrice(coin.ath)}</span></div>}
        {coin?.marketCap != null && <div className="dstat"><span className="dstat-label">{t('adMarketCap')}</span><span>${(coin.marketCap / 1e9).toFixed(2)}B</span></div>}
        {coin?.volume != null && <div className="dstat"><span className="dstat-label">{t('ad24hVolume')}</span><span>${(coin.volume / 1e9).toFixed(2)}B</span></div>}
      </div>

      {/* Holdings */}
      {holdings && (
        <div className="detail-holdings">
          <h3>{t('adYourHoldings')}</h3>
          <div className="detail-holdings-grid">
            <div className="dh-item">
              <span className="dh-label">{t('adBalance')}</span>
              <span className="dh-value">{amount.toFixed(6)} {coin?.symbol}</span>
            </div>
            <div className="dh-item">
              <span className="dh-label">{t('adValue')}</span>
              <span className="dh-value">${fmt(value)}</span>
            </div>
            <div className="dh-item">
              <span className="dh-label">{t('adAvgBuyPrice')}</span>
              <span className="dh-value">${fmtPrice(avgBuy)}</span>
            </div>
            <div className="dh-item">
              <span className="dh-label">{t('adProfitLoss')}</span>
              <span className={`dh-value ${pnl >= 0 ? 'positive' : 'negative'}`}>
                {pnl >= 0 ? '+' : ''}{fmt(pnl)} ({pnlPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Whale activity / smart signals */}
      {signals && <WhalePanel s={signals} symbol={coin?.symbol} />}

      {/* Dividend / income (dividend-paying stocks & ETFs only) */}
      {getAnnualDividend(coinId) != null && (
        <DividendCard coinId={coinId} price={coin?.price || 0} amount={amount} symbol={coin?.symbol} />
      )}

      {/* Technical analysis */}
      {ta && <TechnicalsCard ta={ta} />}

      {/* Private coin notes */}
      <div className="glass-card coin-note-card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.5rem' }}>
          <h3 style={{ margin:0, fontSize:'0.95rem', display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="notes" size={16} style={{ color:'var(--text-muted)' }} />{t('adMyNotes')}</h3>
          {!noteEditing && (
            <button className="btn-secondary btn-sm" onClick={() => setNoteEditing(true)}>
              {note ? 'Edit' : '+ Add note'}
            </button>
          )}
        </div>
        {noteEditing ? (
          <div>
            <textarea
              className="coin-note-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('adNotesPlaceholder')}
              rows={4}
              autoFocus
            />
            <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.5rem' }}>
              <button className="btn-sm" style={{ background:'var(--g)', color:'#000', fontWeight:700, border:'none', borderRadius:8, padding:'0.35rem 0.9rem', cursor:'pointer' }}
                onClick={() => { api.saveCoinNote(coinId, note); setNoteEditing(false); track('asset_note_save', { coin_id: coinId }) }}>
                Save
              </button>
              <button className="btn-secondary btn-sm" onClick={() => { setNote(api.getCoinNote(coinId)); setNoteEditing(false) }}>{t('cancel')}</button>
            </div>
          </div>
        ) : note ? (
          <p style={{ margin:0, color:'var(--text)', fontSize:'0.88rem', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{note}</p>
        ) : (
          <p className="muted" style={{ margin:0, fontSize:'0.85rem' }}>{t('adNoNotes')}</p>
        )}
      </div>

      {/* Sell plan / targets */}
      <div className="sell-plan-card">
        <div className="sell-plan-head">
          <h3>{t('adSellPlan')}</h3>
          <button className="sp-add-btn" onClick={() => setShowAddTarget(s => !s)}>
            {showAddTarget ? 'Cancel' : '+ Add Target'}
          </button>
        </div>
        {showAddTarget && (
          <form className="sp-form" onSubmit={handleAddTarget}>
            <input
              type="number"
              step="any"
              min="0"
              placeholder={t('phTargetPrice')}
              value={tInputPrice}
              onChange={e => setTInputPrice(e.target.value)}
              required
            />
            <input
              type="number"
              step="any"
              min="0"
              placeholder={`Qty to sell (${coin?.symbol || ''}) — blank = all`}
              value={tInputQty}
              onChange={e => setTInputQty(e.target.value)}
            />
            <button type="submit" className="sp-save-btn">{t('vsSave')}</button>
          </form>
        )}
        {targets.length === 0 && !showAddTarget && (
          <p className="muted sp-empty">{t('adNoTargets')}</p>
        )}
        {targets.length > 0 && (
          <div className="sp-list">
            {targets.map(tg => {
              const pct = price > 0 && tg.price > 0 ? (price / tg.price) * 100 : 0
              const reached = price >= tg.price
              const sellQty = tg.quantity == null ? amount : Math.min(tg.quantity, amount)
              const proceeds = sellQty * tg.price
              return (
                <div key={tg.id} className={`sp-row ${reached ? 'sp-reached' : ''}`}>
                  <div className="sp-row-top">
                    <div className="sp-price">
                      <span className="sp-label">{t('adSellAt')}</span>
                      <span className="sp-val">${fmtPrice(tg.price)}</span>
                    </div>
                    <div className="sp-qty">
                      <span className="sp-label">{t('adQuantity')}</span>
                      <span className="sp-val">
                        {tg.quantity == null ? `All (${amount.toFixed(4)})` : `${tg.quantity} ${coin?.symbol || ''}`}
                      </span>
                    </div>
                    <div className="sp-proceeds">
                      <span className="sp-label">{t('adProceeds')}</span>
                      <span className="sp-val">${fmt(proceeds)}</span>
                    </div>
                    <button className="sp-remove" onClick={() => handleRemoveTarget(tg.id)} aria-label={t('adRemoveTarget')}>×</button>
                  </div>
                  <div className="sp-progress">
                    <div className="sp-bar-bg">
                      <div className="sp-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: reached ? 'var(--gd)' : '#00c853' }} />
                    </div>
                    <span className={`sp-pct ${reached ? 'positive' : ''}`}>
                      {reached ? '✓ Reached' : `${pct.toFixed(1)}% of target`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Buy/Sell actions */}
      <div className="detail-actions">
        <button className="action-btn buy-btn detail-act" onClick={() => { setSheetType('buy'); setSheetOpen(true); track('asset_trade_open', { trade_type: 'buy', coin_id: coinId, asset_category: categoryFor(coinId) }) }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Buy {coin?.symbol}
        </button>
        {holdings && (
          <button className="action-btn sell-btn detail-act" onClick={() => { setSheetType('sell'); setSheetOpen(true); track('asset_trade_open', { trade_type: 'sell', coin_id: coinId, asset_category: categoryFor(coinId) }) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Sell {coin?.symbol}
          </button>
        )}
      </div>

      <TradeSheet
        open={sheetOpen}
        type={sheetType}
        onClose={() => setSheetOpen(false)}
        wallets={wallets}
        onDone={() => {
          // Back to the dashboard rather than refreshing this page. A trade is
          // the one action here that changes the whole portfolio, and the
          // number it changes lives on the dashboard: reloading the asset page
          // left someone looking at one coin, having to navigate back to see
          // what their net worth had become. useScrollTop puts them at the top,
          // so the new total is the first thing on screen.
          navigate('/dashboard')
        }}
        holdings={allHoldings}
        prefillCoin={coin ? { id: coinId, symbol: coin.symbol, name: coin.name, image: coin.image } : null}
        variant="page"
      />
    </div>
  )
}

function WhalePanel({ s, symbol }) {
  const { t } = useLanguage()
  const score = s.whaleScore
  const scoreLabel =
    score >= 50 ? 'Strong Accumulation' :
    score >= 20 ? 'Mild Accumulation' :
    score >= -20 ? 'Neutral' :
    score >= -50 ? 'Mild Distribution' :
    'Strong Distribution'
  const scoreColor =
    score >= 50 ? 'var(--gd)' :
    score >= 20 ? '#22c55e' :
    score >= -20 ? '#94a3b8' :
    score >= -50 ? '#f59e0b' :
    '#ef4444'

  const pulsePct = Math.min(100, Math.round(s.volPulse * 50))
  const pulseColor = s.volPulse > 1.5 ? '#ef4444' : s.volPulse > 1 ? '#f59e0b' : '#00c853'

  return (
    <div className="whale-panel">
      <div className="whale-panel-head">
        <h3 style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="flow" size={17} style={{ color:'#38bdf8' }} />{t('adWhaleActivity')}</h3>
        <span className="whale-panel-window">Last {s.windowDays}d</span>
      </div>

      <div className="whale-score-row">
        <div className="whale-score-circle" style={{ borderColor: scoreColor, color: scoreColor }}>
          <div className="whale-score-num">{score > 0 ? '+' : ''}{score}</div>
          <div className="whale-score-lbl">{t('adWhaleScore')}</div>
        </div>
        <div className="whale-score-info">
          <div className="whale-score-tag" style={{ background: scoreColor + '22', color: scoreColor }}>
            {scoreLabel}
          </div>
          <p className="whale-score-desc">
            Composite of accumulation/distribution flow, momentum, and volume pressure.
            +100 = whales loading up, -100 = whales unloading.
          </p>
        </div>
      </div>

      <div className="whale-indicators">
        <Indicator
          label="Volume Pulse"
          value={`${s.volPulse.toFixed(2)}×`}
          help="Last-24h volume vs daily avg. >1.5× = unusual activity."
          barPct={pulsePct}
          color={pulseColor}
        />
        <Indicator
          label="Accum/Dist"
          value={(s.adNormalized * 100).toFixed(0) + '%'}
          help="Volume-weighted price direction. Positive = buying pressure."
          barPct={(s.adNormalized + 1) * 50}
          color={s.adNormalized >= 0 ? 'var(--gd)' : '#ef4444'}
        />
        <Indicator
          label="Momentum"
          value={(s.momentum * 100).toFixed(1) + '%'}
          help="Fast vs slow MA. Positive = uptrend."
          barPct={Math.max(0, Math.min(100, 50 + s.momentum * 200))}
          color={s.momentum >= 0 ? 'var(--gd)' : '#ef4444'}
        />
        <Indicator
          label="Range Position"
          value={(s.rangePos * 100).toFixed(0) + '%'}
          help="Where price sits in recent high-low range. 100% = at the top."
          barPct={s.rangePos * 100}
          color="#00c853"
        />
        <Indicator
          label="Volatility"
          value={(s.volatility * 100).toFixed(0) + '%'}
          help="Annualised. <50% calm, >100% wild."
          barPct={Math.min(100, s.volatility * 50)}
          color="#4d7a59"
        />
      </div>
    </div>
  )
}

// Dividend & income card — shown for dividend-paying stocks/ETFs. Yield is
// derived live from the current price; projected income uses the holding size.
function DividendCard({ coinId, price, amount, symbol }) {
  const { t } = useLanguage()
  const dps = getAnnualDividend(coinId)
  if (dps == null) return null
  const yieldPct = getDividendYield(coinId, price)
  const annualIncome = amount > 0 ? dps * amount : 0
  const sym = (symbol || '').toUpperCase()
  return (
    <div className="whale-panel">
      <div className="whale-panel-head">
        <h3 style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}>
          <Icon name="bank" size={17} style={{ color: 'var(--g-ink)' }} />Dividend &amp; Income
        </h3>
        <span className="whale-panel-window">{t('adEstAnnual')}</span>
      </div>
      <div className="ta-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', padding:'0.25rem 0' }}>
        <div className="ta-stat">
          <div className="ta-stat-label" style={{ color:'var(--text-muted)', fontSize:'0.78rem' }}>{t('adDividendYield')}</div>
          <div className="ta-stat-value" style={{ fontSize:'1.35rem', fontWeight:700, color:'var(--g-ink)' }}>
            {yieldPct != null ? yieldPct.toFixed(2) + '%' : '—'}
          </div>
        </div>
        <div className="ta-stat">
          <div className="ta-stat-label" style={{ color:'var(--text-muted)', fontSize:'0.78rem' }}>{t('adPerShareYr')}</div>
          <div className="ta-stat-value" style={{ fontSize:'1.35rem', fontWeight:700 }}>${dps.toFixed(2)}</div>
        </div>
        {amount > 0 && (
          <div className="ta-stat" style={{ gridColumn:'1 / -1' }}>
            <div className="ta-stat-label" style={{ color:'var(--text-muted)', fontSize:'0.78rem' }}>
              Your projected annual income ({amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {sym})
            </div>
            <div className="ta-stat-value" style={{ fontSize:'1.35rem', fontWeight:700, color:'var(--g-ink)' }}>
              ${annualIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span style={{ fontSize:'0.8rem', fontWeight:500, color:'var(--text-muted)' }}> /yr · ~${(annualIncome/12).toFixed(2)}/mo</span>
            </div>
          </div>
        )}
      </div>
      <p className="whale-score-desc" style={{ marginTop:'0.5rem', fontSize:'0.74rem', color:'var(--text-muted)' }}>
        {t('adDividendNote')}
      </p>
    </div>
  )
}

function TechnicalsCard({ ta }) {
  const { t } = useLanguage()
  const lvl = (p) => (p == null ? '—' : '$' + (p >= 1 ? Math.round(p).toLocaleString() : +(+p).toPrecision(4)))
  const trendMeta = {
    uptrend:   { label: 'Uptrend',   color: 'var(--g-ink)' },
    downtrend: { label: 'Downtrend', color: '#ef4444' },
    sideways:  { label: 'Sideways',  color: '#f59e0b' },
  }[ta.trend] || { label: 'Sideways', color: '#f59e0b' }

  // Overall posture from the composite score.
  const score = ta.score
  const postureLabel =
    score >= 40 ? 'Bullish' :
    score >= 10 ? 'Mildly Bullish' :
    score >= -10 ? 'Neutral' :
    score >= -40 ? 'Mildly Bearish' :
    'Bearish'
  const postureColor =
    score >= 40 ? 'var(--gd)' :
    score >= 10 ? '#22c55e' :
    score >= -10 ? '#94a3b8' :
    score >= -40 ? '#f59e0b' :
    '#ef4444'

  const rsi = ta.rsi
  const rsiColor = ta.rsiState === 'overbought' ? '#ef4444' : ta.rsiState === 'oversold' ? 'var(--gd)' : '#94a3b8'
  const macdColor = ta.macd ? (ta.macd.hist > 0 ? 'var(--gd)' : '#ef4444') : '#94a3b8'
  const bbPct = ta.bb ? Math.round(ta.bb.pctB * 100) : null

  return (
    <div className="whale-panel">
      <div className="whale-panel-head">
        <h3 style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="pulse" size={17} style={{ color: 'var(--g-ink)', fontWeight: 700 }} />{t('adTechnicalAnalysis')}</h3>
        <span className="whale-panel-window">{ta.samples}d daily</span>
      </div>

      <div className="whale-score-row">
        <div className="whale-score-circle" style={{ borderColor: postureColor, color: postureColor }}>
          <div className="whale-score-num">{score > 0 ? '+' : ''}{score}</div>
          <div className="whale-score-lbl">{t('adTaScore')}</div>
        </div>
        <div className="whale-score-info">
          <div className="whale-score-tag" style={{ background: postureColor + '22', color: postureColor }}>
            {postureLabel} · <span style={{ color: trendMeta.color }}>{trendMeta.label}</span>
          </div>
          <p className="whale-score-desc">
            Blends RSI, MACD, Bollinger position and trend. +100 = strong/constructive,
            -100 = stretched/distribution. Drives the Smart Sell Plan targets.
          </p>
        </div>
      </div>

      <div className="whale-indicators">
        {rsi != null && (
          <Indicator
            label="RSI (14)"
            value={`${rsi.toFixed(0)}${ta.rsiState !== 'neutral' ? ' · ' + ta.rsiState : ''}`}
            help="Relative Strength. >70 overbought, <30 oversold."
            barPct={Math.max(0, Math.min(100, rsi))}
            color={rsiColor}
          />
        )}
        {ta.macd && (
          <Indicator
            label="MACD"
            value={`${ta.macd.hist > 0 ? '+' : ''}${ta.macd.hist.toPrecision(3)}${ta.macd.cross ? ' · ' + ta.macd.cross : ''}`}
            help="12/26/9. Histogram positive = bullish momentum; a cross flags a turn."
            barPct={Math.max(0, Math.min(100, 50 + (ta.macd.hist / (Math.abs(ta.macd.line) || 1)) * 50))}
            color={macdColor}
          />
        )}
        {bbPct != null && (
          <Indicator
            label="Bollinger %B"
            value={`${bbPct}%`}
            help="Position within the 20/2 bands. >100% above upper band, <0% below lower."
            barPct={Math.max(0, Math.min(100, bbPct))}
            color={bbPct > 100 ? '#ef4444' : bbPct < 0 ? 'var(--gd)' : '#00c853'}
          />
        )}
        {ta.atrPct != null && (
          <Indicator
            label="ATR (volatility)"
            value={`${(ta.atrPct * 100).toFixed(1)}%`}
            help="Average daily move as a % of price. Higher = wider stops needed."
            barPct={Math.min(100, ta.atrPct * 1000)}
            color="#4d7a59"
          />
        )}
      </div>

      <div className="ta-levels">
        <div className="ta-levels-col">
          <div className="ta-levels-h" style={{ color: '#ef4444' }}>{t('adResistance')}</div>
          {(ta.resistances || []).length
            ? ta.resistances.map((p, i) => <div key={i} className="ta-level">R{i + 1} · {lvl(p)}</div>)
            : <div className="ta-level muted">{t('adNoneNearby')}</div>}
        </div>
        <div className="ta-levels-col">
          <div className="ta-levels-h" style={{ color: 'var(--g-ink)' }}>{t('adSupport')}</div>
          {(ta.supports || []).length
            ? ta.supports.map((p, i) => <div key={i} className="ta-level">S{i + 1} · {lvl(p)}</div>)
            : <div className="ta-level muted">{t('adNoneNearby')}</div>}
        </div>
      </div>
    </div>
  )
}

function Indicator({ label, value, help, barPct, color }) {
  return (
    <div className="wp-ind" title={help}>
      <div className="wp-ind-row">
        <span className="wp-ind-label">{label}</span>
        <span className="wp-ind-value" style={{ color }}>{value}</span>
      </div>
      <div className="wp-ind-bar-bg">
        <div className="wp-ind-bar-fill" style={{ width: `${barPct}%`, background: color }} />
      </div>
    </div>
  )

}
