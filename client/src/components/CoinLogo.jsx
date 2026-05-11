import { useState, useEffect, useRef } from 'react'

// Deterministic gradient color from a string (coin symbol/id)
function symbolToGradient(sym) {
  let h = 0
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0
  const hue1 = h % 360
  const hue2 = (hue1 + 40) % 360
  return [`hsl(${hue1},70%,50%)`, `hsl(${hue2},80%,35%)`]
}

function GeneratedIcon({ symbol, size, className }) {
  const sym = (symbol || '?').toUpperCase()
  const label = sym.substring(0, sym.length > 3 ? 2 : 3)
  const [c1, c2] = symbolToGradient(sym)
  const id = `cg-${sym}`
  const fs = size <= 24 ? size * 0.38 : size <= 36 ? size * 0.36 : size * 0.32
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      <text
        x="50%" y="50%"
        dominantBaseline="central" textAnchor="middle"
        fill="rgba(255,255,255,0.95)" fontWeight="800"
        fontSize={fs} fontFamily="system-ui,sans-serif"
        style={{ userSelect: 'none' }}
      >{label}</text>
    </svg>
  )
}

// Coin logo with fallback chain:
//   0. provided image URL (CoinGecko thumb/image)
//   1. jsDelivr cryptocurrency-icons SVG (top ~200 coins)
//   2. CoinCap symbol icon
//   3. Generated gradient SVG icon (instant, no CDN)
//
// onLoad cancels the stall-timeout so loaded images stay visible.
const STAGE_TIMEOUT_MS = 4000

export default function CoinLogo({
  image,
  symbol,
  size = 32,
  className = 'coin-logo',
  badgeStyle,
  fallbackChar,
}) {
  const sym = (symbol || '').toLowerCase()
  const [stage, setStage] = useState(image ? 0 : 1)
  const stageRef = useRef(stage)
  const loadedRef = useRef(false)
  stageRef.current = stage

  useEffect(() => {
    loadedRef.current = false
    setStage(image ? 0 : 1)
  }, [image, sym])

  useEffect(() => {
    if (stage >= 3) return
    loadedRef.current = false
    const t = setTimeout(() => {
      if (stageRef.current === stage && !loadedRef.current) setStage(s => s + 1)
    }, STAGE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [stage])

  const onLoad = () => { loadedRef.current = true }
  const common = { alt: '', width: size, height: size, className, loading: 'eager', referrerPolicy: 'no-referrer', onLoad }

  if (stage === 0 && image) {
    return <img {...common} src={image} onError={() => setStage(1)} />
  }
  if (stage <= 1 && sym) {
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
  return <GeneratedIcon symbol={fallbackChar || symbol} size={size} className={className} />
}
