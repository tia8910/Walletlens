import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { getCachedCoinImage } from '../api'
// Shared with the landing page's asset-class cards so both render the same
// metal badges. See client/src/data/assetIcons.js.
import { ASSET_ICONS, AssetIconBadge } from '../data/assetIcons'
import { voiceProxy } from '../apiHosts.js'
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
  if (coinId?.startsWith('stock:')) return ['var(--gd)', '#047857']
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
// successfully loaded image. A timer forces an advance only when the
// browser silently stalls (blocked extension, slow CDN) — the first
// (user-supplied/cached) stage gets the most patience since it's most
// likely to be correct; later last-resort CDN fallbacks fail fast so a
// blocked/slow CDN can't stall the whole chain for many seconds per icon.
//
// Order: provided URL → jsDelivr SVG → CoinGecko assets → CoinCap → cryptoicons → generated gradient
// The URL that actually rendered, per asset, kept across sessions.
//
// A logo that has been on screen must never turn back into initials. Two
// things were making it do exactly that:
//
//   • The Dashboard replaced its whole coinImages map with each refresh's
//     result, so a partial response left `image` undefined for the assets it
//     did not carry.
//   • The effect below restarted the fallback ladder whenever `image`
//     changed — including from a URL to undefined. The ladder then re-ran
//     without its best stage, walked a set of CDNs this device may not be
//     able to reach, and settled on the generated letter badge. Once there it
//     stayed for the session, which is why a logo appeared at startup and
//     then went.
//
// Recording the winner and putting it first means the ladder starts from
// something already proven to load, on this device, on this network — and it
// survives a restart, so logos are there in the first frame.
const RESOLVED_KEY = 'wl_logo_resolved'
let RESOLVED = {}
try { RESOLVED = JSON.parse(localStorage.getItem(RESOLVED_KEY) || '{}') || {} } catch { RESOLVED = {} }

let saveTimer = null
function rememberResolved(key, src) {
  if (!key || !src || RESOLVED[key] === src) return
  RESOLVED[key] = src
  // Debounced: a dashboard paints a dozen of these at once.
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(RESOLVED_KEY, JSON.stringify(RESOLVED)) } catch { /* full or private */ }
  }, 500)
}

// Whether an icon's ink is dark, so it can be given something to sit on.
//
// Several official marks are near-black on a transparent ground — Arweave is
// the one that prompted this — and on a dark theme they render as a faint
// smudge or nothing at all. A white disc behind them is what every exchange
// does, and it costs nothing for the rest: an icon that already fills its own
// circle covers the disc completely, so this is a no-op for them.
//
// Measured from the pixels rather than kept as a list of coin ids, because a
// list is wrong the moment a project restyles its logo. Sixteen by sixteen is
// plenty to average an ink colour, and the verdict is cached per URL so it is
// paid once per icon, ever.
const DARK_KEY = 'wl_logo_dark'
let DARKNESS = {}
try { DARKNESS = JSON.parse(localStorage.getItem(DARK_KEY) || '{}') || {} } catch { DARKNESS = {} }

let darkSaveTimer = null
function rememberDarkness(src, isDark) {
  if (!src || DARKNESS[src] === isDark) return
  DARKNESS[src] = isDark
  clearTimeout(darkSaveTimer)
  darkSaveTimer = setTimeout(() => {
    try { localStorage.setItem(DARK_KEY, JSON.stringify(DARKNESS)) } catch { /* full or private */ }
  }, 500)
}

// Below this, on a 0-1 scale, the mark needs a plate. Arweave's black sits
// near 0.05; Tether's green near 0.55; Aptos is dark but opaque, so it gets a
// disc it then completely hides.
const DARK_INK = 0.42

/**
 * Average the luminance of everything that is actually drawn.
 *
 * Returns null when it cannot tell — a tainted canvas, a browser without one,
 * an image with no pixels yet — and the caller then leaves the icon alone.
 * Guessing "dark" on no evidence would put a white disc behind every logo.
 */
function measureInk(img) {
  try {
    if (!img?.naturalWidth) return null
    const c = document.createElement('canvas')
    c.width = 16; c.height = 16
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, 16, 16)
    const { data } = ctx.getImageData(0, 0, 16, 16)

    let sum = 0
    let seen = 0
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]
      if (a < 32) continue      // transparent ground is not ink
      // Rec. 709 luma, which tracks perceived brightness rather than raw mean.
      sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
      seen++
    }
    if (!seen) return null
    return sum / seen
  } catch {
    // Cross-origin pixels the canvas will not hand back. Every icon now comes
    // through /api/icon, which is same-origin, so this is the rare path.
    return null
  }
}

const STAGE_TIMEOUT_MS = 3000
const FALLBACK_TIMEOUT_MS = 1200
// How many times a row may rebuild an exhausted ladder on returning to the
// foreground. Bounded, so an asset with genuinely no logo anywhere does not
// re-walk six CDNs every time the app is opened.
const MAX_RETRIES = 2

/**
 * Non-crypto assets — stocks, metals, fiat. Their icons come from a local
 * table because no CDN carries them, so the fallback ladder in CryptoLogo
 * would only burn requests on a stock ticker before giving up.
 */
function NonCryptoLogo({ coinId, symbol, size = 32, className = 'coin-logo', badgeStyle, fallbackChar }) {
  // The shared badge, not a second copy of it.
  //
  // This drew its own gradient disc with the metal's ISO code, while
  // assetIcons.jsx exported a badge for exactly these ids and the trade sheet
  // drew an ingot — three marks for one asset, and the dashboard got the least
  // recognisable. AssetIconBadge is now the only one, and it carries the same
  // ingot Buy and Sell show.
  if (ASSET_ICONS[coinId]) {
    return <AssetIconBadge coinId={coinId} size={size} className={className} style={badgeStyle} />
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

const CryptoLogo = memo(function CryptoLogo({
  image,
  symbol,
  coinId,
  size = 32,
  className = 'coin-logo',
  badgeStyle,
  fallbackChar,
}) {
  const sym = (symbol || '').toLowerCase()

  // Prefer the stored image and API cache (exact coinId match = correct icon).
  // Only fall back to symbol-based CDNs as last resort — they can return
  // wrong icons when the same symbol exists for multiple coins (WLD, NS, FET…).
  const cachedImg = coinId ? getCachedCoinImage(coinId) : null
  const logoKey = coinId || (sym ? `sym:${sym}` : '')
  const resolved = logoKey ? RESOLVED[logoKey] : null
  const STAGES = useMemo(() => [
    // What loaded last time, first. Everything below it is a guess by
    // comparison, and several of the guesses are hosts a given device or
    // network may block outright.
    resolved ? `img:${resolved}` : null,
    image    && image !== resolved ? `img:${image}` : null,
    cachedImg && cachedImg !== image && cachedImg !== resolved ? `img:${cachedImg}` : null,
    // Our own origin, ahead of every third-party host.
    //
    // A screen recording showed every holding rendering as the generated
    // letter badge: the CDNs below, and the proxy at the bottom, are all
    // somewhere this device cannot reach — the same filtering that made every
    // workers.dev request fail. walletlens.live it does reach, so /api/icon
    // does the last hop from the edge. It is also one request instead of a
    // walk through six, and it is edge-cached for everyone.
    sym      ? `origin:${sym}` : null,
    image    ? `originurl:${image}` : null,
    sym      ? `jsdelivr:${sym}` : null,
    sym      ? `coincap:${sym}` : null,
    sym      ? `lcw:${sym}` : null,
    sym      ? `cryptoicons:${sym}` : null,
    // Deno-proxied fallbacks — ad blockers / privacy extensions and some
    // networks block the icon CDNs directly (coincap, jsdelivr are common
    // targets). The proxy allowlists these CDNs and returns the image with
    // permissive CORS, so logos still load when direct requests are blocked.
    sym      ? `dproxy:https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${sym}.svg` : null,
    sym      ? `dproxy:https://assets.coincap.io/assets/icons/${sym}@2x.png` : null,
  ].filter(Boolean), [image, cachedImg, sym, resolved])

  const [stageIdx, setStageIdx] = useState(0)
  const stageIdxRef = useRef(stageIdx)
  const loadedRef   = useRef(false)
  stageIdxRef.current = stageIdx

  // Restart the ladder for a DIFFERENT asset, or for a new image URL. Not
  // because the URL went away: a refresh that returns a partial map does
  // exactly that, and restarting there is what replaced a loaded logo with
  // initials.
  const assetRef = useRef(`${coinId}|${sym}`)
  useEffect(() => {
    const id = `${coinId}|${sym}`
    const changedAsset = assetRef.current !== id
    assetRef.current = id
    if (!changedAsset && !image) return
    loadedRef.current = false
    setStageIdx(0)
  }, [image, sym, coinId])

  useEffect(() => {
    if (stageIdx >= STAGES.length) return
    loadedRef.current = false
    const timeout = stageIdx <= 1 ? STAGE_TIMEOUT_MS : FALLBACK_TIMEOUT_MS
    let t = null

    // Never run the clock while the tab is hidden.
    //
    // A hidden document has its timers throttled and its image loads deferred
    // or dropped, so the timer would advance past a stage the browser never
    // gave a chance to load — and it advances again, and again, until the
    // ladder is exhausted and the generated letter badge is all that is left.
    // That is the whole bug: a logo that was fine before the app went into the
    // background is initials when it comes back, and only reappears if the row
    // is remounted, which is what opening an asset and returning does.
    const arm = () => {
      clearTimeout(t)
      if (document.hidden) return
      t = setTimeout(() => {
        if (stageIdxRef.current === stageIdx && !loadedRef.current) setStageIdx(s => s + 1)
      }, timeout)
    }
    arm()
    const onVisible = () => { if (!document.hidden) arm() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [stageIdx, STAGES.length])

  // One more try when the app returns, for a ladder that ran out while it was
  // away. Without this the row keeps its badge until something remounts it.
  const retriesRef = useRef(0)
  useEffect(() => {
    if (stageIdx < STAGES.length) return
    const onVisible = () => {
      if (document.hidden || retriesRef.current >= MAX_RETRIES) return
      retriesRef.current += 1
      loadedRef.current = false
      setStageIdx(0)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [stageIdx, STAGES.length])

  const [needsPlate, setNeedsPlate] = useState(false)

  const onLoad = (e) => {
    loadedRef.current = true
    const el = e?.currentTarget
    const src = el?.currentSrc || el?.src || ''
    rememberResolved(logoKey, src)

    const known = DARKNESS[src]
    if (typeof known === 'boolean') { setNeedsPlate(known); return }
    const ink = measureInk(el)
    if (ink === null) return          // could not tell; leave the icon alone
    const dark = ink < DARK_INK
    rememberDarkness(src, dark)
    setNeedsPlate(dark)
  }
  const advance  = () => setStageIdx(s => s + 1)
  const common   = { alt: symbol ? `${String(symbol).toUpperCase()} logo` : 'asset logo', width: size, height: size, className, referrerPolicy: 'no-referrer', decoding: 'async', onLoad }

  // The plate on the first frame for an icon already judged, so a known-dark
  // mark never flashes unreadable before its own onLoad runs.
  const currentStage = STAGES[stageIdx]
  const stageSrc = currentStage?.startsWith('img:') ? currentStage.slice(4) : null
  const plate = needsPlate || DARKNESS[stageSrc] === true
  const withPlate = plate
    ? { ...common, style: { ...(common.style || {}), background: '#fff' } }
    : common
  if (!currentStage) {
    // exhausted all stages
  } else if (currentStage.startsWith('img:')) {
    const src = currentStage.slice(4)
    return <img {...withPlate} src={src} onError={advance} />
  } else if (currentStage.startsWith('origin:')) {
    return <img {...withPlate} src={`/api/icon?sym=${encodeURIComponent(sym)}`} onError={advance} />
  } else if (currentStage.startsWith('originurl:')) {
    // The URL the API gave us, fetched through our origin. On a filtered
    // network coin-images.coingecko.com is no more reachable than the rest.
    return <img {...withPlate} src={`/api/icon?url=${encodeURIComponent(currentStage.slice(10))}`} onError={advance} />
  } else if (currentStage.startsWith('jsdelivr:')) {
    return <img {...withPlate} src={`https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${sym}.svg`} onError={advance} />
  } else if (currentStage.startsWith('coincap:')) {
    return <img {...withPlate} src={`https://assets.coincap.io/assets/icons/${sym}@2x.png`} onError={advance} />
  } else if (currentStage.startsWith('lcw:')) {
    return <img {...withPlate} src={`https://lcw.nyc3.cdn.digitaloceanspaces.com/production/currencies/64/${sym}.webp`} onError={advance} />
  } else if (currentStage.startsWith('cryptoicons:')) {
    return <img {...withPlate} src={`https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${sym}.png`} onError={advance} />
  } else if (currentStage.startsWith('dproxy:')) {
    const target = currentStage.slice(7)
    return <img {...withPlate} src={voiceProxy(target)} onError={advance} />
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

/**
 * Picks between the two. This wrapper calls no hooks, which is the point.
 *
 * The choice used to be an `if (isNonCrypto(coinId)) return …` sitting above
 * six hooks in a single component, so a logo whose coinId moved between a
 * stock and a coin at the same position rendered a different number of hooks
 * than the render before it — React #310. A hookless component may return
 * early; CryptoLogo always runs the same hooks in the same order.
 */
const CoinLogo = memo(function CoinLogo(props) {
  if (isNonCrypto(props.coinId)) return <NonCryptoLogo {...props} />
  return <CryptoLogo {...props} />
})

export default CoinLogo
