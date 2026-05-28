import { memo } from 'react'

function Logo({ size = 32, animated = false, className = '' }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32"
      className={`wl-logo${animated ? ' wl-logo-animated' : ''}${className ? ' ' + className : ''}`}
      aria-label="WalletLens"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Magnifying glass circle */}
      <circle cx="13" cy="13" r="9.5" stroke="var(--g)" strokeWidth="2.2" />
      {/* Bar chart bars inside lens — ascending left to right */}
      <rect x="7.8"  y="14"   width="2.6" height="3.8" rx="0.6" fill="var(--g)" opacity="0.65" />
      <rect x="11.7" y="11.5" width="2.6" height="6.3" rx="0.6" fill="var(--g)" opacity="0.82" />
      <rect x="15.6" y="9"    width="2.6" height="8.8" rx="0.6" fill="var(--g)" />
      {/* Handle */}
      <line x1="19.7" y1="19.7" x2="27" y2="27"
        stroke="var(--g)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

export default memo(Logo)
