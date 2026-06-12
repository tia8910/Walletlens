import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { findComparison } from '../data/comparisons'
import { track } from '../analytics'

const ARROW = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
)

const TH = { padding: '0.55rem', borderBottom: '1px solid rgba(0,230,118,0.25)', textAlign: 'left', fontWeight: 700 }
const TD = { padding: '0.55rem', borderBottom: '1px solid rgba(0,230,118,0.12)', textAlign: 'left', verticalAlign: 'top' }
const TD_US = { ...TD, color: 'var(--g-ink)', fontWeight: 600 }

// Programmatic comparison page: /vs/:slug — "WalletLens vs <competitor>".
// High commercial-intent searches; prerendered to static HTML.
export default function Compare() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const c = findComparison(slug)

  useEffect(() => {
    if (c) {
      track('compare_view', { slug })
      document.title = `WalletLens vs ${c.competitor} — WalletLens`
    } else {
      navigate('/dashboard', { replace: true })
    }
  }, [c, navigate, slug])

  if (!c) return null

  return (
    <div className="wl-app wl-app-landing">
      <main className="tc-page">
        <header className="tc-head">
          <Link to="/" className="tc-brand" aria-label="WalletLens home">
            <Logo size={34} /> <span>WalletLens</span>
          </Link>
        </header>

        <section className="tc-hero">
          <h1 className="tc-h1">WalletLens vs {c.competitor}</h1>
          <p className="tc-sub">{c.tagline}</p>
          <div className="tc-cta-row">
            <button className="lp-cta-primary"
              onClick={() => { track('compare_cta', { slug }); navigate('/dashboard') }}>
              Try WalletLens free
              {ARROW}
            </button>
          </div>
        </section>

        <section className="tc-section">
          <h2>Feature comparison</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '0.6rem' }}>
            <thead>
              <tr>
                <th style={TH}>Feature</th>
                <th style={TH}>WalletLens</th>
                <th style={TH}>{c.competitor}</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r, i) => (
                <tr key={i}>
                  <td style={TD}>{r.feature}</td>
                  <td style={TD_US}>{r.walletlens}</td>
                  <td style={TD}>{r.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="tc-section">
          <h2>The verdict</h2>
          <p>{c.verdict}</p>
          <button className="lp-cta-primary" style={{ marginTop: '0.9rem' }}
            onClick={() => { track('compare_cta_bottom', { slug }); navigate('/dashboard') }}>
            Open WalletLens free
            {ARROW}
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.8rem', opacity: 0.6 }}>
            Comparison reflects publicly documented features and is for general guidance, not endorsement or financial advice. Verify current pricing and features with each provider.
          </p>
        </section>

        <footer className="tc-foot">
          <Link to="/free-net-worth-tracker/">Free net worth tracker</Link>
          <span>·</span>
          <Link to="/blog/">Blog</Link>
          <span>·</span>
          <Link to="/about/">About</Link>
          <span>·</span>
          <Link to="/">Home</Link>
        </footer>
      </main>
    </div>
  )
}
