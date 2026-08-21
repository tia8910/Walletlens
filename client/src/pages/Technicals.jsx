import { useEffect, useMemo, useState } from 'react'
import { noteFeatureUse } from '../featureUse'
import Icon from '../components/Icon'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import MagicAnalysisPanel from '../components/MagicAnalysisPanel'
import { useLanguage } from '../LanguageContext'

export default function Technicals() {
  // Records the discovery, so the feature tip for this page stops being
  // offered to someone who has already found it.
  useEffect(() => { noteFeatureUse('technicals') }, [])

  const { t } = useLanguage()
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
        <p className="magic-hero-sub"><b>{t('miTitle')}</b> — {t('miSubtitle')}</p>
      </div>
      <MagicAnalysisPanel enriched={enriched} totalValue={totalValue} />
    </div>
  )
}
