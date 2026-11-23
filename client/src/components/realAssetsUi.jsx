// Shared pieces for the real asset screens: the kind icons and colours, and
// the money format they all use.

export const KIND_UI = {
  home: { c: '#10b981', d: 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6' },
  car: { c: '#3b82f6', d: 'M5 17h14M6 17v2M18 17v2M4 13l2-6h12l2 6v4H4zM7 13h.01M17 13h.01' },
  gem: { c: '#f59e0b', d: 'M6 3h12l3 6-9 12L3 9zM3 9h18M9 3l3 6 3-6' },
  art: { c: '#a855f7', d: 'M4 4h16v16H4zM4 15l5-5 4 4 3-3 4 4' },
  biz: { c: '#0ea5e9', d: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-5h6v5' },
  owed: { c: '#64748b', d: 'M4 7h16v10H4zM12 10v4M8 12h.01M16 12h.01' },
  other: { c: '#f472b6', d: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8' },
}

export function KindIcon({ kind, size = 18 }) {
  const k = KIND_UI[kind] || KIND_UI.other
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={k.d} />
    </svg>
  )
}

/** Whole dollars from $1,000 up, cents below. */
export function usd(n) {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  return `${v < 0 ? '−' : ''}$${abs.toLocaleString('en-US', { maximumFractionDigits: abs >= 1000 ? 0 : 2 })}`
}

/** $71.4k style, for tight spaces. */
export function usdShort(n) {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  const s = abs >= 1e6 ? `${(abs / 1e6).toFixed(1)}M` : abs >= 1e4 ? `${(abs / 1e3).toFixed(1)}k` : abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return `${v < 0 ? '−' : ''}$${s}`
}

export const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
)
