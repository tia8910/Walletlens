import { track } from '../analytics'

const CRYPTO_EXCHANGES = [
  {
    name: 'Binance',
    tagline: 'World\'s #1 Exchange',
    fee: '0.1% spot fee',
    bonus: 'Earn USDC on sign-up',
    color: '#f0b90b',
    bg: 'linear-gradient(135deg, #1a1400 0%, #2a1f00 100%)',
    glow: 'rgba(240,185,11,0.25)',
    url: 'https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_SYKM0&utm_source=referral_entrance&utm_medium=web_share_copy',
    logo: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="36" className="ep-logo-spin">
        {/* Binance BNB: 5 diamonds (polygon) in cross — top, left, center, right, bottom */}
        <polygon points="20,6 24,10 20,14 16,10" fill="#F0B90B"/>
        <polygon points="20,26 24,30 20,34 16,30" fill="#F0B90B"/>
        <polygon points="6,20 10,16 14,20 10,24" fill="#F0B90B"/>
        <polygon points="26,20 30,16 34,20 30,24" fill="#F0B90B"/>
        <polygon points="20,16 24,20 20,24 16,20" fill="#F0B90B"/>
      </svg>
    ),
  },
  {
    name: 'OKX',
    tagline: 'Advanced Web3 Trading',
    fee: '0.08% maker fee',
    bonus: 'Mystery box for new users',
    color: '#e2e8f0',
    bg: 'linear-gradient(135deg, #0a0a0f 0%, #16161f 100%)',
    glow: 'rgba(226,232,240,0.15)',
    url: 'https://okx.com/join/85929296',
    logo: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="36">
        <rect x="4" y="4" width="13" height="13" rx="2" fill="white"/>
        <rect x="23" y="4" width="13" height="13" rx="2" fill="white"/>
        <rect x="13.5" y="13.5" width="13" height="13" rx="2" fill="white"/>
        <rect x="4" y="23" width="13" height="13" rx="2" fill="white"/>
        <rect x="23" y="23" width="13" height="13" rx="2" fill="white"/>
      </svg>
    ),
  },
  {
    name: 'Bybit',
    tagline: 'Fast Derivatives & Spot',
    fee: '0.1% taker fee',
    bonus: 'Up to $30,000 welcome bonus',
    color: '#f7a600',
    bg: 'linear-gradient(135deg, #1a1000 0%, #241800 100%)',
    glow: 'rgba(247,166,0,0.22)',
    url: 'https://www.bybit.com/invite?ref=3ORQD9',
    logo: (
      <svg viewBox="0 0 56 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="56" height="20" className="ep-logo-pulse">
        {/* Bybit wordmark: white bold BY + orange bar + white T */}
        <text x="0" y="16" fill="white" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontSize="16" letterSpacing="-0.5">BY</text>
        <rect x="28" y="2" width="4" height="14" fill="#F7A600" rx="1"/>
        <text x="32" y="16" fill="white" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontSize="16" letterSpacing="-0.5">T</text>
      </svg>
    ),
  },
]

const STOCK_BROKERS = [
  {
    name: 'IBKR',
    tagline: 'Stocks, Options & Crypto',
    fee: '$0 commissions on stocks',
    bonus: 'Earn up to $1,000 IBKR stock',
    color: '#e8121f',
    bg: 'linear-gradient(135deg, #110003 0%, #1f0005 100%)',
    glow: 'rgba(232,18,31,0.22)',
    url: 'https://ibkr.com/referral/tarek972',
    logo: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="36" className="ep-logo-ibkr">
        {/* IBKR: bold red "I" bar + upward arrow — brokerage feel */}
        <rect x="17" y="6" width="6" height="28" rx="3" fill="#e8121f"/>
        <polygon points="20,5 27,15 23,15 23,28 17,28 17,15 13,15" fill="#e8121f" opacity="0.85"/>
      </svg>
    ),
  },
]

// compact=true → slim strip for dashboard/sheet; compact=false → full cards
export default function ExchangePartners({ compact = false, source = 'unknown' }) {
  if (compact) {
    return (
      <div className="ep-strip-wrap">
        <span className="ep-strip-label">Trade on</span>
        <div className="ep-strip-row">
          {[...CRYPTO_EXCHANGES, ...STOCK_BROKERS].map(ex => (
            <a
              key={ex.name}
              href={ex.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ep-strip-btn"
              style={{ '--ex-color': ex.color, '--ex-glow': ex.glow }}
              onClick={() => track('exchange_referral_click', { exchange: ex.name, source })}
            >
              <span className="ep-strip-logo">{ex.logo}</span>
              <span className="ep-strip-name" style={{ color: ex.color }}>{ex.name}</span>
            </a>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="ep-cards-wrap">
      <p className="ep-cards-label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        Trade with Our Exchange Partners
      </p>
      <div className="ep-cards-grid">
        {CRYPTO_EXCHANGES.map(ex => (
          <a
            key={ex.name}
            href={ex.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ep-card"
            style={{ '--ex-color': ex.color, '--ex-bg': ex.bg, '--ex-glow': ex.glow }}
            onClick={() => track('exchange_referral_click', { exchange: ex.name, source })}
          >
            <div className="ep-card-shine" />
            <div className="ep-card-top">
              <div className="ep-card-logo">{ex.logo}</div>
              <div className="ep-card-info">
                <div className="ep-card-name">{ex.name}</div>
                <div className="ep-card-tagline">{ex.tagline}</div>
              </div>
              <div className="ep-card-arrow">→</div>
            </div>
            <div className="ep-card-divider" />
            <div className="ep-card-bottom">
              <span className="ep-card-fee">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                {ex.fee}
              </span>
              <span className="ep-card-bonus">🎁 {ex.bonus}</span>
            </div>
          </a>
        ))}
      </div>

      <p className="ep-cards-label ep-cards-label-stocks">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
        Also Trade Stocks &amp; Options
      </p>
      <div className="ep-cards-grid ep-cards-grid-wide">
        {STOCK_BROKERS.map(ex => (
          <a
            key={ex.name}
            href={ex.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ep-card ep-card-broker"
            style={{ '--ex-color': ex.color, '--ex-bg': ex.bg, '--ex-glow': ex.glow }}
            onClick={() => track('exchange_referral_click', { exchange: ex.name, source })}
          >
            <div className="ep-card-shine" />
            <div className="ep-card-top">
              <div className="ep-card-logo">{ex.logo}</div>
              <div className="ep-card-info">
                <div className="ep-card-name">{ex.name}</div>
                <div className="ep-card-tagline">{ex.tagline}</div>
              </div>
              <div className="ep-card-arrow">→</div>
            </div>
            <div className="ep-card-divider" />
            <div className="ep-card-bottom">
              <span className="ep-card-fee">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                {ex.fee}
              </span>
              <span className="ep-card-bonus">🎁 {ex.bonus}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
