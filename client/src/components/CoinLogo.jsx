import { useState, useEffect, useRef } from 'react'

// Robust coin-logo fallback chain. Each <img> uses onError to bump to
// the next stage; an additional 2.5s timer forces an advance if the
// browser silently stalls (e.g. blocked by an extension, slow CDN).
//
// Order is from most-likely to least-likely to render correctly:
//   0. provided image URL (CoinGecko etc — usually right but can be slow / blocked)
//   1. jsDelivr cryptocurrency-icons SVG (static CDN, top ~200 coins)
//   2. CoinCap symbol icon (top ~100 coins)
//   3. cryptoicons.org by symbol (long-tail coverage)
//   4. coloured letter / category badge
const STAGE_TIMEOUT_MS = 2500

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
  stageRef.current = stage

  // Reset whenever the source changes (route navigation)
  useEffect(() => {
    setStage(image ? 0 : 1)
  }, [image, sym])

  // Force-advance if a stage hasn't loaded after STAGE_TIMEOUT_MS
  useEffect(() => {
    if (stage >= 4) return
    const t = setTimeout(() => {
      if (stageRef.current === stage) setStage(s => s + 1)
    }, STAGE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [stage])

  const common = { alt: '', width: size, height: size, className, loading: 'eager', referrerPolicy: 'no-referrer' }

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
