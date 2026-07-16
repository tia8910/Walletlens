import { memo, useId } from 'react'

// Matches the brand guide: thick gradient ring, green bars, dot upper-right, handle lower-left
function Logo({ size = 32, animated = false, className = '' }) {
  const uid = useId().replace(/:/g, '')
  const gId = `lg-g-${uid}`

  return (
    <svg
      width={size} height={size} viewBox="0 0 64 64"
      className={`wl-logo${animated ? ' wl-logo-animated' : ''}${className ? ' ' + className : ''}`}
      aria-label="WalletLens"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gId} x1="5" y1="5" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#4ade80" />
          <stop offset="50%"  stopColor="#16a34a" />
          <stop offset="100%" stopColor="#14532d" />
        </linearGradient>
      </defs>

      {/* Main ring — thick gradient stroke, no fill */}
      <circle cx="27" cy="25" r="19" stroke={`url(#${gId})`} strokeWidth="5.5" fill="none" />

      {/* Shine glint — a short bright arc that periodically sweeps the ring
          (animated via .wl-logo-animated CSS; invisible on static logos) */}
      <circle className="wl-logo-glint" cx="27" cy="25" r="19"
        stroke="rgba(255,255,255,0.9)" strokeWidth="5.5" fill="none"
        strokeLinecap="round" strokeDasharray="12 108" />

      {/* Small dot at upper-right of ring (focus point) */}
      <circle cx="40.5" cy="11.5" r="3.8" fill="#4ade80" />

      {/* Ascending green bars — same bottom baseline */}
      <rect className="wl-logo-bar wl-logo-bar-1" x="14.5" y="26.5" width="5"   height="7.5"  rx="1.2" fill={`url(#${gId})`} />
      <rect className="wl-logo-bar wl-logo-bar-2" x="21.5" y="21"   width="5"   height="13"   rx="1.2" fill={`url(#${gId})`} />
      <rect className="wl-logo-bar wl-logo-bar-3" x="28.5" y="15.5" width="5"   height="18.5" rx="1.2" fill={`url(#${gId})`} />

      {/* Handle — lower-left, bold rounded */}
      <line x1="13.5" y1="39" x2="4" y2="55"
        stroke={`url(#${gId})`} strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  )
}

export default memo(Logo)
