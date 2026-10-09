import { useEffect, useRef, useState } from 'react'
import { noteMoment } from '../reviewPrompt'
import Icon from './Icon'
import { MetalBar } from '../data/assetIcons'

// Category/payment icons come in three shapes: a line-icon name string
// (e.g. 'trend-up'), a typographic currency glyph (₿, $, €, ₮, ⊘), or a
// ready-made SVG element (gold/silver bars). Render each correctly instead
// of forcing everything through <Icon>, which blanks out glyphs/elements.
function CatIcon({ icon, size = 15 }) {
  if (typeof icon !== 'string') return icon
  return /^[a-z][a-z-]*$/.test(icon) ? <Icon name={icon} size={size} /> : <span>{icon}</span>
}
import { api, FIAT_PREFIX, GOLD_ID, SILVER_ID, STOCK_PREFIX, XSTOCK_PREFIX, POPULAR_FIAT, POPULAR_TICKERS, POPULAR_XSTOCKS } from '../api'

function playTradeSound(isBuy) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (isBuy) {
      const notes = [523.25, 783.99]
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12)
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12)
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35)
        osc.start(ctx.currentTime + i * 0.12); osc.stop(ctx.currentTime + i * 0.12 + 0.35)
      })
    } else {
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.25)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
    }
  } catch {}
}
import CoinLogo, { FlagImg } from './CoinLogo'
import { MARKETS, MARKET_BY_CODE, marketForCountry, isIntlTicker, intlStockName, marketOfTicker } from '../data/markets'
import { detectCountry, searchStocks, getMarketList } from '../api'
import { track, trackProfileCreated } from '../analytics'
import TradeSignal from './BuySignal'
import { useLanguage } from '../LanguageContext'
import CurrencyPicker, { CurFlag } from './CurrencyPicker'
import { isFiatCode, currencyName, currencySymbol, fmtMoney } from '../data/currencies'
import { useLocation, useNavigate } from 'react-router-dom'
import { isV2Active, homePath } from '../v2Preview'


const IcoClose  = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
const IcoSearch = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IcoBack   = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>

// Curated top coins for the browsable "markets" list shown at the top of the
// full-page trade screen (ids match the price/search API). Live price + 24h
// change are fetched on open so it reads like a real markets list.
const POPULAR_COINS = [
  { id: 'bitcoin',      symbol: 'BTC',  name: 'Bitcoin' },
  { id: 'ethereum',     symbol: 'ETH',  name: 'Ethereum' },
  { id: 'tether',       symbol: 'USDT', name: 'Tether' },
  { id: 'binancecoin',  symbol: 'BNB',  name: 'BNB' },
  { id: 'solana',       symbol: 'SOL',  name: 'Solana' },
  { id: 'ripple',       symbol: 'XRP',  name: 'XRP' },
  { id: 'usd-coin',     symbol: 'USDC', name: 'USD Coin' },
  { id: 'cardano',      symbol: 'ADA',  name: 'Cardano' },
  { id: 'dogecoin',     symbol: 'DOGE', name: 'Dogecoin' },
  { id: 'tron',         symbol: 'TRX',  name: 'TRON' },
  { id: 'chainlink',    symbol: 'LINK', name: 'Chainlink' },
  { id: 'avalanche-2',  symbol: 'AVAX', name: 'Avalanche' },
  { id: 'the-open-network', symbol: 'TON', name: 'Toncoin' },
  { id: 'polkadot',     symbol: 'DOT',  name: 'Polkadot' },
  { id: 'matic-network', symbol: 'MATIC', name: 'Polygon' },
  { id: 'litecoin',     symbol: 'LTC',  name: 'Litecoin' },
  { id: 'shiba-inu',    symbol: 'SHIB', name: 'Shiba Inu' },
  { id: 'uniswap',      symbol: 'UNI',  name: 'Uniswap' },
]

// Shared with the landing page's asset-class cards — see data/assetIcons.jsx.
const IcoGoldBar   = <MetalBar metal="gold" />
const IcoSilverBar = <MetalBar metal="silver" />

const IcoOther = (
  <Icon name="package" size={16} />
)

const CATEGORIES = [
  { key: 'crypto', label: 'Crypto', labelKey: 'catCrypto',  icon: '₿',           color: '#6366f1' },
  { key: 'stock',  label: 'US stocks', labelKey: 'catUsStocks', icon: 'trend-up',        color: 'var(--g-ink)' },
  // Every market but the US, opening on the user's own.
  { key: 'wstock', label: 'Local markets', labelKey: 'catLocalMarkets', icon: 'globe',   color: '#0ea5e9' },
  { key: 'tstock', label: 'Tokenized', labelKey: 'tcTokenized', icon: 'coins',         color: '#f0b90b' },
  { key: 'gold',   label: 'Gold', labelKey: 'catGold',    icon: IcoGoldBar,     color: '#f59e0b' },
  { key: 'silver', label: 'Silver', labelKey: 'catSilver',  icon: IcoSilverBar,   color: '#94a3b8' },
  { key: 'fiat',   label: 'Fiat', labelKey: 'tcFiat',    icon: '$',            color: '#0ea5e9' },
  { key: 'bond',   label: 'Bonds', labelKey: 'catBonds',   icon: 'building',           color: '#0284c7' },
  { key: 'other',  label: 'Other', labelKey: 'txOther',   icon: IcoOther,       color: '#a78bfa' },
]

// ── Payment leg options (Buy with / Sell for) ─────────────────────────────
const BUY_WITH_OPTIONS = [
  { key: 'NONE',   label: 'None', labelKey: 'txNone',   icon: '⊘', color: '#94a3b8' },
  { key: 'USDT',   label: 'USDT',   icon: '₮', color: '#26a17b' },
  { key: 'USDC',   label: 'USDC',   icon: '$', color: '#2775ca' },
  { key: 'BTC',    label: 'BTC',    icon: '₿', color: '#f7931a' },
  { key: 'USD',    label: 'USD',    icon: '$', color: 'var(--g-ink)' },
  { key: 'EUR',    label: 'EUR',    icon: '€', color: '#3b82f6' },
  { key: 'CUSTOM', label: 'Other', labelKey: 'txOther',  icon: 'edit', color: '#a78bfa' },
]
const SELL_FOR_OPTIONS = [
  { key: 'USD',    label: 'USD',    icon: '$', color: 'var(--g-ink)' },
  { key: 'USDT',   label: 'USDT',   icon: '₮', color: '#26a17b' },
  { key: 'USDC',   label: 'USDC',   icon: '$', color: '#2775ca' },
  { key: 'BTC',    label: 'BTC',    icon: '₿', color: '#f7931a' },
  { key: 'EUR',    label: 'EUR',    icon: '€', color: '#3b82f6' },
  { key: 'CUSTOM', label: 'Other', labelKey: 'txOther',  icon: 'edit', color: '#a78bfa' },
  { key: 'REMOVE', label: 'Remove', labelKey: 'txRemove', icon: 'trash', color: '#f87171' },
]

// Cash legs wear their country's flag; the coins keep their glyphs.
const LEG_FLAGS = new Set(['USD', 'EUR'])
function LegIcon({ o, size }) {
  return LEG_FLAGS.has(o.key) || o.fiat
    ? <CoinLogo coinId={`${FIAT_PREFIX}${o.key.toLowerCase()}`} symbol={o.key} size={size + 4} className="bs-leg-flag" />
    : <CatIcon icon={o.icon} size={size} />
}

// Country names that run long on a chip, said the way people say them.
const SHORT_REGION = {
  en: { US: 'US', GB: 'UK', AE: 'UAE', SA: 'Saudi', KR: 'Korea', HK: 'Hong Kong', NL: 'Netherlands' },
  ar: { US: 'أمريكا', AE: 'الإمارات', SA: 'السعودية', GB: 'بريطانيا', KR: 'كوريا' },
  fr: { US: 'États-Unis', AE: 'Émirats', SA: 'Arabie saoudite', GB: 'Royaume-Uni', KR: 'Corée' },
  es: { US: 'EE. UU.', AE: 'Emiratos', GB: 'Reino Unido', KR: 'Corea' },
  de: { US: 'USA', AE: 'VAE', GB: 'UK', KR: 'Korea' },
  it: { US: 'USA', AE: 'Emirati', GB: 'Regno Unito', KR: 'Corea' },
}

// Both stock categories make the same kind of asset: stock:<ticker>.
const isStockCat = c => c === 'stock' || c === 'wstock'

// Names of stocks picked from a worldwide search, for the asset they become.
const PICKED_NAMES = {}

// ── Preset asset for each non-crypto category ─────────────────────────────
function presetForCategory(cat, stockTicker, fiatCode, otherInput) {
  if (cat === 'gold')   return { id: GOLD_ID,   symbol: 'XAU', name: 'Gold (1 oz)',   category: 'gold',   image: '' }
  if (cat === 'silver') return { id: SILVER_ID, symbol: 'XAG', name: 'Silver (1 oz)', category: 'silver', image: '' }
  if (isStockCat(cat) && stockTicker) {
    const up = stockTicker.toUpperCase()
    const info = POPULAR_TICKERS.find(t => t.ticker === up)
    const name = info?.name || intlStockName(up) || PICKED_NAMES[up] || up
    return { id: `${STOCK_PREFIX}${stockTicker.toLowerCase()}`, symbol: up, name, category: 'stock', image: '' }
  }
  if (cat === 'tstock' && stockTicker) {
    const info = POPULAR_XSTOCKS.find(t => t.ticker === stockTicker.toUpperCase())
    return { id: `${XSTOCK_PREFIX}${stockTicker.toLowerCase()}`, symbol: `${stockTicker.toUpperCase()}X`, name: `${info?.name || stockTicker.toUpperCase()} (Tokenized)`, category: 'tstock', image: '' }
  }
  if (cat === 'fiat' && fiatCode)
    return { id: `${FIAT_PREFIX}${fiatCode.toLowerCase()}`, symbol: fiatCode.toUpperCase(), name: fiatCode.toUpperCase(), category: 'fiat', image: '' }
  if (cat === 'bond' && otherInput)
    return { id: `bond:${otherInput.toLowerCase()}`, symbol: otherInput.toUpperCase(), name: otherInput, category: 'bond', image: '' }
  if (cat === 'other' && otherInput)
    return { id: `other:${otherInput.toLowerCase()}`, symbol: otherInput.toUpperCase(), name: otherInput, category: 'other', image: '' }
  return null
}

// ── Leg resolvers ─────────────────────────────────────────────────────────
// A USD price for a counter-asset leg, without letting the price fan-out hold
// the Confirm button open.
//
// These legs are the "bought with USDT" / "sold for BTC" side of a trade: the
// user has already entered the amount and the price for the asset they care
// about, and this lookup only converts that figure into units of the OTHER
// asset. It was an unbounded `await api.getPrices(...)` in the middle of the
// submit path, so on a network where the upstream sources are slow or blocked
// the button sat on "Setting up…" for as long as every tier took to give up.
//
// Cached first, because a dashboard that has been open for a moment already
// holds a price no older than the poll interval, and a counter-leg does not
// need a fresher one than the screen behind it. Then a live fetch with a
// deadline, and 0 when even that does not land — which the callers already
// treat as "no usable price".
const LEG_PRICE_DEADLINE_MS = 3000
async function legPriceUsd(id) {
  const cached = api.getCachedPrices(id)?.[id]?.usd
  if (cached > 0) return cached
  const live = await Promise.race([
    api.getPrices(id).catch(() => null),
    new Promise(resolve => setTimeout(() => resolve(null), LEG_PRICE_DEADLINE_MS)),
  ])
  return live?.[id]?.usd || 0
}

// Any other fiat currency the FX feed knows (EGP, SAR, GBP…): a cash leg
// priced in USD per unit, from the live price if there is one, else the rate.
async function fiatLeg(T) {
  if (!/^[A-Z]{3}$/.test(T)) return null
  let rates = null
  try { rates = await api.getFiatRates() } catch {}
  if (!isFiatCode(T, rates)) return null
  const lower = T.toLowerCase()
  let usd = 0
  try { usd = await legPriceUsd(`${FIAT_PREFIX}${lower}`) } catch {}
  if (!(usd > 0)) usd = Number(rates?.[T]) > 0 ? 1 / Number(rates[T]) : 0
  if (!(usd > 0)) return null
  return { coin_id: `${FIAT_PREFIX}${lower}`, symbol: T, name: currencyName(T), category: 'fiat', pricePerUnit: usd }
}

async function buildReceiveLeg(target, proceedsUsd) {
  const T = (target || '').toUpperCase()
  if (!T) return null
  if (T === 'USD')  return { coin_id: `${FIAT_PREFIX}usd`, symbol: 'USD',  name: 'US Dollar', category: 'fiat',   amount: proceedsUsd, pricePerUnit: 1 }
  if (T === 'USDT') return { coin_id: 'tether',            symbol: 'USDT', name: 'Tether',    category: 'crypto', amount: proceedsUsd, pricePerUnit: 1 }
  if (T === 'USDC') return { coin_id: 'usd-coin',          symbol: 'USDC', name: 'USD Coin',  category: 'crypto', amount: proceedsUsd, pricePerUnit: 1 }
  if (T === 'BTC') {
    const usd = await legPriceUsd('bitcoin')
    if (!usd) return null
    return { coin_id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', category: 'crypto', amount: proceedsUsd / usd, pricePerUnit: usd }
  }
  if (T === 'EUR') {
    let eurUsd = null
    try { eurUsd = (await legPriceUsd(`${FIAT_PREFIX}eur`)) || null } catch {}
    if (!eurUsd) eurUsd = 1.08
    return { coin_id: `${FIAT_PREFIX}eur`, symbol: 'EUR', name: 'Euro', category: 'fiat', amount: proceedsUsd / eurUsd, pricePerUnit: eurUsd }
  }
  const fiat = await fiatLeg(T)
  if (fiat) return { ...fiat, amount: proceedsUsd / fiat.pricePerUnit }
  const lower = T.toLowerCase()
  try {
    const search = await api.searchCoins?.(lower)
    const hit = Array.isArray(search) ? search.find(c => (c.symbol || '').toLowerCase() === lower) : null
    if (hit) {
      const usd = await legPriceUsd(hit.id)
      if (usd > 0) return { coin_id: hit.id, symbol: T, name: hit.name || T, category: 'crypto', amount: proceedsUsd / usd, pricePerUnit: usd }
    }
  } catch {}
  return { coin_id: `other:${lower}`, symbol: T, name: T, category: 'other', amount: proceedsUsd, pricePerUnit: 1 }
}

async function buildSpendLeg(source, costUsd) {
  const T = (source || '').toUpperCase()
  if (!T || T === 'NONE') return null
  if (T === 'USD')  return { coin_id: `${FIAT_PREFIX}usd`, symbol: 'USD',  name: 'US Dollar', category: 'fiat',   amount: costUsd, pricePerUnit: 1 }
  if (T === 'USDT') return { coin_id: 'tether',            symbol: 'USDT', name: 'Tether',    category: 'crypto', amount: costUsd, pricePerUnit: 1 }
  if (T === 'USDC') return { coin_id: 'usd-coin',          symbol: 'USDC', name: 'USD Coin',  category: 'crypto', amount: costUsd, pricePerUnit: 1 }
  if (T === 'BTC') {
    const usd = await legPriceUsd('bitcoin')
    if (!usd) return null
    return { coin_id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', category: 'crypto', amount: costUsd / usd, pricePerUnit: usd }
  }
  if (T === 'EUR') {
    let eurUsd = null
    try { eurUsd = (await legPriceUsd(`${FIAT_PREFIX}eur`)) || null } catch {}
    if (!eurUsd) eurUsd = 1.08
    return { coin_id: `${FIAT_PREFIX}eur`, symbol: 'EUR', name: 'Euro', category: 'fiat', amount: costUsd / eurUsd, pricePerUnit: eurUsd }
  }
  const fiat = await fiatLeg(T)
  if (fiat) return { ...fiat, amount: costUsd / fiat.pricePerUnit }
  const lower = T.toLowerCase()
  try {
    const search = await api.searchCoins?.(lower)
    const hit = Array.isArray(search) ? search.find(c => (c.symbol || '').toLowerCase() === lower) : null
    if (hit) {
      const usd = await legPriceUsd(hit.id)
      if (usd > 0) return { coin_id: hit.id, symbol: T, name: hit.name || T, category: 'crypto', amount: costUsd / usd, pricePerUnit: usd }
    }
  } catch {}
  return { coin_id: `other:${lower}`, symbol: T, name: T, category: 'other', amount: costUsd, pricePerUnit: 1 }
}

// ── Slide to confirm (v2 ticket) ──────────────────────────────────────────
// A trade is the one action here that writes to the portfolio, so v2 asks for
// a deliberate slide instead of a tap that a scroll can trigger by accident.
// Keyboard users confirm with Enter or Space on the focused control.
function SlideToConfirm({ label, disabled, busy, onConfirm, tone }) {
  const trackRef = useRef(null)
  const [x, setX] = useState(0)
  const [nudge, setNudge] = useState(false)
  const drag = useRef(null)
  const max = () => Math.max(0, (trackRef.current?.clientWidth || 0) - 58)

  function onDown(e) {
    if (disabled || busy) return
    drag.current = { startX: e.clientX, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onMove(e) {
    if (!drag.current) return
    const dx = Math.min(max(), Math.max(0, e.clientX - drag.current.startX))
    if (dx > 4) drag.current.moved = true
    setX(dx)
  }
  function onUp() {
    if (!drag.current) return
    const done = x >= max() * 0.85
    const tapped = !drag.current.moved
    drag.current = null
    if (done) { setX(max()); onConfirm() } else {
      setX(0)
      if (tapped) { setNudge(true); setTimeout(() => setNudge(false), 600) }
    }
  }
  useEffect(() => { if (!busy) setX(0) }, [busy])

  return (
    <div ref={trackRef}
      className={`tk-slide tk-slide-${tone}${disabled ? ' is-off' : ''}${nudge ? ' is-nudge' : ''}`}
      role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled || busy} aria-label={label}
      onKeyDown={e => { if (!disabled && !busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onConfirm() } }}>
      <span className="tk-slide-fill" style={{ width: x + 58 }} />
      <span className="tk-slide-label">{label}</span>
      <span className="tk-slide-arrows" aria-hidden="true">›››</span>
      <span className="tk-slide-knob" style={{ transform: `translateX(${x}px)` }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {busy
          ? <span className="tk-spin" aria-hidden="true" />
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>}
      </span>
    </div>
  )
}

// ── TradeSheet ────────────────────────────────────────────────────────────
export default function TradeSheet({ open, type, onClose, wallets, onDone, holdings, prefillCoin, prefillCategory, prefillStockTicker, variant = 'sheet' }) {
  const { t, lang } = useLanguage()
  const isPage = variant === 'page'
  const [category, setCategory]         = useState('crypto')
  const [coinSearch, setCoinSearch]     = useState('')
  const [coinResults, setCoinResults]   = useState([])
  const [selectedCoin, setSelectedCoin] = useState(null)
  // Stock / fiat / other sub-fields
  const [stockTicker, setStockTicker]   = useState('')
  const [stockInput, setStockInput]     = useState('')
  const [stockSector, setStockSector]   = useState('All')
  // The stock market on show: the user's own (detected) unless they pick one.
  const [market, setMarket]             = useState(() => {
    try { const m = marketForCountry(JSON.parse(localStorage.getItem('wl_country') || 'null')?.c); return m === 'US' ? 'GB' : m } catch { return 'GB' }
  })
  const [homeMarket, setHomeMarket]     = useState(null)
  const marketPicked                    = useRef(false)
  const [stockHits, setStockHits]       = useState([])
  const [stockSearching, setStockSearching] = useState(false)
  // Each market's full exchange list, once loaded, and how much of it shows.
  const [fullLists, setFullLists]       = useState({})
  const [listLimit, setListLimit]       = useState(60)
  // A price in its own currency, the way the user's language writes it (77.40 ج.م.‏, £2.45).
  const localMoney = (amount, currency) => {
    try { return new Intl.NumberFormat(lang || 'en', { style: 'currency', currency, maximumFractionDigits: amount < 10 ? 3 : 2 }).format(amount) }
    catch { return `${Number(amount).toFixed(2)} ${currency}` }
  }
  const regionName = (code) => {
    const short = SHORT_REGION[lang]?.[code] || (lang === 'en' ? SHORT_REGION.en[code] : null)
    if (short) return short
    try { return new Intl.DisplayNames([lang || 'en'], { type: 'region', style: 'short' }).of(code) } catch { return code }
  }
  // Local markets: every market but the US, opening on the user's own.
  const localMarket = homeMarket && homeMarket !== 'US' ? MARKET_BY_CODE[homeMarket] : null
  const catLabel = (c) => t(c.labelKey)
  const catIcon = (c, size) => <CatIcon icon={c.icon} size={size} />
  const [fiatCode, setFiatCode]         = useState('USD')
  const [otherName, setOtherName]       = useState('')
  // Common fields
  const [walletId, setWalletId]         = useState('')
  const [amount, setAmount]             = useState('')
  const [price, setPrice]               = useState('')
  const [date, setDate]                 = useState(new Date().toISOString().split('T')[0])
  const [buyWith, setBuyWith]           = useState('NONE')
  const [buyWithCustom, setBuyWithCustom] = useState('')
  const [sellFor, setSellFor]           = useState('REMOVE')
  const [sellForCustom, setSellForCustom] = useState('')
  const [amtMode, setAmtMode]           = useState('qty') // 'qty' | 'usd'
  const [usdInput, setUsdInput]         = useState('')
  // The currency the ticket is written in: amounts and prices are typed and
  // shown in it and stored in USD, the app's base, at the live rate.
  const [tradeCur, setTradeCur]         = useState(() => { try { return localStorage.getItem('wl_trade_cur') || 'USD' } catch { return 'USD' } })
  const [fxRates, setFxRates]           = useState(null)
  const [curPicker, setCurPicker]       = useState(null) // null | 'trade' | 'leg'
  const [priceDraft, setPriceDraft]     = useState('')
  const curPicked = useRef(false)
  const [metalUnit, setMetalUnit]       = useState('oz') // 'oz' | 'g'
  const [busy, setBusy]                 = useState(false)
  const [msg, setMsg]                   = useState('')
  const [success, setSuccess]           = useState(false)
  const [signalOpen, setSignalOpen]     = useState(false)
  const [holdingsFilter, setHoldingsFilter] = useState('')
  const [spendPct, setSpendPct]         = useState(null)
  const [sellPct, setSellPct]           = useState(null)
  const [confirmNoneOpen, setConfirmNoneOpen] = useState(false)
  const [mode, setMode]                 = useState(type)
  // v2 ticket: 'asset' (choose what) then 'ticket' (how much, confirm).
  const [v2Step, setV2Step]             = useState('asset')
  const [assetChg, setAssetChg]         = useState(null)
  const [receipt, setReceipt]           = useState(null)
  const fetchedPrice                    = useRef('')
  const location = useLocation()
  const navigate = useNavigate()
  const v2 = isV2Active(location.pathname)
  // Units of the ticket's currency per 1 USD; 1 when it is USD or no rate is known.
  const fx = v2 && tradeCur !== 'USD' && Number(fxRates?.[tradeCur]) > 0 ? Number(fxRates[tradeCur]) : 1
  const curCode = fx === 1 ? 'USD' : tradeCur
  const searchTimer                     = useRef(null)
  const dragStartY                      = useRef(null)

  const isBuy  = mode === 'buy'
  const accent = isBuy ? 'var(--g)' : '#f87171'
  const catInfo = CATEGORIES.find(c => c.key === category) || CATEGORIES[0]

  // Reset form when sheet opens
  useEffect(() => {
    if (!open) return
    setMode(type)
    setCoinSearch(''); setCoinResults([]); setHoldingsFilter(''); setMsg(''); setSuccess(false)
    setAmount(''); setPrice(''); setBuyWith('NONE'); setBuyWithCustom(''); setSpendPct(null); setSellPct(null); setConfirmNoneOpen(false)
    setSellFor('REMOVE'); setSellForCustom(''); setAmtMode(v2 && type === 'buy' ? 'usd' : 'qty'); setUsdInput(''); setMetalUnit('oz')
    setV2Step(prefillCoin ? 'ticket' : 'asset'); setAssetChg(null); setSignalOpen(v2)
    setStockTicker(''); setStockInput(''); setFiatCode('USD'); setOtherName('')
    setDate(new Date().toISOString().split('T')[0])
    if (wallets.length) setWalletId(String(wallets[0].id))
    if (prefillCoin) {
      setSelectedCoin(prefillCoin)
      setCategory('crypto')
    } else if (prefillCategory) {
      setSelectedCoin(null)
      // A foreign listing opens in the market category, a US one in US stocks.
      setCategory(prefillCategory === 'stock' && isIntlTicker(prefillStockTicker) ? 'wstock' : prefillCategory)
      if (prefillCategory === 'stock' && prefillStockTicker) {
        setStockTicker(prefillStockTicker)
        if (isIntlTicker(prefillStockTicker)) { marketPicked.current = true; setMarket(marketOfTicker(prefillStockTicker)) }
      }
    } else {
      setSelectedCoin(null)
      setCategory('crypto')
    }
  }, [open]) // eslint-disable-line

  const [priceFetchFailed, setPriceFetchFailed] = useState(false)
  const [priceFocused, setPriceFocused] = useState(false)
  const [popPrices, setPopPrices] = useState({})
  const [stockPrices, setStockPrices] = useState({})
  const [xstockPrices, setXstockPrices] = useState({})

  // Fetch live prices for the browsable popular-coins list (full-page only).
  useEffect(() => {
    if ((!isPage && !v2) || !open) return
    let alive = true
    api.getPrices(POPULAR_COINS.map(c => c.id).join(',')).then(px => {
      if (alive && px) setPopPrices(px)
    }).catch(() => {})
    return () => { alive = false }
  }, [isPage, v2, open])

  // Fetch live prices for the stock markets list when the Stocks tab is open.
  // Fetch the whole popular list (one batched request server-side) so every
  // sector filter shows prices, not just the first page.
  // Which market is the user's: detected once, opened unless they chose another.
  useEffect(() => {
    if (!open) return
    let alive = true
    detectCountry().then(c => {
      if (!alive || !c) return
      const m = marketForCountry(c)
      setHomeMarket(m)
      if (!marketPicked.current) setMarket(m === 'US' ? 'GB' : m)
    }).catch(() => {})
    return () => { alive = false }
  }, [open])

  // The whole exchange for the market on show (popular names until it arrives).
  useEffect(() => {
    setListLimit(60)
    if (!open || !isStockCat(category)) return
    const code = category === 'stock' ? 'US' : market
    if (!code || fullLists[code]) return
    let alive = true
    getMarketList(code).then(v => { if (alive && v) setFullLists(prev => ({ ...prev, [code]: v })) }).catch(() => {})
    return () => { alive = false }
  }, [open, category, market]) // eslint-disable-line react-hooks/exhaustive-deps

  // Worldwide search: any listed company by name or ticker, after a pause in typing.
  useEffect(() => {
    if (!open || !isStockCat(category)) return
    const q = stockInput.trim()
    if (q.length < 2) { setStockHits([]); setStockSearching(false); return }
    let alive = true
    setStockSearching(true)
    const id = setTimeout(() => {
      searchStocks(q).then(hits => {
        if (!alive) return
        setStockHits(hits)
        const ids = hits.map(h => `${STOCK_PREFIX}${h.symbol.toLowerCase()}`)
        if (ids.length) api.getPrices(ids.join(',')).then(px => { if (alive && px) setStockPrices(prev => ({ ...prev, ...px })) }).catch(() => {})
      }).catch(() => {}).finally(() => { if (alive) setStockSearching(false) })
    }, 450)
    return () => { alive = false; clearTimeout(id) }
  }, [open, category, stockInput])

  useEffect(() => {
    if (!open || !isStockCat(category)) return
    let alive = true
    const list = category === 'stock' ? POPULAR_TICKERS : (MARKET_BY_CODE[market]?.stocks || [])
    const ids = list.map(t => `${STOCK_PREFIX}${t.ticker.toLowerCase()}`)
    // Paint last-known prices instantly from the persisted cache, then refresh.
    const cached = api.getCachedPrices(ids.join(','))
    if (Object.keys(cached).length) setStockPrices(prev => ({ ...cached, ...prev }))
    api.getPrices(ids.join(',')).then(px => {
      if (alive && px) setStockPrices(prev => ({ ...prev, ...px }))
    }).catch(() => {})
    return () => { alive = false }
  }, [open, category, market])

  // Fetch live tokenized-stock prices (from Binance) when the Tokenized tab is open.
  useEffect(() => {
    if (!open || category !== 'tstock') return
    let alive = true
    const ids = POPULAR_XSTOCKS.map(t => `${XSTOCK_PREFIX}${t.ticker.toLowerCase()}`)
    const cached = api.getCachedPrices(ids.join(','))
    if (Object.keys(cached).length) setXstockPrices(prev => ({ ...cached, ...prev }))
    api.getPrices(ids.join(',')).then(px => {
      if (alive && px) setXstockPrices(prev => ({ ...prev, ...px }))
    }).catch(() => {})
    return () => { alive = false }
  }, [open, category])

  // Auto-fill price when coin / non-crypto asset selected
  useEffect(() => {
    const resolvedId = resolveAssetId()
    if (!resolvedId) { setPrice(''); setPriceFetchFailed(false); return }
    setPrice('…'); setPriceFetchFailed(false)
    api.getPrices(resolvedId).then(px => {
      const quote = px?.[resolvedId]
      const p = quote?.usd ?? quote?.price
      // A stale quote is a cached value nothing could refresh, and it must not
      // become the cost basis of a trade. Left to fill the box it looks exactly
      // like a live price, and the number it writes into the portfolio is
      // whatever the coin cost the last time the network could reach it: the
      // reported case offered 0.0112966 for a coin trading at 0.01285.
      //
      // Treated as a failed fetch, which it is. The field clears and says so,
      // and the price becomes something the person types deliberately rather
      // than something the app quietly asserted.
      setAssetChg(quote?.usd_24h_change ?? null)
      if (p && !quote?.stale) { fetchedPrice.current = String(p); setPrice(String(p)); setPriceFetchFailed(false) }
      else { setPrice(''); setPriceFetchFailed(true) }
    }).catch(() => { setPrice(''); setPriceFetchFailed(true) })
  }, [selectedCoin, category, stockTicker, fiatCode]) // eslint-disable-line

  // Debounced crypto coin search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (category !== 'crypto' || !coinSearch || selectedCoin) return
    searchTimer.current = setTimeout(async () => {
      const res = await api.searchCoins(coinSearch).catch(() => [])
      setCoinResults(res.slice(0, 8))
    }, 200)
    return () => clearTimeout(searchTimer.current)
  }, [coinSearch, selectedCoin, category])

  function resolveAssetId() {
    if (category === 'crypto') return selectedCoin?.id || null
    if (category === 'gold')   return GOLD_ID
    if (category === 'silver') return SILVER_ID
    if (isStockCat(category) && stockTicker) return `${STOCK_PREFIX}${stockTicker.toLowerCase()}`
    if (category === 'tstock' && stockTicker) return `${XSTOCK_PREFIX}${stockTicker.toLowerCase()}`
    if (category === 'fiat' && fiatCode)    return `${FIAT_PREFIX}${fiatCode.toLowerCase()}`
    if (category === 'bond' && otherName)   return `bond:${otherName.toLowerCase()}`
    if (category === 'other' && otherName)  return `other:${otherName.toLowerCase()}`
    return null
  }

  function resolveAssetMeta() {
    if (category === 'crypto') return selectedCoin ? { id: selectedCoin.id, symbol: selectedCoin.symbol?.toUpperCase(), name: selectedCoin.name, image: selectedCoin.thumb || selectedCoin.image || '', category: 'crypto' } : null
    return presetForCategory(category, stockTicker, fiatCode, otherName)
  }

  const asset = resolveAssetMeta()
  const holdingForCoin = holdings?.find(h => h.coin_id === asset?.id)
  const total = amount && price ? parseFloat(amount) * parseFloat(price) : 0

  // When selling crypto and the user holds exactly one coin, auto-select it so
  // the "Available to sell" balance + % quick-fill appears immediately
  // (no extra tap needed to reach the percentage buttons).
  useEffect(() => {
    if (isBuy || selectedCoin || prefillCoin || category !== 'crypto') return
    const sellable = (holdings || []).filter(h =>
      (h.amount ?? 0) > 0 &&
      !h.coin_id?.startsWith('fiat:') && !h.coin_id?.startsWith('stock:') &&
      h.coin_id !== 'gold' && h.coin_id !== 'silver' &&
      !h.coin_id?.startsWith('bond:') && !h.coin_id?.startsWith('other:')
    )
    if (sellable.length === 1) {
      const h = sellable[0]
      setSelectedCoin({ id: h.coin_id, symbol: h.coin_symbol, name: h.coin_name, image: h.coin_image || h.image || '' })
    }
  }, [isBuy, category, selectedCoin, prefillCoin, holdings])

  // Format price with thousands commas for display when field is not focused
  function fmtPriceDisplay(val) {
    if (!val || val === '…') return val
    const clean = String(val).replace(/,/g, '')
    const parts = clean.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.join('.')
  }

  // Map buyWith key → coin_id in holdings, for balance lookup
  const BUY_WITH_COIN_IDS = {
    USD:  `${FIAT_PREFIX}usd`,
    USDT: 'tether',
    USDC: 'usd-coin',
    BTC:  'bitcoin',
    EUR:  `${FIAT_PREFIX}eur`,
  }
  const buyWithHolding = (isBuy && buyWith && buyWith !== 'NONE' && buyWith !== 'CUSTOM')
    ? holdings?.find(h => h.coin_id === (BUY_WITH_COIN_IDS[buyWith] || (isFiatCode(buyWith, fxRates) ? `${FIAT_PREFIX}${buyWith.toLowerCase()}` : '')))
    : null
  const buyWithBalanceUsd = buyWithHolding?.value ?? 0
  const buyWithBalanceAmt = buyWithHolding?.amount ?? 0

  // Live "% of balance" this trade represents — keeps the percentage in sync
  // with whatever the user typed (USD value, quantity, or a % button). This is
  // what makes the percentage reflect the entered USD value in real time.
  const pctBalanceUsd = isBuy ? buyWithBalanceUsd : (holdingForCoin?.value ?? 0)
  const livePct = (pctBalanceUsd > 0 && total > 0) ? (total / pctBalanceUsd) * 100 : null
  const livePctLabel = livePct == null ? null
    : livePct >= 99.5 ? '100' : parseFloat(livePct.toFixed(livePct < 10 ? 1 : 0)).toString()
  // A discrete % button is "active" when the live percentage lands on it,
  // regardless of whether the user clicked it or typed an equivalent amount.
  const pctIsActive = (stored, pct) => stored === pct || (livePct != null && Math.abs(livePct - pct) < 0.5)

  // Recalculate amount when price arrives after a % pct is selected
  useEffect(() => {
    if (!spendPct || !buyWithBalanceUsd || !price || price === '…') return
    const px = parseFloat(price)
    if (px > 0) setAmount(String(parseFloat((buyWithBalanceUsd * spendPct / 100 / px).toFixed(8))))
  }, [price]) // eslint-disable-line

  // When in USD mode, re-derive quantity whenever price updates
  useEffect(() => {
    if (amtMode !== 'usd' || !usdInput || !price || price === '…') return
    const px = parseFloat(price)
    if (px > 0) setAmount(String(parseFloat((parseFloat(usdInput) / fx / px).toFixed(8))))
  }, [price, amtMode, usdInput]) // eslint-disable-line react-hooks/exhaustive-deps

  // The rates, once per opening. Units of each currency per 1 USD.
  useEffect(() => {
    if (!open || !v2) return
    let live = true
    api.getFiatRates?.().then(r => { if (live && r) setFxRates(r) }).catch(() => {})
    return () => { live = false }
  }, [open, v2])

  // A local market's stock opens in its own currency (COMI.CA in EGP), until
  // the person picks one themselves.
  useEffect(() => {
    if (curPicked.current || !asset?.id) return
    const home = asset.category === 'stock' && isIntlTicker(asset.id) ? MARKET_BY_CODE[marketOfTicker(asset.id)]?.currency : null
    let saved = 'USD'
    try { saved = localStorage.getItem('wl_trade_cur') || 'USD' } catch {}
    setTradeCur(home || saved)
  }, [asset?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // A new currency rewrites the amount being typed in it, for the same quantity.
  useEffect(() => {
    if (amtMode !== 'usd') return
    const qty = parseFloat(amount), px = parseFloat(price)
    if (qty > 0 && px > 0) setUsdInput(String(parseFloat((qty * px * fx).toFixed(2))))
  }, [fx]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickTradeCur(code) {
    curPicked.current = true
    setTradeCur(code)
    try { localStorage.setItem('wl_trade_cur', code) } catch {}
    track('trade_currency_select', { currency: code })
  }

  function handleUsdInput(val) {
    setUsdInput(val)
    setSpendPct(null)
    const px = parseFloat(price)
    if (px > 0 && val) {
      const qty = parseFloat(val) / fx / px
      if (isFinite(qty) && qty > 0) setAmount(String(parseFloat(qty.toFixed(8))))
      else setAmount('')
    } else { setAmount('') }
  }

  function switchAmtMode(mode) {
    setAmtMode(mode)
    if (mode === 'usd') {
      const qty = parseFloat(amount), px = parseFloat(price)
      setUsdInput(qty > 0 && px > 0 ? String(parseFloat((qty * px * fx).toFixed(2))) : '')
    } else {
      setUsdInput('')
    }
  }

  function switchMetalUnit(u) {
    if (u === metalUnit) return
    const TROY_OZ = 31.1034768
    const px = parseFloat(price)
    if (u === 'g') {
      setAmount(v => v ? String(parseFloat((parseFloat(v) * TROY_OZ).toFixed(4))) : v)
      if (px > 0) setPrice(String(parseFloat((px / TROY_OZ).toFixed(4))))
    } else {
      setAmount(v => v ? String(parseFloat((parseFloat(v) / TROY_OZ).toFixed(6))) : v)
      if (px > 0) setPrice(String(parseFloat((px * TROY_OZ).toFixed(2))))
    }
    setMetalUnit(u)
  }

  function pickCategory(key) {
    track('trade_category_select', { category: key, trade_type: mode })
    setCategory(key); setSelectedCoin(null); setCoinSearch(''); setStockTicker(''); setStockInput(''); setFiatCode('USD'); setOtherName('')
  }

  // Swipe-to-close disabled — use the × button only

  async function submit(force = false) {
    if (!asset || !amount || !price || price === '…') { setMsg(t('errFillAll')); return }
    if (isBuy && !buyWith) { setMsg(t('errChooseBuyWith')); return }
    if (!isBuy && !sellFor) { setMsg(t('errChooseSellFor')); return }
    if (isBuy && buyWith === 'CUSTOM' && !buyWithCustom.trim()) { setMsg(t('errEnterBuyAsset')); return }
    if (!isBuy && sellFor === 'CUSTOM' && !sellForCustom.trim()) { setMsg(t('errEnterSellAsset')); return }
    // Numeric validation — block NaN/negative/zero before anything is recorded.
    const amtCheck = parseFloat(amount), pxCheck = parseFloat(price)
    if (!isFinite(amtCheck) || amtCheck <= 0) { setMsg(t('errValidAmount')); return }
    if (!isFinite(pxCheck) || pxCheck < 0) { setMsg(t('errValidPrice')); return }
    // A sell can never exceed the held balance (would create a negative position).
    if (!isBuy && holdingForCoin && isFinite(holdingForCoin.amount) && amtCheck > holdingForCoin.amount + 1e-9) {
      setMsg(`You only hold ${parseFloat(Number(holdingForCoin.amount).toFixed(8))} ${holdingForCoin.coin_symbol?.toUpperCase() || ''}.`); return
    }
    // Buying with "None" / selling for "Remove" records no counter-asset — make
    // sure that's intentional rather than the user skipping past the selector.
    if (!force && ((isBuy && buyWith === 'NONE') || (!isBuy && sellFor === 'REMOVE'))) {
      setConfirmNoneOpen(true); return
    }
    setBusy(true); setMsg('')
    const heldBefore = Number(holdingForCoin?.amount) || 0
    // Whether this is the very first holding — drives the "profile_created" event
    // so we learn the user STARTED their portfolio with a manual trade.
    const isFirstHolding = !Array.isArray(holdings) || holdings.length === 0
    try {
      // Auto-create a default wallet if the user is trading before making one,
      // so they never have to set up a wallet first.
      let wid = walletId || wallets[0]?.id
      if (!wid) {
        const w = await api.createWallet({ name: 'My Wallet' })
        wid = w.id
      }
      const TROY_OZ = 31.1034768
      const isMetal = category === 'gold' || category === 'silver'
      const rawAmt = parseFloat(amount)
      const rawPpu = parseFloat(price)
      // Convert grams to troy oz for storage (price stored per oz)
      const amt = isMetal && metalUnit === 'g' ? rawAmt / TROY_OZ : rawAmt
      const ppu = isMetal && metalUnit === 'g' ? rawPpu * TROY_OZ : rawPpu

      await api.addTransaction({
        // `mode`, not the `type` prop: the Buy/Sell switch inside the sheet
        // changes the side, and recording the side it opened on turned a
        // switched-to sell into a buy (plus a buy of the "sell for" asset).
        wallet_id: wid, type: mode,
        coin_id: asset.id,
        coin_symbol: asset.symbol,
        coin_name: asset.name,
        coin_image: asset.image || '',
        amount: amt, price_per_unit: ppu,
        date, category: asset.category || category,
      })

      // Buy-with spend leg
      if (isBuy && buyWith !== 'NONE') {
        const src = buyWith === 'CUSTOM' ? buyWithCustom.trim().toUpperCase() : buyWith
        if (src) {
          const leg = await buildSpendLeg(src, amt * ppu)
          if (leg) await api.addTransaction({
            wallet_id: wid, type: 'sell',
            category: leg.category, coin_id: leg.coin_id,
            coin_symbol: leg.symbol, coin_name: leg.name, coin_image: '',
            amount: leg.amount, price_per_unit: leg.pricePerUnit, date,
            notes: `Spent on buying ${asset.symbol}`,
          })
        }
      }

      // Sell-for receive leg
      if (!isBuy && sellFor !== 'REMOVE') {
        const tgt = sellFor === 'CUSTOM' ? sellForCustom.trim().toUpperCase() : sellFor
        if (tgt) {
          const leg = await buildReceiveLeg(tgt, amt * ppu)
          if (leg) await api.addTransaction({
            wallet_id: wid, type: 'buy',
            category: leg.category, coin_id: leg.coin_id,
            coin_symbol: leg.symbol, coin_name: leg.name, coin_image: '',
            amount: leg.amount, price_per_unit: leg.pricePerUnit, date,
            notes: `Proceeds from selling ${asset.symbol}`,
          })
        }
      }

      const legKey = isBuy ? (buyWith === 'CUSTOM' ? buyWithCustom.trim().toUpperCase() : buyWith)
                           : (sellFor === 'CUSTOM' ? sellForCustom.trim().toUpperCase() : sellFor)
      setReceipt({
        id: asset.id, symbol: asset.symbol, amount: amt, price: ppu, total: amt * ppu,
        leg: legKey === 'NONE' || legKey === 'REMOVE' ? '' : legKey,
        newBalance: isBuy ? heldBefore + amt : Math.max(0, heldBefore - amt),
        date, wallet: (wallets.find(w => String(w.id) === String(wid)) || {}).name || '',
      })
      setSuccess(true)
      // Force dashboard to refresh holdings immediately
      window.dispatchEvent(new Event('wl:portfolio-updated'))

      const assetCat = asset.category || category || 'crypto'

      // WHICH CATEGORY WAS TRADED, AND NOTHING ELSE.
      //
      // This call used to carry asset_symbol, asset_name, value_usd,
      // value_tier, amount, price_usd, wallet_id, paid_with, received_as,
      // pct_of_position, position_pct_tier, full_exit, realized_pnl_pct and
      // pnl_outcome — the ticker, the dollar size and the profit or loss of
      // every trade, to Google Analytics, from an app whose pitch is that
      // none of that leaves the device. The contract at the top of
      // analytics.js forbids every one of them by name.
      //
      // The comment below this used to say the leak was removed. It had been,
      // from trade_submitted only, while this event kept sending all of it.
      // analyticsPrivacy.test.js could not see either call because its scanner
      // required a quoted event name and both are named by a ternary.
      // For a stock, which market: US, or the local market's code (EG, SA…).
      const stockMarket = assetCat === 'stock' ? marketOfTicker(asset.id) : undefined
      track(mode === 'buy' ? 'buy_transaction' : 'sell_transaction', {
        asset_category: assetCat,
        source: 'trade_sheet',
        ...(stockMarket ? { stock_market: stockMarket } : {}),
      })

      // Kept for backwards compatibility with the existing GA reports.
      track('trade_submitted', { trade_type: mode, asset_category: assetCat, source: 'trade_sheet' })

      // First manual trade = the user started their profile this way.
      if (isFirstHolding) {
        trackProfileCreated({ method: 'manual_trade', source: 'trade_sheet' })
        // The moment the app stops being empty. Matters most for the
        // single-asset users the old holdings floor excluded entirely.
        noteMoment('first_holding')
      } else {
        // Every buy or sell is a thing the app just did for them.
        noteMoment('trade_saved')
      }
      // v2 shows a receipt the user dismisses; classic closes itself.
      if (!v2) setTimeout(() => { onClose(); onDone() }, 1200)
    } catch { setMsg('Failed. Try again.') }
    finally { setBusy(false) }
  }

  // The asset picker, shared by the classic sheet and the v2 ticket.
  const assetPicker = (
    <>

      {/* Crypto: search (buy) or holdings list (sell) */}
      {category === 'crypto' && (
        selectedCoin ? (
          <div className="bs-coin-selected">
            <CoinLogo image={selectedCoin.thumb || selectedCoin.image} symbol={selectedCoin.symbol} coinId={selectedCoin.id} size={28} className="bs-coin-thumb" />
            <div className="bs-coin-info">
              <strong>{selectedCoin.name}</strong>
              <span className="muted">{selectedCoin.symbol?.toUpperCase()}</span>
            </div>
            {!prefillCoin && (
              <button className="bs-coin-clear" onClick={() => { setSelectedCoin(null); setCoinSearch(''); setHoldingsFilter('') }}>
                {IcoClose}
              </button>
            )}
          </div>
        ) : isBuy ? (
          <>
          <div className="bs-search-wrap">
            <span className="bs-search-icon">{IcoSearch}</span>
            <input className="bs-input bs-search-input" placeholder={t('txSearchCoin')}
              value={coinSearch} onChange={e => setCoinSearch(e.target.value)} />
            {coinResults.length > 0 && (
              <div className="bs-dropdown">
                {coinResults.map(c => (
                  <button key={c.id} className="bs-dropdown-item"
                    onClick={() => { setSelectedCoin(c); setCoinSearch(c.name); setCoinResults([]) }}>
                    <CoinLogo image={c.thumb || c.image} symbol={c.symbol} size={22} className="bs-dropdown-logo" />
                    <span>{c.name}</span>
                    <span className="muted bs-sym">{c.symbol?.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Browsable "markets" list (full-page only) — tap to pick, like an exchange */}
          {(isPage || v2) && !coinSearch.trim() && coinResults.length === 0 && (
            <div className="bs-markets">
              <div className="bs-markets-head">
                <span>{t('txPopular')}</span><span>{t('tsPrice24h')}</span>
              </div>
              <div className="bs-markets-list">
                {POPULAR_COINS.map(c => {
                  const p = popPrices[c.id]?.usd ?? popPrices[c.id]?.price
                  const ch = popPrices[c.id]?.usd_24h_change
                  const up = Number(ch) >= 0
                  return (
                    <button key={c.id} type="button" className="bs-market-row"
                      onClick={() => { track('trade_market_pick'); setSelectedCoin({ id: c.id, symbol: c.symbol, name: c.name }); setCoinSearch(c.name); setCoinResults([]) }}>
                      <CoinLogo symbol={c.symbol} coinId={c.id} size={30} className="bs-coin-thumb" />
                      <div className="bs-coin-info">
                        <strong>{c.symbol}</strong>
                        <span className="muted">{c.name}</span>
                      </div>
                      <div className="bs-market-px">
                        <span className="bs-market-price">{p != null ? `$${Number(p).toLocaleString(undefined, { maximumFractionDigits: p < 1 ? 6 : 2 })}` : '—'}</span>
                        {ch != null && <span className="bs-market-chg" style={{ color: up ? 'var(--g-ink)' : '#f87171' }}>{up ? '+' : ''}{Number(ch).toFixed(2)}%</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          </>
        ) : (() => {
          const cryptoHoldings = (holdings || []).filter(h =>
            !h.coin_id?.startsWith('fiat:') &&
            !h.coin_id?.startsWith('stock:') &&
            h.coin_id !== 'gold' && h.coin_id !== 'silver' &&
            !h.coin_id?.startsWith('bond:') &&
            !h.coin_id?.startsWith('other:') &&
            (h.amount ?? 0) > 0
          )
          const q = holdingsFilter.trim().toLowerCase()
          const filtered = q
            ? cryptoHoldings.filter(h =>
                h.coin_name?.toLowerCase().includes(q) ||
                h.coin_symbol?.toLowerCase().includes(q)
              )
            : cryptoHoldings
          if (!cryptoHoldings.length) return (
            <p className="bs-hint" style={{ margin: '0.4rem 0' }}>{t('tsNoCryptoYet')}</p>
          )
          return (
            <div className="bs-holdings-sel">
              {cryptoHoldings.length > 5 && (
                <div className="bs-search-wrap" style={{ marginBottom: '0.4rem' }}>
                  <span className="bs-search-icon">{IcoSearch}</span>
                  <input className="bs-input bs-search-input" placeholder={t('tsFilterHoldings')}
                    value={holdingsFilter} onChange={e => setHoldingsFilter(e.target.value)} />
                </div>
              )}
              <div className="bs-holdings-list">
                {filtered.map(h => (
                  <button key={h.coin_id} className="bs-holding-row"
                    onClick={() => setSelectedCoin({ id: h.coin_id, symbol: h.coin_symbol, name: h.coin_name, image: h.coin_image || h.image || '' })}>
                    <CoinLogo image={h.coin_image || h.image} symbol={h.coin_symbol} coinId={h.coin_id} size={28} className="bs-coin-thumb" />
                    <div className="bs-coin-info">
                      <strong>{h.coin_name}</strong>
                      <span className="muted">{h.coin_symbol?.toUpperCase()}</span>
                    </div>
                    <div className="bs-holding-bal">
                      <span className="bs-holding-amt">{parseFloat(h.amount?.toFixed(6))}</span>
                      {h.value > 0 && <span className="muted" style={{ fontSize: '0.72rem' }}>${h.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && <p className="bs-hint" style={{ margin: '0.3rem 0' }}>{t('tsNoMatch')}</p>}
              </div>
            </div>
          )
        })()
      )}

      {/* Gold / Silver: preset, no search needed */}
      {(category === 'gold' || category === 'silver') && (
        <div className="bs-coin-selected">
          <span style={{ fontSize: '1.6rem' }}>{category === 'gold' ? IcoGoldBar : IcoSilverBar}</span>
          <div className="bs-coin-info">
            <strong>{category === 'gold' ? 'Gold (1 troy oz)' : 'Silver (1 troy oz)'}</strong>
            <span className="muted">{category === 'gold' ? 'XAU' : 'XAG'} · live spot price</span>
          </div>
        </div>
      )}

      {/* Stock: market + sector filter, the market's list, and worldwide search */}
      {isStockCat(category) && (() => {
        const isUS = category === 'stock'
        // The whole exchange once it has loaded; the curated list until then,
        // and for a US sector filter (the screener rows carry no sector).
        const full = isUS ? (stockSector === 'All' ? fullLists.US : null) : fullLists[market]
        const base = full ? full.stocks.map(x => ({ ticker: x.t, name: x.n, q: x }))
          : isUS ? POPULAR_TICKERS
          : (MARKET_BY_CODE[market]?.stocks || [])
        const shownMarket = isUS ? 'US' : market
        const sectors = isUS ? ['All', ...Array.from(new Set(POPULAR_TICKERS.map(t => t.sector)))] : []
        const query = stockInput.trim().toUpperCase()
        const filtered = base.filter(t =>
          (!isUS || full || stockSector === 'All' || t.sector === stockSector) &&
          (!query || t.ticker.includes(query) || t.name.toUpperCase().includes(query))
        )
        // Worldwide results the market list does not already show.
        const hits = query.length >= 2 ? stockHits.filter(h => !filtered.some(f => f.ticker === h.symbol)) : []
        // Other markets: the user's own first. US shares have their own category.
        const order = [...new Set([localMarket?.code || 'GB', ...MARKETS.map(m => m.code)].filter(c => c && c !== 'US'))]
        const pickTicker = (ticker, name) => { if (name) PICKED_NAMES[ticker] = name; setStockTicker(ticker); setStockInput(ticker) }
        const row = (ticker, name, sub, q) => {
          const sid = `${STOCK_PREFIX}${ticker.toLowerCase()}`
          // A row from the full list carries its own quote; others use the fetched prices.
          const rec = q ? { usd: q.u, usd_24h_change: q.c, local: { price: q.p, currency: q.cur } } : stockPrices[sid]
          const p = rec?.usd ?? rec?.price
          const ch = rec?.usd_24h_change
          const up = Number(ch) >= 0
          const on = stockTicker === ticker
          const loc = rec?.local?.price > 0 && rec.local.currency && rec.local.currency !== 'USD' ? rec.local : null
          return (
            <button key={ticker} type="button" className={`bs-market-row ${on ? 'active' : ''}`}
              title={name} onClick={() => pickTicker(ticker, name)}>
              <CoinLogo symbol={ticker} coinId={sid} size={30} className="bs-coin-thumb" />
              <div className="bs-coin-info">
                <strong>{ticker}</strong>
                <span className="muted">{sub ? `${name} · ${sub}` : name}</span>
              </div>
              <div className="bs-market-px">
                {/* A foreign listing shows its own price first, then the dollar figure. */}
                {loc ? <>
                  <span className="bs-market-price">{localMoney(loc.price, loc.currency)}</span>
                  <span className="bs-market-usd">{p != null ? `$${Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: p < 1 ? 4 : 2 })}` : ''}
                    {ch != null && isFinite(ch) && <b style={{ color: up ? 'var(--g-ink)' : '#f87171' }}> {up ? '+' : ''}{Number(ch).toFixed(2)}%</b>}</span>
                </> : <>
                  <span className="bs-market-price">{p != null ? `$${Number(p).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</span>
                  {ch != null && isFinite(ch) && <span className="bs-market-chg" style={{ color: up ? 'var(--g-ink)' : '#f87171' }}>{up ? '+' : ''}{Number(ch).toFixed(2)}%</span>}
                </>}
              </div>
            </button>
          )
        }
        const selName = POPULAR_TICKERS.find(x => x.ticker === stockTicker)?.name || intlStockName(stockTicker) || PICKED_NAMES[stockTicker]
        const selLocal = stockPrices[`${STOCK_PREFIX}${String(stockTicker).toLowerCase()}`]?.local
        const selCur = selLocal?.currency || (isIntlTicker(stockTicker) ? MARKET_BY_CODE[marketOfTicker(stockTicker)]?.currency : '')
        return (
          <div className="bs-stock-wrap">
            {/* Markets: the user's own first */}
            {!isUS && <div className="bs-market-title">{t('stkSelectMarket')}</div>}
            {!isUS && <div className="bs-market-chips" role="tablist" aria-label={t('stkSelectMarket')}>
              {order.map(code => {
                const m = MARKET_BY_CODE[code]
                if (!m) return null
                return (
                  <button key={code} type="button" role="tab" aria-selected={market === code} title={m.exchange}
                    className={`bs-market-chip ${market === code ? 'active' : ''}`}
                    onClick={() => { marketPicked.current = true; setMarket(code); setStockSector('All') }}>
                    <FlagImg cc={m.flag} size={18} />
                    <span>{regionName(code)}</span>
                    {code === homeMarket && <i className="bs-market-home" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>}
            {/* Sector filter pills (US only, where the list is long) */}
            {sectors.length > 0 && (
              <div className="bs-sector-row">
                {sectors.map(sct => (
                  <button key={sct} className={`bs-sector-btn ${stockSector === sct ? 'active' : ''}`}
                    onClick={() => setStockSector(sct)}>{sct}</button>
                ))}
              </div>
            )}
            {/* Search: this market's list, and any company worldwide */}
            <div className="bs-search-wrap" style={{marginBottom:'0.4rem'}}>
              <span className="bs-search-icon">{IcoSearch}</span>
              <input className="bs-input bs-search-input"
                placeholder={t('stkSearchAll')}
                value={stockInput}
                onChange={e => { setStockInput(e.target.value); const v = e.target.value.trim().toUpperCase(); if (!base.find(x => x.ticker === v)) setStockTicker(v); }}
              />
            </div>
            <div className="bs-markets">
              <div className="bs-markets-head">
                <span>{isUS && stockSector !== 'All' ? stockSector
                  : full ? t('stkAllIn')(regionName(shownMarket), MARKET_BY_CODE[shownMarket]?.exchange || '', full.total)
                  : t('stkPopularIn')(regionName(shownMarket), MARKET_BY_CODE[shownMarket]?.exchange || '')}</span>
                <span>{t('tsPrice24h')}</span>
              </div>
              <div className="bs-markets-list">
                {filtered.slice(0, full || !isUS ? listLimit : 40).map(x => row(x.ticker, x.name, null, x.q))}
                {(full || !isUS) && filtered.length > listLimit && (
                  <button type="button" className="bs-market-showmore" onClick={() => setListLimit(n => n + 60)}>
                    {t('stkShowMore')(filtered.length - listLimit)}
                  </button>
                )}
                {(hits.length > 0 || stockSearching) && (
                  <div className="bs-markets-head bs-markets-sub"><span>{stockSearching && hits.length === 0 ? t('stkSearching') : t('stkResults')}</span></div>
                )}
                {hits.map(h => row(h.symbol, h.name, h.exchange))}
                {filtered.length === 0 && hits.length === 0 && !stockSearching && <p className="bs-hint" style={{ margin: '0.3rem 0' }}>{t('tsNoMatch')}</p>}
                {!query && !full && <p className="bs-hint bs-market-more">{t('stkSearchMore')}</p>}
              </div>
            </div>
            {stockTicker && (
              <div className="bs-stock-selected">
                <span style={{color: catInfo.color, fontWeight:700}}>{stockTicker}</span>
                {selName && <span className="muted"> · {selName}</span>}
                <span className="bs-hint" style={{marginInlineStart:'auto', color:catInfo.color}}>
                  {selCur && selCur !== 'USD' ? t('stkConverted')(selCur) : t('tsLiveYahoo')}
                </span>
              </div>
            )}
          </div>
        )
      })()}

      {/* Tokenized stocks (xStocks) — browsable list, live prices from Binance */}
      {category === 'tstock' && (() => {
        const query = stockInput.toUpperCase()
        const filtered = POPULAR_XSTOCKS.filter(t =>
          !query || t.ticker.includes(query) || t.name.toUpperCase().includes(query)
        )
        const selectedInfo = POPULAR_XSTOCKS.find(t => t.ticker === stockTicker)
        return (
          <div className="bs-stock-wrap">
            <div className="bs-search-wrap" style={{marginBottom:'0.4rem'}}>
              <span className="bs-search-icon">{IcoSearch}</span>
              <input className="bs-input bs-search-input"
                placeholder={t('txSearchStock')}
                value={stockInput}
                onChange={e => { setStockInput(e.target.value); const v = e.target.value.trim().toUpperCase(); if (!POPULAR_XSTOCKS.find(t=>t.ticker===v)) setStockTicker(v); }}
              />
            </div>
            <div className="bs-markets">
              <div className="bs-markets-head"><span>Popular · Tokenized xStocks</span><span>{t('tsPrice24h')}</span></div>
              <div className="bs-markets-list">
                {filtered.map(t => {
                  const sid = `${XSTOCK_PREFIX}${t.ticker.toLowerCase()}`
                  const rec = xstockPrices[sid]
                  const p = rec?.usd ?? rec?.price
                  const ch = rec?.usd_24h_change
                  const up = Number(ch) >= 0
                  const on = stockTicker === t.ticker
                  return (
                    <button key={t.ticker} type="button" className={`bs-market-row ${on ? 'active' : ''}`}
                      title={t.name}
                      onClick={() => { setStockTicker(t.ticker); setStockInput(t.ticker) }}>
                      <CoinLogo symbol={t.ticker} coinId={`${STOCK_PREFIX}${t.ticker.toLowerCase()}`} size={30} className="bs-coin-thumb" />
                      <div className="bs-coin-info">
                        <strong>{t.ticker}<span className="dvx-cat-badge" style={{ background:'#f0b90b22', color:'#f0b90b', borderColor:'#f0b90b44', marginLeft:'0.4rem' }}>xStock</span></strong>
                        <span className="muted">{t.name}</span>
                      </div>
                      <div className="bs-market-px">
                        <span className="bs-market-price">{p != null ? `$${Number(p).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</span>
                        {ch != null && isFinite(ch) && <span className="bs-market-chg" style={{ color: up ? 'var(--g-ink)' : '#f87171' }}>{up ? '+' : ''}{Number(ch).toFixed(2)}%</span>}
                      </div>
                    </button>
                  )
                })}
                {filtered.length === 0 && <p className="bs-hint" style={{ margin: '0.3rem 0' }}>{t('tsNoMatch')}</p>}
              </div>
            </div>
            {stockTicker && (
              <div className="bs-stock-selected">
                <span style={{color: catInfo.color, fontWeight:700}}>{stockTicker}X</span>
                {selectedInfo && <span className="muted"> — {selectedInfo.name}</span>}
                <span className="bs-hint" style={{marginLeft:'auto', color:catInfo.color}}>{t('tsLiveCoinGecko')}</span>
              </div>
            )}
          </div>
        )
      })()}

      {/* Fiat: popular list + custom */}
      {category === 'fiat' && (
        <div className="bs-stock-wrap">
          <div className="bs-popular-chips">
            {POPULAR_FIAT.map(f => (
              <button key={f.code}
                className={`bs-chip ${fiatCode === f.code ? 'active' : ''}`}
                onClick={() => { setFiatCode(f.code) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <CoinLogo coinId={`${FIAT_PREFIX}${f.code.toLowerCase()}`} symbol={f.code} size={18} className="bs-chip-flag" /> {f.code}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bond / Other: name input */}
      {(category === 'bond' || category === 'other') && (
        <input className="bs-input"
          placeholder={category === 'bond' ? 'e.g. US Treasury 10Y, I-Bond' : 'e.g. Real estate, Art, Watch'}
          value={otherName}
          onChange={e => setOtherName(e.target.value)}
        />
      )}
    </>
  )

  // "None / Remove" confirmation, shared by both layouts.
  const confirmNoneOverlay = confirmNoneOpen && (
    <div className="bs-confirm-overlay" onClick={() => setConfirmNoneOpen(false)}>
      <div className="bs-confirm-card" onClick={e => e.stopPropagation()}>
        <div className="bs-confirm-icon" style={{ color: accent }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>
          </svg>
        </div>
        {isBuy ? (
          <>
            <h4 className="bs-confirm-title">{t('txBuyNothing')}</h4>
            <p className="bs-confirm-text">{t('txChoseNone')(asset?.symbol)}</p>
          </>
        ) : (
          <>
            <h4 className="bs-confirm-title">{t('txSellNothing')}</h4>
            <p className="bs-confirm-text">{t('txChoseRemove')(asset?.symbol)}</p>
          </>
        )}
        <div className="bs-confirm-actions">
          <button className="bs-confirm-switch" onClick={() => setConfirmNoneOpen(false)}>
            {isBuy ? t('tcChoosePaid') : t('tcChooseReceived')}
          </button>
          <button className="bs-confirm-go" style={{ background: accent }}
            onClick={() => { setConfirmNoneOpen(false); submit(true) }}>
            {isBuy ? t('tcJustAddIt') : t('tcJustRemoveIt')}
          </button>
        </div>
      </div>
    </div>
  )
  // ── v2 ticket (/v2test preview) ───────────────────────────────────────
  // The same state and submit() as the classic sheet, laid out as a short
  // flow: choose the asset, then one ticket with a large amount, how it is
  // paid for (or received), the details, and a slide to confirm.
  useEffect(() => {
    if (v2 && open && selectedCoin && v2Step === 'asset') setV2Step('ticket')
  }, [v2, open, selectedCoin]) // eslint-disable-line react-hooks/exhaustive-deps

  if (v2) {
    const sym = asset?.symbol?.toUpperCase() || ''
    const isMetal = category === 'gold' || category === 'silver'
    // Every amount on the ticket, in the currency it is written in.
    const fmtUsd = (n) => fmtMoney(Number(n || 0) * fx, curCode)
    const fmtQty = (n) => Number(parseFloat(Number(n || 0).toFixed(8))).toLocaleString(undefined, { maximumFractionDigits: 8 })
    const legMissing = isBuy ? (!buyWith || (buyWith === 'CUSTOM' && !buyWithCustom.trim()))
                             : (!sellFor || (sellFor === 'CUSTOM' && !sellForCustom.trim()))
    const ready = !!asset && parseFloat(amount) > 0 && !!price && price !== '…' && !legMissing
    const step = v2Step === 'asset' ? 1 : ready ? 3 : 2
    const avgCost = holdingForCoin?.total_invested && holdingForCoin?.amount ? holdingForCoin.total_invested / holdingForCoin.amount : null
    const pnl = !isBuy && avgCost && parseFloat(amount) > 0 && parseFloat(price) > 0 ? (parseFloat(price) - avgCost) * parseFloat(amount) : null
    const heldAmt = Number(holdingForCoin?.amount) || 0
    const sellShare = heldAmt > 0 && parseFloat(amount) > 0 ? Math.min(100, (parseFloat(amount) / heldAmt) * 100) : 0
    const pctBase = isBuy ? buyWithBalanceUsd : heldAmt
    const closeAll = () => { if (success) { onClose(); onDone() } else onClose() }
    const leave = (fn) => { onClose(); onDone(); fn() }

    const applyPct = (pct) => {
      const px = parseFloat(price)
      if (isBuy) {
        setSpendPct(pct)
        const spend = buyWithBalanceUsd * pct / 100
        if (px > 0) setAmount(String(parseFloat((spend / px).toFixed(8))))
        if (amtMode === 'usd') setUsdInput(String(parseFloat((spend * fx).toFixed(2))))
      } else {
        setSellPct(pct)
        const q = heldAmt * pct / 100
        setAmount(String(parseFloat(q.toFixed(8))))
        if (amtMode === 'usd' && px > 0) setUsdInput(String(parseFloat((q * px * fx).toFixed(2))))
      }
    }
    const onBig = (e) => {
      const v = e.target.value.replace(/[^0-9.]/g, '')
      if (amtMode === 'usd') handleUsdInput(v)
      else { setAmount(v); setSpendPct(null); setSellPct(null) }
    }
    const switchSide = (to) => {
      if (to === mode) return
      track('trade_mode_switch', { to, v2: true })
      setMode(to); setAmount(''); setUsdInput(''); setSpendPct(null); setSellPct(null); setMsg('')
      if (to === 'buy') { setBuyWith('NONE'); setAmtMode('usd') } else { setSellFor('REMOVE'); setAmtMode('qty') }
    }
    const legValue = isBuy ? buyWith : sellFor
    // The fixed chips, plus the ticket's currency and any currency picked from
    // the full list, each with its flag, before "Other".
    const baseLegs = isBuy ? BUY_WITH_OPTIONS : SELL_FOR_OPTIONS
    const extraCur = [...new Set([curCode, legValue])].filter(c => c && !baseLegs.some(o => o.key === c) && isFiatCode(c, fxRates))
    const legOptions = [
      ...baseLegs.filter(o => o.key !== 'CUSTOM' && o.key !== 'REMOVE'),
      ...extraCur.map(c => ({ key: c, label: c, fiat: true, color: '#0ea5e9' })),
      { key: 'MORE', label: t('tkMoreCurrencies'), icon: 'globe', color: '#0ea5e9' },
      ...baseLegs.filter(o => o.key === 'CUSTOM' || o.key === 'REMOVE'),
    ]
    const setLeg = (k) => {
      if (k === 'MORE') { setCurPicker('leg'); return }
      if (isBuy) { setBuyWith(k); setSpendPct(null) } else setSellFor(k)
    }
    // The price as typed and shown in the ticket's currency; stored in USD.
    const priceShown = price && price !== '…' && fx !== 1 ? String(parseFloat((parseFloat(price) * fx).toPrecision(6))) : price
    const legCustom = isBuy ? buyWithCustom : sellForCustom
    const setLegCustom = isBuy ? setBuyWithCustom : setSellForCustom
    const legLabel = legValue === 'CUSTOM' ? legCustom.trim().toUpperCase() : legValue
    const legNote = isBuy
      ? (buyWith === 'NONE' ? t('tkOnlyAdds') : buyWith === 'CUSTOM' || buyWithHolding ? '' : t('tkNoBalance'))
      : (sellFor === 'REMOVE' ? t('tkOnlyRemoves') : '')
    const slideLabel = busy ? t('obSettingUp')
      : !asset ? t('tkChooseAsset')
      : !(parseFloat(amount) > 0) ? t('tkEnterAmount')
      : (!price || price === '…') ? t('tkEnterPrice')
      : `${isBuy ? t('tkSlideBuy') : t('tkSlideSell')} ${isMetal ? asset.name : sym}`
    const chg = Number(assetChg)
    const chipColor = (c) => (String(c).startsWith('var(') ? '#10b981' : c)
    const bigVal = amtMode === 'usd' ? usdInput : amount
    const cryptoHeld = isBuy && category === 'crypto' && !selectedCoin && !coinSearch.trim()
      ? (holdings || []).filter(h => (h.amount ?? 0) > 0 && !/^(fiat:|stock:|bond:|other:|xstock:)/.test(h.coin_id || '') && h.coin_id !== 'gold' && h.coin_id !== 'silver').slice(0, 5)
      : []

    return (
      <>
        <div className={`bs-backdrop ${open ? 'bs-backdrop-open' : ''}`} />
        <div className={`bs-sheet bs-v2 ${open ? 'bs-sheet-open' : ''} ${isPage ? 'bs-page' : ''}`}>
          {!isPage && <div className="bs-handle" />}

          <div className="tk-head">
            <button type="button" className="tk-ib" aria-label="Back"
              onClick={() => (!success && v2Step === 'ticket' && !prefillCoin) ? setV2Step('asset') : closeAll()}>{IcoBack}</button>
            {!success ? (
              <div className={`tk-mode${isBuy ? '' : ' is-sell'}`} role="tablist">
                <button type="button" role="tab" aria-selected={isBuy} className={isBuy ? 'on' : ''} onClick={() => switchSide('buy')}>{t('buy')}</button>
                <button type="button" role="tab" aria-selected={!isBuy} className={!isBuy ? 'on' : ''} onClick={() => switchSide('sell')}>{t('sell')}</button>
              </div>
            ) : <span style={{ flex: 1 }} />}
            <button type="button" className="tk-ib" onClick={closeAll} aria-label={t('close')}>{IcoClose}</button>
          </div>

          {success && receipt ? (
            <div className="tk-done">
              <div className={`tk-ring${isBuy ? '' : ' is-sell'}`}><span><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div>
              <h3 className="tk-num">{isBuy ? t('tkBought') : t('tkSold')} {fmtQty(receipt.amount)} {receipt.symbol?.toUpperCase()}</h3>
              <p className="tk-num">{fmtUsd(receipt.total)}{receipt.leg ? ` · ${receipt.leg}` : ''}</p>
              <div className="tk-card tk-receipt">
                <div className="tk-kv"><span className="tk-k">{t('tkPricePer')} {receipt.symbol?.toUpperCase()}</span><span className="tk-v tk-num">{fmtUsd(receipt.price)}</span></div>
                {receipt.leg && <div className="tk-kv"><span className="tk-k">{isBuy ? t('tkPaid') : t('tkReceived')}</span><span className="tk-v tk-num">{fmtUsd(receipt.total)} · {receipt.leg}</span></div>}
                <div className="tk-kv"><span className="tk-k">{t('tkNewBalance')}</span><span className="tk-v tk-num">{fmtQty(receipt.newBalance)} {receipt.symbol?.toUpperCase()}</span></div>
                <div className="tk-kv"><span className="tk-k">{t('txDate')}{receipt.wallet ? ` · ${t('txWallet')}` : ''}</span><span className="tk-v">{receipt.date}{receipt.wallet ? ` · ${receipt.wallet}` : ''}</span></div>
              </div>
              <button type="button" className="tk-nudge" onClick={() => leave(() => navigate(homePath(true), { state: { tab: 'alerts' } }))}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {t('tkPriceAlert')} {receipt.symbol?.toUpperCase()}
              </button>
              <div className="tk-btns">
                <button type="button" className="tk-btn" onClick={() => leave(() => navigate(`/asset/?id=${encodeURIComponent(receipt.id)}`))}>{t('tkViewHolding')}</button>
                <button type="button" className="tk-btn tk-btn-main" onClick={() => leave(() => {})}>{t('tkDone')}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="tk-steps" aria-hidden="true">{[1, 2, 3].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

              <div className="bs-body tk-body">
                {v2Step === 'asset' ? (
                  <>
                    {!prefillCoin && (
                      <div className="tk-cats" data-tour="ts-category">
                        {CATEGORIES.map(c => (
                          <button key={c.key} type="button" className={`tk-cat${category === c.key ? ' on' : ''}`} style={{ '--c': chipColor(c.color) }} onClick={() => pickCategory(c.key)}>
                            <span className="tk-cat-ico">{catIcon(c, 13)}</span>{catLabel(c)}
                          </button>
                        ))}
                      </div>
                    )}
                    {cryptoHeld.length > 0 && (
                      <>
                        <div className="tk-sec"><span>{t('tkYourHoldings')}</span><span>{t('tsPrice24h')}</span></div>
                        <div className="tk-card tk-list">
                          {cryptoHeld.map(h => (
                            <button key={h.coin_id} type="button" className="bs-market-row"
                              onClick={() => setSelectedCoin({ id: h.coin_id, symbol: h.coin_symbol, name: h.coin_name, image: h.coin_image || h.image || '' })}>
                              <CoinLogo image={h.coin_image || h.image} symbol={h.coin_symbol} coinId={h.coin_id} size={30} className="bs-coin-thumb" />
                              <div className="bs-coin-info"><strong>{h.coin_name}</strong><span className="muted">{h.coin_symbol?.toUpperCase()} · {fmtQty(h.amount)}</span></div>
                              <div className="bs-market-px"><span className="bs-market-price">{h.value > 0 ? fmtUsd(h.value) : '—'}</span></div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="tk-asset" data-tour="ts-asset">{assetPicker}</div>
                  </>
                ) : (
                  <>
                    <div className="tk-card tk-assetbar">
                      {isMetal
                        ? <span className="tk-metal">{category === 'gold' ? IcoGoldBar : IcoSilverBar}</span>
                        : <CoinLogo image={asset?.image} symbol={asset?.symbol} coinId={asset?.id} size={38} className="bs-coin-thumb" />}
                      <div className="tk-assetbar-n">
                        <b>{asset?.name}</b>
                        <small className="tk-num">
                          {price && price !== '…' ? fmtUsd(price) : priceFetchFailed ? t('tkNoLivePrice') : t('tkFetching')}
                          {assetChg != null && isFinite(chg) && <span className={chg >= 0 ? 'tk-up' : 'tk-dn'}> · {chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%</span>}
                        </small>
                      </div>
                      {!prefillCoin && <button type="button" className="tk-chip" onClick={() => { setV2Step('asset'); if (category === 'crypto') { setSelectedCoin(null); setCoinSearch('') } }}>{t('tkChange')}</button>}
                    </div>

                    {!isBuy && holdingForCoin && (
                      <div className="tk-card tk-hold">
                        <div className="tk-hold-row"><span>{t('tkYouHold')}</span><b className="tk-num">{fmtQty(heldAmt)} {sym}{holdingForCoin.value > 0 ? ` · ${fmtUsd(holdingForCoin.value)}` : ''}</b></div>
                        <div className="tk-meter"><i style={{ width: `${sellShare}%` }} /></div>
                        {sellShare > 0 && <div className="tk-hold-row"><span>{t('tkSelling')} {sellShare.toFixed(sellShare < 10 ? 1 : 0)}%</span><span className="tk-num">{fmtQty(Math.max(0, heldAmt - parseFloat(amount)))} {sym}</span></div>}
                      </div>
                    )}

                    <div className="tk-amount">
                      <div className="tk-lbl-row">
                        <span className="tk-lbl">{isBuy ? t('tkYouSpend') : t('tkYouSell')}</span>
                        <button type="button" className="tk-curpick" aria-label={t('tkCurrency')} onClick={() => setCurPicker('trade')}>
                          <CurFlag code={curCode} size={18} />
                          {curCode}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                      </div>
                      <label className="tk-big">
                        {amtMode === 'usd' && <span className="tk-cur">{currencySymbol(curCode)}</span>}
                        <input data-tour="ts-amount" inputMode="decimal" autoComplete="off" placeholder="0"
                          aria-label={isBuy ? t('tkYouSpend') : t('tkYouSell')}
                          value={bigVal} onChange={onBig}
                          style={{ width: `${Math.max(1, String(bigVal).length) + 0.5}ch` }} />
                        {amtMode !== 'usd' && <span className="tk-cur">{isMetal ? metalUnit : sym}</span>}
                      </label>
                      <div className="tk-conv tk-num">
                        <span>{amtMode === 'usd'
                          ? (parseFloat(amount) > 0 ? `≈ ${fmtQty(amount)} ${isMetal ? metalUnit : sym}` : (isMetal ? metalUnit : sym))
                          : (total > 0 ? `≈ ${fmtUsd(total)}` : curCode)}</span>
                        {/* Metals get both: the oz / g unit, and the same switch
                            between a quantity and a dollar amount every other
                            asset has. The unit used to replace the switch, so
                            gold could only be bought by the dollar. */}
                        {isMetal && (
                          <span className="tk-seg">{['oz', 'g'].map(u => <button key={u} type="button" className={metalUnit === u ? 'on' : ''} onClick={() => switchMetalUnit(u)}>{u}</button>)}</span>
                        )}
                        <button type="button" className="tk-swap" aria-label="USD / quantity" onClick={() => switchAmtMode(amtMode === 'usd' ? 'qty' : 'usd')}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>
                        </button>
                      </div>
                    </div>

                    {pctBase > 0 && (
                      <div className="tk-pct">
                        {[25, 50, 75, 100].map(pct => (
                          <button key={pct} type="button" className={pctIsActive(isBuy ? spendPct : sellPct, pct) ? 'on' : ''} onClick={() => applyPct(pct)}>
                            {pct === 100 ? t('tsMax') : `${pct}%`}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="tk-card">
                      <div className="tk-kv">
                        <span className="tk-k">{isBuy ? t('tkPayWith') : t('tkReceiveIn')}</span>
                        <span className="tk-v tk-num">
                          {legValue !== 'NONE' && legValue !== 'REMOVE' ? legLabel : ''}
                          {isBuy && buyWithHolding && <small> {fmtQty(buyWithBalanceAmt)} {buyWith}{buyWithBalanceUsd > 0 ? ` ≈ ${fmtUsd(buyWithBalanceUsd)}` : ''}</small>}
                        </span>
                      </div>
                      <div className="tk-legs">
                        {legOptions.map(o => (
                          <button key={o.key} type="button" className={`tk-leg${legValue === o.key ? ' on' : ''}`} style={{ '--c': chipColor(o.color) }} onClick={() => setLeg(o.key)}>
                            <span className="tk-leg-ico"><LegIcon o={o} size={12} /></span>{o.labelKey ? t(o.labelKey) : o.label}
                          </button>
                        ))}
                      </div>
                      {legValue === 'CUSTOM' && (
                        <input className="bs-input tk-custom" type="text" placeholder="e.g. SOL, DAI" value={legCustom} onChange={e => setLegCustom(e.target.value)} />
                      )}
                      {legNote && <p className="tk-note">{legNote}</p>}
                    </div>

                    <div className="tk-card">
                      <div className="tk-kv">
                        <span className="tk-k">{t('tkPricePer')} {isMetal ? metalUnit : sym}</span>
                        <span className="tk-v">
                          <input className="tk-inline tk-num" inputMode="decimal"
                            placeholder={price === '…' ? t('tkFetching') : t('tsEnterPrice')}
                            value={price === '…' ? '' : priceFocused ? (fx !== 1 ? priceDraft : price) : fmtPriceDisplay(priceShown)}
                            onFocus={() => { setPriceDraft(priceShown || ''); setPriceFocused(true) }} onBlur={() => setPriceFocused(false)}
                            onChange={e => {
                              const v = e.target.value.replace(/,/g, '')
                              if (fx !== 1) { setPriceDraft(v); setPrice(v && parseFloat(v) >= 0 ? String(parseFloat(v) / fx) : v) }
                              else setPrice(v)
                              setPriceFetchFailed(false)
                            }}
                            disabled={price === '…'} aria-label={t('tkPricePer')} />
                          {fx !== 1 && <small>{curCode}</small>}
                          {price && price !== '…' && price === fetchedPrice.current && <span className="tk-tag">{t('tkMarket')}</span>}
                        </span>
                      </div>
                      {priceFetchFailed && <p className="tk-note tk-warn">{t('tkEnterPrice')}</p>}
                      <div className="tk-kv">
                        <span className="tk-k">{t('txDate')}</span>
                        <span className="tk-v"><input className="tk-inline" type="date" value={date} onChange={e => setDate(e.target.value)} aria-label={t('txDate')} /></span>
                      </div>
                      {wallets.length > 1 && (
                        <div className="tk-kv">
                          <span className="tk-k">{t('txWallet')}</span>
                          <span className="tk-v"><select className="tk-inline" value={walletId} onChange={e => setWalletId(e.target.value)} aria-label={t('txWallet')}>
                            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select></span>
                        </div>
                      )}
                    </div>

                    {pnl != null && (
                      <div className="tk-card tk-pnl">
                        <span className={`tk-pnl-ico${pnl >= 0 ? '' : ' is-loss'}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg></span>
                        <div className="tk-pnl-t"><b>{pnl >= 0 ? t('tkProfitSale') : t('tkLossSale')}</b><small className="tk-num">{t('tkAvgCost')} {fmtUsd(avgCost)}</small></div>
                        <b className={`tk-num ${pnl >= 0 ? 'tk-up' : 'tk-dn'}`}>{pnl >= 0 ? '+' : '−'}{fmtUsd(Math.abs(pnl))}</b>
                      </div>
                    )}

                    {asset?.id && ['crypto', 'stock', 'wstock', 'gold', 'silver', 'tstock'].includes(category) && (
                      <div className={`tk-card tk-signal${signalOpen ? '' : ' is-closed'}`}>
                        <button type="button" className="tk-signal-toggle" aria-expanded={signalOpen} onClick={() => setSignalOpen(v => !v)}>
                          <span>{isBuy ? t('tkEntrySignal') : t('tkExitSignal')}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><polyline points={signalOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}/></svg>
                        </button>
                        {/* Open by default, and drawn flat inside this card
                            rather than as a second box nested in it. */}
                        {signalOpen && (
                          <div className="tk-signal-body">
                            <TradeSignal coinId={asset.id} currentPrice={parseFloat(price) || null} userAvgCost={avgCost} mode={isBuy ? 'buy' : 'sell'} />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="bs-footer tk-foot">
                {msg && <p className="tk-msg">{msg}</p>}
                {v2Step === 'asset' ? (
                  <button type="button" className="tk-btn tk-btn-main tk-continue" disabled={!asset} onClick={() => setV2Step('ticket')}>
                    {asset ? `${t('tkContinue')} · ${asset.symbol?.toUpperCase()}` : t('tkChooseAsset')}
                  </button>
                ) : (
                  <>
                    {total > 0 && (
                      <div className="tk-sum tk-num">
                        <span>{isBuy ? t('tkYouGet') : t('tkYouReceive')}</span>
                        <b>{isBuy ? `${fmtQty(amount)} ${isMetal ? metalUnit : sym}` : `${fmtUsd(total)}${sellFor !== 'REMOVE' && legLabel ? ` · ${legLabel}` : ''}`}</b>
                      </div>
                    )}
                    <SlideToConfirm tone={isBuy ? 'buy' : 'sell'} label={slideLabel} disabled={!ready} busy={busy}
                      onConfirm={() => { playTradeSound(isBuy); submit() }} />
                  </>
                )}
              </div>
            </>
          )}
          {confirmNoneOverlay}
          <CurrencyPicker open={!!curPicker} rates={fxRates}
            title={curPicker === 'leg' ? (isBuy ? t('tkPayWith') : t('tkReceiveIn')) : t('tkCurrency')}
            value={curPicker === 'leg' ? legValue : curCode}
            onClose={() => setCurPicker(null)}
            onPick={(c) => { if (curPicker === 'leg') setLeg(c); else pickTradeCur(c); setCurPicker(null) }} />
        </div>
      </>
    )
  }

  return (
    <>
      <div className={`bs-backdrop ${open ? 'bs-backdrop-open' : ''}`} />
      <div className={`bs-sheet ${open ? 'bs-sheet-open' : ''} ${isPage ? 'bs-page' : ''}`}>
        {!isPage && <div className="bs-handle" />}

        <div className="bs-header">
          <div className="bs-header-left">
            {isPage && (
              <button className="bs-back" onClick={onClose} aria-label="Back">{IcoBack}</button>
            )}
            <div className="bs-type-dot" style={{ background: accent }} />
            <h3 className="bs-title" style={{ color: accent }}>{isBuy ? t('tcBuyAsset') : t('tcSellAsset')}</h3>
          </div>
          <button className="bs-close" style={{ '--bs-acc': accent }} onClick={onClose} aria-label={t('close')}>{IcoClose}</button>
        </div>

        {success ? (
          <div className="bs-success">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 17 9"/>
            </svg>
            <p style={{ color:'var(--text)', fontWeight:700, fontSize:'1.05rem', margin:0 }}>{t('tsTradeRecorded')}</p>
            <p className="muted" style={{ fontSize:'0.82rem', margin:'0.3rem 0 0.75rem' }}>
              {isBuy ? 'Bought' : 'Sold'} {amount} {asset?.symbol}
            </p>
          </div>
        ) : (
          <>
          <div className="bs-body">
            {/* ── Binance-style Buy / Sell tab toggle ── */}
            <div className="bs-mode-tabs">
              <button type="button"
                className={`bs-mode-tab ${isBuy ? 'active buy' : ''}`}
                onClick={() => { if (isBuy) return; track('trade_mode_switch', { to: 'buy' }); setMode('buy'); setAmount(''); setUsdInput(''); setSpendPct(null); setSellPct(null); setBuyWith('NONE'); setMsg('') }}>
                Buy
              </button>
              <button type="button"
                className={`bs-mode-tab ${!isBuy ? 'active sell' : ''}`}
                onClick={() => { if (!isBuy) return; track('trade_mode_switch', { to: 'sell' }); setMode('sell'); setAmount(''); setUsdInput(''); setSpendPct(null); setSellPct(null); setSellFor('REMOVE'); setMsg('') }}>
                Sell
              </button>
            </div>

            {/* ── Buy with (first — drives balance & % fill) ── */}
            {isBuy && (
              <div className="bs-field">
                <label className="bs-label">{t('txBuyWith')} <span className="bs-req">*</span></label>
                <div className="bs-leg-grid">
                  {BUY_WITH_OPTIONS.map(o => (
                    <button key={o.key} type="button"
                      className={`bs-leg-chip ${buyWith === o.key ? 'active' : ''}`}
                      style={buyWith === o.key ? { borderColor: o.color, background: o.color + '20' } : {}}
                      onClick={() => { setBuyWith(o.key); setSpendPct(null) }}>
                      <span className="bs-leg-chip-icon" style={{ color: o.color }}><LegIcon o={o} size={15} /></span>
                      <span className="bs-leg-chip-label" style={buyWith === o.key ? { color: o.color } : {}}>{o.labelKey ? t(o.labelKey) : o.label}</span>
                    </button>
                  ))}
                </div>
                {buyWith === 'CUSTOM' && (
                  <input className="bs-input bs-leg-custom" type="text"
                    placeholder="e.g. SOL, DAI"
                    value={buyWithCustom} onChange={e => setBuyWithCustom(e.target.value)} />
                )}

                {/* Balance + % quick-fill — shown when a trackable payment asset is selected */}
                {buyWith && buyWith !== 'NONE' && buyWith !== 'CUSTOM' && (
                  buyWithHolding ? (
                    <div className="bs-buywith-balance">
                      <div className="bs-balance-row">
                        <span className="muted">Your {buyWith} balance</span>
                        <span className="bs-buywith-bal-val">
                          {parseFloat(buyWithBalanceAmt.toFixed(6))} {buyWith}
                          {buyWithBalanceUsd > 0 && <span className="muted"> ≈ ${buyWithBalanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
                        </span>
                      </div>
                      <div className="bs-pct-row">
                        {[25, 50, 75, 100].map(pct => (
                          <button key={pct} type="button"
                            className={`bs-pct-btn ${pctIsActive(spendPct, pct) ? 'active' : ''}`}
                            onClick={() => {
                              setSpendPct(pct)
                              const spendUsd = buyWithBalanceUsd * pct / 100
                              const px = parseFloat(price)
                              if (px > 0) setAmount(String(parseFloat((spendUsd / px).toFixed(8))))
                            }}>
                            {pct}%
                          </button>
                        ))}
                      </div>
                      {livePctLabel != null && (
                        <p className="bs-pct-live">
                          {t('tsBuyUsesPct')(livePctLabel, buyWith)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="bs-hint bs-buywith-warn">
                      No {buyWith} balance found in holdings.
                    </p>
                  )
                )}

                {buyWith && (
                  <p className="bs-hint">
                    {buyWith === 'NONE'
                      ? 'Only adds to holdings — no balance deducted.'
                      : <>Cost{total > 0 ? ` $${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''} deducted from <strong>{buyWith === 'CUSTOM' ? (buyWithCustom.trim().toUpperCase() || '…') : buyWith}</strong>.</>}
                  </p>
                )}
              </div>
            )}

            {/* ── Category selector ── */}
            {!prefillCoin && (
              <div className="bs-field">
                <label className="bs-label">{t('tsAssetCategory')}</label>
                <div className="bs-cat-grid" data-tour="ts-category">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.key}
                      className={`bs-cat-btn ${category === c.key ? 'active' : ''}`}
                      style={category === c.key ? { borderColor: c.color, background: c.color + '18', color: c.color } : {}}
                      onClick={() => pickCategory(c.key)}
                    >
                      <span>{catIcon(c, 15)}</span> {catLabel(c)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Asset selector by category ── */}
            <div className="bs-field" data-tour="ts-asset">
              <label className="bs-label">{t('tsAsset')}</label>
              {assetPicker}
            </div>

            {/* Available balance + % quick-fill for sells (mirrors Buy) */}
            {!isBuy && holdingForCoin && (
              <div className="bs-field">
                <div className="bs-buywith-balance">
                  <div className="bs-balance-row">
                    <span className="muted">{t('tsAvailableToSell')}</span>
                    <button className="bs-balance-max" onClick={() => { setSellPct(100); setAmount(String(holdingForCoin.amount)) }}>
                      {parseFloat(Number(holdingForCoin.amount).toFixed(8))} {holdingForCoin.coin_symbol?.toUpperCase()}
                      {holdingForCoin.value > 0 && <span className="muted"> ≈ ${Number(holdingForCoin.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
                      <span className="bs-max-tag">{t('tsMax')}</span>
                    </button>
                  </div>
                  <div className="bs-pct-row">
                    {[25, 50, 75, 100].map(pct => (
                      <button key={pct} type="button"
                        className={`bs-pct-btn ${pctIsActive(sellPct, pct) ? 'active' : ''}`}
                        onClick={() => {
                          setSellPct(pct)
                          const qty = Number(holdingForCoin.amount) * pct / 100
                          setAmount(String(parseFloat(qty.toFixed(8))))
                        }}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                  {livePctLabel != null && (
                    <p className="bs-pct-live">
                      {t('txSellingPct')(livePctLabel, holdingForCoin.coin_symbol?.toUpperCase())}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Amount + Price */}
            <div className="bs-row-2">
              <div className="bs-field">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                  <label className="bs-label" style={{ margin:0 }}>
                    {amtMode === 'usd' ? 'USD Value'
                      : (category === 'gold' || category === 'silver') ? `QTY (${metalUnit})`
                      : isStockCat(category) ? 'Shares'
                      : 'QTY'}
                  </label>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {(category === 'gold' || category === 'silver') && (
                      <div className="bs-seg">
                        {['oz', 'g'].map(u => (
                          <button key={u} type="button" className={`bs-seg-btn${metalUnit === u ? ' active' : ''}`} onClick={() => switchMetalUnit(u)}>{u}</button>
                        ))}
                      </div>
                    )}
                    <div className="bs-seg">
                      <button type="button" className={`bs-seg-btn${amtMode === 'qty' ? ' active' : ''}`} onClick={() => switchAmtMode('qty')}>{t('tsQty')}</button>
                      <button type="button" className={`bs-seg-btn${amtMode === 'usd' ? ' active' : ''}`} onClick={() => switchAmtMode('usd')}>$</button>
                    </div>
                  </div>
                </div>
                {amtMode === 'usd' ? (
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:'0.75rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-sub)', fontWeight:700, fontSize:'0.9rem', pointerEvents:'none' }}>$</span>
                    <input data-tour="ts-amount" className="bs-input bs-input-value" type="text" inputMode="decimal" placeholder="0.00" min="0" step="any"
                      style={{ paddingLeft:'1.5rem' }}
                      value={usdInput} onChange={e => handleUsdInput(e.target.value)} />
                  </div>
                ) : (
                  <input data-tour="ts-amount" className="bs-input bs-input-value" type="text" inputMode="decimal" placeholder="0.00" min="0" step="any"
                    value={amount} onChange={e => { setAmount(e.target.value); setSpendPct(null); setSellPct(null) }} />
                )}
                {amtMode === 'usd' && amount && parseFloat(amount) > 0 && (
                  <span style={{ fontSize:'0.7rem', color:'var(--text-sub)', marginTop:'0.2rem' }}>
                    ≈ {parseFloat(amount).toLocaleString(undefined, { maximumSignificantDigits:6 })} {asset?.symbol?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="bs-field">
                <label className="bs-label">
                  {t('tcPriceUsd')}
                  {price === '…' && <span style={{marginLeft:6,fontSize:'0.75rem',color: 'var(--g-ink)', fontWeight: 700}}>fetching…</span>}
                  {priceFetchFailed && <span style={{marginLeft:6,fontSize:'0.75rem',color:'#f87171'}}>couldn't fetch — enter manually</span>}
                </label>
                <input className="bs-input bs-input-value" type="text" inputMode={price === '…' ? 'text' : 'decimal'} placeholder={t('tsEnterPrice')} min="0" step="any"
                  value={price === '…' ? '' : priceFocused ? price : fmtPriceDisplay(price)}
                  onFocus={() => setPriceFocused(true)}
                  onBlur={() => setPriceFocused(false)}
                  onChange={e => { setPrice(e.target.value.replace(/,/g, '')); setPriceFetchFailed(false) }}
                  disabled={price === '…'} />
              </div>
            </div>

            {/* Date + Wallet */}
            <div className="bs-row-2">
              <div className="bs-field">
                <label className="bs-label">{t('txDate')}</label>
                <input className="bs-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              {wallets.length > 1 && (
                <div className="bs-field">
                  <label className="bs-label">{t('txWallet')}</label>
                  <select className="bs-input" value={walletId} onChange={e => setWalletId(e.target.value)}>
                    {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              )}
            </div>


            {/* Sell for — icon selector, mandatory */}
            {!isBuy && (
              <div className="bs-field">
                <label className="bs-label">{t('txSellFor')} <span className="bs-req">*</span></label>
                <div className="bs-leg-grid">
                  {SELL_FOR_OPTIONS.map(o => (
                    <button
                      key={o.key}
                      type="button"
                      className={`bs-leg-chip ${sellFor === o.key ? 'active' : ''}`}
                      style={sellFor === o.key ? { borderColor: o.color, background: o.color + '20' } : {}}
                      onClick={() => setSellFor(o.key)}
                    >
                      <span className="bs-leg-chip-icon" style={{ color: o.color }}><LegIcon o={o} size={15} /></span>
                      <span className="bs-leg-chip-label" style={sellFor === o.key ? { color: o.color } : {}}>{o.labelKey ? t(o.labelKey) : o.label}</span>
                    </button>
                  ))}
                </div>
                {sellFor === 'CUSTOM' && (
                  <input className="bs-input bs-leg-custom" type="text"
                    placeholder="e.g. SOL, DAI"
                    value={sellForCustom} onChange={e => setSellForCustom(e.target.value)} />
                )}
                {sellFor && (
                  <p className="bs-hint">
                    {sellFor === 'REMOVE'
                      ? 'Deducted from holdings only — no other balance credited.'
                      : <>Proceeds{total > 0 ? ` $${total.toLocaleString(undefined,{maximumFractionDigits:2})}` : ''} credited to <strong>{sellFor === 'CUSTOM' ? (sellForCustom.trim().toUpperCase() || '…') : sellFor}</strong>.</>}
                  </p>
                )}
              </div>
            )}

            {/* Total */}
            {total > 0 && (
              <div className="bs-total">
                <span className="muted">{t('txTotal')}</span>
                <strong style={{ color: accent, fontSize:'1.2rem' }}>
                  ${total.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}
                </strong>
              </div>
            )}

            {/* Trade signal — only for assets we can build one for (price history) */}
            {asset?.id && ['crypto', 'stock', 'wstock', 'gold', 'silver', 'tstock'].includes(category) && (
              <div className="bs-signal-wrap">
                <button className="bs-signal-toggle" onClick={() => setSignalOpen(v => !v)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points={signalOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}/></svg>
                  {isBuy ? 'Entry signal' : 'Exit signal'}
                </button>
                {signalOpen && (
                  <TradeSignal
                    coinId={asset.id}
                    currentPrice={parseFloat(price) || null}
                    userAvgCost={holdingForCoin?.total_invested && holdingForCoin?.amount ? holdingForCoin.total_invested / holdingForCoin.amount : null}
                    mode={isBuy ? 'buy' : 'sell'}
                  />
                )}
              </div>
            )}

          </div>
          {/* Footer — outside scrollable bs-body so the button is always tappable */}
          <div className="bs-footer">
            {msg && <p style={{ color:'#f87171', fontSize:'0.8rem', margin:'0 0 0.5rem' }}>{msg}</p>}
            <button data-tour="ts-confirm" className={`bs-submit ${isBuy ? 'dvx-btn-primary' : 'dvx-btn-sell'}`}
              onClick={() => { playTradeSound(isBuy); submit() }}
              disabled={busy || !asset || !amount || !price || (isBuy ? !buyWith : !sellFor) || (isBuy && buyWith === 'CUSTOM' && !buyWithCustom.trim()) || (!isBuy && sellFor === 'CUSTOM' && !sellForCustom.trim())}>
              {busy ? t('obSettingUp') : isBuy ? t('tcConfirmBuy') : t('tcConfirmSell')}
            </button>
          </div>
          </>
        )}

        {confirmNoneOverlay}
      </div>
    </>
  )
}
