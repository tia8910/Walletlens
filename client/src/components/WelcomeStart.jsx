import { useState, useEffect, useMemo, useRef } from 'react'
import Icon from './Icon'
import CoinLogo from './CoinLogo'
import { api } from '../api'
import sfx from '../sfx'
import { POPULAR_FIAT, POPULAR_TICKERS, GOLD_ID, SILVER_ID, COPPER_ID, PLATINUM_ID, STOCK_PREFIX, FIAT_PREFIX } from '../data/assets'
import { THEMES } from '../ThemeContext'
import { track, trackProfileCreated } from '../analytics'
import { useLanguage } from '../LanguageContext'
import './SetupScreens.css'

// ── First-run "build your dashboard" ────────────────────────────────────────
// Shown once to a brand-new user (no holdings yet), right after they pick what
// they track. One row per asset, each with a picker for WHICH asset — any
// currency, stablecoin, metal, coin, stock or ETF, or something else by value
// — and the net worth adds up live above them as they type. Each is seeded at
// its live price so P&L starts at zero. Fully skippable.

const STARTED_KEY = 'wl_started'
const INTERESTS_KEY = 'wl_interests'
const GRAMS_PER_OZ = 31.1034768

const GOLD_LOGO = THEMES.find(t => t.id === 'gold')?.logo || ''
const SILVER_LOGO = THEMES.find(t => t.id === 'silver')?.logo || ''

// Tabs of the picker, in order, with the colour each takes in the net-worth bar.
export const SETUP_CATS = ['cash', 'stable', 'metal', 'crypto', 'stock', 'other']
const CAT_COLOR = { cash: '#34d399', stable: '#26a17b', metal: '#e6b422', crypto: '#f7931a', stock: '#60a5fa', other: '#a78bfa' }

const STABLES = [
  ['tether', 'USDT', 'Tether'], ['usd-coin', 'USDC', 'USD Coin'], ['dai', 'DAI', 'Dai'], ['first-digital-usd', 'FDUSD', 'First Digital USD'],
]
const COINS = [
  ['bitcoin', 'BTC', 'Bitcoin'], ['ethereum', 'ETH', 'Ethereum'], ['solana', 'SOL', 'Solana'], ['ripple', 'XRP', 'XRP'],
  ['binancecoin', 'BNB', 'BNB'], ['cardano', 'ADA', 'Cardano'], ['dogecoin', 'DOGE', 'Dogecoin'], ['the-open-network', 'TON', 'Toncoin'],
  ['avalanche-2', 'AVAX', 'Avalanche'], ['chainlink', 'LINK', 'Chainlink'], ['tron', 'TRX', 'TRON'], ['sui', 'SUI', 'Sui'],
]
const STOCKS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'PLTR', 'SPY', 'QQQ', 'VOO']
const STOCK_NAMES = { SPY: 'S&P 500 ETF', QQQ: 'Nasdaq 100 ETF', VOO: 'Vanguard S&P 500 ETF' }

const stockName = (tk) => POPULAR_TICKERS.find(p => p.ticker === tk)?.name || STOCK_NAMES[tk] || tk

/** Every asset the picker offers, as the rows and the transactions need it. */
export function setupAsset(kind, key, t = (k) => k) {
  switch (kind) {
    case 'cash': {
      const f = POPULAR_FIAT.find(x => x.code === key) || { code: key, name: key, symbol: key }
      return { cat: 'cash', id: `${FIAT_PREFIX}${f.code.toLowerCase()}`, sym: f.code, name: f.name, label: f.name, category: 'fiat', glyph: f.symbol, bg: 'rgba(52,211,153,.15)', fg: '#34d399', unit: f.code }
    }
    case 'stable': {
      const s = STABLES.find(x => x[0] === key) || STABLES[0]
      return { cat: 'stable', id: s[0], sym: s[1], name: s[2], label: s[2], category: 'crypto', logo: true, unit: s[1] }
    }
    case 'metal': {
      const M = {
        'gold-oz': [GOLD_ID, 'XAU', 'Gold (1 oz)', `${t('catGold')} · oz`, 'gold', GOLD_LOGO, 'oz'],
        'gold-g': [GOLD_ID, 'XAU', 'Gold (1 oz)', `${t('catGold')} · ${t('wsGram')}`, 'gold', GOLD_LOGO, 'g'],
        'silver-oz': [SILVER_ID, 'XAG', 'Silver (1 oz)', `${t('catSilver')} · oz`, 'silver', SILVER_LOGO, 'oz'],
        'silver-g': [SILVER_ID, 'XAG', 'Silver (1 oz)', `${t('catSilver')} · ${t('wsGram')}`, 'silver', SILVER_LOGO, 'g'],
        'platinum-oz': [PLATINUM_ID, 'XPT', 'Platinum (1 oz)', 'Platinum · oz', 'platinum', '', 'oz'],
        'copper-lb': [COPPER_ID, 'XCU', 'Copper (1 lb)', 'Copper · lb', 'copper', '', 'lb'],
      }
      const m = M[key] || M['gold-oz']
      return {
        cat: 'metal', key, id: m[0], sym: m[1], name: m[2], label: m[3], category: m[4], img: m[5], unit: m[6], grams: m[6] === 'g',
        glyph: m[1] === 'XPT' ? 'Pt' : m[1] === 'XCU' ? 'Cu' : '', bg: m[1] === 'XCU' ? 'linear-gradient(#f0a070,#b8653a)' : 'linear-gradient(#e5e7eb,#9ca3af)', fg: '#1f2937',
      }
    }
    case 'crypto': {
      const c = COINS.find(x => x[0] === key)
      return { cat: 'crypto', id: key, sym: c?.[1] || String(key).toUpperCase(), name: c?.[2] || key, label: c?.[2] || key, category: 'crypto', logo: true, unit: c?.[1] || '' }
    }
    case 'stock': {
      const tk = String(key).toUpperCase()
      return { cat: 'stock', id: `${STOCK_PREFIX}${tk.toLowerCase()}`, sym: tk, name: stockName(tk), label: stockName(tk), category: 'stock', logo: true, unit: tk }
    }
    case 'other': {
      const O = {
        'real-estate': ['other:real-estate', 'PROPERTY', t('catRealEstate'), 'other', '⌂', '#fbbf24'],
        bonds: ['bond:bonds', 'BONDS', t('catBonds'), 'bond', 'B', '#f472b6'],
        vehicle: ['other:vehicle', 'VEHICLE', t('wsVehicle'), 'other', '◈', '#94a3b8'],
        business: ['other:business', 'BUSINESS', t('wsBusiness'), 'other', '◆', '#a78bfa'],
      }
      const o = O[key]
      if (o) return { cat: 'other', key, id: o[0], sym: o[1], name: o[2], label: o[2], category: o[3], glyph: o[4], bg: `color-mix(in srgb, ${o[5]} 16%, transparent)`, fg: o[5], valued: true, unit: 'USD' }
      // Something typed in: stored by value, like the trade sheet's "other".
      const name = String(key).trim()
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset'
      return { cat: 'other', key, id: `other:${slug}`, sym: name.toUpperCase().slice(0, 12), name, label: name, category: 'other', glyph: name.slice(0, 1).toUpperCase(), bg: 'rgba(167,139,250,.16)', fg: '#a78bfa', valued: true, unit: 'USD' }
    }
    default: return null
  }
}

/** What each tab lists before anything is typed. */
function catalogue(cat, t) {
  switch (cat) {
    case 'cash': return POPULAR_FIAT.map(f => setupAsset('cash', f.code, t))
    case 'stable': return STABLES.map(s => setupAsset('stable', s[0], t))
    case 'metal': return ['gold-oz', 'gold-g', 'silver-oz', 'silver-g', 'platinum-oz', 'copper-lb'].map(k => setupAsset('metal', k, t))
    case 'crypto': return COINS.map(c => setupAsset('crypto', c[0], t))
    case 'stock': return STOCKS.map(k => setupAsset('stock', k, t))
    case 'other': return ['real-estate', 'bonds', 'vehicle', 'business'].map(k => setupAsset('other', k, t))
    default: return []
  }
}

/**
 * The rows to start with, from what they said they track on the step before.
 * With nothing picked there, the four balances most people have plus an open
 * stock row and an open "other" row.
 */
export function initialRows(interests, currency, t = (k) => k) {
  const rows = []
  const add = (cat, asset) => rows.push({ id: rows.length + 1, cat, asset, amt: '' })
  const has = (x) => interests.includes(x)
  const any = interests.length > 0
  if (!any || has('cash')) add('cash', setupAsset('cash', currency, t))
  if (!any || has('stablecoins')) add('stable', setupAsset('stable', 'tether', t))
  if (!any || has('gold')) add('metal', setupAsset('metal', 'gold-oz', t))
  if (has('silver')) add('metal', setupAsset('metal', 'silver-oz', t))
  if (has('commodities')) add('metal', setupAsset('metal', 'copper-lb', t))
  if (!any || has('crypto')) add('crypto', setupAsset('crypto', 'bitcoin', t))
  if (!any || has('stocks')) add('stock', null)
  if (has('etfs')) add('stock', setupAsset('stock', 'VOO', t))
  if (has('realestate')) add('other', setupAsset('other', 'real-estate', t))
  if (has('bonds')) add('other', setupAsset('other', 'bonds', t))
  if (!any) add('other', null)
  return rows
}

/** A row's value in USD at the given prices. */
export function rowValue(row, prices) {
  const a = row.asset
  const amt = Math.max(0, parseFloat(row.amt) || 0)
  if (!a || !amt) return 0
  if (a.valued) return amt
  const px = prices[a.id]?.usd ?? prices[a.id]?.price ?? (a.id === `${FIAT_PREFIX}usd` || a.cat === 'stable' ? 1 : 0)
  return a.grams ? (amt / GRAMS_PER_OZ) * px : amt * px
}

function readCurrency() {
  try { return (JSON.parse(localStorage.getItem('wl_settings') || '{}').currency || 'USD').toUpperCase() }
  catch { return 'USD' }
}
function readInterests() {
  try { const v = JSON.parse(localStorage.getItem(INTERESTS_KEY) || '[]'); return Array.isArray(v) ? v : [] }
  catch { return [] }
}

const usd = (v) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const catLabel = (cat, t) => ({ cash: t('catCash'), stable: t('wsCatStable'), metal: t('wsCatMetals'), crypto: t('catCrypto'), stock: t('catStocks'), other: t('wsCatOther') })[cat]

function Mark({ asset }) {
  if (!asset) return <span className="su-mark empty" aria-hidden="true">＋</span>
  if (asset.logo) return <span className="su-mark" aria-hidden="true"><CoinLogo image={asset.image || ''} symbol={asset.sym} coinId={asset.id} size={38} /></span>
  if (asset.img) return <span className="su-mark plain" aria-hidden="true" style={{ background: 'rgba(255,255,255,.06)' }}><img src={asset.img} alt="" /></span>
  return <span className="su-mark" aria-hidden="true" style={{ background: asset.bg, color: asset.fg }}>{asset.glyph}</span>
}

const Caret = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
)

function AssetSheet({ cat: startCat, current, prices, onPrices, onPick, onClose }) {
  const { t } = useLanguage()
  const [cat, setCat] = useState(startCat)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const timer = useRef(null)
  const tabsRef = useRef(null)

  // The chosen tab can sit past the edge of a narrow screen; bring it in.
  useEffect(() => {
    tabsRef.current?.querySelector('.su-tab.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [cat])

  // Prices for what the tab shows, so the list reads like a market.
  useEffect(() => {
    const ids = catalogue(cat, t).filter(a => !a.valued).map(a => a.id)
    if (ids.length) api.getPrices([...new Set(ids)].join(',')).then(onPrices).catch(() => {})
  }, [cat]) // eslint-disable-line react-hooks/exhaustive-deps

  // Any coin at all, beyond the ones listed.
  useEffect(() => {
    clearTimeout(timer.current)
    const s = q.trim()
    if (cat !== 'crypto' || s.length < 2) { setFound([]); return undefined }
    let alive = true
    timer.current = setTimeout(async () => {
      const coins = await api.searchCoins(s).catch(() => [])
      if (!alive) return
      setFound((coins || []).filter(c => c?.id).slice(0, 12).map(c => ({
        ...setupAsset('crypto', c.id, t), sym: String(c.symbol || '').toUpperCase(), name: c.name, label: c.name, image: c.large || c.thumb || '', unit: String(c.symbol || '').toUpperCase(),
      })))
    }, 250)
    return () => { alive = false; clearTimeout(timer.current) }
  }, [q, cat]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = catalogue(cat, t)
    const local = s ? base.filter(a => a.sym.toLowerCase().includes(s) || a.label.toLowerCase().includes(s)) : base
    if (cat === 'crypto' && found.length) {
      const seen = new Set(local.map(a => a.id))
      return [...local, ...found.filter(a => !seen.has(a.id))]
    }
    if (cat === 'stock' && s && /^[a-z]{1,5}([.-][a-z])?$/.test(s) && !local.some(a => a.sym.toLowerCase() === s)) {
      return [...local, setupAsset('stock', s.toUpperCase(), t)]
    }
    if (cat === 'other' && q.trim()) return [...local, { ...setupAsset('other', q.trim(), t), custom: true }]
    return local
  }, [cat, q, found]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="su-scrim" onClick={onClose} />
      <div className="su-sheet" role="dialog" aria-modal="true" aria-label={t('wsChooseAsset')}>
        <div className="su-grab" />
        <div className="su-sheet-title">{t('wsChooseAsset')}</div>
        <div className="su-tabs" role="tablist" ref={tabsRef}>
          {SETUP_CATS.map(c => (
            <button key={c} role="tab" aria-selected={c === cat} className={`su-tab${c === cat ? ' on' : ''}`}
              onClick={() => { setCat(c); setQ('') }}>{catLabel(c, t)}</button>
          ))}
        </div>
        <label className="su-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('wsSearch')} aria-label={t('wsSearch')} autoComplete="off" spellCheck={false} />
        </label>
        <div className="su-list">
          {list.map(a => {
            const p = prices[a.id]
            const px = a.grams ? (p?.usd || 0) / GRAMS_PER_OZ : p?.usd
            const chg = p?.usd_24h_change
            const showPx = !a.valued && a.cat !== 'cash' && a.cat !== 'stable' && px > 0
            const sel = current && current.id === a.id && current.unit === a.unit
            return (
              <button key={`${a.id}:${a.unit}:${a.custom ? 'c' : ''}`} className={`su-opt${sel ? ' sel' : ''}`} onClick={() => onPick(a)}>
                <Mark asset={a} />
                <span className="su-opt-t">
                  <b>{a.custom ? t('wsAddCustom')(a.label) : a.cat === 'metal' || a.cat === 'other' ? a.label : a.sym}</b>
                  <small>{a.cat === 'metal' ? a.sym : a.cat === 'other' ? t('wsValueUsd') : a.label}</small>
                </span>
                {showPx && (
                  <span className="su-opt-px">{usd(px)}
                    {Number.isFinite(chg) && chg !== 0 && <small className={chg >= 0 ? 'su-up' : 'su-dn'}>{chg >= 0 ? '+' : ''}{chg.toFixed(1)}%</small>}
                  </span>
                )}
              </button>
            )
          })}
          {!list.length && <div className="su-empty">{t('wsNoMatch')}</div>}
        </div>
      </div>
    </>
  )
}

export default function WelcomeStart({ onDone }) {
  const { t } = useLanguage()
  const [rows, setRows] = useState(() => {
    const cur = readCurrency()
    return initialRows(readInterests(), POPULAR_FIAT.some(f => f.code === cur) ? cur : 'USD', t)
  })
  const [prices, setPrices] = useState(() => {
    const ids = SETUP_CATS.flatMap(c => catalogue(c, t)).filter(a => !a.valued).map(a => a.id)
    return api.getCachedPrices([...new Set(ids)].join(','))
  })
  const [sheet, setSheet] = useState(null)   // { row: index | null, cat }
  const [busy, setBusy] = useState(false)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [canSkip, setCanSkip] = useState(false)
  const [bump, setBump] = useState(0)
  const focusRow = useRef(null)
  const nextId = useRef(100)

  // The pad from the welcome slides carries on to the end of setup.
  useEffect(() => sfx.holdAmbient(), [])

  // Delay the "add later" link so users see the step before they can bail.
  useEffect(() => {
    const timer = setTimeout(() => setCanSkip(true), 4000)
    return () => clearTimeout(timer)
  }, [])

  // Live prices for whatever the rows hold.
  const rowIds = rows.map(r => r.asset && !r.asset.valued ? r.asset.id : null).filter(Boolean).join(',')
  useEffect(() => {
    if (!rowIds) return
    api.getPrices(rowIds).then(p => setPrices(prev => ({ ...prev, ...p }))).catch(() => {})
  }, [rowIds])

  useEffect(() => {
    if (focusRow.current == null) return
    const id = focusRow.current
    focusRow.current = null
    setTimeout(() => document.querySelector(`[data-su-row="${id}"]`)?.focus(), 60)
  }, [rows])

  const values = rows.map(r => rowValue(r, prices))
  const total = values.reduce((s, v) => s + v, 0)
  const byCat = {}
  rows.forEach((r, i) => { if (values[i] > 0) byCat[r.cat] = (byCat[r.cat] || 0) + values[i] })
  const hasAny = rows.some(r => r.asset && parseFloat(r.amt) > 0)

  function setAmt(i, v) {
    const clean = v.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
    setRows(prev => prev.map((r, j) => j === i ? { ...r, amt: clean } : r))
    setBump(b => b + 1)
  }

  function openSheet(row, cat) {
    setSheet({ row, cat })
    try { sfx.playWhoosh() } catch {}
  }

  function pick(asset) {
    const at = sheet?.row
    setSheet(null)
    try { sfx.playSelect(4, true) } catch {}
    sfx.haptic(9)
    if (at == null) {
      const id = nextId.current++
      focusRow.current = id
      setRows(prev => [...prev, { id, cat: asset.cat, asset, amt: '', added: true }])
    } else {
      focusRow.current = rows[at].id
      setRows(prev => prev.map((r, j) => j === at ? { ...r, cat: asset.cat, asset } : r))
    }
    track('welcome_start_pick', { cat: asset.cat, id: asset.id })
  }

  function removeRow(i) {
    setRows(prev => prev.filter((_, j) => j !== i))
  }

  function finish() {
    try { localStorage.setItem(STARTED_KEY, '1') } catch {}
    onDone?.()
  }

  function skip() {
    track('welcome_start_skip')
    finish()
  }
  function askSkip() { track('welcome_start_skip_prompt'); setConfirmSkip(true) }

  async function start() {
    if (!hasAny) { skip(); return }
    setBusy(true)
    try {
      const wallet = await api.ensureWallet()
      const date = new Date().toISOString().split('T')[0]
      const seeds = rows.filter(r => r.asset && parseFloat(r.amt) > 0)

      // Fetch live prices so cost basis ≈ current value (P&L starts ~0) —
      // but never let that fetch decide how long this button spins.
      //
      // getPrices fans out per asset class over four tiers of sources and
      // proxies. When the first ones are unreachable — a blocked network, a
      // rate-limited CoinGecko — the fan-out still resolves, eventually, and
      // the await here had no ceiling. "Setting up…" for half a minute, on the
      // first thing a new user ever does, for numbers they typed themselves
      // and that get written to localStorage either way.
      //
      // So the fetch is given a short deadline it usually beats. Whatever has
      // not landed by then falls back to the prices already known, and
      // anything still missing is repaired by backfillCostBasis below, after
      // the dashboard is already on screen.
      const ids = [...new Set(seeds.filter(r => !r.asset.valued).map(r => r.asset.id))]
      const PRICE_DEADLINE_MS = 2500
      let px = { ...prices, ...(ids.length ? api.getCachedPrices(ids.join(',')) : {}) }
      if (ids.length) {
        // The un-raced promise is kept: it is what backfillCostBasis rides on,
        // and dropping it would throw away a fetch already in flight.
        const live = api.getPrices(ids.join(',')).catch(() => ({}))
        const onTime = await Promise.race([
          live,
          new Promise(r => setTimeout(() => r(null), PRICE_DEADLINE_MS)),
        ])
        if (onTime) px = { ...px, ...onTime }
      }
      const priceOf = (a) => {
        if (a.valued) return 1
        const p = px[a.id]?.usd ?? px[a.id]?.price
        if (p) return p
        // One unit of USD is a dollar and so is a stablecoin. Any other
        // currency or asset is not, so 0 marks it for backfillCostBasis to
        // repair once its price lands, rather than pricing it as dollars.
        return a.id === `${FIAT_PREFIX}usd` || a.cat === 'stable' ? 1 : 0
      }

      for (const r of seeds) {
        const a = r.asset
        const amt = parseFloat(r.amt)
        await api.addTransaction({
          wallet_id: wallet.id, type: 'buy', category: a.category,
          coin_id: a.id, coin_symbol: a.sym, coin_name: a.cat === 'cash' ? `${a.sym} Cash` : a.name,
          // Metals are priced per troy ounce; grams are converted here.
          amount: a.grams ? amt / GRAMS_PER_OZ : amt,
          price_per_unit: priceOf(a), date,
          ...(a.image ? { coin_image: a.image } : {}),
        })
      }
      track('welcome_start_seed', { count: seeds.length, cats: [...new Set(seeds.map(r => r.cat))].join(',') })
      trackProfileCreated({ method: 'welcome_balances', source: 'welcome_start' })
      try { sfx.playTriumph() } catch {}
      sfx.haptic([12, 40, 18])
      // Deliberately not awaited: anything the deadline above cut short gets
      // its cost basis repaired while the dashboard is already on screen.
      if (ids.length) api.backfillCostBasis(ids).catch(() => {})
      finish()
    } catch {
      finish()
    } finally { setBusy(false) }
  }

  const cats = SETUP_CATS.filter(c => byCat[c] > 0)

  return (
    <div className="su-screen" role="dialog" aria-modal="true" aria-label={t('wsTitle')}>
      <div className="su-inner">
        <header className="su-hero">
          <div className="su-eyebrow"><Icon name="sparkles" size={13} /> {t('ipEyebrow')}</div>
          <h1 className="su-title">{t('wsTitle')}</h1>
          <p className="su-sub">{t('wsSubShort')}</p>
        </header>

        <div className="su-body">
          <div className="su-nw">
            <div className="su-nw-label">{t('wsNetWorth')}</div>
            <div key={bump} className={`su-nw-val${bump ? ' bump' : ''}`}>{usd(total)}</div>
            <div className="su-alloc" aria-hidden="true">
              {cats.map(c => <span key={c} style={{ background: CAT_COLOR[c], flexGrow: byCat[c] / total }} />)}
            </div>
            {cats.length > 0 && (
              <div className="su-legend">
                {cats.map(c => <span key={c}><i style={{ background: CAT_COLOR[c] }} />{catLabel(c, t)} {Math.round(byCat[c] / total * 100)}%</span>)}
              </div>
            )}
          </div>

          <div className="su-rows">
            {rows.map((r, i) => {
              const a = r.asset
              return (
                <div key={r.id} className="su-row">
                  <Mark asset={a} />
                  <span className="su-meta">
                    <div className="su-cat">{catLabel(r.cat, t)}</div>
                    <button className={`su-pick${a ? '' : ' empty'}`} onClick={() => openSheet(i, r.cat)}>
                      {a ? <>{a.cat === 'metal' || a.cat === 'other' ? a.label : a.sym} {a.cat !== 'metal' && a.cat !== 'other' && <small>{a.label}</small>}</> : t('wsChoose')}
                      <Caret />
                    </button>
                  </span>
                  <span className="su-amt">
                    <input data-su-row={r.id} type="text" inputMode="decimal" placeholder="0.00" value={r.amt}
                      disabled={!a} onChange={e => setAmt(i, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') start() }}
                      aria-label={a ? `${a.label} ${a.unit}` : catLabel(r.cat, t)} />
                    <div className="su-usd">{values[i] > 0 ? usd(values[i]) : a ? a.unit : '—'}</div>
                  </span>
                  {r.added && (
                    <button className="su-remove" onClick={() => removeRow(i)} aria-label={t('wsRemoveRow')} title={t('wsRemoveRow')}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <button className="su-more" onClick={() => openSheet(null, 'crypto')}>＋ {t('wsAddAnother')}</button>
        </div>

        <div className="su-foot">
          <button className="su-cta" onClick={start} disabled={busy}>
            {busy ? t('obSettingUp') : hasAny ? `${t('wsSeeDashboard')} ✦` : t('wsNext')}
          </button>
          <button
            className="su-ghost" onClick={askSkip} disabled={busy}
            style={{ opacity: canSkip ? 1 : 0, pointerEvents: canSkip ? 'auto' : 'none' }}
          >{t('wsLater')}</button>
          <p className="su-privacy">
            <Icon name="lock" size={12} style={{ verticalAlign: '-2px', marginInlineEnd: '0.35em' }} />{t('wsPrivacy')}
          </p>
        </div>
      </div>

      {sheet && (
        <AssetSheet
          cat={sheet.cat}
          current={sheet.row != null ? rows[sheet.row]?.asset : null}
          prices={prices}
          onPrices={p => setPrices(prev => ({ ...prev, ...p }))}
          onPick={pick}
          onClose={() => setSheet(null)}
        />
      )}

      {confirmSkip && (
        <div className="bs-confirm-overlay" onClick={() => setConfirmSkip(false)}>
          <div className="bs-confirm-card" onClick={e => e.stopPropagation()}>
            <h4 className="bs-confirm-title">{t('wsSkipTitle')}</h4>
            <p className="bs-confirm-text">{t('wsSkipText')}</p>
            <div className="bs-confirm-actions">
              <button className="bs-confirm-go" style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                onClick={() => setConfirmSkip(false)}>
                {t('wsAddBalance')}
              </button>
              <button className="bs-confirm-switch" onClick={skip} disabled={busy}>{t('wsSkipAnyway')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function hasStarted() {
  try { return localStorage.getItem(STARTED_KEY) === '1' } catch { return false }
}
