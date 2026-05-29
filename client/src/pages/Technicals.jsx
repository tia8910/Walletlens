import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import MagicAnalysisPanel from '../components/MagicAnalysisPanel'

export default function Technicals() {
  const navigate = useNavigate()
  const [portfolio, setPortfolio] = useState([])
  const [prices, setPrices] = useState({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    track('technicals_page_view')
    let alive = true
    async function load() {
      let p = []
      try { p = (await api.getPortfolio()) || [] } catch {}
      if (!alive) return
      setPortfolio(p)
      if (p.length) {
        const ids = p.map(h => h.coin_id).join(',')
        api.getPrices(ids).then(px => alive && setPrices(px || {})).catch(() => {})
      }
      setLoaded(true)
    }
    load()
    return () => { alive = false }
  }, [])

  const { enriched, totalValue } = useMemo(() => {
    const raw = portfolio.map(h => {
      const price = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value = h.amount * price
      const invested = h.total_invested || 0
      const pnl = value - invested
      return { ...h, price, value, invested, pnl, pnlPct: invested > 0 ? (pnl / invested) * 100 : 0 }
    })
    return { enriched: raw, totalValue: raw.reduce((s, h) => s + h.value, 0) }
  }, [portfolio, prices])

  if (!loaded) {
    return <div className="dvx-page"><div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem' }}>Loading analysis…</div></div>
  }

  if (portfolio.length === 0) {
    return (
      <div className="dvx-page">
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📐</div>
          <h2 style={{ margin: '0 0 0.4rem' }}>Technical & On-Chain Analysis</h2>
          <p className="muted" style={{ maxWidth: 420, margin: '0 auto 1.2rem' }}>
            Add a crypto holding and the Magic Indicator will merge technicals, on-chain flow,
            volume, whale activity and fundamentals into a single direction for each asset.
          </p>
          <button className="dvx-btn-primary" onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dvx-page">
      <div className="magic-hero">
        <h1 className="magic-hero-title">📐 Technical & On-Chain Analysis</h1>
        <p className="magic-hero-sub">
          The <b>Magic Indicator</b> fuses five signals — technical, on-chain, volume, whales and
          fundamentals — into one direction per crypto holding.
        </p>
      </div>
      <MagicAnalysisPanel enriched={enriched} totalValue={totalValue} />
    </div>
  )
}
