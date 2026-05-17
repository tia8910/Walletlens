import { useState, useEffect, useRef, memo } from 'react'

// Known non-crypto asset icons rendered inline — no CDN needed
const ASSET_ICONS = {
  'metal:xau': { emoji: '🥇', label: 'XAU', color1: '#f59e0b', color2: '#b45309' },
  'metal:xag': { emoji: '🥈', label: 'XAG', color1: '#94a3b8', color2: '#475569' },
}
function isNonCrypto(coinId) {
  if (!coinId) return false
  return coinId.startsWith('stock:') || coinId.startsWith('fiat:') ||
         coinId.startsWith('bond:') || coinId.startsWith('other:') ||
         coinId.startsWith('metal:')
}
function nonCryptoLabel(coinId, symbol) {
  if (coinId?.startsWith('fiat:'))  return coinId.slice(5).toUpperCase().substring(0, 3)
  if (coinId?.startsWith('stock:')) return coinId.slice(6).toUpperCase().substring(0, 4)
  if (coinId?.startsWith('bond:'))  return (symbol || 'BND').substring(0, 3).toUpperCase()
  if (coinId?.startsWith('other:')) return (symbol || 'OTH').substring(0, 3).toUpperCase()
  return (symbol || '?').substring(0, 3).toUpperCase()
}
function nonCryptoColor(coinId) {
  if (coinId?.startsWith('stock:')) return ['#10b981', '#047857']
  if (coinId?.startsWith('fiat:'))  return ['#0ea5e9', '#0369a1']
  if (coinId?.startsWith('bond:'))  return ['#0284c7', '#075985']
  return ['#a78bfa', '#6d28d9']
}

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
// Order: provided URL → jsDelivr SVG → CoinGecko assets → CoinCap → cryptoicons → generated gradient
const STAGE_TIMEOUT_MS = 8000

const CoinLogo = memo(function CoinLogo({
  image,
  symbol,
  coinId,
  size = 32,
  className = 'coin-logo',
  badgeStyle,
  fallbackChar,
}) {
  const sym = (symbol || '').toLowerCase()

  // Short-circuit for non-crypto assets — no CDN has their icons
  if (isNonCrypto(coinId)) {
    const known = ASSET_ICONS[coinId]
    if (known) {
      const id = `gi-${coinId}`
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ borderRadius:'50%', flexShrink:0, ...badgeStyle }}>
          <defs>
            <radialGradient id={id} cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor={known.color1} />
              <stop offset="100%" stopColor={known.color2} />
            </radialGradient>
          </defs>
          <circle cx="16" cy="16" r="16" fill={`url(#${id})`} />
          <text x="16" y="16" textAnchor="middle" dominantBaseline="central"
            fontSize="11" fontWeight="800" fontFamily="Inter,system-ui,sans-serif" fill="rgba(255,255,255,0.95)">
            {known.label}
          </text>
        </svg>
      )
    }
    const label = fallbackChar || nonCryptoLabel(coinId, symbol)
    const [c1, c2] = nonCryptoColor(coinId)
    const id = `gi-nc-${coinId}`
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ borderRadius:'50%', flexShrink:0, ...badgeStyle }}>
        <defs>
          <radialGradient id={id} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </radialGradient>
        </defs>
        <circle cx="16" cy="16" r="16" fill={`url(#${id})`} />
        <text x="16" y="16" textAnchor="middle" dominantBaseline="central"
          fontSize={label.length > 3 ? '8' : label.length > 2 ? '10' : '12'} fontWeight="800"
          fontFamily="Inter,system-ui,sans-serif" fill="rgba(255,255,255,0.95)">
          {label}
        </text>
      </svg>
    )
  }

  const STAGES = [
    image ? `img:${image}` : null,
    sym   ? `jsdelivr:${sym}` : null,
    coinId ? `coingecko-search:${coinId}` : null,
    sym   ? `coincap:${sym}` : null,
    sym   ? `binance:${sym}` : null,
    sym   ? `cryptoicons:${sym}` : null,
  ].filter(Boolean)

  const [stageIdx, setStageIdx] = useState(image ? 0 : 1)
  const stageIdxRef = useRef(stageIdx)
  const loadedRef   = useRef(false)
  stageIdxRef.current = stageIdx

  useEffect(() => {
    loadedRef.current = false
    setStageIdx(image ? 0 : 1)
  }, [image, sym, coinId])

  useEffect(() => {
    if (stageIdx >= STAGES.length) return
    loadedRef.current = false
    const t = setTimeout(() => {
      if (stageIdxRef.current === stageIdx && !loadedRef.current) setStageIdx(s => s + 1)
    }, STAGE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [stageIdx])

  const onLoad   = () => { loadedRef.current = true }
  const advance  = () => setStageIdx(s => s + 1)
  const common   = { alt: '', width: size, height: size, className, loading: 'lazy', referrerPolicy: 'no-referrer', onLoad }

  const currentStage = STAGES[stageIdx]
  if (!currentStage) {
    // exhausted all stages
  } else if (currentStage.startsWith('img:')) {
    return <img {...common} src={image} onError={advance} />
  } else if (currentStage.startsWith('jsdelivr:')) {
    return <img {...common} src={`https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${sym}.svg`} onError={advance} />
  } else if (currentStage.startsWith('coingecko-search:')) {
    return <img {...common} src={`https://coin-images.coingecko.com/coins/images/thumb/${coinId}.png`} onError={advance} />
  } else if (currentStage.startsWith('coincap:')) {
    return <img {...common} src={`https://assets.coincap.io/assets/icons/${sym}@2x.png`} onError={advance} />
  } else if (currentStage.startsWith('binance:')) {
    return <img {...common} src={`https://bin.bnbstatic.com/image/pgc/202309/coin-icons/${sym.toUpperCase()}.png`} onError={advance} />
  } else if (currentStage.startsWith('cryptoicons:')) {
    return <img {...common} src={`https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${sym}.png`} onError={advance} />
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
