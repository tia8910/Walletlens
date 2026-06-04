import { memo } from 'react'

// Logo image. Two variants — dark-text for light surfaces, light-text for
// dark surfaces — toggled purely in CSS via the [data-wl-light] ancestor so
// it stays correct in both themes without prop drilling.
function Logo({ size = 32, animated = false, className = '' }) {
  return (
    <span
      className={`wl-logo-new${animated ? ' wl-logo-animated' : ''}${className ? ' ' + className : ''}`}
      style={{ height: size }}
      aria-label="WalletLens"
      role="img"
    >
      <img className="wl-logo-img wl-logo-img-dark" src="/walletlens-logo-dark.png" alt="WalletLens" height={size} draggable={false} />
      <img className="wl-logo-img wl-logo-img-light" src="/walletlens-logo.png" alt="" aria-hidden="true" height={size} draggable={false} />
    </span>
  )
}

export default memo(Logo)
