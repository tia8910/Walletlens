import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { noteFeatureUse } from '../featureUse'
import Icon from '../components/Icon'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import TechChartPanel from '../components/TechChartPanel'
import { useLanguage } from '../LanguageContext'

// The alarm settings and the chart signal and portfolio goal alerts, the same
// panel as Alerts > Signals & goals, so a signal can be set up where it is read.
const ProAlerts = lazy(() => import('../components/ProAlerts'))
// The Smart Sell Plan reads the same charts, so it lives here with them.
const AISellPlan = lazy(() => import('../components/AISellPlan'))

export default function Technicals() {
  // Records the discovery, so the feature tip for this page stops being
  // offered to someone who has already found it.
  useEffect(() => { noteFeatureUse('technicals') }, [])

  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [portfolio, setPortfolio] = useState([])
  const [prices, setPrices] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [coinTargets, setCoinTargets] = useState({})
  const loadTargets = () => api.getCoinTargets().then(ct => setCoinTargets(ct || {})).catch(() => {})

  useEffect(() => {
    track('technicals_page_view')
    let alive = true
    async function load() {
      let p = []
      try { p = (await api.getPortfolio()) || [] } catch {}
      if (!alive) return
      setPortfolio(p)
      loadTargets()
      if (p.length) {
        const ids = p.map(h => h.coin_id).join(',')
        api.getPrices(ids).then(px => alive && setPrices(px || {})).catch(() => {})
      }
      setLoaded(true)
    }
    load()
    return () => { alive = false }
  }, [])

  const { enriched } = useMemo(() => {
    const raw = portfolio.map(h => {
      const price = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value = h.amount * price
      const invested = h.total_invested || 0
      const pnl = value - invested
      return { ...h, price, value, invested, pnl, pnlPct: invested > 0 ? (pnl / invested) * 100 : 0 }
    })
    return { enriched: raw }
  }, [portfolio, prices])

  if (!loaded) {
    return <div className="dvx-page"><div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem' }}>{t('tnLoading')}</div></div>
  }

  if (portfolio.length === 0) {
    return (
      <div className="dvx-page">
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ marginBottom: '0.5rem', display:'flex', justifyContent:'center' }}><Icon name="ruler" size={36} /></div>
          <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.15rem' }}>{t('tnTitle')}</h2>
          <p className="muted" style={{ maxWidth: 420, margin: '0 auto 1.2rem' }}>
            {t('tnEmptyBody')}
          </p>
          <button className="dvx-btn-primary" onClick={() => navigate('/dashboard')}>{t('tnGoDashboard')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dvx-page">
      <div className="magic-hero">
        <h1 className="magic-hero-title" style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:'0.35rem' }}><Icon name="ruler" size={20} /> <span>{t('tnTitle')}</span></h1>
        <p className="magic-hero-sub">{t('acSignalsDesc')}</p>
      </div>
      <TechChartPanel enriched={enriched} initialPick={location.state?.coinId || null} />
      <Suspense fallback={null}>
        <AISellPlan enriched={enriched} prices={prices} coinTargets={coinTargets} onTargetsChange={loadTargets} />
      </Suspense>
      <section className="tn-signal-alerts" aria-labelledby="tn-signal-alerts-h" style={{ marginTop: '1.25rem' }}>
        <h2 id="tn-signal-alerts-h" style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'1.05rem', margin:'0 0 0.75rem' }}>
          <Icon name="siren" size={18} /> <span>{t('alTab')}</span>
        </h2>
        <Suspense fallback={<div className="glass-card" style={{ textAlign: 'center', padding: '1.5rem' }}>{t('tnLoading')}</div>}>
          <ProAlerts enriched={enriched} prices={prices} />
        </Suspense>
      </section>
    </div>
  )
}
