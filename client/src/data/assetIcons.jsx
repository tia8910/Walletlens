// Inline icons for assets that no crypto icon CDN carries — precious metals.
// Shared between CoinLogo (used throughout the app) and the landing page's
// asset-class cards, so the two can never drift apart.
//
// Kept dependency-free on purpose: the landing page needs these colours but
// must not pull in api.js just to draw a circle.
export const ASSET_ICONS = {
  'metal:xau': { label: 'XAU', color1: '#f59e0b', color2: '#b45309', metal: 'gold' },
  'metal:xag': { label: 'XAG', color1: '#94a3b8', color2: '#475569', metal: 'silver' },
  'metal:xpt': { label: 'XPT', color1: '#cbd5e1', color2: '#94a3b8', metal: 'platinum' },
  'metal:xcu': { label: 'XCU', color1: '#c2410c', color2: '#92400e', metal: 'copper' },
}

// ── Metal bars ────────────────────────────────────────────────────────────
// The ingot marks the trade sheet shows for the Gold / Silver categories.
// Shared so the landing page's asset-class cards use the same artwork the
// user sees when they actually add gold or silver.
const BARS = {
  gold:     { shadow: '#b45309', body: '#f59e0b', face: '#fcd34d', ink: '#78350f', label: 'Au' },
  silver:   { shadow: '#475569', body: '#94a3b8', face: '#e2e8f0', ink: '#1e293b', label: 'Ag' },
  // Platinum and copper had no bar, so a holding in either fell through to a
  // disc with its ISO code while gold and silver showed an ingot. Four metals,
  // four ingots.
  platinum: { shadow: '#94a3b8', body: '#cbd5e1', face: '#f1f5f9', ink: '#334155', label: 'Pt' },
  copper:   { shadow: '#92400e', body: '#c2410c', face: '#fb923c', ink: '#7c2d12', label: 'Cu' },
}

/**
 * The ingot itself, in its own 32x20 space.
 *
 * Split out so the trade sheet's category mark and the round badge on a
 * holdings row are literally the same artwork rather than two drawings that
 * have to be kept in step.
 */
function BarShapes({ c }) {
  return (
    <>
      <rect x="1" y="5" width="30" height="12" rx="2" fill={c.shadow} />
      <rect x="3" y="3" width="26" height="14" rx="2" fill={c.body} />
      <rect x="5" y="5" width="22" height="10" rx="1" fill={c.face} />
      <text
        x="16" y="13" textAnchor="middle" fontSize="7" fontWeight="800"
        fontFamily="monospace,sans-serif" fill={c.ink} letterSpacing="0.5"
      >
        {c.label}
      </text>
    </>
  )
}

export function MetalBar({ metal = 'gold', width = 20, style }) {
  const c = BARS[metal] || BARS.gold
  return (
    <svg
      width={width} height={Math.round((width * 20) / 32)} viewBox="0 0 32 20"
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
      aria-hidden="true"
    >
      <BarShapes c={c} />
    </svg>
  )
}

// The badge CoinLogo draws for the metal ids above.
//
// It used to be a disc with the ISO code on it — XAU on orange — while the
// trade sheet showed an ingot for the same asset. One holding, two marks, and
// the one on the dashboard was the less recognisable of the two.
//
// It is the ingot now, on a neutral plate. The plate is what keeps a metal
// aligned with the round crypto icons beside it in a holdings row; the bar is
// what makes it the same mark the user picked in Buy and Sell.
export function AssetIconBadge({ coinId, size = 32, className = '', style }) {
  const known = ASSET_ICONS[coinId]
  if (!known) return null
  const bar = BARS[known.metal]

  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32"
      className={className}
      style={{ borderRadius: '50%', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {/* Dark and near-opaque, so the bar's own metal colours carry the
          identity exactly as they do on the trade sheet, on either theme. */}
      <circle cx="16" cy="16" r="16" fill="#0f172a" />
      <circle cx="16" cy="16" r="15.2" fill="none" stroke={known.color1} strokeOpacity="0.45" />
      {bar
        // 24 of 32 wide, centred: big enough to read at 32px, with the plate
        // still visible as a ring around it.
        ? <g transform="translate(4 8.5) scale(0.75)"><BarShapes c={bar} /></g>
        : (
          <text
            x="16" y="16" textAnchor="middle" dominantBaseline="central"
            fontSize="11" fontWeight="800" fontFamily="Inter,system-ui,sans-serif"
            fill="rgba(255,255,255,0.95)"
          >
            {known.label}
          </text>
        )}
    </svg>
  )
}
