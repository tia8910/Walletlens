import { useState, useEffect } from 'react'

const NON_CRYPTO = ['stock:', 'metal:', 'fiat:', 'cash:', 'bond:', 'real:', 'other:']

function isCrypto(id) {
  const idL = (id || '').toLowerCase()
  return !NON_CRYPTO.some(p => idL.startsWith(p)) &&
    !idL.includes('apartment') && !idL.includes('appartment') && !idL.includes('property')
}

function badge(impact) {
  if (impact < 0.1) return { label: 'High Liquidity', color: '#22c55e', dot: '🟢' }
  if (impact < 1)   return { label: 'Medium', color: '#fb923c', dot: '🟡' }
  return { label: 'Low Liquidity', color: '#f87171', dot: '🔴' }
}

function fmt(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(2)
}

export default function LiquidityRisk({ holdings }) {
  const [open, setOpen]       = useState(false)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const cryptoHoldings = (holdings || []).filter(h => isCrypto(h.coin_id || h.id))

  useEffect(() => {
    if (!open || cryptoHoldings.length === 0 || data) return
    const ids = cryptoHoldings.map(h => h.coin_id || h.id)
    setLoading(true); setError(null)
    ;(async () => {
      let volMap = null

      // Try CoinGecko with CORS proxies
      const cgUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&price_change_percentage=24h`
      const proxies = [u => u, u => 'https://corsproxy.io/?' + encodeURIComponent(u), u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)]
      for (const proxy of proxies) {
        try {
          const res = await fetch(proxy(cgUrl), { signal: AbortSignal.timeout(5000) })
          if (!res.ok) continue
          const markets = await res.json()
          volMap = {}
          markets.forEach(m => { volMap[m.id] = m.total_volume })
          break
        } catch { /* try next */ }
      }

      // Fallback: CoinCap (open CORS, no key needed)
      if (!volMap) {
        try {
          const res = await fetch(`https://api.coincap.io/v2/assets?ids=${ids.join(',')}`, { signal: AbortSignal.timeout(6000) })
          if (res.ok) {
            const { data: assets } = await res.json()
            volMap = {}
            assets?.forEach(a => { volMap[a.id] = parseFloat(a.volumeUsd24Hr) || 0 })
          }
        } catch { /* exhausted */ }
      }

      if (!volMap) { setError('Failed to fetch volume data. Try again later.'); setLoading(false); return }
      const rows = cryptoHoldings
        .map(h => {
          const id = h.coin_id || h.id
          const vol = volMap[id] || 0
          const impact = vol > 0 ? (h.value / vol) * 100 : null
          return { id, symbol: h.coin_symbol || h.symbol, value: h.value, vol, impact }
        })
        .filter(r => r.vol > 0)
        .sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1))
      setData(rows); setLoading(false)
    })()
  }, [open, cryptoHoldings.length])

  if (cryptoHoldings.length === 0) return null

  const lowCount = data ? data.filter(r => r.impact >= 1).length : 0

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: '1rem',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.9rem 1.1rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1rem' }}>💧</span>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Liquidity Risk Score</span>
          {data && (
            <span style={{
              fontSize: '0.72rem',
              color: lowCount > 0 ? '#f87171' : '#22c55e',
              background: lowCount > 0 ? 'rgba(248,113,113,0.1)' : 'rgba(34,197,94,0.1)',
              borderRadius: 6,
              padding: '0.15rem 0.5rem',
              fontWeight: 700,
            }}>
              {lowCount > 0 ? `${lowCount} of ${data.length} low liquidity` : `${data.length} of ${data.length} liquid`}
            </span>
          )}
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '0.8rem 1.1rem 1rem' }}>
          {loading && (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', padding: '1.5rem 0' }}>
              Fetching volume data…
            </div>
          )}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
              <span style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</span>
              <button onClick={() => { setError(null); setData(null) }} style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer' }}>Retry</button>
            </div>
          )}
          {data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
                gap: '0.5rem',
                padding: '0 0.1rem',
                marginBottom: '0.25rem',
              }}>
                {['Asset', 'Holding', '24h Volume', 'Market Impact'].map(h => (
                  <span key={h} style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>{h}</span>
                ))}
              </div>
              {data.map(row => {
                const b = badge(row.impact)
                return (
                  <div key={row.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1fr',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.5rem 0.6rem',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {(row.symbol || row.id).toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
                      {fmt(row.value)}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
                      {fmt(row.vol)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: b.color }}>
                        {row.impact.toFixed(3)}%
                      </span>
                      <span style={{
                        fontSize: '0.68rem',
                        color: b.color,
                        background: b.color + '18',
                        borderRadius: 5,
                        padding: '0.1rem 0.35rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}>
                        {b.dot} {b.label}
                      </span>
                    </div>
                  </div>
                )
              })}
              <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', margin: '0.4rem 0 0' }}>
                Market impact = (holding value / 24h volume) × 100. &gt;1% means selling could move the market.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
