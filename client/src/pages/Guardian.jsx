import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'
import PortfolioGuardian from '../components/PortfolioGuardian'

// Portfolio Guardian lives on its own page, reachable only from the drawer —
// it used to be buried in the long Settings page.
export default function Guardian() {
  const navigate = useNavigate()
  useEffect(() => { track('guardian_view') }, [])

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <h2 style={{ margin:0, fontSize:'1.2rem', display:'inline-flex', alignItems:'center', gap:'0.45rem' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Portfolio Guardian
        </h2>
      </div>

      <div className="settings-section glass-card">
        <p className="settings-hint" style={{ marginBottom: '0.85rem' }}>
          Dead Man's Switch — notifies your heirs if you stop opening WalletLens.
        </p>
        <PortfolioGuardian />
      </div>
    </div>
  )
}
