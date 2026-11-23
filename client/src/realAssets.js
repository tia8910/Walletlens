// Real assets: the things in the "Other" category that are not traded on a
// market (a flat, a car, a watch, a painting, a business, money someone owes).
//
// The portfolio already holds them as transactions under an other: id. This
// keeps what a market price cannot know about each one, on this device and
// in the backup: what it is, what it earns, what is still owed on it, and how
// its value tends to move. From that the app estimates today's value, the
// range around it, what is really yours, the yield, how long it would take to
// sell, and the notes worth reading. Nothing here leaves the phone.

import { loadData, saveData } from './data/storage'

export const RA_STORE = 'real_assets'
export const KINDS = ['home', 'car', 'gem', 'art', 'biz', 'owed', 'other']
export const USES = ['home', 'rent', 'resell']
const DAY = 86_400_000
const YEAR = 365.25 * DAY

/** Typical yearly change in value, percent: a starting point the owner can change. */
export const DEFAULT_GROWTH = { home: 5, car: -15, gem: 2, art: 3, biz: 0, owed: 0, other: 0 }
/** Roughly how long it takes to turn each kind into cash, in days. */
export const SELL_DAYS = { home: 90, car: 21, gem: 30, art: 60, biz: 180, owed: 30, other: 30 }

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const pos = (v) => { const n = num(v); return n != null && n > 0 ? n : null }
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(v) ? v : null)
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Only known fields, of the right types, so a stored row can never be junk. */
export function sanitizeMeta(m = {}) {
  const kind = KINDS.includes(m.kind) ? m.kind : 'other'
  const growth = num(m.growth)
  const out = {
    kind,
    growth: growth == null ? DEFAULT_GROWTH[kind] : Math.max(-50, Math.min(50, growth)),
  }
  const a = m.anchor
  if (a && pos(a.price) && num(a.at)) out.anchor = { price: pos(a.price), at: num(a.at) }
  if (kind === 'home') {
    out.use = USES.includes(m.use) ? m.use : 'home'
    if (text(m.city, 60)) out.city = text(m.city, 60)
    if (pos(m.size)) out.size = pos(m.size)
  }
  if (kind === 'car') {
    const y = num(m.year)
    if (y && y > 1950 && y < 2100) out.year = Math.round(y)
    if (pos(m.km)) out.km = pos(m.km)
  }
  if (pos(m.rent)) out.rent = pos(m.rent)
  if (pos(m.loanLeft)) out.loanLeft = pos(m.loanLeft)
  if (pos(m.loanMonthly)) out.loanMonthly = pos(m.loanMonthly)
  if (pos(m.costs)) out.costs = pos(m.costs)
  if (day(m.insuranceDue)) out.insuranceDue = day(m.insuranceDue)
  if (day(m.dueDate)) out.dueDate = day(m.dueDate)
  return out
}

export function loadRealAssets() {
  const v = loadData(RA_STORE, {})
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}
export function getRealAsset(id) { return loadRealAssets()[id] || null }
export function saveRealAsset(id, meta) {
  if (!String(id || '').startsWith('other:')) return null
  const all = loadRealAssets()
  all[id] = sanitizeMeta(meta)
  saveData(RA_STORE, all)
  return all[id]
}
export function removeRealAsset(id) {
  const all = loadRealAssets()
  delete all[id]
  saveData(RA_STORE, all)
}

/** A real price, as of now: the estimate starts again from it. */
export function setRealValue(id, unitPrice, now = Date.now()) {
  const m = getRealAsset(id)
  if (!m || !(unitPrice > 0)) return null
  return saveRealAsset(id, { ...m, anchor: { price: unitPrice, at: now } })
}

const WORDS = {
  home: ['real-estate', 'real estate', 'realestate', 'property', 'apartment', 'appartment', 'house', 'home', 'villa', 'flat', 'land', 'plot', 'building', 'condo', 'عقار', 'شقة', 'منزل', 'بيت', 'فيلا', 'أرض', 'ارض', 'maison', 'appartement', 'terrain', 'immobil', 'inmueble', 'casa', 'piso', 'wohnung', 'grundstück', 'appartamento'],
  car: ['car', 'vehicle', 'auto', 'truck', 'motor', 'bike', 'سيارة', 'عربية', 'voiture', 'coche', 'carro', 'wagen', 'macchina'],
  gem: ['watch', 'rolex', 'jewel', 'jewelry', 'ring', 'diamond', 'ساعة', 'مجوهرات', 'ذهب', 'montre', 'bijou', 'reloj', 'joya', 'uhr', 'schmuck', 'orologio', 'gioiell'],
  art: ['art', 'painting', 'collect', 'nft', 'stamp', 'لوحة', 'تحف', 'tableau', 'cuadro', 'gemälde', 'quadro'],
  biz: ['business', 'company', 'shop', 'store', 'startup', 'share in', 'شركة', 'محل', 'entreprise', 'empresa', 'firma', 'azienda'],
  owed: ['loan to', 'owed', 'lent', 'debt', 'iou', 'سلفة', 'دين', 'prêt', 'préstamo', 'darlehen', 'prestito'],
}

/** What an Other asset is: as the owner said, else a guess from its name. */
export function kindFor(id, meta = getRealAsset(id), name = '') {
  if (meta?.kind && meta.kind !== 'other') return meta.kind
  const s = `${String(id || '').replace(/^other:/, '')} ${name}`.toLowerCase()
  for (const k of ['home', 'car', 'gem', 'art', 'biz', 'owed']) if (WORDS[k].some(w => s.includes(w))) return k
  return meta?.kind || 'other'
}

/**
 * Today's price per unit, from the last real price and the yearly change.
 * Null when the owner has not given a starting point, so the plain manual
 * price stands.
 */
export function estimatedPrice(meta, now = Date.now()) {
  const a = meta?.anchor
  if (!a || !(a.price > 0)) return null
  const years = Math.max(0, (now - a.at) / YEAR)
  const g = (num(meta.growth) ?? 0) / 100
  return a.price * Math.pow(1 + g, years)
}

/** Estimated prices for every Other asset that has a starting point. */
export function estimatedPrices(now = Date.now(), all = loadRealAssets()) {
  const out = {}
  for (const [id, meta] of Object.entries(all)) {
    const p = estimatedPrice(meta, now)
    if (p > 0) out[id] = p
  }
  return out
}

/** Months since the value was last set from a real price. */
export const monthsSince = (at, now = Date.now()) => (at ? Math.floor((now - at) / (YEAR / 12)) : null)

/**
 * The numbers the asset page shows. `holding` is the portfolio row
 * ({ amount, total_invested }), `unit` the current price per unit.
 */
export function summarize(meta, holding, unit, now = Date.now()) {
  const m = meta || { kind: 'other', growth: 0 }
  const value = Math.max(0, (Number(holding?.amount) || 0) * (Number(unit) || 0))
  const invested = Number(holding?.total_invested) || 0
  const age = m.anchor ? Math.max(0, (now - m.anchor.at) / YEAR) : 0
  const estimated = !!m.anchor && age > 1 / 365
  const spread = estimated ? Math.min(0.2, 0.05 + 0.02 * age) : 0
  const loan = m.loanLeft || 0
  const rent = m.rent || 0
  const costs = m.costs || 0
  return {
    kind: m.kind,
    value,
    low: value * (1 - spread),
    high: value * (1 + spread),
    estimated,
    gainPct: invested > 0 ? ((value - invested) / invested) * 100 : null,
    gain: value - invested,
    loan,
    equity: Math.max(0, value - loan),
    equityPct: value > 0 ? Math.max(0, Math.min(100, ((value - loan) / value) * 100)) : 0,
    rent,
    yieldPct: value > 0 && rent ? (rent * 12 / value) * 100 : null,
    netMonthly: rent - costs - (m.loanMonthly || 0),
    costs,
    sellDays: SELL_DAYS[m.kind] || 30,
    growth: num(m.growth) ?? 0,
    nextYear: value * (Math.pow(1 + (num(m.growth) ?? 0) / 100, 1) - 1),
  }
}

/** Value at the end of each of the next `years` years, with today first. */
export function projection(value, growthPct, years = 5) {
  const g = (Number(growthPct) || 0) / 100
  return Array.from({ length: years + 1 }, (_, i) => value * Math.pow(1 + g, i))
}

/** Value at each year from the purchase to `ahead` years from now, for a falling-value chart. */
export function valueByYear(meta, now = Date.now(), ahead = 4) {
  const a = meta?.anchor
  if (!a) return []
  const g = (num(meta.growth) ?? 0) / 100
  const startYear = meta.year || new Date(a.at).getFullYear()
  const thisYear = new Date(now).getFullYear()
  const out = []
  for (let y = startYear; y <= thisYear + ahead; y++) {
    const at = new Date(y, 6, 1).getTime()
    out.push({ year: y, value: a.price * Math.pow(1 + g, (at - a.at) / YEAR), past: y <= thisYear })
  }
  return out
}

/**
 * The notes worth reading, most useful first. `ctx`: { now, inPlan } where
 * inPlan says whether Portfolio Guardian's legacy plan already covers it.
 */
export function notesFor(meta, sum, ctx = {}) {
  const now = ctx.now ?? Date.now()
  const out = []
  if (!meta) return out
  const months = monthsSince(meta.anchor?.at, now)
  if (months != null && months >= 12) out.push({ id: 'stale', months, tone: 'warn' })
  if (meta.insuranceDue) {
    const days = Math.ceil((new Date(meta.insuranceDue).getTime() - now) / DAY)
    if (days >= 0 && days <= 45) out.push({ id: 'insurance', days, tone: 'warn' })
  }
  if (meta.kind === 'car' && sum.growth < 0) {
    const age = meta.year ? new Date(now).getFullYear() - meta.year : null
    if (age != null && age >= 3) out.push({ id: 'sellCar', age, tone: 'info' })
  }
  if (meta.rent && meta.loanMonthly) out.push({ id: 'rentCovers', times: meta.rent / meta.loanMonthly, tone: meta.rent >= meta.loanMonthly ? 'good' : 'warn' })
  if (sum.yieldPct != null && sum.yieldPct < 3) out.push({ id: 'lowYield', pct: sum.yieldPct, tone: 'info' })
  if (sum.yieldPct != null && sum.yieldPct >= 6) out.push({ id: 'goodYield', pct: sum.yieldPct, tone: 'good' })
  if (meta.dueDate) {
    const days = Math.ceil((new Date(meta.dueDate).getTime() - now) / DAY)
    out.push({ id: days < 0 ? 'owedLate' : 'owedDue', days: Math.abs(days), tone: days < 0 ? 'warn' : 'info' })
  }
  if (ctx.inPlan === false) out.push({ id: 'legacy', tone: 'info' })
  if (!meta.anchor) out.push({ id: 'noStart', tone: 'info' })
  return out
}

/**
 * How fast everything owned turns into cash: today (markets, cash), within
 * weeks, within months. `rows` are portfolio rows with { coin_id, value }.
 */
export function cashLadder(rows, all = loadRealAssets()) {
  const out = { today: 0, weeks: 0, months: 0 }
  for (const h of rows || []) {
    const v = Number(h.value) || 0
    if (!(v > 0)) continue
    if (!String(h.coin_id || '').startsWith('other:')) { out.today += v; continue }
    const days = SELL_DAYS[kindFor(h.coin_id, all[h.coin_id], h.coin_name || h.coin_symbol || '')] || 30
    if (days <= 31) out.weeks += v
    else out.months += v
  }
  return out
}

/** Loans still owed on what is held. */
export function loansOn(rows, all = loadRealAssets()) {
  let s = 0
  for (const h of rows || []) s += all[h.coin_id]?.loanLeft || 0
  return s
}

/** Monthly income from what is held (rent, net of logged costs is shown per asset). */
export function monthlyIncome(rows, all = loadRealAssets()) {
  let s = 0
  for (const h of rows || []) s += all[h.coin_id]?.rent || 0
  return s
}

/** The jobs worth doing across every real asset, soonest first. */
export function todoList(rows, all = loadRealAssets(), now = Date.now()) {
  const out = []
  for (const h of rows || []) {
    const m = all[h.coin_id]
    if (!m) continue
    const name = h.coin_name || h.coin_symbol || String(h.coin_id).slice(6)
    const months = monthsSince(m.anchor?.at, now)
    if (months != null && months >= 12) out.push({ id: h.coin_id, what: 'value', name, months, at: m.anchor.at + YEAR })
    if (m.insuranceDue) {
      const days = Math.ceil((new Date(m.insuranceDue).getTime() - now) / DAY)
      if (days >= 0 && days <= 60) out.push({ id: h.coin_id, what: 'insurance', name, days, at: now + days * DAY })
    }
    if (m.dueDate) {
      const days = Math.ceil((new Date(m.dueDate).getTime() - now) / DAY)
      if (days <= 30) out.push({ id: h.coin_id, what: days < 0 ? 'owedLate' : 'owedDue', name, days: Math.abs(days), at: now + days * DAY })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** The id a new real asset is saved under, unique among what is held. */
export function newAssetId(name, taken = []) {
  const base = String(name || 'asset').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 40) || 'asset'
  let id = `other:${base}`
  for (let i = 2; taken.includes(id); i++) id = `other:${base}-${i}`
  return id
}
