// WalletLens SVG logo — matches the brand mark (green lens with iris)
export default function Logo({ size = 32, animated = false, className = '' }) {
  const r = size / 2
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      className={`wl-logo ${animated ? 'wl-logo-animated' : ''} ${className}`}
      aria-label="WalletLens"
    >
      {/* outer thin ring */}
      <circle cx="50" cy="50" r="47" fill="none" style={{ stroke: 'var(--g)', opacity: 0.25 }} strokeWidth="1.5" />
      {/* green lens ring */}
      <circle cx="50" cy="50" r="38" fill="none" style={{ stroke: 'var(--g)' }} strokeWidth="7" />
      {/* inner green fill circle (pupil/light) */}
      <circle cx="50" cy="50" r="16" style={{ fill: 'var(--g)' }} />
      {/* highlight specular */}
      <circle cx="42" cy="42" r="5" fill="rgba(255,255,255,0.35)" />
    </svg>
  )
}
