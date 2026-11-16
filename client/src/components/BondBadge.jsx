import { useId } from 'react'

// The mark for a bond: a deep blue coin holding a certificate, its engraved
// lines and a gold seal with ribbons, the way a paper bond was issued. Drawn
// in one 32-unit box so it reads at 18px on the holdings drum and at 40px in
// the lists. Gradient ids come from useId, so many on one page do not clash.

export default function BondBadge({ size = 32, className = 'coin-logo', style, title }) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const disc = `bd-disc-${raw}`, paper = `bd-paper-${raw}`, gold = `bd-gold-${raw}`
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true} style={{ borderRadius: '50%', flexShrink: 0, ...style }}>
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={disc} cx="32%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="55%" stopColor="#0369a1" />
          <stop offset="100%" stopColor="#0c2d4a" />
        </radialGradient>
        <linearGradient id={paper} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dbeafe" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#${disc})`} />
      <circle cx="16" cy="16" r="14.6" fill="none" stroke="#bae6fd" strokeOpacity=".35" strokeWidth=".7" strokeDasharray="1.2 1.1" />
      {/* the certificate, its corner folded */}
      <path d="M8.5 8.2h11.2l3.8 3.8v11.8a1 1 0 0 1-1 1H8.5a1 1 0 0 1-1-1V9.2a1 1 0 0 1 1-1z" fill={`url(#${paper})`} />
      <path d="M19.7 8.2v3.1a.7.7 0 0 0 .7.7h3.1z" fill="#93c5fd" />
      {/* engraved lines and a guilloche wave */}
      <path d="M10.2 11.4h7.2M10.2 13.6h9.6" stroke="#1e40af" strokeWidth="1" strokeLinecap="round" />
      <path d="M10.2 16.4c1.2-1.1 2.4 1.1 3.6 0s2.4 1.1 3.6 0 2.4 1.1 3.6 0" fill="none" stroke="#0284c7" strokeWidth=".8" strokeLinecap="round" />
      <path d="M10.2 19h4.6" stroke="#1e40af" strokeOpacity=".55" strokeWidth=".9" strokeLinecap="round" />
      {/* gold seal with ribbons */}
      <path d="M18.6 22.3l-1.2 4.4 2.3-1.1 1.3 2.1.9-4.7zM22.9 22.3l1.2 4.4-2.3-1.1-1.3 2.1-.9-4.7z" fill="#dc2626" />
      <circle cx="20.75" cy="20.6" r="3.3" fill={`url(#${gold})`} stroke="#fff7d6" strokeWidth=".6" />
      <path d="M20.75 18.6l.6 1.25 1.37.2-1 .96.24 1.36-1.21-.64-1.21.64.24-1.36-1-.96 1.37-.2z" fill="#fff7d6" />
    </svg>
  )
}
