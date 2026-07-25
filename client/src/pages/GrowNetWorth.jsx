import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import Icon from '../components/Icon'

const GrowthPlan = lazy(() => import('../components/GrowthPlan'))

// Grow My Net Worth as a real route (/grow) rather than an overlay, so it gets
// its own page, its own scroll, and the browser/device back button for free.
export default function GrowNetWorth() {
  const navigate = useNavigate()
  // Goals can deep-link a specific target, e.g. /grow?goal=50000&name=House
  const [params] = useSearchParams()
  const goalParam = Number(params.get('goal')) || null
  const goalName = params.get('name') || ''
  const [portfolio, setPortfolio] = useState([])
  const [prices, setPrices] = useState({})
  const [transactions, setTransactions] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    track('grow_page_view')
    async function load() {
      const [p, txs] = await Promise.all([api.getPortfolio(), api.getTransactions()])
      setPortfolio(p || [])
      setTransactions(txs || [])
      if (p?.length) {
        const ids = p.map(h => h.coin_id).join(',')
        api.getPrices(ids).then(px => setPrices(px || {})).catch(() => {})
      }
      setLoaded(true)
    }
    load()
  }, [])

  const { enriched, totalValue, totalInvested } = useMemo(() => {
    const raw = portfolio.map(h => {
      const price = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value = h.amount * price
      const invested = h.total_invested || 0
      const pnl = value - invested
      return { ...h, price, value, invested, pnl, pnlPct: invested > 0 ? (pnl / invested) * 100 : 0 }
    }).sort((a, b) => b.value - a.value)
    return {
      enriched: raw,
      totalValue: raw.reduce((s, h) => s + h.value, 0),
      totalInvested: raw.reduce((s, h) => s + h.invested, 0),
    }
  }, [portfolio, prices])

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/coach'))

  return (
    <div className="gnw-page">
      <div className="gnw-header">
        <button className="back-btn" onClick={back}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <h1 className="gnw-title">
          <Icon name="trend-up" size={17} /> {goalName ? `Reaching “${goalName}”` : 'Grow My Net Worth'}
        </h1>
      </div>

      {!loaded ? (
        <p className="gnw-msg">Loading your portfolio…</p>
      ) : !enriched.length ? (
        <p className="gnw-msg">Add some holdings first — then we can simulate how your net worth could grow.</p>
      ) : (
        <Suspense fallback={<p className="gnw-msg">Loading engine…</p>}>
          <GrowthPlan
            asPage
            initialGoal={goalParam}
            enriched={enriched}
            prices={prices}
            transactions={transactions}
            totalValue={totalValue}
            totalInvested={totalInvested}
          />
        </Suspense>
      )}
    </div>
  )
}
