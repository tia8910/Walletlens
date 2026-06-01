import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import CoinLogo from '../components/CoinLogo'
import { findTrackCoin } from '../data/trackCoins'
import { track } from '../analytics'

// Programmatic per-coin landing page: /track/:slug
// Targets "[coin] portfolio tracker" / "track [coin] free" searches and funnels
// into the free, no-account dashboard. Prerendered to static HTML by
// scripts/prerender.mjs; this component is the hydrated SPA view.
export default function TrackCoin() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const coin = findTrackCoin(slug)

  useEffect(() => {
    if (coin) track('track_coin_view', { symbol: coin.symbol })
    else navigate('/dashboard', { replace: true })
  }, [coin, navigate])

  if (!coin) return null

  return (
    <div className="wl-app wl-app-landing">
      <main className="tc-page">
        <header className="tc-head">
          <Link to="/" className="tc-brand" aria-label="WalletLens home">
            <Logo size={34} /> <span>WalletLens</span>
          </Link>
        </header>

        <section className="tc-hero">
          <CoinLogo symbol={coin.symbol} coinId={coin.id} size={64} className="tc-coin-logo" />
          <h1 className="tc-h1">Track {coin.name} ({coin.symbol}) — Free, No Account</h1>
          <p className="tc-sub">
            Add {coin.name} to your free WalletLens portfolio and watch its live price, your cost basis,
            and your profit/loss update automatically — alongside the rest of your net worth. No sign-up,
            no wallet connection, and your data stays on your device.
          </p>
          <div className="tc-cta-row">
            <button className="lp-cta-primary" onClick={() => { track('track_coin_cta', { symbol: coin.symbol }); navigate('/dashboard') }}>
              Track {coin.symbol} free
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button className="lp-cta-ghost" onClick={() => { track('track_coin_analysis', { symbol: coin.symbol }); navigate(`/asset/${coin.id}`) }}>
              View {coin.symbol} analysis
            </button>
          </div>
        </section>

        <section className="tc-section">
          <h2>What is {coin.name}?</h2>
          <p>{coin.name} ({coin.symbol}) is {coin.blurb}</p>
        </section>

        <section className="tc-section">
          <h2>Why track {coin.symbol} with WalletLens?</h2>
          <ul className="tc-list">
            <li><strong>100% free</strong> — no account, no subscription, no ads.</li>
            <li><strong>Live {coin.symbol} price</strong> and automatic profit/loss on every trade you log.</li>
            <li><strong>All in one place</strong> — see {coin.symbol} next to your other crypto, stocks, gold and cash in a single net-worth view.</li>
            <li><strong>Private by design</strong> — your holdings never leave your device; no exchange API keys required.</li>
            <li><strong>AI analysis</strong> — a health score, risk scan and the Magic Indicator direction for {coin.symbol}.</li>
          </ul>
        </section>

        <section className="tc-section">
          <h2>How to track {coin.name} for free</h2>
          <ol className="tc-steps">
            <li>Open WalletLens — no account or email needed.</li>
            <li>Add a {coin.symbol} trade with the amount and price you paid.</li>
            <li>Watch your {coin.name} value, P&amp;L and allocation update with live prices.</li>
          </ol>
          <button className="lp-cta-primary" onClick={() => { track('track_coin_cta_bottom', { symbol: coin.symbol }); navigate('/dashboard') }}>
            Add {coin.symbol} to your portfolio
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </section>

        <footer className="tc-foot">
          <Link to="/free-net-worth-tracker">Free net worth tracker</Link>
          <span>·</span>
          <Link to="/blog">Blog</Link>
          <span>·</span>
          <Link to="/about">About</Link>
          <span>·</span>
          <Link to="/">Home</Link>
        </footer>
      </main>
    </div>
  )
}
