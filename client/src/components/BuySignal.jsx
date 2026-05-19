import { useEffect, useState } from 'react'

const PROXIES = [
  u => 'https://corsproxy.io/?' + encodeURIComponent(u),
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://cors.eu.org/' + u,
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
]
const _signalCache = {}
const BINANCE_SYM = { 'bitcoin':'BTCUSDT','ethereum':'ETHUSDT','solana':'SOLUSDT','ripple':'XRPUSDT','binancecoin':'BNBUSDT','cardano':'ADAUSDT','avalanche-2':'AVAXUSDT','matic-network':'MATICUSDT','near':'NEARUSDT','uniswap':'UNIUSDT','aave':'AAVEUSDT','dogecoin':'DOGEUSDT','shiba-inu':'SHIBUSDT','chainlink':'LINKUSDT','polkadot':'DOTUSDT','litecoin':'LTCUSDT','tron':'TRXUSDT','stellar':'XLMUSDT','cosmos':'ATOMUSDT','aptos':'APTUSDT','sui':'SUIUSDT','arbitrum':'ARBUSDT','optimism':'OPUSDT','pepe':'1000PEPEUSDT','render-token':'RENDERUSDT','fetch-ai':'FETUSDT','lido-dao':'LDOUSDT','curve-dao-token':'CRVUSDT','maker':'MKRUSDT','immutable-x':'IMXUSDT','the-sandbox':'SANDUSDT','decentraland':'MANAUSDT' }

// Kraken OHLC — CORS-enabled exchange with no auth required
const KRAKEN_SYM = {
  'bitcoin':'XBTUSD','ethereum':'ETHUSD','solana':'SOLUSD','ripple':'XRPUSD',
  'cardano':'ADAUSD','avalanche-2':'AVAXUSD','dogecoin':'DOGEUSD','shiba-inu':'SHIBUSD',
  'polkadot':'DOTUSD','chainlink':'LINKUSD','litecoin':'LTCUSD','tron':'TRXUSD',
  'cosmos':'ATOMUSD','near':'NEARUSD','aptos':'APTUSD','arbitrum':'ARBUSD',
  'optimism':'OPUSD','sui':'SUIUSD','uniswap':'UNIUSD','aave':'AAVEUSD',
  'render-token':'RENDERUSD','fetch-ai':'FETUSD','lido-dao':'LDOUSD',
  'stellar':'XLMUSD','matic-network':'MATICUSD',
}

function _ccSym(coinId) {
  const s = BINANCE_SYM[coinId]
  return s ? s.replace(/USDT$/, '').replace(/^1000/, '') : null
}

function _parseCCHistoday(json) {
  const rows = json?.Data?.Data
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('empty')
  const last = rows[rows.length - 1], d1 = rows[rows.length - 2]
  const d7 = rows[Math.max(0, rows.length - 8)], d30 = rows[0]
  const price = last.close
  return {
    current_price: price,
    price_change_percentage_24h:              d1.close  > 0 ? ((price - d1.close)  / d1.close)  * 100 : 0,
    price_change_percentage_7d_in_currency:   d7.close  > 0 ? ((price - d7.close)  / d7.close)  * 100 : 0,
    price_change_percentage_30d_in_currency:  d30.close > 0 ? ((price - d30.close) / d30.close) * 100 : 0,
    ath: 0,
  }
}

function _parseBinanceKlines(klines) {
  if (!klines?.length) throw new Error('empty')
  const price  = parseFloat(klines[klines.length - 1][4]) || 0
  const prev1d = parseFloat(klines[klines.length - 2]?.[4]) || 0
  const prev7d = parseFloat(klines[Math.max(0, klines.length - 8)]?.[4]) || 0
  const prev30 = parseFloat(klines[0]?.[4]) || 0
  return {
    current_price: price,
    price_change_percentage_24h:             prev1d > 0 ? ((price - prev1d) / prev1d) * 100 : 0,
    price_change_percentage_7d_in_currency:  prev7d > 0 ? ((price - prev7d) / prev7d) * 100 : 0,
    price_change_percentage_30d_in_currency: prev30 > 0 ? ((price - prev30) / prev30) * 100 : 0,
    ath: 0,
  }
}

function _parseKrakenOHLC(data) {
  // Kraken result key is their internal pair name — just take the first non-'last' key
  const key = Object.keys(data?.result || {}).find(k => k !== 'last')
  const candles = data?.result?.[key]
  if (!Array.isArray(candles) || candles.length < 2) throw new Error('empty')
  // Candle format: [timestamp, open, high, low, close, vwap, volume, count]
  const price  = parseFloat(candles[candles.length - 1][4]) || 0
  const prev1d = parseFloat(candles[candles.length - 2]?.[4]) || 0
  const prev7d = parseFloat(candles[Math.max(0, candles.length - 8)]?.[4]) || 0
  const prev30 = parseFloat(candles[0]?.[4]) || 0
  return {
    current_price: price,
    price_change_percentage_24h:             prev1d > 0 ? ((price - prev1d) / prev1d) * 100 : 0,
    price_change_percentage_7d_in_currency:  prev7d > 0 ? ((price - prev7d) / prev7d) * 100 : 0,
    price_change_percentage_30d_in_currency: prev30 > 0 ? ((price - prev30) / prev30) * 100 : 0,
    ath: 0,
  }
}

async function fetchSignalData(coinId) {
  const now = Date.now()
  if (_signalCache[coinId] && now - _signalCache[coinId].t < 5 * 60 * 1000) return _signalCache[coinId].d

  const cgUrl  = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinId}&price_change_percentage=24h,7d,30d`
  const ccSym  = _ccSym(coinId)
  const binSym = BINANCE_SYM[coinId]

  // Race ALL sources simultaneously — first valid response wins
  const attempts = [
    // CoinGecko via 4 CORS proxies
    ...PROXIES.map(proxy =>
      fetch(proxy(cgUrl), { signal: AbortSignal.timeout(6000) })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
        .then(data => { if (!data[0]) throw new Error('empty'); return data[0] })
    ),
  ]

  if (ccSym) attempts.push(
    fetch(`https://min-api.cryptocompare.com/data/v2/histoday?fsym=${ccSym}&tsym=USD&limit=31`, { signal: AbortSignal.timeout(8000) })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(_parseCCHistoday)
  )

  if (binSym) attempts.push(
    fetch(`https://api.binance.com/api/v3/klines?symbol=${binSym}&interval=1d&limit=31`, { signal: AbortSignal.timeout(8000) })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(_parseBinanceKlines)
  )

  const krakenSym = KRAKEN_SYM[coinId]
  if (krakenSym) attempts.push(
    fetch(`https://api.kraken.com/0/public/OHLC?pair=${krakenSym}&interval=1440`, { signal: AbortSignal.timeout(7000) })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => { if (d.error?.length) throw new Error(d.error[0]); return d })
      .then(_parseKrakenOHLC)
  )

  try {
    const d = await Promise.any(attempts)
    _signalCache[coinId] = { d, t: now }
    return d
  } catch { return null }
}

// RSI-style momentum label
function momentumLabel(pct24h, pct7d, pct30d) {
  if (pct24h > 20 || pct7d > 40)  return { label: 'Extreme Pump', score: -3 }
  if (pct24h > 10 || pct7d > 20)  return { label: 'FOMO Zone',    score: -2 }
  if (pct24h > 5  || pct7d > 10)  return { label: 'Rising Fast',  score: -1 }
  if (pct24h < -15 || pct7d < -30) return { label: 'Heavy Dip',   score: +2 }
  if (pct24h < -8  || pct7d < -15) return { label: 'Dip',         score: +1 }
  if (pct24h < -3  || pct7d < -5)  return { label: 'Slight Dip',  score: +1 }
  return { label: 'Stable', score: 0 }
}

function priceVsAvgLabel(currentPrice, avgPrice30d) {
  if (!avgPrice30d || !currentPrice) return null
  const diff = ((currentPrice - avgPrice30d) / avgPrice30d) * 100
  if (diff > 25)  return { label: `+${diff.toFixed(0)}% above 30d avg`, score: -2 }
  if (diff > 10)  return { label: `+${diff.toFixed(0)}% above 30d avg`, score: -1 }
  if (diff < -25) return { label: `${diff.toFixed(0)}% below 30d avg`,  score: +2 }
  if (diff < -10) return { label: `${diff.toFixed(0)}% below 30d avg`,  score: +1 }
  return { label: `Near 30d avg (${diff > 0 ? '+' : ''}${diff.toFixed(0)}%)`, score: 0 }
}

function avgCostLabel(currentPrice, userAvgCost) {
  if (!userAvgCost || !currentPrice) return null
  const diff = ((currentPrice - userAvgCost) / userAvgCost) * 100
  if (diff > 30)  return { label: `${diff.toFixed(0)}% above your avg cost`, score: -2, warn: true }
  if (diff > 10)  return { label: `${diff.toFixed(0)}% above your avg cost`, score: -1, warn: true }
  if (diff < -20) return { label: `${Math.abs(diff).toFixed(0)}% below your avg — DCA opportunity`, score: +2, warn: false }
  if (diff < -5)  return { label: `${Math.abs(diff).toFixed(0)}% below your avg cost`, score: +1, warn: false }
  return { label: `Near your avg cost`, score: 0, warn: false }
}

function verdict(totalScore, mode) {
  if (mode === 'sell') {
    // For sell: high score = good exit (price elevated), low = bad exit (price down)
    if (totalScore >= 3)  return { text: 'Great Exit',       color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    emoji: '🟢' }
    if (totalScore >= 1)  return { text: 'Decent Exit',      color: '#86efac', bg: 'rgba(134,239,172,0.08)', emoji: '🟢' }
    if (totalScore === 0) return { text: 'Neutral',           color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', emoji: '🟡' }
    if (totalScore >= -1) return { text: 'Selling Low',      color: '#fb923c', bg: 'rgba(251,146,60,0.1)',   emoji: '🟡' }
    return                       { text: 'Wait for Recovery', color: '#f87171', bg: 'rgba(248,113,113,0.1)',  emoji: '🔴' }
  }
  if (totalScore >= 3)  return { text: 'Strong Entry',   color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    emoji: '🟢' }
  if (totalScore >= 1)  return { text: 'Decent Entry',   color: '#86efac', bg: 'rgba(134,239,172,0.08)', emoji: '🟢' }
  if (totalScore === 0) return { text: 'Neutral',         color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', emoji: '🟡' }
  if (totalScore >= -1) return { text: 'Be Cautious',    color: '#fb923c', bg: 'rgba(251,146,60,0.1)',   emoji: '🟡' }
  if (totalScore >= -2) return { text: 'FOMO Risk',      color: '#f87171', bg: 'rgba(248,113,113,0.1)',  emoji: '🔴' }
  return                       { text: 'Don\'t Buy Now', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   emoji: '🔴' }
}

export default function BuySignal({ coinId, currentPrice, userAvgCost, mode = 'buy' }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed]   = useState(false)

  const load = (id) => {
    setData(null); setFailed(false); setLoading(true)
    fetchSignalData(id).then(d => { setData(d); setLoading(false); if (!d) setFailed(true) })
  }

  useEffect(() => {
    if (!coinId || coinId.startsWith('stock:') || coinId.startsWith('metal:') ||
        coinId.startsWith('fiat:') || coinId.startsWith('cash:')) return
    load(coinId)
  }, [coinId])

  if (!coinId || coinId.startsWith('stock:') || coinId.startsWith('fiat:') ||
      coinId.startsWith('cash:') || coinId.startsWith('bond:')) return null
  if (loading) return (
    <div style={{ padding:'0.6rem 0.8rem', borderRadius:10, background:'var(--surface-1)', fontSize:'0.75rem', color:'var(--text-sub)', marginBottom:'0.75rem' }}>
      ⏳ Analysing entry timing…
    </div>
  )
  if (failed) return (
    <div style={{ padding:'0.6rem 0.8rem', borderRadius:10, background:'var(--surface-1)', fontSize:'0.75rem', color:'var(--text-sub)', marginBottom:'0.75rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <span>⏱️ {mode === 'sell' ? 'Sell' : 'Buy'} signal unavailable</span>
      <button onClick={() => load(coinId)} style={{ fontSize:'0.7rem', background:'var(--surface-2)', border:'none', color:'var(--text-muted)', borderRadius:6, padding:'0.2rem 0.5rem', cursor:'pointer' }}>Retry</button>
    </div>
  )
  if (!data) return null

  const pct24h  = data.price_change_percentage_24h_in_currency  ?? data.price_change_percentage_24h  ?? 0
  const pct7d   = data.price_change_percentage_7d_in_currency   ?? data.price_change_percentage_7d   ?? 0
  const pct30d  = data.price_change_percentage_30d_in_currency  ?? data.price_change_percentage_30d  ?? 0
  const ath     = data.ath || 0
  const price   = currentPrice || data.current_price || 0

  // 30d avg approximation from pct30d
  const avg30d  = pct30d !== 0 ? price / (1 + pct30d / 100) : null

  const momentum   = momentumLabel(pct24h, pct7d, pct30d)
  const vsAvg      = priceVsAvgLabel(price, avg30d)
  const vsUserCost = avgCostLabel(price, userAvgCost)

  // ATH distance signal
  const athPct = ath > 0 ? ((price - ath) / ath) * 100 : null
  let athSignal = null
  if (athPct !== null) {
    if (athPct > -10)      athSignal = { label: 'Near ATH — high risk entry', score: -2 }
    else if (athPct > -30) athSignal = { label: `${Math.abs(athPct).toFixed(0)}% from ATH`, score: -1 }
    else if (athPct < -75) athSignal = { label: `${Math.abs(athPct).toFixed(0)}% below ATH — deep discount`, score: +2 }
    else if (athPct < -50) athSignal = { label: `${Math.abs(athPct).toFixed(0)}% below ATH`, score: +1 }
  }

  const signals = [momentum, vsAvg, athSignal, vsUserCost].filter(Boolean)
  // For sell mode, invert the score: good entry signals = bad sell signals
  const rawScore = signals.reduce((s, sig) => s + (sig.score || 0), 0)
  const totalScore = mode === 'sell' ? -rawScore : rawScore
  const v = verdict(totalScore, mode)

  const rows = [
    { icon: pct24h >= 0 ? '📈' : '📉', label: '24h move',     value: `${pct24h >= 0 ? '+' : ''}${pct24h.toFixed(1)}%`, warn: pct24h > 10 },
    { icon: pct7d  >= 0 ? '📈' : '📉', label: '7d move',      value: `${pct7d  >= 0 ? '+' : ''}${pct7d.toFixed(1)}%`,  warn: pct7d  > 20 },
    vsAvg      ? { icon: '📊', label: 'vs 30d average', value: vsAvg.label,        warn: vsAvg.score < 0 } : null,
    athSignal  ? { icon: '🏔️', label: 'vs All-Time High', value: athSignal.label,  warn: athSignal.score < 0 } : null,
    momentum.score < -1 ? { icon: '⚠️', label: 'Momentum',  value: momentum.label, warn: true } : null,
    vsUserCost ? { icon: vsUserCost.warn ? '⚠️' : '💰', label: 'vs your avg cost', value: vsUserCost.label, warn: vsUserCost.warn } : null,
  ].filter(Boolean)

  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${v.color}33`,
      background: v.bg, padding: '0.75rem 0.9rem',
      marginBottom: '0.75rem',
    }}>
      {/* Verdict header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{v.emoji}</span>
        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: v.color }}>{v.text}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-sub)', marginLeft: 'auto' }}>
          {mode === 'sell' ? 'Good time to sell?' : 'Good time to buy?'}
        </span>
      </div>

      {/* Signal rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>{r.icon} {r.label}</span>
            <span style={{ fontWeight: 700, color: r.warn ? '#fb923c' : '#86efac' }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Contextual advice */}
      {mode === 'buy' && totalScore <= -2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: '#fca5a5', lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(248,113,113,0.08)', borderRadius: 8 }}>
          ⚠️ Prices may be elevated due to recent hype. Consider waiting for a dip or splitting your buy over several days.
        </div>
      )}
      {mode === 'buy' && totalScore >= 2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: '#86efac', lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(134,239,172,0.06)', borderRadius: 8 }}>
          💡 This looks like a reasonable entry point. Still consider DCA — split across 2–3 buys.
        </div>
      )}
      {mode === 'sell' && totalScore >= 2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: '#86efac', lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(134,239,172,0.06)', borderRadius: 8 }}>
          💡 Price looks elevated — good time to take profit. Consider selling in parts to avoid missing further upside.
        </div>
      )}
      {mode === 'sell' && totalScore <= -2 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: '#fca5a5', lineHeight: 1.5,
          padding: '0.4rem 0.6rem', background: 'rgba(248,113,113,0.08)', borderRadius: 8 }}>
          ⚠️ You may be selling at a low. Unless you need the funds urgently, consider waiting for a recovery.
        </div>
      )}
    </div>
  )
}
