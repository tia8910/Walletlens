import { memo } from 'react'
import { useTheme } from '../ThemeContext'

// variant='dark'  → always white arrow (use on dark-background pages like Landing)
// variant='light' → always black arrow
// variant=null    → auto from theme context
function Logo({ size = 32, animated = false, className = '', variant = null }) {
  const { mode } = useTheme()
  const effective = variant || mode
  const base = effective === 'light' ? '/wl-logo-light' : '/wl-logo-transparent'
  const style = { height: size, width: 'auto', display: 'block', flexShrink: 0 }
  // Serve WebP (2× source) for crisp Retina rendering; PNG fallback for older browsers
  return (
    <picture>
      <source srcSet={`${base}.webp`} type="image/webp" />
      <img
        src={`${base}.png`}
        height={size}
        alt="WalletLens"
        draggable="false"
        style={style}
        className={className}
      />
    </picture>
  )
}

export default memo(Logo)
