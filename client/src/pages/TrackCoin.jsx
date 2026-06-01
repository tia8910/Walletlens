import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import CoinLogo from '../components/CoinLogo'
import { findTrackAsset } from '../data/trackCoins'
import { track } from '../analytics'

// Programmatic per-asset landing page: /track/:slug
// Covers crypto, US stocks, ETFs, and precious metals.
// Targets "[asset] portfolio tracker" / "track [asset] free" searches.
// Prerendered to static HTML by scripts/prerender.mjs; hydrated as SPA.
export default function TrackCoin() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const coin = findTrackAsset(slug)

  const isStock = coin?.type === 'stock'
  const isMetal = coin?.type === 'metal'
  const isCrypto = !isStock && !isMetal

  useEffect(() => {
    if (coin) track('track_coin_view', { symbol: coin.symbol, type: coin.type || 'crypto' })
    else navigate('/dashboard', { replace: true })
  }, [coin, navigate])

  if (!coin) return null

  const heroTitle = isStock
    ? `Track ${coin.name} Stock (${coin.symbol}) — Free, No Account`
    : isMetal
    ? `Track ${coin.name} Price (${coin.symbol}) — Free, No Account`
    : `Track ${coin.name} (${coin.symbol}) — Free, No Account`

  const heroPara = isStock
    ? `Add ${coin.name} shares to your free WalletLens portfolio and watch the live price, your cost basis, and your profit/loss update automatically — alongside your crypto and other investments. No sign-up needed and your data stays on your device.`
    : isMetal
    ? `Add ${coin.name} to your free WalletLens portfolio and watch its live price per ounce, your cost basis, and your profit/loss update automatically — alongside your crypto, stocks and other assets. No sign-up needed and your data stays on your device.`
    : `Add ${coin.name} to your free WalletLens portfolio and watch its live price, your cost basis, and your profit/loss update automatically — alongside the rest of your net worth. No sign-up, no wallet connection, and your data stays on your device.`

  const addStep = isStock
    ? `Add ${coin.symbol} shares with the quantity and your average cost per share.`
    : isMetal
    ? `Add ${coin.symbol} with your quantity in ounces and the price you paid.`
    : `Add a ${coin.symbol} trade with the amount and price you paid.`

  const tradeWord = isStock ? 'position' : isMetal ? 'holding' : 'trade'

  const sideByBullet = isStock
    ? `See ${coin.symbol} next to your crypto, gold and cash in a single net-worth view.`
    : isMetal
    ? `See ${coin.symbol} next to your crypto, stocks and cash in a single net-worth view.`
    : `See ${coin.symbol} next to your other crypto, stocks, gold and cash in a single net-worth view.`

  const privacyBullet = isStock
    ? `No brokerage login needed — enter holdings manually; your data stays on your device.`
    : isMetal
    ? `No dealer login needed — enter your holdings manually; your data stays on your device.`
    : `Private by design — your holdings never leave your device; no exchange API keys required.`

  const aiBullet = isCrypto
    ? `AI analysis — a health score, risk scan and the Magic Indicator direction for ${coin.symbol}.`
    : `AI portfolio health score — see how your ${coin.symbol} position affects your overall portfolio.`

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
          <h1 className="tc-h1">{heroTitle}</h1>
          <p className="tc-sub">{heroPara}</p>
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
          <h2>What is {coin.name}{isStock ? ' stock' : ''}?</h2>
          <p>{coin.name} ({coin.symbol}) is {coin.blurb}</p>
        </section>

        <section className="tc-section">
          <h2>Why track {coin.symbol} with WalletLens?</h2>
          <ul className="tc-list">
            <li><strong>100% free</strong> — no account, no subscription, no ads.</li>
            <li><strong>Live {coin.symbol} price</strong> and automatic profit/loss on every {tradeWord} you log.</li>
            <li><strong>All in one place</strong> — {sideByBullet}</li>
            <li><strong>{isStock ? 'No brokerage login needed' : isMetal ? 'No dealer login needed' : 'Private by design'}</strong> — {isStock ? 'enter holdings manually; your data stays on your device.' : isMetal ? 'enter your holdings manually; your data stays on your device.' : 'your holdings never leave your device; no exchange API keys required.'}</li>
            <li><strong>{isCrypto ? 'AI analysis' : 'AI portfolio health score'}</strong> — {isCrypto ? `a health score, risk scan and the Magic Indicator direction for ${coin.symbol}.` : `see how your ${coin.symbol} position affects your overall portfolio.`}</li>
          </ul>
        </section>

        <section className="tc-section">
          <h2>How to track {coin.name} for free</h2>
          <ol className="tc-steps">
            <li>Open WalletLens — no account or email needed.</li>
            <li>{addStep}</li>
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
