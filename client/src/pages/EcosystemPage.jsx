import { useEffect } from 'react'
import './EcosystemPage.css'

// The WalletLens ecosystem page: what the three surfaces are, exactly which
// traffic leaves the device, and what the app does that a coin tracker cannot.
//
// It renders outside the app chrome (App.jsx treats it as a landing route), so
// it carries its own header and footer. Every rule in EcosystemPage.css is
// scoped to .wl-eco; nothing here should reach the rest of the app.
//
// The prerenderer emits a text-only version of this same content for crawlers
// that do not run JS — see the /ecosystem block in scripts/prerender.mjs. Keep
// the two in step: the FAQ here and the FAQPage JSON-LD there have to match, or
// the structured data is a rich-results violation.

const WEB = 'https://walletlens.live'
const PLAY = 'https://play.google.com/store/apps/details?id=live.walletlens.twa'
const CWS = 'https://chromewebstore.google.com/detail/ajmjdeobjjmabgonhaeaaehoepfafhbn'

const TITLE = 'Free Net Worth Tracker, No Account, No Server | WalletLens'
const DESC = 'Track property, stocks, gold, cash and crypto in one net worth figure. ' +
  'Free, no account, no subscription, and your holdings stay on your device. Web, Android, Chrome.'

export default function EcosystemPage() {
  useEffect(() => {
    document.title = TITLE
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute('content', DESC)
  }, [])

  // The sticky bar rides transparent over the mint hero and takes the page
  // ground once the hero is behind it, so its type stays legible on both.
  useEffect(() => {
    const nav = document.getElementById('wl-eco-nav')
    const hero = document.getElementById('wl-eco-top')
    if (!nav || !hero) return undefined
    const mark = () => {
      nav.classList.toggle('solid', window.scrollY > hero.offsetHeight - nav.offsetHeight - 40)
    }
    mark()
    window.addEventListener('scroll', mark, { passive: true })
    return () => window.removeEventListener('scroll', mark)
  }, [])

  return (
    <div className="wl-eco">
      <a className="skip" href="#wl-eco-content">Skip to content</a>

      <div className="tape" aria-hidden="true"><div className="tape-run"><span className="hi" key="EVERY ASSET CLASS">EVERY ASSET CLASS</span><span key="PROPERTY">PROPERTY</span><span key="AAPL">AAPL</span><span key="NVDA">NVDA</span><span key="XAU GOLD">XAU GOLD</span><span key="CASH USD">CASH USD</span><span key="CRYPTO">CRYPTO</span><span key="SPY">SPY</span><span key="XAG SILVER">XAG SILVER</span><span key="MSFT">MSFT</span><span key="EUR">EUR</span><span key="BONDS">BONDS</span><span key="TSLA">TSLA</span><span key="VOO">VOO</span><span key="COLLECTIBLES">COLLECTIBLES</span><span key="GBP">GBP</span><span key="PLATINUM">PLATINUM</span><span key="ART AND WATCHES">ART AND WATCHES</span><span key="A CAR">A CAR</span><span key="A BUSINESS STAKE">A BUSINESS STAKE</span><span className="hi" key="EVERY ASSET CLASS">EVERY ASSET CLASS</span><span key="PROPERTY">PROPERTY</span><span key="AAPL">AAPL</span><span key="NVDA">NVDA</span><span key="XAU GOLD">XAU GOLD</span><span key="CASH USD">CASH USD</span><span key="CRYPTO">CRYPTO</span><span key="SPY">SPY</span><span key="XAG SILVER">XAG SILVER</span><span key="MSFT">MSFT</span><span key="EUR">EUR</span><span key="BONDS">BONDS</span><span key="TSLA">TSLA</span><span key="VOO">VOO</span><span key="COLLECTIBLES">COLLECTIBLES</span><span key="GBP">GBP</span><span key="PLATINUM">PLATINUM</span><span key="ART AND WATCHES">ART AND WATCHES</span><span key="A CAR">A CAR</span><span key="A BUSINESS STAKE">A BUSINESS STAKE</span></div></div>

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false"><defs>
  <symbol id="i-play" viewBox="0 0 24 24">
    <path fill="#00A0FF" d="M3.6 1.8a1.5 1.5 0 0 0-.6 1.2v18a1.5 1.5 0 0 0 .6 1.2l.1.1L13.8 12v-.2L3.7 1.7z" />
    <path fill="#FFBC00" d="M17.2 15.4 13.8 12v-.2l3.4-3.4.1.1 4 2.3c1.2.7 1.2 1.8 0 2.4l-4 2.3z" />
    <path fill="#FF3A44" d="M17.3 15.3 13.8 11.9 3.6 22.2c.4.4 1 .5 1.8.1l11.9-6.9" />
    <path fill="#00C853" d="M17.3 8.6 5.4 1.8C4.6 1.4 4 1.4 3.6 1.9l10.2 10z" />
  </symbol>

  <symbol id="i-chrome" viewBox="0 0 24 24">
    <path fill="#EA4335" d="M12 12 12 2 A10 10 0 0 1 20.66 17 Z" />
    <path fill="#34A853" d="M12 12 20.66 17 A10 10 0 0 1 3.34 17 Z" />
    <path fill="#FBBC05" d="M12 12 3.34 17 A10 10 0 0 1 12 2 Z" />
    <circle cx="12" cy="12" r="5.2" fill="#fff" />
    <circle cx="12" cy="12" r="4.2" fill="#4285F4" />
  </symbol>

  <symbol id="i-android" viewBox="0 0 24 24">
    <g fill="#3DDC84">
      <path d="M6.5 10.6h11V17a1.6 1.6 0 0 1-1.6 1.6H8.1A1.6 1.6 0 0 1 6.5 17z" />
      <rect x="3" y="10.4" width="2.6" height="6.6" rx="1.3" />
      <rect x="18.4" y="10.4" width="2.6" height="6.6" rx="1.3" />
      <rect x="8.4" y="18" width="2.4" height="4.4" rx="1.2" />
      <rect x="13.2" y="18" width="2.4" height="4.4" rx="1.2" />
      <path d="M6.6 9.6a5.4 5.4 0 0 1 10.8 0z" />
    </g>
    <path stroke="#3DDC84" strokeWidth="1.1" strokeLinecap="round" d="M7.7 4.3 8.9 6.1M16.3 4.3 15.1 6.1" />
    <circle cx="9.5" cy="7.7" r=".85" fill="#fff" /><circle cx="14.5" cy="7.7" r=".85" fill="#fff" />
  </symbol>
  <symbol id="i-web" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.8" y="4.2" width="18.4" height="15.6" rx="2.4" /><path d="M2.8 9h18.4" />
    <path d="M6 6.6h.01M8.6 6.6h.01M11.2 6.6h.01" /></g></symbol>

  <symbol id="i-camera" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8.6A1.6 1.6 0 0 1 4.6 7H7l1.3-2.2h7.4L17 7h2.4A1.6 1.6 0 0 1 21 8.6v8.8a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.4z" />
    <circle cx="12" cy="13" r="3.6" /></g></symbol>

  <symbol id="i-mic" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2.6" width="6" height="11" rx="3" /><path d="M5.4 11.6a6.6 6.6 0 0 0 13.2 0" />
    <path d="M12 18.2V21.4" /></g></symbol>

  <symbol id="i-stack" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.8 3 7.4l9 4.6 9-4.6z" /><path d="m3 12 9 4.6 9-4.6" /><path d="m3 16.6 9 4.6 9-4.6" /></g></symbol>

  <symbol id="i-bell" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18.4 8.6a6.4 6.4 0 1 0-12.8 0c0 6-2.2 7.2-2.2 7.2h17.2s-2.2-1.2-2.2-7.2" />
    <path d="M10.2 19.2a2.1 2.1 0 0 0 3.6 0" /></g></symbol>

  <symbol id="i-scales" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4.2v16" /><path d="M5.6 7.2h12.8" /><path d="m5.6 7.2-3 6.2h6z" /><path d="m18.4 7.2-3 6.2h6z" />
    <path d="M8.4 20.2h7.2" /></g></symbol>

  <symbol id="i-cloud" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.2 19a4.2 4.2 0 0 1-.5-8.4 5.6 5.6 0 0 1 10.8 1.2A3.7 3.7 0 0 1 17 19" />
    <path d="M12 21.2V11.6" /><path d="m9.4 14.2 2.6-2.6 2.6 2.6" /></g></symbol>

  <symbol id="i-tag" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.4 13.1 13.1 20.4a2 2 0 0 1-2.8 0l-6.7-6.7a2 2 0 0 1-.6-1.4V4.6a2 2 0 0 1 2-2h7.7a2 2 0 0 1 1.4.6l6.3 6.3a2 2 0 0 1 0 2.8z" />
    <circle cx="8" cy="8" r="1.5" /></g></symbol>

  <symbol id="i-offline" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3.4 21 21.4" /><path d="M5.2 9.6a12 12 0 0 1 3.9-2.4" /><path d="M18.9 9.6a12 12 0 0 0-4.6-2.5" />
    <path d="M8.4 13.2a7.3 7.3 0 0 1 2.2-1.4" /><path d="M15.6 13.2a7.3 7.3 0 0 0-1-.8" />
    <path d="M12 17.6h.01" /></g></symbol>

  <symbol id="i-shield" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.6 4.4 5.8v6.1c0 4.6 3.1 8.1 7.6 9.5 4.5-1.4 7.6-4.9 7.6-9.5V5.8z" />
    <path d="m8.8 12.1 2.3 2.3 4.1-4.6" /></g></symbol>
  <symbol id="i-link" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.2 13.8a4.2 4.2 0 0 0 6.1.3l2.4-2.4a4.2 4.2 0 1 0-6-6l-1.4 1.4" />
    <path d="M13.8 10.2a4.2 4.2 0 0 0-6.1-.3l-2.4 2.4a4.2 4.2 0 1 0 6 6l1.4-1.4" /></g></symbol>
  <symbol id="i-gauge" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.4 17.4a9.2 9.2 0 1 1 17.2 0" /><path d="m12 17.4 4.4-6" /><circle cx="12" cy="17.4" r="1.7" />
    <path d="M4.6 12.4h1.6M17.8 12.4h1.6M12 4.6v1.6" /></g></symbol>
  <symbol id="i-doc" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.6 2.8H6.9a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2h10.2a2 2 0 0 0 2-2V8.2z" />
    <path d="M13.4 2.8v5.4h5.5" /><path d="M8.6 13.4h6.8M8.6 17h4.6" /></g></symbol>
  {/* i-code is parked with the open-source card: both come back when the
      GitHub account flag is lifted. */}
  <symbol data-parked="true" id="i-code" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="m8.4 8.2-4.6 3.9 4.6 3.9" /><path d="m15.6 8.2 4.6 3.9-4.6 3.9" /><path d="m13.4 4.6-2.8 15" /></g></symbol>
</defs></svg>

      <header className="nav" id="wl-eco-nav">
        <div className="nav-in">
          <a className="brand" href="#wl-eco-top"><svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs><linearGradient id="wlNavLens" x1="5" y1="5" x2="52" y2="52" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#4ade80" /><stop offset="50%" stopColor="#16a34a" /><stop offset="100%" stopColor="#14532d" />
      </linearGradient></defs>
      <circle cx="27" cy="25" r="19" stroke="url(#wlNavLens)" strokeWidth="5.5" />
      <circle cx="40.5" cy="11.5" r="3.8" fill="#4ade80" />
      <rect x="14.5" y="26.5" width="5" height="7.5" rx="1.2" fill="url(#wlNavLens)" />
      <rect x="21.5" y="21" width="5" height="13" rx="1.2" fill="url(#wlNavLens)" />
      <rect x="28.5" y="15.5" width="5" height="18.5" rx="1.2" fill="url(#wlNavLens)" />
      <line x1="13.5" y1="39" x2="4" y2="55" stroke="url(#wlNavLens)" strokeWidth="5.5" strokeLinecap="round" />
    </svg> WalletLens</a>
          <nav className="nav-links" aria-label="Sections">
            <a href="#wl-eco-shots">The app</a><a href="#wl-eco-ecosystem">Ecosystem</a><a href="#wl-eco-privacy">Privacy</a>
            <a href="#wl-eco-why">Features</a><a href="#wl-eco-faq">FAQ</a>
          </nav>
          <div className="nav-cta">
            <a className="nav-store" href={PLAY} aria-label="Get WalletLens for Android on Google Play"><svg className="ic" aria-hidden="true"><use href="#i-play" /></svg></a>
            <a className="nav-store" href={CWS} aria-label="Add the WalletLens extension to Chrome"><svg className="ic" aria-hidden="true"><use href="#i-chrome" /></svg></a>
            <a className="nav-go" href="/dashboard">Start free</a>
          </div>
        </div>
      </header>

      <main id="wl-eco-content">

        <div className="stage hero" id="wl-eco-top">
          <div className="sweep" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className="wrap">
            <p className="kicker"><span>Web</span><span>Android</span><span>Chrome extension</span></p>
            <h1>The net worth tracker<br />that never asks<br /><em>who you are</em></h1>
            <p className="sub">Property, stocks, gold, cash, crypto and anything else you value, in one figure,
              on every screen you use. Your holdings are written to your own device, and nothing is uploaded
              unless you switch on a feature that needs it.</p>
            <div className="hero-cta">
              <a className="hcta primary" href="/dashboard"><svg className="ic" aria-hidden="true"><use href="#i-web" /></svg>Open the WalletLens web app</a>
              <a className="hcta" href={PLAY}><svg className="ic" aria-hidden="true"><use href="#i-play" /></svg>Get it on Google Play</a>
              <a className="hcta" href={CWS}><svg className="ic" aria-hidden="true"><use href="#i-chrome" /></svg>Add it to Chrome</a>
            </div>
            <p className="facts"><span>Free, no paid tier</span><span>No account</span>
              <span>No bank linking</span><span>Works offline</span></p>
            <div className="chips">
          <div className="chip"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%230A140F'/%3E%3Crect x='9' y='22' width='4.5' height='9' rx='1.2' fill='%234ade80'/%3E%3Crect x='17.7' y='16' width='4.5' height='15' rx='1.2' fill='%2316a34a'/%3E%3Crect x='26.4' y='9' width='4.5' height='22' rx='1.2' fill='%234ade80'/%3E%3C/svg%3E" alt="" /><small>STOCKS</small></div>
          <div className="chip"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%2314532d'/%3E%3Cpath d='M20 9L31 19h-3v11h-6v-7h-4v7h-6V19H9Z' fill='%234ade80'/%3E%3C/svg%3E" alt="" /><small>PROPERTY</small></div>
          <div className="chip"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect x='3' y='15' width='34' height='13' rx='2' fill='%23c49a1a'/%3E%3Crect x='3' y='15' width='34' height='7' rx='2' fill='%23e8b825'/%3E%3C/svg%3E" alt="" /><small>GOLD</small></div>
          <div className="chip"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect x='3' y='15' width='34' height='13' rx='2' fill='%23808898'/%3E%3Crect x='3' y='15' width='34' height='7' rx='2' fill='%23e8ecf4'/%3E%3C/svg%3E" alt="" /><small>SILVER</small></div>
          <div className="chip"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect x='3' y='11' width='34' height='18' rx='3' fill='%230f7a38'/%3E%3Crect x='6' y='14' width='28' height='12' rx='2' fill='none' stroke='%234ade80' stroke-width='1.4'/%3E%3Ccircle cx='20' cy='20' r='4.2' fill='%234ade80'/%3E%3C/svg%3E" alt="" /><small>CASH</small></div>
          <div className="chip"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%23f7931a'/%3E%3Cpath fill='%23ffffff' d='M28.2 18c.3-2.3-1.4-3.5-3.8-4.3l.8-3.1-1.9-.5-.8 3c-.5-.1-1-.2-1.5-.4l.8-3-1.9-.5-.8 3.1c-.4-.1-.8-.2-1.2-.3l-2.6-.7-.5 2.1s1.4.3 1.4.4c.8.2.9.7.9 1.1l-1 3.9c.1 0 .1 0 .2.1h-.2l-1.3 5.4c-.1.3-.4.6-.9.5 0 0-1.4-.4-1.4-.4l-1 2.3 2.5.6c.5.1.9.2 1.3.4l-.8 3.2 1.9.5.8-3.1c.5.1 1 .3 1.5.4l-.8 3.1 1.9.5.8-3.2c3.3.6 5.7.4 6.8-2.6.9-2.4 0-3.8-1.7-4.7 1.2-.3 2.2-1.1 2.5-2.8zm-4.4 6.2c-.6 2.4-4.7 1.1-6 .8l1-4.1c1.3.3 5.6 1 5 3.3zm.6-6.2c-.6 2.2-4 1.1-5.1.8l.9-3.7c1.1.3 4.9.8 4.2 2.9z'/%3E%3C/svg%3E" alt="" /><small>CRYPTO</small></div>
            </div>
          </div>
        </div>

        <div className="stage shots" id="wl-eco-shots">
          <div className="sweep" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className="wrap shots-in">
            <div className="shots-copy">
              <p className="kicker"><span>The app itself</span></p>
              <h2>Not a drawing<br />of an app</h2>
              <ul className="screen-keys">
                <li><span className="n">01</span><div><b>Analysis</b>
                  <p>Allocation by asset class, and a wallet evaluation that names the gaps
                    rather than scoring you and leaving it there.</p></div></li>
                <li><span className="n">02</span><div><b>Dashboard</b>
                  <p>Net worth in any currency, over any window, with the asset classes
                    broken out beneath it.</p></div></li>
                <li><span className="n">03</span><div><b>Goals</b>
                  <p>Every dollar assigned to a purpose, with a target, a deadline and the
                    runway left on each.</p></div></li>
              </ul>
              <p className="shot-note">Real screens, example portfolio</p>
            </div>
            <div className="shot-stage">
              <picture>
                <source media="(min-width: 720px)" srcSet="/screens/app-three-screens.webp" />
                <img className="shot" src="/screens/app-dashboard.webp" width="1031" height="877"
                  alt="WalletLens on Android: a portfolio analysis screen with allocation by asset class,
                    the dashboard showing total portfolio value and a candlestick chart, and a goals screen
                    splitting net worth into funded buckets." />
              </picture>
            </div>
          </div>
        </div>

        <section id="wl-eco-ecosystem" aria-labelledby="wl-eco-h-eco"><div className="wrap">
          <p className="kicker"><span>One portfolio</span><span>three surfaces</span></p>
          <h2 id="wl-eco-h-eco">One store.<br />Three ways in.</h2>
          <p className="dek lede">Your holdings are written once, to your own device. The web app and the Android
            app read that same store, and the extension keeps a mirrored copy so it can answer without loading a
            page. Nothing is reconciled through an account and nothing sits in the middle.</p>

          <p className="visually-hidden">One local store on your device, read by three apps: the web app, the
            Android app and the Chrome extension.</p>
          <div className="orbit" aria-hidden="true">
            <i className="orb-ring a" /><i className="orb-ring b" /><i className="orb-ring c" />
            <div className="orb-core"><svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs><linearGradient id="wlCoreLens" x1="5" y1="5" x2="52" y2="52" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#4ade80" /><stop offset="50%" stopColor="#16a34a" /><stop offset="100%" stopColor="#14532d" />
      </linearGradient></defs>
      <circle cx="27" cy="25" r="19" stroke="url(#wlCoreLens)" strokeWidth="5.5" />
      <circle cx="40.5" cy="11.5" r="3.8" fill="#4ade80" />
      <rect x="14.5" y="26.5" width="5" height="7.5" rx="1.2" fill="url(#wlCoreLens)" />
      <rect x="21.5" y="21" width="5" height="13" rx="1.2" fill="url(#wlCoreLens)" />
      <rect x="28.5" y="15.5" width="5" height="18.5" rx="1.2" fill="url(#wlCoreLens)" />
      <line x1="13.5" y1="39" x2="4" y2="55" stroke="url(#wlCoreLens)" strokeWidth="5.5" strokeLinecap="round" />
    </svg><b>Your device</b>
              <span>Every holding<br />lives here</span></div>
            <div className="orb-spin">
            <span className="sat" style={{ '--a': '-90deg' }}><span className="satin"><span className="tile"><svg className="ic" aria-hidden="true"><use href="#i-web" /></svg></span><em>Web app</em></span></span>
            <span className="sat" style={{ '--a': '30deg' }}><span className="satin"><span className="tile"><svg className="ic" aria-hidden="true"><use href="#i-android" /></svg></span><em>Android</em></span></span>
            <span className="sat" style={{ '--a': '150deg' }}><span className="satin"><span className="tile"><svg className="ic" aria-hidden="true"><use href="#i-chrome" /></svg></span><em>Extension</em></span></span>
            </div>
          </div>

          <div className="surfaces-note">
            <div className="sn"><h3>The web app</h3>
              <p>Where you build the portfolio. Allocation, profit and loss, seven-day trend, dividends, zakat
                and rebalancing, in the browser you already have.</p>
              <a href="/dashboard"><svg className="ic" aria-hidden="true"><use href="#i-web" /></svg>Open the WalletLens web app</a></div>
            <div className="sn"><h3>The Android app</h3>
              <p>The one that watches while you are not looking. Alerts arrive with the app closed and open
                straight to the holding they are about.</p>
              <a href={PLAY}><svg className="ic" aria-hidden="true"><use href="#i-play" /></svg>Get WalletLens for Android</a></div>
            <div className="sn"><h3>The Chrome extension</h3>
              <p>Net worth behind the toolbar icon. One click from any tab, no page to load and nothing to
                sign into.</p>
              <a href={CWS}><svg className="ic" aria-hidden="true"><use href="#i-chrome" /></svg>Add the extension to Chrome</a></div>
          </div>
        </div></section>

        <div className="stage band" id="wl-eco-privacy">
          <div className="sweep" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className="wrap">
            <p className="kicker"><span>Nothing to breach</span></p>
            <h2 id="wl-eco-h-priv">Three kinds of traffic.<br />Named, one by one.</h2>
            <p className="dek">Most trackers print the word privacy and then ask you to sign in. Here is every
              packet WalletLens sends without asking, every packet it sends only because you switched something
              on, and every packet it never sends at all.</p>

            <div className="traffic">
              <div className="lane out">
                <div className="lane-head"><h3>Sent by default</h3><span className="verdict go">Always</span></div>
                <div className="wire">
                  <span className="node">Your device</span>
                  <span className="line"><i className="pk" /><i className="pk" /><i className="pk" /></span>
                  <span className="node">Public price feed</span>
                </div>
                <p className="visually-hidden">Sent by default:</p>
                <ul className="lane-list"><li>BTC</li><li>ETH</li><li>AAPL</li><li>XAU</li>
                  <li>a ticker, nothing beside it</li></ul>
              </div>

              <div className="lane optin">
                <div className="lane-head"><h3>Sent only if you switch it on</h3>
                  <span className="verdict opt">Opt in</span></div>
                <div className="wire">
                  <span className="node">Your device</span>
                  <span className="line"><i className="pk" /><i className="pk" /><i className="pk" /></span>
                  <span className="node">WalletLens worker</span>
                </div>
                <p className="visually-hidden">Sent only if you switch the feature on:</p>
                <ul className="lane-list"><li>alerts: the tickers you hold, so they can be watched for you</li>
                  <li>screenshot import: the picture you chose</li>
                  <li>Portfolio Guardian: your heirs&rsquo; emails and a snapshot for them</li>
                  <li>weekly email: your address and your total</li></ul>
                <p className="lane-note">Each of these is off until you turn it on, each can be turned back off,
                  and none of them is needed to use WalletLens as a tracker.</p>
              </div>

              <div className="lane stop">
                <div className="lane-head"><h3>Never sent, whatever you switch on</h3>
                  <span className="verdict no">Never</span></div>
                <div className="wire">
                  <span className="node">Your device</span>
                  <span className="line"><i className="pk" /><i className="pk" /><i className="pk" />
                    <span className="wall" /></span>
                  <span className="node ghost">Any server</span>
                </div>
                <p className="visually-hidden">Never sent:</p>
                <ul className="lane-list"><li><s>your transaction history</s></li><li><s>your notes</s></li>
                  <li><s>a password</s></li><li><s>a bank or brokerage connection</s></li>
                  <li><s>an account, because there isn&rsquo;t one</s></li></ul>
              </div>
            </div>
            <p className="dek dek-tail">There is no account to create, so there is no account to leak. A backup
              goes to your own Google Drive, encrypted on the device before it leaves, and you hold the
              passphrase. Every feature above that sends
              anything is named, and each one can be turned back off.</p>
          </div>
        </div>

        <section id="wl-eco-why" aria-labelledby="wl-eco-h-why"><div className="wrap">
          <p className="kicker"><span>Why WalletLens</span></p>
          <h2 id="wl-eco-h-why">What most trackers<br />leave out</h2>
          <p className="dek lede">Your net worth is a house, a pension, some shares, a little gold and whatever
            crypto you hold, and it only means anything once it sits in one figure. Trackers like Kubera and
            Empower charge a subscription for that all-asset view; CoinStats and Delta cover crypto and stop
            there. These are the parts nobody else puts in for free.</p>
          <div className="feats">
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-stack" /></svg><div>
              <h3>Every asset in one number</h3>
              <p>Property and land, any US stock or ETF, gold and silver by the gram, cash in any currency, bonds, crypto, and anything you value yourself: art, watches, a car, a stake in a business. Most trackers make you pick a category. This one is the whole balance sheet.</p>
              <span className="tag">Property, stocks, metals, cash, crypto</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-shield" /></svg><div>
              <h3>Portfolio Guardian</h3>
              <p>Name the people who should reach your portfolio if something happens to you. Opening the app resets the countdown, and WalletLens warns you by email for two weeks before it ever contacts anyone, so it only fires when you have genuinely stopped. What they receive is a snapshot of what you hold, never access to an account and never anything that can move funds. It is a rare thing in a portfolio tracker, and it works here because there is no account for anyone to inherit.</p>
              <span className="tag">A dead man’s switch for your holdings</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-camera" /></svg><div>
              <h3>Photograph your holdings in</h3>
              <p>Point your camera at any broker, exchange or wallet screen, or even a handwritten list, and WalletLens reads the rows off the picture. It works with institutions that have no API at all, and it never needs a login of yours.</p>
              <span className="tag">No CSV, no column mapping</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-mic" /></svg><div>
              <h3>Or just say it out loud</h3>
              <p>“I bought half a Bitcoin at 65K and twenty Apple shares.” One sentence, several trades, parsed in English or Arabic. Typing rows on a phone is where most portfolios go stale.</p>
              <span className="tag">Under a minute</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-link" /></svg><div>
              <h3>Paste a wallet address</h3>
              <p>An ETH, BTC or Solana address is enough. Balances arrive on their own, with no API key to generate, no exchange login and no read-only permission to hand over.</p>
              <span className="tag">Address in, holdings out</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-gauge" /></svg><div>
              <h3>One signal per holding</h3>
              <p>The Magic Indicator weighs eight pillars for a coin and seven for a share into one reading, from strong buy through to distribute: technical and momentum always, then whale flow, on-chain activity, sentiment and cycle for crypto, or earnings, sector, dividend and market for equities. Comparable signals usually sit behind a paid tier.</p>
              <span className="tag">Eight pillars, one reading</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-bell" /></svg><div>
              <h3>Alerts that name what you hold</h3>
              <p>Price moves, round-number levels, your own targets, seven-day trend switches on your crypto, news that names something you own, a daily digest and a reminder when zakat falls due. Each one opens straight to the holding it is about.</p>
              <span className="tag">Android, with the app closed</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-scales" /></svg><div>
              <h3>Zakat, calculated on the real thing</h3>
              <p>Your live net worth against a nisab priced from current gold and silver. Gold or silver standard, lunar or solar year, long-term shares handled properly. It tracks the hawl and reminds you before it completes.</p>
              <span className="tag">Built in, not a separate app</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-doc" /></svg><div>
              <h3>Tax-ready without the upgrade</h3>
              <p>A full transaction CSV your accountant can work from, or that you map into Koinly, CoinTracker or TurboTax in a couple of clicks, plus an Excel export of your holdings whenever you want your own numbers out. Tax export is a paid feature in most trackers.</p>
              <span className="tag">Export, no plan required</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-cloud" /></svg><div>
              <h3>A Drive backup that keeps itself current</h3>
              <p>Connect Google Drive once and WalletLens backs itself up from then on: shortly after you add a trade, on a slow sweep for edits nothing announced, and again when you open the app after a while away. It uploads only when something actually changed, it renews its own access quietly so it never stops working or asks you to sign in again, and every backup is encrypted on your device before it leaves. Open WalletLens on a new phone and the portfolio restores itself.</p>
              <span className="tag">Automatic, encrypted, your own folder</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-tag" /></svg><div>
              <h3>Free with nothing held back</h3>
              <p>No paid tier, no holding limit, no paywalled chart, no trial that ends. The parts that usually cost money are the parts that need a server holding your portfolio, and there is not one.</p>
              <span className="tag">No paid tier</span></div></div>
            <div className="feat"><svg className="ic" aria-hidden="true"><use href="#i-offline" /></svg><div>
              <h3>Reads fine on a plane</h3>
              <p>Net worth, allocation, profit and loss and history all render from data already on the device. Only fresh prices need a network connection.</p>
              <span className="tag">Offline by design</span></div></div>
          </div>
          <p className="disclaimer">WalletLens reports what you hold and what public markets say it is worth.
            Nothing here is financial advice, and the Magic Indicator is a signal to read, not a recommendation
            to act on.</p>
        </div></section>

        <div className="stage band warm">
          <div className="sweep" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className="wrap">
            <p className="kicker"><span>Setup</span></p>
            <h2>Setup is a photograph,<br />or a sentence</h2>
            <p className="dek">Photograph the screen, say it out loud, paste a wallet address, or type the four
              things you actually hold. There is no onboarding to sit through, no bank to connect and no wallet
              to authorise.</p>
          </div>
        </div>

        <section id="wl-eco-faq" aria-labelledby="wl-eco-h-faq"><div className="wrap">
          <p className="kicker"><span>FAQ</span></p>
          <h2 id="wl-eco-h-faq">Your questions,<br />answered</h2>
          <div className="faq">
            <details key="0"><summary><h3>Is WalletLens really free?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">Yes. No paid tier, no subscription, no holding limit and no feature behind a paywall. The expensive part of a tracker is the server that stores your portfolio, and WalletLens does not have one.</div></details>
            <details key="1"><summary><h3>Is this only for crypto?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">No. WalletLens is a net worth tracker and crypto is one line in it. Property, any US stock or ETF, gold, silver and platinum by weight, cash in any currency, bonds, and anything you value yourself all sit in the same figure.</div></details>
            <details key="2"><summary><h3>Does WalletLens connect to my bank or brokerage?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">No. There is no Plaid-style connection, no credentials are asked for and nothing is linked. You enter holdings yourself, or photograph a screen, or speak them, or paste a public wallet address.</div></details>
            <details key="3"><summary><h3>Can I track things with no market price, like a house?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">Yes. Enter your own valuation for property, a car, a business stake, art or watches, and update it whenever you like. It counts towards your net worth and towards zakat alongside everything priced live.</div></details>
            <details key="4"><summary><h3>Do I have to create an account?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">No. There is nothing to sign up for and no password to lose. Open it and start entering holdings, which are written to your own device.</div></details>
            <details key="5"><summary><h3>Where is my portfolio actually stored?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">In your browser or phone storage. No server holds a copy by default, which is why there is nothing to breach, nothing to sell and nothing to hand over. Features you switch on yourself can send specific data, and each one is named on this page.</div></details>
            <details key="6"><summary><h3>What happens to my portfolio if I die?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">Portfolio Guardian is a dead man’s switch. You nominate the people who should reach your holdings, and every time you open WalletLens the countdown resets. If it ever runs out, you are warned by email for two weeks first, and only then are they sent a snapshot of what you hold. They receive a picture of the portfolio, never a login and never anything that can move funds.</div></details>
            <details key="7"><summary><h3>How do I leave my crypto and investments to my family?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">Without handing anyone a seed phrase or an exchange password. Portfolio Guardian sends your nominated people a readable snapshot of everything you hold across every asset class, so they know what exists and where to look. Custody stays exactly where it already is.</div></details>
            <details key="8"><summary><h3>Does WalletLens calculate zakat?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">Yes, on your live portfolio, against a nisab priced from current gold and silver. Gold or silver standard, lunar or solar year, long-term shares counted at the usual portion, and property and cash included. It tracks the hawl and reminds you before it completes.</div></details>
            <details key="9"><summary><h3>How does screenshot import work?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">It reads the holdings off a picture of any broker, exchange or wallet screen. Because it reads a picture rather than connecting to an API, it works with institutions that have no integration at all, and it never needs a login of yours. The image you choose is sent for reading and is not kept.</div></details>
            <details key="10"><summary><h3>Do the three apps share one portfolio?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">The web app and the Android app read the same store on the device. The Chrome extension keeps a mirrored copy so it can show your total without loading a page, refreshed whenever you open walletlens.live. Moving between devices goes through the encrypted Google Drive backup, which WalletLens keeps current for you.</div></details>
            <details key="11"><summary><h3>Do I have to remember to back up?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">No. Connect Google Drive once and WalletLens keeps the backup current by itself, shortly after you make a change and again when you open the app after time away. It skips the upload when nothing has changed, and it renews its own access in the background so it never quietly stops. The file is encrypted on your device before it is uploaded, into a folder you own, and you hold the passphrase.</div></details>
            <details key="12"><summary><h3>Will it tell me when something moves?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">The Android app sends price moves, round-number levels, your own targets, seven-day trend switches on your crypto, news naming what you hold, a daily digest and zakat reminders. Notifications arrive with the app closed, and each opens straight to that asset.</div></details>
            <details key="13"><summary><h3>Is there an iPhone app?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">Not in the App Store yet. Open walletlens.live in Safari and add it to your home screen: it installs and runs like an app, offline included, and it is the same portfolio the other surfaces read.</div></details>
            <details key="14"><summary><h3>Does it work offline?</h3>
              <svg className="arw" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></summary>
              <div className="ans">Net worth, allocation, profit and loss and history all render from data already on the device. Only fresh prices need a network connection.</div></details>
          </div>
        </div></section>

        <div className="stage band" id="wl-eco-get">
          <div className="sweep" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className="wrap">
            <p className="kicker"><span>Pick a surface</span></p>
            <h2>Start on one.<br />Use all three.</h2>
            <div className="surfs">
              <div className="surf"><span className="plat">Web</span>
                <p>Opens in the browser you already have. Add it to your home screen, on Android or iPhone,
                  and it installs like an app.</p>
                <a className="go" href="/dashboard"><svg className="ic" aria-hidden="true"><use href="#i-web" /></svg>Open the web app</a></div>
              <div className="surf"><span className="plat">Android</span>
                <p>The one that taps you on the shoulder when something you own moves.</p>
                <a className="go" href={PLAY}><svg className="ic" aria-hidden="true"><use href="#i-play" /></svg>Get it on Play</a></div>
              <div className="surf"><span className="plat">Chrome</span>
                <p>Net worth behind the toolbar icon, one click from any tab.</p>
                <a className="go" href={CWS}><svg className="ic" aria-hidden="true"><use href="#i-chrome" /></svg>Add to Chrome</a></div>
            </div>
            <p className="close-note"><span>Free, no paid tier</span><span>No account</span>
              <span>No card</span><span>Works offline</span></p>
          </div>
        </div>

      </main>

      <footer className="foot"><div className="wrap"><div className="foot-in">
        <span className="brandline">WalletLens</span>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/zakat-calculator">Zakat calculator</a>
        <a href="/blog">Blog</a>
      </div></div></footer>
    </div>
  )
}
