import { memo } from 'react'

function Logo({ size = 32, animated = false, className = '' }) {
  return (
    <span
      className={`wl-logo-new${animated ? ' wl-logo-animated' : ''}${className ? ' ' + className : ''}`}
      style={{ '--logo-h': `${size}px` }}
    >
      <img
        src="/walletlens-logo.png"
        alt="WalletLens"
        height={size}
        draggable={false}
        style={{ display: 'block', height: size, width: 'auto' }}
      />
    </span>
  )
}

export default memo(Logo)
