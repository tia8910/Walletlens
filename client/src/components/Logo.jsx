import { memo, useId } from 'react'

function Logo({ size = 32, animated = false, className = '' }) {
  const uid = useId().replace(/:/g, '')
  const gradId = `lg-${uid}`
  const glowId = `lg-glow-${uid}`

  return (
    <svg
      width={size} height={size} viewBox="0 0 40 40"
      className={`wl-logo${animated ? ' wl-logo-animated' : ''}${className ? ' ' + className : ''}`}
      aria-label="WalletLens"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Dark green gradient fill for the lens circle */}
        <radialGradient id={gradId} cx="38%" cy="32%" r="68%" gradientUnits="objectBoundingBox">
          <stop offset="0%"   stopColor="#1db954" stopOpacity="0.95" />
          <stop offset="45%"  stopColor="#0f7a36" />
          <stop offset="100%" stopColor="#052912" />
        </radialGradient>
        {/* Subtle glow filter for animated state */}
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Filled lens circle with gradient */}
      <circle cx="17" cy="17" r="14.5" fill={`url(#${gradId})`} />
      {/* Subtle inner ring highlight */}
      <circle cx="17" cy="17" r="14.5" stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" />

      {/* Ascending white bars (chart inside lens) */}
      <rect className="wl-logo-bar wl-logo-bar-1" x="9.5"  y="19"   width="4" height="5.5" rx="1" fill="white" opacity="0.75" />
      <rect className="wl-logo-bar wl-logo-bar-2" x="15"   y="14.5" width="4" height="10"  rx="1" fill="white" opacity="0.88" />
      <rect className="wl-logo-bar wl-logo-bar-3" x="20.5" y="10.5" width="4" height="14"  rx="1" fill="white" />

      {/* Handle — bold rounded stroke, bottom-right */}
      <line x1="28.2" y1="28.2" x2="37" y2="37"
        stroke="#16a34a" strokeWidth="3.8" strokeLinecap="round" />
    </svg>
  )
}

export default memo(Logo)
