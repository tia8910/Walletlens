import { useState, useEffect, useRef } from 'react'

// Coin logo with fallback chain:
//   0. provided image URL (CoinGecko thumb/image)
//   1. jsDelivr cryptocurrency-icons SVG (top ~200 coins)
//   2. CoinCap symbol icon (top ~100 coins)
//   3. coloured letter badge
//
// onLoad stops the stage — only advances on error or 4s timeout (stalled load).
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

  // Timeout only fires if image hasn't loaded yet (stalled request)
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
  return (
    <div
      className={className}
      style={{
        background: 'rgba(0,200,83,0.12)',
        color: '#00c853',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: Math.max(10, size * 0.36),
        borderRadius: '50%',
        width: size, height: size,
        ...badgeStyle,
      }}
    >
      {fallbackChar || (symbol || '?').toString().substring(0, 2).toUpperCase()}
    </div>
  )
}
