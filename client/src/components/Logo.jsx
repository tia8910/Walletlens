import { memo } from 'react'
import { useTheme } from '../ThemeContext'

// variant='dark'  → always white arrow (use on dark-background pages like Landing)
// variant='light' → always black arrow
// variant=null    → auto from theme context
function Logo({ size = 32, animated = false, className = '', variant = null }) {
  const { mode } = useTheme()
  const effective = variant || mode
  const src = effective === 'light' ? '/wl-logo-light.png' : '/wl-logo-transparent.png'
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
