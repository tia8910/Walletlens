// Inline icons for assets that no crypto icon CDN carries — precious metals.
// Shared between CoinLogo (used throughout the app) and the landing page's
// asset-class cards, so the two can never drift apart.
//
// Kept dependency-free on purpose: the landing page needs these colours but
// must not pull in api.js just to draw a circle.
export const ASSET_ICONS = {
  'metal:xau': { label: 'XAU', color1: '#f59e0b', color2: '#b45309' },
  'metal:xag': { label: 'XAG', color1: '#94a3b8', color2: '#475569' },
  'metal:xpt': { label: 'XPT', color1: '#cbd5e1', color2: '#94a3b8' },
  'metal:xcu': { label: 'XCU', color1: '#c2410c', color2: '#92400e' },
}

// The badge CoinLogo draws for the ids above: a radial-gradient disc with the
// metal's ISO code. Exported so the landing page renders the identical mark
// without importing CoinLogo's whole fallback chain.
export function AssetIconBadge({ coinId, size = 32, className = '', style }) {
  const known = ASSET_ICONS[coinId]
  if (!known) return null
  const id = `ai-${coinId.replace(':', '-')}`
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32"
      className={className}
      style={{ borderRadius: '50%', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={id} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor={known.color1} />
          <stop offset="100%" stopColor={known.color2} />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#${id})`} />
      <text
        x="16" y="16" textAnchor="middle" dominantBaseline="central"
        fontSize="11" fontWeight="800" fontFamily="Inter,system-ui,sans-serif"
        fill="rgba(255,255,255,0.95)"
      >
        {known.label}
      </text>
    </svg>
  )
}
