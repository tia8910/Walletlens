import { useState, useEffect } from 'react'

// Robust coin-logo fallback chain. Tries (in order):
// 1. provided image URL (e.g. CoinGecko)
// 2. CoinCap symbol icon — https://assets.coincap.io/assets/icons/{sym}@2x.png
// 3. cryptocurrency-icons SVG via jsDelivr — https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons/svg/color/{sym}.svg
// 4. TradingView crypto SVG — https://s3-symbol-logo.tradingview.com/crypto/XTVC{TICKER}.svg
// 5. letter / category badge
//
// Each <img> uses onError to bump to the next stage so we never show a
// broken-image icon. `loading="lazy"` keeps off-screen rows cheap.
export default function CoinLogo({
  image,
  symbol,
  size = 32,
  className = 'coin-logo',
  badgeStyle,
  fallbackChar,
}) {
  const sym = (symbol || '').toLowerCase()
  const symU = (symbol || '').toUpperCase()
  const [stage, setStage] = useState(image ? 0 : 1)

  // Re-evaluate when image/symbol changes (route navigation)
  useEffect(() => {
    setStage(image ? 0 : 1)
  }, [image, sym])

  const common = { alt: '', width: size, height: size, className, loading: 'lazy' }

  if (stage === 0 && image) {
    return <img {...common} src={image} onError={() => setStage(sym ? 1 : 4)} />
  }
  if (stage === 1 && sym) {
    return <img {...common} src={`https://assets.coincap.io/assets/icons/${sym}@2x.png`} onError={() => setStage(2)} />
  }
  if (stage === 2 && sym) {
    return <img {...common} src={`https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/svg/color/${sym}.svg`} onError={() => setStage(3)} />
  }
  if (stage === 3 && symU) {
    return <img {...common} src={`https://s3-symbol-logo.tradingview.com/crypto/XTVC${symU}.svg`} onError={() => setStage(4)} />
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
