import { useEffect, useState } from 'react'
import { dataUrl } from './apiHosts'

// Smart money flow, per holding.
//
// The same hourly file the ticker reads (smartmoney.json, published by the
// data cron from Nansen's smart-money netflow). Never Nansen directly: Nansen
// bills by credit, and a badge on every crypto row of every portfolio would
// tie the bill to traffic.
//
// One request serves every badge and card on the page. The promise is shared
// and kept for REFRESH_MS, so ten holdings are one fetch, not ten.

const REFRESH_MS = 15 * 60_000

let cache = null   // { at, promise }

export function loadMoneyFlow(now = Date.now()) {
  if (cache && now - cache.at < REFRESH_MS) return cache.promise
  const promise = fetch(dataUrl('smartmoney.json'), { signal: AbortSignal.timeout(8000) })
    .then(r => (r.ok ? r.json() : null))
    .then(d => indexFlows(d))
    .catch(() => null)
  cache = { at: now, promise }
  // A failed load is not kept for the full window: the next mount tries again.
  promise.then(v => { if (!v && cache?.promise === promise) cache = null })
  return promise
}

/** { updated, bySymbol: Map<SYMBOL, flow> } or null when there is nothing usable. */
export function indexFlows(data) {
  if (!data || !Array.isArray(data.flows) || !data.flows.length) return null
  const bySymbol = new Map()
  for (const f of data.flows) {
    const s = String(f?.symbol || '').toUpperCase()
    if (s && Number.isFinite(f.netflow)) bySymbol.set(s, f)
  }
  return bySymbol.size ? { updated: data.updated || null, bySymbol } : null
}

// Nansen labels wallets on chains, so the majors show up under their wrapped
// and bridged tickers: bitcoin moves on Ethereum as WBTC and cbBTC, and on BNB
// Chain as BTCB. Summing them is the closest on-chain reading of "smart money
// in BTC" there is.
export const FLOW_ALIASES = {
  BTC: ['BTC', 'WBTC', 'CBBTC', 'TBTC', 'BTCB'],
  ETH: ['ETH', 'WETH'],
  SOL: ['SOL', 'WSOL'],
  BNB: ['BNB', 'WBNB'],
  AVAX: ['AVAX', 'WAVAX'],
  POL: ['POL', 'MATIC', 'WPOL', 'WMATIC'],
  MATIC: ['MATIC', 'POL', 'WMATIC', 'WPOL'],
}

/** The flow for one ticker, with its wrapped forms folded in. Null when untracked. */
export function flowFor(index, symbol) {
  if (!index || !symbol) return null
  const sym = String(symbol).toUpperCase()
  const names = FLOW_ALIASES[sym] || [sym]
  const hits = names.map(n => index.bySymbol.get(n)).filter(Boolean)
  if (!hits.length) return null
  const sum = (k) => {
    const vals = hits.map(h => h[k]).filter(v => Number.isFinite(v))
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }
  return {
    symbol: sym,
    netflow: sum('netflow'),
    netflow7d: sum('netflow7d'),
    netflow30d: sum('netflow30d'),
    traders: sum('traders'),
    updated: index.updated,
  }
}

// Below this a day's net flow is noise, not a position being built.
export const FLAT_USD = 50_000
// Above this, and agreeing with the week, it is conviction.
export const STRONG_USD = 1_000_000

/**
 * inflow / outflow, and how strongly.
 *
 * "Strong" needs both size and agreement: a large 24h inflow against a week of
 * selling is a bounce in the flow, not accumulation, so it stays plain inflow.
 */
export function flowStatus(f) {
  if (!f || !Number.isFinite(f.netflow)) return null
  const d = f.netflow
  if (Math.abs(d) < FLAT_USD) return 'flat'
  const weekAgrees = !Number.isFinite(f.netflow7d) || Math.sign(f.netflow7d) === Math.sign(d)
  if (d > 0) return d >= STRONG_USD && weekAgrees ? 'strongIn' : 'in'
  return -d >= STRONG_USD && weekAgrees ? 'strongOut' : 'out'
}

export const FLOW_TONE = {
  strongIn: 'up', in: 'up', flat: 'flat', out: 'dn', strongOut: 'dn',
}

export const FLOW_LABEL_KEY = {
  strongIn: 'mfStrongIn', in: 'mfIn', flat: 'mfFlat', out: 'mfOut', strongOut: 'mfStrongOut',
}

/** $12.4M, $840K, $1.2B, always with a sign when asked. */
export function fmtUsdShort(n, signed = false) {
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(1)}B`
    : a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M`
    : a >= 1e3 ? `$${Math.round(a / 1e3)}K`
    : `$${Math.round(a)}`
  if (!signed) return s
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s}`
}

/** The shared index, or null while loading / when unavailable. */
export function useMoneyFlow(enabled = true) {
  const [index, setIndex] = useState(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    loadMoneyFlow().then(v => { if (alive) setIndex(v) })
    return () => { alive = false }
  }, [enabled])
  return index
}
