import { memo } from 'react'
import { useTheme } from '../ThemeContext'

function Logo({ size = 32, animated = false, className = '' }) {
  const { mode } = useTheme()
  const src = mode === 'light' ? '/wl-logo-light.png' : '/wl-logo-transparent.png'
  return (
    <img
      src={src}
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
