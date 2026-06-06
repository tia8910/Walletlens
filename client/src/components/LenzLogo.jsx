import { useId } from 'react'

// $LENZ token mark — a premium "privacy lens" coin.
// A metallic emerald→cyan→indigo coin ring, a dark glass lens with an aperture
// hexagon, a privacy keyhole at its core, a specular shine and a twinkling spark.
// `animated` adds slow SMIL rotation/twinkle (robust across browsers, no CSS
// transform-origin pitfalls). Unique gradient ids per instance via useId().
export default function LenzLogo({ size = 64, animated = false, className = '', style }) {
  const uid = useId().replace(/:/g, '')
  const ring = `ring-${uid}`
  const face = `face-${uid}`
  const glass = `glass-${uid}`
  const sheen = `sheen-${uid}`
  const key = `key-${uid}`

  // Hexagon (aperture) points around centre (32,32), r=9.
  const hex = [0, 60, 120, 180, 240, 300]
    .map(a => {
      const r = (a * Math.PI) / 180
      return `${(32 + 9 * Math.cos(r)).toFixed(2)},${(32 + 9 * Math.sin(r)).toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={style}
      role="img"
      aria-label="$LENZ token logo"
    >
      <defs>
        <linearGradient id={ring} x1="8" y1="6" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="32%" stopColor="#10b981" />
          <stop offset="66%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <radialGradient id={face} cx="38%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#0d2a24" />
          <stop offset="100%" stopColor="#04100c" />
        </radialGradient>
        <radialGradient id={glass} cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#0b3b34" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#02110d" />
        </radialGradient>
        <linearGradient id={sheen} x1="18" y1="14" x2="40" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={key} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d1fae5" />
          <stop offset="100%" stopColor="#5eead4" />
        </linearGradient>
      </defs>

      {/* Coin body + metallic rim */}
      <circle cx="32" cy="32" r="29.5" fill={`url(#${face})`} stroke={`url(#${ring})`} strokeWidth="3.5" />
      <circle cx="32" cy="32" r="29.5" fill="none" stroke={`url(#${sheen})`} strokeWidth="1.1" opacity="0.7" />

      {/* Decorative dotted orbit (rotates) */}
      <g opacity="0.55">
        <circle cx="32" cy="32" r="24" fill="none" stroke={`url(#${ring})`} strokeWidth="1" strokeDasharray="1.5 4.5" strokeLinecap="round">
          {animated && (
            <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="22s" repeatCount="indefinite" />
          )}
        </circle>
      </g>

      {/* Lens glass */}
      <circle cx="32" cy="32" r="14.5" fill={`url(#${glass})`} stroke={`url(#${ring})`} strokeWidth="2" />

      {/* Aperture hexagon (counter-rotates) */}
      <polygon points={hex} fill="none" stroke={`url(#${ring})`} strokeWidth="1" opacity="0.6">
        {animated && (
          <animateTransform attributeName="transform" type="rotate" from="360 32 32" to="0 32 32" dur="30s" repeatCount="indefinite" />
        )}
      </polygon>

      {/* Privacy keyhole at the core */}
      <g>
        <circle cx="32" cy="30" r="2.7" fill={`url(#${key})`} />
        <path d="M30.1 31.6 L33.9 31.6 L33 37.2 L31 37.2 Z" fill={`url(#${key})`} />
      </g>

      {/* Specular shine across the glass */}
      <path d="M23.5 27 A 11 11 0 0 1 35 21.5" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" />

      {/* Twinkling spark */}
      <g transform="translate(46 17)">
        <path d="M0 -3.4 L0.9 -0.9 L3.4 0 L0.9 0.9 L0 3.4 L-0.9 0.9 L-3.4 0 L-0.9 -0.9 Z" fill="#ecfeff">
          {animated && (
            <animate attributeName="opacity" values="0.2;1;0.2" dur="2.8s" repeatCount="indefinite" />
          )}
        </path>
      </g>
    </svg>
  )
}
