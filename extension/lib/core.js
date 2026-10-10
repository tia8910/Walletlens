// WalletLens extension core: everything the popup and the background worker
// share. Holdings math, prices for every asset class, currencies, signals,
// the net worth history kept on this device, and alert checks.
//
// Nothing here sends a balance, an amount or an address anywhere. The only
// outside requests are public price, rate and news lookups by asset id.

export const ext = globalThis.browser ?? globalThis.chrome

export const SITE = 'https://walletlens.live'
export const STORAGE_KEY = 'wl_portfolio_cache'
export const SETTINGS_KEY = 'wl_ext_settings'
export const HISTORY_KEY = 'wl_nw_history'      // [{ d: 'YYYY-MM-DD', v: usd }]
export const INTRADAY_KEY = 'wl_nw_intraday'    // [{ t: ms, v: usd }] last 24h
export const RATES_KEY = 'wl_fx_rates'
export const PRICE_CACHE_KEY = 'wl_price_cache_v2'

const CG = 'https://api.coingecko.com/api/v3'
const PROXY = u => `https://walletlens-voice.tarek-abdelhameed.workers.dev/proxy?url=${encodeURIComponent(u)}`
export const NEWS_URL = SITE + '/news.json'
const PRICE_TTL = 2 * 60 * 1000

// ── Storage ────────────────────────────────────────────────────────────────

export const get = (key, fallback = null) =>
  new Promise(r => ext.storage.local.get(key, x => r(x?.[key] ?? fallback)))
export const set = (key, value) =>
  new Promise(r => ext.storage.local.set({ [key]: value }, () => r()))

export const DEFAULT_SETTINGS = {
  currency: 'USD',
  hideBalances: false,
  badge: true,
  alerts: [],               // { id, kind: 'above'|'below', coinId, symbol, name, usd, on, firedAt }
  moveAlert: { on: true, pct: 3, lastDay: '' },
  digest: { on: false, hour: 9, lastDay: '' },
}
export async function getSettings() {
  const s = await get(SETTINGS_KEY, {})
  return { ...DEFAULT_SETTINGS, ...s, moveAlert: { ...DEFAULT_SETTINGS.moveAlert, ...(s.moveAlert || {}) }, digest: { ...DEFAULT_SETTINGS.digest, ...(s.digest || {}) }, alerts: Array.isArray(s.alerts) ? s.alerts : [] }
}
export async function saveSettings(patch) {
  const s = { ...(await getSettings()), ...patch }
  await set(SETTINGS_KEY, s)
  return s
}

// ── Fetch with the proxy as a fallback ────────────────────────────────────────

async function fetchFirst(urls, parse = r => r.json(), timeout = 8000) {
  for (const u of urls) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(timeout) })
      if (!res.ok) continue
      const v = await parse(res)
      if (v != null) return v
    } catch {}
  }
  return null
}
const both = u => [u, PROXY(u)]

// ── Holdings ─────────────────────────────────────────────────────────────────

export const NON_CRYPTO_RE = /^(stock|metal|fiat|bond|other|real|cash):/
export const isCrypto = id => !NON_CRYPTO_RE.test(id)

/** The asset class a holding belongs to, for the allocation and the filter. */
export function assetClass(id) {
  if (id.startsWith('stock:')) return 'stocks'
  if (id.startsWith('metal:')) return 'metals'
  if (id.startsWith('fiat:') || id.startsWith('cash:')) return 'cash'
  if (id.startsWith('real:')) return 'property'
  if (id.startsWith('bond:') || id.startsWith('other:')) return 'other'
  return 'crypto'
}

export function computeHoldings(transactions, walletId = 'all') {
  const map = new Map()
  for (const tx of transactions || []) {
    if (walletId !== 'all' && String(tx.wallet_id) !== String(walletId)) continue
    const id = String(tx.coin_id || '').trim()
    if (!id) continue
    const qty = Number(tx.amount ?? tx.quantity ?? 0)
    const cost = Number(tx.total_cost ?? (qty * (tx.price_per_unit ?? 0)))
    if (!isFinite(qty)) continue
    if (!map.has(id)) map.set(id, { coin_id: id, coin_symbol: tx.coin_symbol || id, coin_name: tx.coin_name || id, coin_image: tx.coin_image || '', amount: 0, totalCost: 0 })
    const h = map.get(id)
    if (tx.coin_symbol) h.coin_symbol = tx.coin_symbol
    if (tx.coin_name) h.coin_name = tx.coin_name
    if (tx.coin_image && !h.coin_image) h.coin_image = tx.coin_image
    const type = (tx.type || '').toLowerCase()
    if (type === 'buy' || type === 'deposit') { h.amount += qty; h.totalCost += isFinite(cost) ? cost : 0 }
    if (type === 'sell' || type === 'withdraw') {
      // Selling takes cost out at the average price, so P&L stays honest.
      const avg = h.amount > 0 ? h.totalCost / h.amount : 0
      h.amount -= qty; h.totalCost -= avg * qty
    }
  }
  for (const [id, h] of map) if (h.amount < 1e-9) map.delete(id)
  return map
}

// ── Prices ─────────────────────────────────────────────────────────────────

async function cryptoPrices(ids) {
  if (!ids.length) return {}
  const key = ids.slice().sort().join(',')
  try {
    const c = await get(PRICE_CACHE_KEY)
    if (c && c.key === key && Date.now() - c.at < PRICE_TTL) return c.prices
  } catch {}
  // One call: price, 24h change, logo and a 7 day sparkline for every coin.
  const url = `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(key)}&per_page=250&page=1&sparkline=true&price_change_percentage=24h`
  const list = await fetchFirst(both(url), async r => { const j = await r.json(); return Array.isArray(j) && j.length ? j : null })
  const prices = {}
  if (list) {
    for (const c of list) {
      if (!c?.id) continue
      const spark = c.sparkline_in_7d?.price
      prices[c.id] = { usd: c.current_price, chg: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0, image: c.image || '', spark: Array.isArray(spark) ? thin(spark, 28) : null }
    }
  } else {
    const simple = await fetchFirst(both(`${CG}/simple/price?ids=${encodeURIComponent(key)}&vs_currencies=usd&include_24hr_change=true`))
    for (const [id, v] of Object.entries(simple || {})) prices[id] = { usd: v.usd, chg: v.usd_24h_change ?? 0 }
  }
  if (Object.keys(prices).length) await set(PRICE_CACHE_KEY, { key, prices, at: Date.now() })
  return prices
}
const thin = (arr, n) => arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.round(i * (arr.length - 1) / (n - 1))])

export async function stockQuotes(symbols) {
  if (!symbols.length) return {}
  const url = `https://stooq.com/q/l/?s=${symbols.join('%3B')}&f=sd2t2ohlcvn&h&e=csv`
  const text = await fetchFirst(both(url), r => r.text(), 8000)
  const out = {}
  if (!text) return out
  text.trim().split('\n').slice(1).forEach((line, i) => {
    const c = line.split(','), open = parseFloat(c[3]), close = parseFloat(c[6])
    if (isFinite(close) && close > 0) out[symbols[i]] = { usd: close, chg: isFinite(open) && open > 0 ? (close - open) / open * 100 : null }
  })
  return out
}

const METAL_CODE = { 'metal:xau': 'XAU', 'metal:xag': 'XAG', 'metal:xcu': 'XCU', 'metal:xpt': 'XPT' }
export async function metalPrice(code) {
  const j = await fetchFirst(both(`https://api.gold-api.com/price/${code}`), r => r.json(), 6000)
  return j?.price > 0 ? j.price : null
}

/** USD per one unit of every currency, cached for six hours. */
export async function fxRates() {
  const c = await get(RATES_KEY)
  if (c && Date.now() - c.at < 6 * 3600e3) return c.rates
  const j = await fetchFirst(both('https://open.er-api.com/v6/latest/USD'))
  if (j?.rates) { await set(RATES_KEY, { rates: j.rates, at: Date.now() }); return j.rates }
  return c?.rates || { USD: 1 }
}

/** Every holding priced in USD, by the right source for its class. */
export async function priceAll(map) {
  const ids = [...map.keys()]
  const crypto = ids.filter(isCrypto)
  const stocks = ids.filter(id => id.startsWith('stock:'))
  const metals = ids.filter(id => id.startsWith('metal:'))
  const fiats = ids.filter(id => id.startsWith('fiat:'))
  const [cp, sq, rates, ...mp] = await Promise.all([
    cryptoPrices([...new Set([...crypto, 'bitcoin', 'ethereum'])]),
    stockQuotes(stocks.map(id => id.slice(6).toLowerCase() + '.us')),
    fiats.length ? fxRates() : Promise.resolve({}),
    ...metals.map(id => metalPrice(METAL_CODE[id])),
  ])
  const out = { ...cp }
  stocks.forEach(id => { const q = sq[id.slice(6).toLowerCase() + '.us']; if (q) out[id] = q })
  metals.forEach((id, i) => { if (mp[i]) out[id] = { usd: mp[i], chg: null } })
  fiats.forEach(id => { const r = rates[id.slice(5).toUpperCase()]; if (r > 0) out[id] = { usd: 1 / r, chg: 0 } })
  // Bonds, property and anything without a market are valued at cost, so they
  // still count toward the total instead of disappearing.
  for (const [id, h] of map) if (!out[id]?.usd && h.amount > 0 && h.totalCost > 0) out[id] = { usd: h.totalCost / h.amount, chg: null, estimated: true }
  return out
}

/** Rows sorted by value, with totals. */
export function summarize(map, prices) {
  const rows = [...map.values()].map(h => {
    const p = prices[h.coin_id]
    const value = p?.usd != null ? h.amount * p.usd : null
    return { h, value, chg: p?.chg ?? null, spark: p?.spark || null, image: p?.image || '', pnl: value != null && h.totalCost > 0 ? value - h.totalCost : null, cls: assetClass(h.coin_id) }
  }).sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
  let total = 0, prev = 0, cost = 0
  for (const r of rows) {
    if (r.value == null) continue
    total += r.value; cost += r.h.totalCost || 0
    prev += isFinite(r.chg) && r.chg !== null ? r.value / (1 + r.chg / 100) : r.value
  }
  const dayChange = total - prev
  return { rows, total, cost, dayChange, dayPct: prev > 0 ? dayChange / prev * 100 : 0, pnl: cost > 0 ? total - cost : null, pnlPct: cost > 0 ? (total - cost) / cost * 100 : null }
}

/** Read the portfolio, price it and sum it. Null when there is nothing synced yet. */
export async function loadPortfolio(walletId = 'all') {
  const data = await get(STORAGE_KEY)
  if (!data || !Array.isArray(data.transactions) || !data.transactions.length) return null
  const map = computeHoldings(data.transactions, walletId)
  const prices = await priceAll(map)
  return { data, map, prices, ...summarize(map, prices) }
}

// ── Currency formatting ─────────────────────────────────────────────────────

export const CURRENCIES = [
  ['USD', '🇺🇸', '$'], ['EUR', '🇪🇺', '€'], ['GBP', '🇬🇧', '£'], ['AED', '🇦🇪', 'AED '], ['SAR', '🇸🇦', 'SAR '],
  ['EGP', '🇪🇬', 'EGP '], ['KWD', '🇰🇼', 'KWD '], ['QAR', '🇶🇦', 'QAR '], ['TRY', '🇹🇷', '₺'], ['INR', '🇮🇳', '₹'],
  ['JPY', '🇯🇵', '¥'], ['CAD', '🇨🇦', 'C$'], ['AUD', '🇦🇺', 'A$'], ['CHF', '🇨🇭', 'CHF '], ['MAD', '🇲🇦', 'MAD '],
]
export function money(usd, cur = 'USD', rates = { USD: 1 }, { compact = false, sign = false } = {}) {
  if (usd == null || !isFinite(usd)) return '—'
  // Without a rate for the currency yet, stay in dollars rather than mislabel.
  const code = cur === 'USD' || rates?.[cur] > 0 ? cur : 'USD'
  const v = usd * (code === 'USD' ? 1 : rates[code])
  const sym = (CURRENCIES.find(c => c[0] === code) || ['', '', code + ' '])[2]
  const a = Math.abs(v)
  let s
  if (compact && a >= 1e9) s = (a / 1e9).toFixed(2) + 'B'
  else if (compact && a >= 1e6) s = (a / 1e6).toFixed(2) + 'M'
  else if (compact && a >= 1e4) s = (a / 1e3).toFixed(1) + 'K'
  else s = a.toLocaleString('en-US', { minimumFractionDigits: a >= 1000 ? 0 : 2, maximumFractionDigits: a >= 1000 ? 0 : a >= 1 ? 2 : 6 })
  return (v < 0 ? '-' : sign ? '+' : '') + sym + s
}
export const pct = (p, d = 2) => p == null || !isFinite(p) ? '—' : (p >= 0 ? '+' : '') + p.toFixed(d) + '%'
export function amount(n) {
  if (!isFinite(n)) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return n.toPrecision(4).replace(/\.?0+$/, '')
}

// ── Net worth history (kept only on this device) ────────────────────────────

const today = () => new Date().toISOString().slice(0, 10)
export async function recordSnapshot(total) {
  if (!(total > 0)) return
  const hist = await get(HISTORY_KEY, [])
  const d = today()
  const last = hist[hist.length - 1]
  if (last && last.d === d) last.v = total; else hist.push({ d, v: total })
  await set(HISTORY_KEY, hist.slice(-800))
  const now = Date.now()
  const intra = (await get(INTRADAY_KEY, [])).filter(p => now - p.t < 24 * 3600e3)
  if (!intra.length || now - intra[intra.length - 1].t > 10 * 60e3) intra.push({ t: now, v: total })
  else intra[intra.length - 1] = { t: now, v: total }
  await set(INTRADAY_KEY, intra)
}
/** Points for a range: '1D' uses the intraday log, the rest the daily one. */
export async function historyFor(range) {
  if (range === '1D') return (await get(INTRADAY_KEY, [])).map(p => p.v)
  const days = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }[range] || 7
  return (await get(HISTORY_KEY, [])).slice(-days).map(p => p.v)
}

// ── Signals (educational) ───────────────────────────────────────────────────

export async function ohlc(coinId, days = 30) {
  return fetchFirst(both(`${CG}/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=${days}`), async r => { const j = await r.json(); return Array.isArray(j) && j.length ? j : null })
}
function ema(arr, n) { const k = 2 / (n + 1); let e = arr[0]; for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k); return e }
export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null
  let g = 0, l = 0
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) g += d; else l -= d }
  let ag = g / period, al = l / period
  for (let i = period + 1; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; ag = (ag * (period - 1) + Math.max(d, 0)) / period; al = (al * (period - 1) + Math.max(-d, 0)) / period }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al)
}
/**
 * A read for one coin from its candles: EMA 9 against EMA 21 for the trend,
 * RSI 14 for momentum, and ATR for a stop and three targets.
 */
export function signalFrom(candles) {
  if (!candles || candles.length < 30) return null
  const closes = candles.map(c => c[4]), last = closes[closes.length - 1]
  const e9 = ema(closes.slice(-60), 9), e21 = ema(closes.slice(-60), 21), r = rsi(closes)
  const trs = candles.slice(-15).map((c, i, a) => i ? Math.max(c[2] - c[3], Math.abs(c[2] - a[i - 1][4]), Math.abs(c[3] - a[i - 1][4])) : c[2] - c[3])
  const atr = trs.reduce((s, x) => s + x, 0) / trs.length
  let action = 'hold'
  if (e9 > e21 && r != null && r < 70) action = 'buy'
  else if (e9 < e21 && r != null && r > 30) action = 'sell'
  const dir = action === 'sell' ? -1 : 1
  const why = `${e9 > e21 ? 'EMA 9 above 21' : 'EMA 9 below 21'} · RSI ${r == null ? '—' : Math.round(r)}`
  return { action, rsi: r, why, last, stop: last - dir * 1.5 * atr, tp: [1.5, 3, 4.5].map(k => last + dir * k * atr) }
}

// ── Market ─────────────────────────────────────────────────────────────────

export async function fearGreed() {
  const j = await fetchFirst(['https://api.alternative.me/fng/?limit=8'], r => r.json(), 6000)
  const d = j?.data
  if (!Array.isArray(d) || !d.length) return null
  return { now: +d[0].value, label: d[0].value_classification, yesterday: d[1] ? +d[1].value : null, week: d[7] ? +d[7].value : null }
}
export async function news() {
  const j = await fetchFirst([NEWS_URL], r => r.json(), 6000)
  return (Array.isArray(j) ? j : j?.articles || []).slice(0, 30)
}

// ── Alerts ─────────────────────────────────────────────────────────────────

/**
 * Checks every alert against current prices and the portfolio's day move.
 * Returns the notifications to show and the settings to save. A price alert
 * fires once and switches itself off; the move alert and the digest fire at
 * most once a day.
 */
export function evaluateAlerts(settings, { prices, dayPct, total, now = new Date() }) {
  const notes = []
  const s = structuredClone(settings)
  for (const a of s.alerts) {
    if (!a.on) continue
    const p = prices[a.coinId]?.usd
    if (!(p > 0)) continue
    if ((a.kind === 'above' && p >= a.usd) || (a.kind === 'below' && p <= a.usd)) {
      notes.push({ id: 'alert-' + a.id, title: `${a.name} ${a.kind === 'above' ? 'rose above' : 'fell below'} ${money(a.usd, s.currency, s._rates)}`, message: `Now ${money(p, s.currency, s._rates)}. This alert is now off; set a new one any time.` })
      a.on = false; a.firedAt = now.getTime()
    }
  }
  const day = now.toISOString().slice(0, 10)
  if (s.moveAlert.on && s.moveAlert.lastDay !== day && isFinite(dayPct) && Math.abs(dayPct) >= s.moveAlert.pct) {
    notes.push({ id: 'move-' + day, title: `Your net worth is ${dayPct >= 0 ? 'up' : 'down'} ${Math.abs(dayPct).toFixed(1)}% today`, message: s.hideBalances ? 'Open WalletLens to see what moved.' : `Now ${money(total, s.currency, s._rates)}.` })
    s.moveAlert.lastDay = day
  }
  if (s.digest.on && s.digest.lastDay !== day && now.getHours() >= s.digest.hour) {
    notes.push({ id: 'digest-' + day, title: 'Your morning summary', message: s.hideBalances ? `Net worth ${pct(dayPct)} in the last 24 hours.` : `Net worth ${money(total, s.currency, s._rates)}, ${pct(dayPct)} in the last 24 hours.` })
    s.digest.lastDay = day
  }
  delete s._rates
  return { notes, settings: s }
}

/** The toolbar badge: today's change, green or red. */
export function badgeFor(dayPct) {
  if (!isFinite(dayPct)) return { text: '', color: '#10b981' }
  const a = Math.abs(dayPct)
  const text = (dayPct >= 0 ? '+' : '-') + (a >= 10 ? Math.round(a) : a.toFixed(1))
  return { text: text.slice(0, 4), color: dayPct >= 0 ? '#10b981' : '#ef4444' }
}
