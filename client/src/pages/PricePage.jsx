import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import CoinLogo from '../components/CoinLogo'
import { findPriceAsset } from '../data/priceAssets'
import { track } from '../analytics'

const ARROW = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
)

function fmtPrice(n) {
  if (n == null) return null
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n.toLocaleString('en-US', { maximumSignificantDigits: 6 })
}

// Programmatic live-price page: /price/:slug — "X price today".
// Crypto (and gold via PAX Gold proxy) fetch a live price client-side from the
// public CoinGecko endpoint; stocks/metals without a public feed show a
// graceful fallback that funnels into the app. Prerendered for SEO.
export default function PricePage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const asset = findPriceAsset(slug)

  const [price, setPrice] = useState(null)
  const [change, setChange] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ok | unavailable

  useEffect(() => {
    if (asset) {
      track('price_view', { slug })
      document.title = `${asset.name} Price Today (${asset.symbol}) — WalletLens`
    } else {
      navigate('/dashboard', { replace: true })
    }
  }, [asset, navigate, slug])

  useEffect(() => {
    if (!asset) return
    if (!asset.cgId) { setStatus('unavailable'); return }
    let cancelled = false
    setStatus('loading')
    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${asset.cgId}&vs_currencies=usd&include_24hr_change=true`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('bad status')))
      .then(d => {
        if (cancelled) return
        const row = d?.[asset.cgId]
        if (row && typeof row.usd === 'number') {
          setPrice(row.usd)
          setChange(typeof row.usd_24h_change === 'number' ? row.usd_24h_change : null)
          setStatus('ok')
        } else {
          setStatus('unavailable')
        }
      })
      .catch(() => { if (!cancelled) setStatus('unavailable') })
    return () => { cancelled = true }
  }, [asset])

  if (!asset) return null

  const changePos = change != null && change >= 0

  return (
    <div className="wl-app wl-app-landing">
      <main className="tc-page">
        <header className="tc-head">
          <Link to="/" className="tc-brand" aria-label="WalletLens home">
            <Logo size={34} /> <span>WalletLens</span>
          </Link>
        </header>

        <section className="tc-hero">
          <CoinLogo symbol={asset.symbol} coinId={asset.id} size={56} className="tc-coin-logo" />
          <h1 className="tc-h1">{asset.name} Price Today ({asset.symbol})</h1>

          <div style={{ margin: '1.1rem 0 0.3rem', fontSize: 'clamp(2rem, 7vw, 3rem)', fontWeight: 900, letterSpacing: '-0.02em' }}>
            {status === 'ok' && price != null ? `$${fmtPrice(price)}` : status === 'loading' ? '…' : '—'}
          </div>
          {status === 'ok' && change != null && (
            <div style={{ fontWeight: 700, color: changePos ? 'var(--g-ink)' : '#ef4444', marginBottom: '0.2rem' }}>
              {changePos ? '+' : ''}{change.toFixed(2)}% (24h)
            </div>
          )}
          {status === 'unavailable' && (
            <p style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: '0.2rem' }}>
              Open WalletLens for the live {asset.symbol} price and your own P&amp;L.
            </p>
          )}

          <p className="tc-sub">{asset.name} ({asset.symbol}) is {asset.blurb}</p>
          <div className="tc-cta-row">
            <button className="lp-cta-primary"
              onClick={() => { track('price_cta', { slug }); navigate('/dashboard') }}>
              Track {asset.symbol} free
              {ARROW}
            </button>
            <button className="lp-cta-ghost"
              onClick={() => { track('price_analysis', { slug }); navigate(`/asset/${asset.id}`) }}>
              {asset.symbol} analysis
            </button>
          </div>
        </section>

        <section className="tc-section">
          <h2>How to track {asset.name} live</h2>
          <ol className="tc-steps">
            <li>Open WalletLens — no account or email needed.</li>
            <li>Add your {asset.symbol} holding with the amount and price you paid.</li>
            <li>Watch the live {asset.name} price, your P&amp;L and allocation update automatically.</li>
          </ol>
          <button className="lp-cta-primary" style={{ marginTop: '0.9rem' }}
            onClick={() => { track('price_cta_bottom', { slug }); navigate('/dashboard') }}>
            Track {asset.symbol} in your portfolio
            {ARROW}
          </button>
        </section>

        <section className="tc-section">
          <h2>Frequently asked questions</h2>
          <h3>How much is {asset.name} worth today?</h3>
          <p>
            The live {asset.name} ({asset.symbol}) price shown above updates from market data when the
            page loads. For continuously updating prices and your personal profit/loss, track {asset.symbol}
            in WalletLens.
          </p>
          <h3>Where can I track {asset.name} for free?</h3>
          <p>
            WalletLens tracks {asset.name} for free with no account — add your holding once and it values
            it with live prices alongside your entire net worth, with data kept on your device.
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
