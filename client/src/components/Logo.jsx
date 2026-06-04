import { memo, useId } from 'react'

// ── TEST: new brand logo PNG ──────────────────────────────────────────────────
function Logo({ size = 32, animated = false, className = '' }) {
  return (
    <img
      src="/wl-logo-dark.png"
      width={size}
      height={size}
      alt="WalletLens"
      style={{ borderRadius: size * 0.22, objectFit: 'cover', display: 'block' }}
      className={className}
    />
  )
}

export default memo(Logo)
