import { useEffect, useState, useRef } from 'react'

const PROXIES = [
  url => 'https://corsproxy.io/?' + encodeURIComponent(url),
  url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
  url => 'https://cors.eu.org/' + url,
  url => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url),
]

const CG_TO_CAP = { 'ripple':'xrp','binancecoin':'binance-coin','avalanche-2':'avalanche','matic-network':'polygon','near':'near-protocol','the-sandbox':'the-sandbox-land','axie-infinity':'axie-infinity-shards','fetch-ai':'fetch','kucoin-shares':'kucoin-shares' }
const toCapId = id => CG_TO_CAP[id] || id

const BINANCE_SYM = { 'bitcoin':'BTCUSDT','ethereum':'ETHUSDT','solana':'SOLUSDT','ripple':'XRPUSDT','binancecoin':'BNBUSDT','cardano':'ADAUSDT','avalanche-2':'AVAXUSDT','matic-network':'MATICUSDT','near':'NEARUSDT','uniswap':'UNIUSDT','aave':'AAVEUSDT','chainlink':'LINKUSDT','dogecoin':'DOGEUSDT','shiba-inu':'SHIBUSDT','polkadot':'DOTUSDT','litecoin':'LTCUSDT','tron':'TRXUSDT','stellar':'XLMUSDT','cosmos':'ATOMUSDT','aptos':'APTUSDT','sui':'SUIUSDT','arbitrum':'ARBUSDT','optimism':'OPUSDT','fetch-ai':'FETUSDT','render-token':'RENDERUSDT','pepe':'PEPEUSDT','bonk':'BONKUSDT','floki':'FLOKIUSDT','the-sandbox':'SANDUSDT','decentraland':'MANAUSDT','axie-infinity':'AXSUSDT','immutable-x':'IMXUSDT','gala':'GALAUSDT','lido-dao':'LDOUSDT','curve-dao-token':'CRVUSDT','maker':'MKRUSDT' }

async function batchFetchSparklines(coinIds) {
  // Try CoinGecko sparklines via all CORS proxies in parallel
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&sparkline=true&price_change_percentage=7d&per_page=50`
  try {
    const series = await Promise.any(
      PROXIES.map(proxy =>
        fetch(proxy(url), { signal: AbortSignal.timeout(6000) })
          .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
          .then(data => {
            const s = {}
            for (const coin of data) {
              if (coin.sparkline_in_7d?.price?.length >= 10) s[coin.id] = coin.sparkline_in_7d.price
            }
            if (Object.keys(s).length === 0) throw new Error('no data')
            return s
          })
      )
    )
    if (series) return series
  } catch { /* all proxies failed */ }

  // Fallback: CryptoCompare histohour (native CORS, no key)
  try {
    const series = {}
    await Promise.all(coinIds.map(async id => {
      const sym = BINANCE_SYM[id]?.replace(/USDT$/, '').replace(/^1000/, '')
      if (!sym) return
      try {
        const res = await fetch(`https://min-api.cryptocompare.com/data/v2/histohour?fsym=${sym}&tsym=USD&limit=168`, { signal: AbortSignal.timeout(7000) })
        if (!res.ok) return
        const json = await res.json()
        const rows = json?.Data?.Data
        if (Array.isArray(rows) && rows.length >= 10) series[id] = rows.map(k => k.close)
      } catch { /* skip */ }
    }))
    if (Object.keys(series).length >= 2) return series
  } catch { /* exhausted */ }

  // Final fallback: Binance klines (1h, 168 candles = 7 days)
  try {
    const series = {}
    await Promise.all(coinIds.map(async id => {
      const sym = BINANCE_SYM[id]
      if (!sym) return
      try {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1h&limit=168`, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return
        const klines = await res.json()
        if (klines?.length >= 10) series[id] = klines.map(k => parseFloat(k[4]))
      } catch { /* skip */ }
    }))
    if (Object.keys(series).length >= 2) return series
  } catch { /* exhausted */ }

  return null
}

function pearson(a, b) {
  if (!a || !b || a.length < 3 || b.length < 3) return null
  const n = Math.min(a.length, b.length)
  const ra = [], rb = []
  for (let i = 1; i < n; i++) {
    if (a[i - 1] === 0 || b[i - 1] === 0) continue
    ra.push((a[i] - a[i - 1]) / a[i - 1])
    rb.push((b[i] - b[i - 1]) / b[i - 1])
  }
  const mn = ra.length
  if (mn < 2) return null
  const meanA = ra.reduce((s, v) => s + v, 0) / mn
  const meanB = rb.reduce((s, v) => s + v, 0) / mn
  let num = 0, dA = 0, dB = 0
  for (let i = 0; i < mn; i++) {
    const da = ra[i] - meanA, db = rb[i] - meanB
    num += da * db; dA += da * da; dB += db * db
  }
  const denom = Math.sqrt(dA * dB)
  return denom === 0 ? null : Math.max(-1, Math.min(1, num / denom))
}

function corrColor(r) {
  if (r === null) return 'var(--surface-1)'
  if (r >= 0.8)  return 'rgba(248,113,113,0.55)'
  if (r >= 0.5)  return 'rgba(251,146,60,0.40)'
  if (r >= 0.2)  return 'rgba(250,204,21,0.25)'
  if (r >= -0.2) return 'rgba(148,163,184,0.18)'
  if (r >= -0.5) return 'rgba(96,165,250,0.30)'
  return 'rgba(34,197,94,0.40)'
}

function corrTextColor(r) {
  if (r === null) return 'var(--text-sub)'
  if (r >= 0.8)  return '#f87171'
  if (r >= 0.5)  return '#fb923c'
  if (r >= 0.2)  return '#fde68a'
  if (r >= -0.2) return 'var(--text-muted)'
  if (r >= -0.5) return '#93c5fd'
  return '#4ade80'
}

const MAX_ASSETS = 8
let _cache = null, _cacheTime = 0

export default function CorrelationMatrix({ enriched = [] }) {
  const [matrix, setMatrix]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [open, setOpen]       = useState(true)

  const cryptoHoldings = enriched
    .filter(h => h.coin_id && !h.coin_id.startsWith('stock:') && !h.coin_id.startsWith('metal:') && !h.coin_id.startsWith('cash:') && !h.coin_id.startsWith('fiat:') && !h.coin_id.startsWith('real:'))
    .slice(0, MAX_ASSETS)

  async function compute() {
    if (cryptoHoldings.length < 2) return
    setLoading(true); setError(null)

    const now = Date.now()
    let series = _cache && now - _cacheTime < 10 * 60 * 1000 ? _cache : null

    if (!series) {
      series = await batchFetchSparklines(cryptoHoldings.map(h => h.coin_id))
      if (series) { _cache = series; _cacheTime = now }
    }

    if (!series) { setError('Price data unavailable. Try again later.'); setLoading(false); return }

    const ids = cryptoHoldings.map(h => h.coin_id).filter(id => series[id])
    if (ids.length < 2) { setError('Not enough price data for your holdings.'); setLoading(false); return }

    const mat = {}
    for (const a of ids) {
      mat[a] = {}
      for (const b of ids) {
        mat[a][b] = a === b ? 1 : pearson(series[a], series[b])
      }
    }

    setMatrix({ mat, ids, holdings: cryptoHoldings.filter(h => ids.includes(h.coin_id)) })
    setLoading(false)
  }

  useEffect(() => {
    if (open && !matrix && !loading) compute()
  }, [open])

  if (cryptoHoldings.length < 2) return null

  return (
    <div className="cm-root glass-card" style={{ marginBottom: '0.75rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 1.1rem', color: 'inherit' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.5 }}>
          Correlation Matrix
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-sub)', marginLeft: 'auto' }}>
          7-day · {cryptoHoldings.length} assets
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: 0.35, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding: '0 1rem 1rem' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-sub)', fontSize: '0.8rem' }}>
              Fetching price data…
            </div>
          )}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
              <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</span>
              <button onClick={() => { setError(null); setMatrix(null); _cache = null; compute() }}
                style={{ fontSize: '0.7rem', background: 'var(--surface-2)', border: 'none', color: 'var(--text-muted)', borderRadius: 6, padding: '0.2rem 0.5rem', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          )}
          {matrix && (
            <>
              <div style={{ overflowX: 'auto', marginBottom: '0.8rem' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: matrix.ids.length * 52 }}>
                  <thead>
                    <tr>
                      <td style={{ width: 44 }} />
                      {matrix.holdings.map(h => (
                        <th key={h.coin_id} style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', padding: '0 4px 6px', width: 44 }}>
                          {(h.coin_symbol || h.coin_id).toUpperCase().slice(0, 5)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.holdings.map(rowH => (
                      <tr key={rowH.coin_id}>
                        <td style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', paddingRight: '6px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {(rowH.coin_symbol || rowH.coin_id).toUpperCase().slice(0, 5)}
                        </td>
                        {matrix.holdings.map(colH => {
                          const r = matrix.mat[rowH.coin_id]?.[colH.coin_id] ?? null
                          const isDiag = rowH.coin_id === colH.coin_id
                          return (
                            <td key={colH.coin_id} style={{ width: 44, height: 36, background: corrColor(r), borderRadius: 6, textAlign: 'center', fontSize: isDiag ? '0.65rem' : '0.68rem', fontWeight: 700, color: isDiag ? 'rgba(255,255,255,0.25)' : corrTextColor(r), padding: '0 2px', border: '1px solid rgba(255,255,255,0.04)' }}>
                              {isDiag ? '—' : (r !== null ? r.toFixed(2) : '—')}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)' }}>
                {[
                  { color: '#f87171', label: '> 0.8  High risk' },
                  { color: '#fb923c', label: '0.5–0.8  Correlated' },
                  { color: '#94a3b8', label: '~0  Uncorrelated' },
                  { color: '#93c5fd', label: '< -0.2  Diversifying' },
                  { color: '#4ade80', label: '< -0.5  Hedge' },
                ].map(l => (
                  <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, opacity: 0.8, flexShrink: 0 }} />
                    {l.label}
                  </span>
                ))}
              </div>
              {(() => {
                const pairs = []
                for (const a of matrix.ids) {
                  for (const b of matrix.ids) {
                    if (a >= b) continue
                    const r = matrix.mat[a]?.[b]
                    if (r !== null) pairs.push({ a, b, r })
                  }
                }
                const worst = pairs.sort((x, y) => y.r - x.r)[0]
                if (!worst || worst.r < 0.7) return null
                const symA = (matrix.holdings.find(h => h.coin_id === worst.a)?.coin_symbol || worst.a).toUpperCase()
                const symB = (matrix.holdings.find(h => h.coin_id === worst.b)?.coin_symbol || worst.b).toUpperCase()
                return (
                  <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 10, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', fontSize: '0.74rem', color: '#fca5a5', lineHeight: 1.5 }}>
                    ⚠️ <strong>{symA} & {symB}</strong> move together ({worst.r.toFixed(2)}) — holding both adds concentration risk without diversification.
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}
    </div>
  )
}
