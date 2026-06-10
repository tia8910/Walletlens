import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { findTerm, GLOSSARY } from '../data/glossary'
import { track } from '../analytics'

const ARROW = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
)

// Programmatic glossary page: /learn/:slug
// One concise, schema-rich definition per investing/crypto term — designed to
// be lifted by answer engines (Google AI Overviews, ChatGPT, Perplexity).
// Prerendered to static HTML by scripts/prerender.mjs.
export default function Learn() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const term = findTerm(slug)

  useEffect(() => {
    if (term) {
      track('learn_view', { slug })
      document.title = `What Is ${term.term}? — WalletLens`
    } else {
      navigate('/dashboard', { replace: true })
    }
  }, [term, navigate, slug])

  if (!term) return null

  const paragraphs = term.body.split('\n\n')
  const related = (term.related || [])
    .map(s => GLOSSARY.find(t => t.slug === s))
    .filter(Boolean)

  return (
    <div className="wl-app wl-app-landing">
      <main className="tc-page">
        <header className="tc-head">
          <Link to="/" className="tc-brand" aria-label="WalletLens home">
            <Logo size={34} /> <span>WalletLens</span>
          </Link>
        </header>

        <section className="tc-hero">
          <h1 className="tc-h1">What Is {term.term}?</h1>
          <p className="tc-sub">{term.short}</p>
        </section>

        <section className="tc-section">
          <h2>Definition</h2>
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </section>

        <section className="tc-section">
          <h2>Track it in WalletLens</h2>
          <p>
            WalletLens is a free, private net-worth tracker that puts concepts like this into practice —
            it tracks your crypto, stocks, gold and cash in one dashboard, computing your cost basis,
            P&amp;L and allocation automatically with live prices. No account, no sign-up, and your
            data stays on your device.
          </p>
          <button className="lp-cta-primary" style={{ marginTop: '0.9rem' }}
            onClick={() => { track('learn_cta', { slug }); navigate('/dashboard') }}>
            Open free tracker
            {ARROW}
          </button>
        </section>

        {related.length > 0 && (
          <section className="tc-section">
            <h2>Related terms</h2>
            <ul className="tc-list">
              {related.map(r => (
                <li key={r.slug}><Link to={`/learn/${r.slug}/`}>{r.term}</Link></li>
              ))}
            </ul>
          </section>
        )}

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
