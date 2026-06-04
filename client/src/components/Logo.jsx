import { memo } from 'react'

function Logo({ size = 32, animated = false, className = '' }) {
  return (
    <img
      src="/wl-logo-transparent.png"
      width={size}
      height={size}
      alt="WalletLens"
      draggable="false"
      style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }}
      className={className}
    />
  )
}

export default memo(Logo)
