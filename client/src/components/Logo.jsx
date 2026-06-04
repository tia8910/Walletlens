import { memo, useId } from 'react'
import { useTheme } from '../ThemeContext'

// variant='dark'  → white ring/handle (dark-background pages like Landing)
// variant='light' → dark ring/handle
// variant=null    → auto from theme context
function Logo({ size = 32, className = '', variant = null }) {
  const { mode } = useTheme()
  const uid = useId().replace(/:/g, '')
  const effective = variant || mode
  const ring = effective === 'light' ? '#111827' : '#ffffff'
  const w = Math.round(size * 100 / 112)

  return (
    <svg
      viewBox="0 0 100 112"
      height={size}
      width={w}
      style={{ display: 'block', flexShrink: 0 }}
      className={className}
      role="img"
      aria-label="WalletLens"
    >
      <defs>
        <clipPath id={`${uid}lc`}>
          <circle cx="44" cy="43" r="25" />
        </clipPath>
      </defs>
      {/* Emerald lens fill */}
      <circle cx="44" cy="43" r="33" fill="#10b981" />
      {/* Ascending bar chart inside the lens */}
      <g clipPath={`url(#${uid}lc)`}>
        <rect x="25" y="46" width="6" height="8"  rx="1.5" fill="white" fillOpacity="0.75" />
        <rect x="33" y="41" width="6" height="13" rx="1.5" fill="white" fillOpacity="0.85" />
        <rect x="41" y="35" width="6" height="19" rx="1.5" fill="white" fillOpacity="0.95" />
        <rect x="49" y="29" width="6" height="25" rx="1.5" fill="white" />
      </g>
      {/* Magnifying glass ring */}
      <circle cx="44" cy="43" r="33" fill="none" stroke={ring} strokeWidth="7" />
      {/* Handle */}
      <line x1="68" y1="67" x2="90" y2="89" stroke={ring} strokeWidth="9" strokeLinecap="round" />
    </svg>
  )
}

export default memo(Logo)
