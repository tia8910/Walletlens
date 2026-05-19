import { useState, useEffect } from 'react'

const SECTORS = {
  'Layer 1':    ['bitcoin','ethereum','solana','avalanche-2','cardano','near','aptos','sui'],
  'Layer 2':    ['matic-network','arbitrum','optimism','base','starknet','zksync'],
  'DeFi':       ['uniswap','aave','curve-dao-token','compound-governance-token','maker','lido-dao'],
  'AI/Data':    ['fetch-ai','singularitynet','ocean-protocol','render-token','bittensor'],
  'Gaming/NFT': ['the-sandbox','decentraland','axie-infinity','immutable-x','gala'],
  'Meme':       ['dogecoin','shiba-inu','pepe','floki','bonk'],
  'Exchange':   ['binancecoin','cronos','okb','kucoin-shares'],
}

const ALL_IDS = [...new Set(Object.values(SECTORS).flat())]

let _cache = null, _cacheTime = 0

function tileColor(pct) {
  if (pct > 10) return '#22c55e'
  if (pct > 3)  return '#86efac'
  if (pct > -3) return '#94a3b8'
  if (pct > -10) return '#fb923c'
  return '#f87171'
}

async function fetchSectors() {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ALL_IDS.join(',')}&price_change_percentage=7d&per_page=250`
  const proxies = [u => u, u => 'https://corsproxy.io/?' + encodeURIComponent(u), u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)]
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const data = await res.json()
      const byId = {}
      data.forEach(c => { byId[c.id] = c })
      const result = Object.entries(SECTORS).map(([sector, ids]) => {
        const coins = ids.map(id => byId[id]).filter(Boolean)
        const changes = coins.map(c => c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d ?? 0)
        const avg = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0
        const top = coins.reduce((best, c) => {
          const v = c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d ?? 0
          return !best || v > (best.price_change_percentage_7d_in_currency ?? best.price_change_percentage_7d ?? 0) ? c : best
        }, null)
        return { sector, avg, top }
      })
      result.sort((a, b) => b.avg - a.avg)
      return result
    } catch { /* try next proxy */ }
  }
  return null
}

export default function SectorHeatmap() {
  const [open, setOpen]     = useState(false)
  const [tiles, setTiles]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!open) return
    const now = Date.now()
    if (_cache && now - _cacheTime < 10 * 60 * 1000) { setTiles(_cache); return }
    setLoading(true); setError(null)
    fetchSectors().then(result => {
      if (result) { _cache = result; _cacheTime = Date.now(); setTiles(result) }
      else setError('Failed to load sector data')
      setLoading(false)
    })
  }, [open])

  const hot  = tiles ? tiles.filter(t => t.avg >= 3).length : 0
  const cold = tiles ? tiles.filter(t => t.avg <= -3).length : 0

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', overflow: 'hidden', marginTop: '1rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Sector Rotation Heatmap</span>
        <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 1.1rem 1.1rem' }}>
          {loading && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', padding: '1rem 0' }}>Loading…</div>}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
              <span style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</span>
              <button onClick={() => { setError(null); _cache = null; setOpen(false); setTimeout(() => setOpen(true), 50) }}
                style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.5)', borderRadius: 6, padding: '0.2rem 0.5rem', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          )}
          {tiles && (
            <>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.75rem' }}>
                {hot > 0 && <span style={{ color: '#22c55e', marginRight: '0.75rem' }}>🔥 Hot: {hot} sector{hot > 1 ? 's' : ''}</span>}
                {cold > 0 && <span style={{ color: '#fb923c' }}>❄️ Cold: {cold} sector{cold > 1 ? 's' : ''}</span>}
                {hot === 0 && cold === 0 && <span>Neutral market across sectors</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {tiles.map(({ sector, avg, top }) => {
                  const color = tileColor(avg)
                  const sign = avg >= 0 ? '+' : ''
                  return (
                    <div key={sector} style={{ background: color + '1a', border: `1px solid ${color}44`, borderRadius: '0.6rem', padding: '0.6rem 0.7rem' }}>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.2rem' }}>{sector}</div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color, lineHeight: 1 }}>{sign}{avg.toFixed(1)}%</div>
                      {top && <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>↑ {top.symbol}</div>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
