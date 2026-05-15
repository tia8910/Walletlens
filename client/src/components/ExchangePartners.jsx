import { track } from '../analytics'

const EXCHANGES = [
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
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="36">
        <path d="M12.116 16.482l7.884-7.884 7.888 7.888-4.592.003-3.296-3.297-3.293 3.294-4.591-.004zM7 20l3.293-3.293 3.294 3.293-3.294 3.294L7 20zm9.825.003 3.175-3.175 3.174 3.174-3.174 3.175-3.175-3.174zm7.587-3.293L27.706 20l-3.294 3.294L21.118 20l3.294-3.29zM12.116 23.518l4.591.003 3.293 3.294 3.296-3.297 4.592.003-7.888 7.888-7.884-7.891z" fill="#F0B90B"/>
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
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="36">
        <path d="M6 10h12c3.314 0 6 2.686 6 6s-2.686 6-6 6H6V10z" fill="#F7A600"/>
        <path d="M6 22h13c3.866 0 7 3.134 7 7s-3.134 7-7 7H6V22z" fill="#F7A600" opacity="0.7"/>
        <circle cx="18" cy="16" r="3" fill="#1a1000"/>
        <circle cx="19" cy="29" r="3.5" fill="#1a1000"/>
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
          {EXCHANGES.map(ex => (
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
        Recommended Exchanges
      </p>
      <div className="ep-cards-grid">
        {EXCHANGES.map(ex => (
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
    </div>
  )
}
