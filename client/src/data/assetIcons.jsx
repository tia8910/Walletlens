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

// ── Metal bars ────────────────────────────────────────────────────────────
// The ingot marks the trade sheet shows for the Gold / Silver categories.
// Shared so the landing page's asset-class cards use the same artwork the
// user sees when they actually add gold or silver.
const BARS = {
  gold:   { shadow: '#b45309', body: '#f59e0b', face: '#fcd34d', ink: '#78350f', label: 'Au' },
  silver: { shadow: '#475569', body: '#94a3b8', face: '#e2e8f0', ink: '#1e293b', label: 'Ag' },
}

export function MetalBar({ metal = 'gold', width = 20, style }) {
  const c = BARS[metal] || BARS.gold
  return (
    <svg
      width={width} height={Math.round((width * 20) / 32)} viewBox="0 0 32 20"
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
      aria-hidden="true"
    >
      <rect x="1" y="5" width="30" height="12" rx="2" fill={c.shadow} />
      <rect x="3" y="3" width="26" height="14" rx="2" fill={c.body} />
      <rect x="5" y="5" width="22" height="10" rx="1" fill={c.face} />
      <text
        x="16" y="13" textAnchor="middle" fontSize="7" fontWeight="800"
        fontFamily="monospace,sans-serif" fill={c.ink} letterSpacing="0.5"
      >
        {c.label}
      </text>
    </svg>
  )
}

// The badge CoinLogo draws for the metal ids above: a radial-gradient disc with
// the metal's ISO code. Used on holdings rows, where a round logo slot is
// expected alongside the crypto icons.
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
