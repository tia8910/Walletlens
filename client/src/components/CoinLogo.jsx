import { useState, useEffect, useRef, memo } from 'react'

// Deterministic gradient from symbol — avoids every CDN/network round-trip
// for the final fallback (letter badge).
function symbolToGradient(sym) {
  let h = 0
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0
  const hue1 = h % 360
  const hue2 = (hue1 + 40) % 360
  return [`hsl(${hue1},70%,50%)`, `hsl(${hue2},80%,35%)`]
}

function GeneratedIcon({ symbol, size, className, badgeStyle, fallbackChar }) {
  const sym = (symbol || '?').toString()
  const [c1, c2] = symbolToGradient(sym.toLowerCase())
  const label = fallbackChar || sym.substring(0, 2).toUpperCase()
  const id = `gi-${sym.toLowerCase()}`
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 32 32"
      className={className}
      style={{ borderRadius: '50%', flexShrink: 0, ...badgeStyle }}
    >
      <defs>
        <radialGradient id={id} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#${id})`} />
      <text
        x="16" y="16"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={label.length > 1 ? '12' : '14'}
        fontWeight="800"
        fontFamily="Inter,system-ui,sans-serif"
        fill="rgba(255,255,255,0.92)"
      >
        {label}
      </text>
    </svg>
  )
}

// Robust coin-logo fallback chain. Each <img> uses onError to bump to
// the next stage; onLoad clears the timeout so we never advance past a
// successfully loaded image. A 2.5 s timer forces an advance only when
// the browser silently stalls (blocked extension, slow CDN).
//
// Order: provided URL → jsDelivr SVG → CoinCap → cryptoicons → generated gradient
const STAGE_TIMEOUT_MS = 2500

const CoinLogo = memo(function CoinLogo({
  image,
  symbol,
  size = 32,
  className = 'coin-logo',
  badgeStyle,
  fallbackChar,
}) {
  const sym = (symbol || '').toLowerCase()
  const [stage, setStage] = useState(image ? 0 : 1)
  const stageRef  = useRef(stage)
  const loadedRef = useRef(false)
  stageRef.current = stage

  // Reset whenever the source changes (route navigation)
  useEffect(() => {
    loadedRef.current = false
    setStage(image ? 0 : 1)
  }, [image, sym])

  // Force-advance only if the current stage hasn't loaded within the timeout
  useEffect(() => {
    if (stage >= 4) return
    loadedRef.current = false
    const t = setTimeout(() => {
      if (stageRef.current === stage && !loadedRef.current) setStage(s => s + 1)
    }, STAGE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [stage])

  const onLoad  = () => { loadedRef.current = true }
  const common  = { alt: '', width: size, height: size, className, loading: 'lazy', referrerPolicy: 'no-referrer', onLoad }

  if (stage === 0 && image) {
    return <img {...common} src={image} onError={() => setStage(1)} />
  }
  if (stage === 1 && sym) {
    return (
      <img
        {...common}
        src={`https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/svg/color/${sym}.svg`}
        onError={() => setStage(2)}
      />
    )
  }
  if (stage === 2 && sym) {
    return (
      <img
        {...common}
        src={`https://assets.coincap.io/assets/icons/${sym}@2x.png`}
        onError={() => setStage(3)}
      />
    )
  }
  if (stage === 3 && sym) {
    return (
      <img
        {...common}
        src={`https://cryptoicons.org/api/icon/${sym}/200`}
        onError={() => setStage(4)}
      />
    )
  }
  return (
    <GeneratedIcon
      symbol={symbol}
      size={size}
      className={className}
      badgeStyle={badgeStyle}
      fallbackChar={fallbackChar}
    />
  )
})

export default CoinLogo
