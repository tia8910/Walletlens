import { useState, useMemo, useEffect } from 'react'
import Icon from './Icon'
import { track, trackAI } from '../analytics'
import { api } from '../api'
import { buildTASellPlan } from '../technicals'
import { isStablecoin } from '../stablecoins'
import { useLanguage } from '../LanguageContext'
import { setStopAlarm, stopAlarmKeys } from '../targetAlarms'

// Fallback rule-based plan (P&L + concentration + 24h momentum) — used when no
// technical analysis is available for the holding (non-crypto, or too little
// price history). Returns { action, urgency, targets, reason }.
function ruleBasedPlan(h, price, value, pnlPct, weight, chg24) {
  let action, targets, reason, urgency
  if (pnlPct >= 200) {
      action  = 'TAKE PROFIT'
      urgency = 'high'
      targets = [
        { label: 'Sell 40% now', price: price, note: 'Lock in 200%+ gains — secure original capital' },
        { label: 'Sell 30% at +250%', price: +(h.total_invested / h.amount * 3.5).toFixed(4), note: 'Trail remaining position' },
        { label: 'Hold 30%', price: null, note: 'Let final position run with stop-loss at break-even' },
      ]
      reason = `Up ${pnlPct.toFixed(0)}% — time to systematically de-risk.`
    } else if (pnlPct >= 100) {
      action  = 'PARTIAL SELL'
      urgency = 'medium'
      targets = [
        { label: 'Sell 25% now', price: price, note: 'Return original investment' },
        { label: 'Sell 25% at +150%', price: +(price * 1.25).toFixed(4), note: 'Second tranche at higher level' },
        { label: 'Hold 50%', price: null, note: 'Keep upside exposure' },
      ]
      reason = `Up ${pnlPct.toFixed(0)}% — consider returning your principal.`
    } else if (pnlPct >= 30 && weight > 15) {
      action  = 'TRIM OVERWEIGHT'
      urgency = 'medium'
      targets = [
        { label: `Trim to 12% weight`, price: price, note: `Currently ${weight.toFixed(1)}% of portfolio — rebalance` },
        { label: 'Hold core', price: null, note: 'Keep strategic allocation' },
      ]
      reason = `${weight.toFixed(1)}% allocation is too large — trim to manage concentration risk.`
    } else if (pnlPct >= 20) {
      action  = 'HOLD & TRAIL'
      urgency = 'low'
      targets = [
        { label: `Set stop-loss at +${Math.max(0, pnlPct - 15).toFixed(0)}%`, price: +(h.total_invested / h.amount * (1 + Math.max(0, pnlPct - 15) / 100)).toFixed(4), note: 'Protect gains' },
        { label: `Take profit at +50%`, price: +(h.total_invested / h.amount * 1.5).toFixed(4), note: 'First target' },
      ]
      reason = `Solid gain. Set a trailing stop to protect profits.`
    } else if (pnlPct <= -30 && weight > 3) {
      action  = 'CUT LOSS'
      urgency = 'high'
      targets = [
        { label: 'Exit 50% immediately', price: price, note: `Down ${Math.abs(pnlPct).toFixed(0)}% — limit further damage` },
        { label: 'Hold 50% with hard stop at -40%', price: +(h.total_invested / h.amount * 0.6).toFixed(4), note: 'Final exit if thesis breaks' },
      ]
      reason = `Down ${Math.abs(pnlPct).toFixed(0)}% — reassess thesis or cut exposure.`
    } else if (pnlPct <= -15) {
      action  = 'WATCH & DECIDE'
      urgency = 'medium'
      targets = [
        { label: 'Set hard stop at -30%', price: +(h.total_invested / h.amount * 0.7).toFixed(4), note: 'Maximum acceptable loss' },
        { label: 'DCA if thesis holds', price: +(price * 0.9).toFixed(4), note: 'Average down only with conviction' },
      ]
      reason = `Down ${Math.abs(pnlPct).toFixed(0)}% — define your max pain before it hits.`
    } else if (chg24 < -5 && pnlPct > 0) {
      action  = 'SELL SPIKE'
      urgency = 'medium'
      targets = [
        { label: 'Sell 20% on any bounce', price: +(price * 1.03).toFixed(4), note: 'Reduce into relief rallies' },
        { label: 'Hold core', price: null, note: 'Keep long-term position' },
      ]
      reason = `Sharp 24h drop (${chg24.toFixed(1)}%) while still in profit — reduce on bounces.`
    } else {
      action  = 'HOLD'
      urgency = 'low'
      targets = [
        { label: `First target: +50%`, price: +(h.total_invested / h.amount * 1.5).toFixed(4), note: 'Initial take-profit' },
        { label: `Moonbag target: +100%`, price: +(h.total_invested / h.amount * 2).toFixed(4), note: 'Long-term goal' },
      ]
      reason = `Position is healthy. Let it run with clear targets.`
    }

    return { action, targets, reason, urgency }
}

// Build the full sell plan. When `technicals[coin_id]` is present the targets,
// action and reasoning come from real technical analysis (RSI, MACD, Bollinger,
// trend, support/resistance). Otherwise it falls back to the P&L rule engine.
function generateSellPlan(enriched, prices, technicals = {}) {
  const investable = enriched.filter(h => !isStablecoin(h.coin_id, h.coin_symbol))
  if (!investable.length) return null

  const totalValue = investable.reduce((s, h) => {
    const price = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
    return s + h.amount * price
  }, 0)

  const rows = investable.map(h => {
    const price   = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
    const value   = h.amount * price
    const sym     = h.coin_symbol?.toUpperCase()

    // Non-crypto assets without live price: show as "manually tracked"
    const id = (h.coin_id || '').toLowerCase()
    const symL = (h.coin_symbol || '').toLowerCase()
    const isNonCryptoAsset =
      id.startsWith('metal:') || id.startsWith('stock:') || id.startsWith('real:') ||
      id.startsWith('cash:')  || id.startsWith('fiat:')  ||
      id.includes('appartment') || id.includes('apartment') ||
      ['xau','xag','xpt','xpd'].includes(symL)

    if (isNonCryptoAsset && price === 0) {
      const investedVal = h.total_invested || 0
      return {
        sym, coinId: h.coin_id, amount: h.amount, pnlPct: 0, weight: totalValue > 0 ? (investedVal / totalValue) * 100 : 0,
        value: investedVal, price: 0,
        action: 'MANUALLY TRACKED', urgency: 'low', ta: null,
        reason: `${sym} is a non-crypto asset without live price feed. Value reflects your recorded cost basis.`,
        targets: [{ label: 'Update price manually', price: null, note: 'Edit your holding to set current market value' }],
      }
    }

    const pnlPct  = h.total_invested > 0 ? ((value - h.total_invested) / h.total_invested) * 100 : 0
    const weight  = totalValue > 0 ? (value / totalValue) * 100 : 0
    const chg24   = prices[h.coin_id]?.usd_24h_change ?? 0
    const avgCost = h.amount > 0 ? h.total_invested / h.amount : 0

    const ta = technicals[h.coin_id] || null
    const plan = (ta && price > 0)
      ? buildTASellPlan(ta, { currentPrice: price, avgCost, pnlPct, weight })
      : ruleBasedPlan(h, price, value, pnlPct, weight, chg24)

    return { sym, coinId: h.coin_id, amount: h.amount, pnlPct, weight, value, price, ta, ...plan }
  }).sort((a, b) => {
    const order = { 'high': 0, 'medium': 1, 'low': 2, 'manually tracked': 3 }
    return order[a.urgency] - order[b.urgency]
  })

  // Overall summary
  const totalInvested = investable.reduce((s, h) => s + h.total_invested, 0)
  const totalPnlPct = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0

  let summary
  if (totalPnlPct > 50) summary = `Portfolio is up ${totalPnlPct.toFixed(1)}% overall. Consider locking in profits on your biggest winners while keeping strategic core positions.`
  else if (totalPnlPct > 0) summary = `Portfolio is modestly positive (+${totalPnlPct.toFixed(1)}%). Set clear targets for each position and protect gains with stop-losses.`
  else if (totalPnlPct > -20) summary = `Portfolio is slightly underwater (${totalPnlPct.toFixed(1)}%). Reassess underperformers — trim weak hands and hold quality.`
  else summary = `Portfolio is down ${Math.abs(totalPnlPct).toFixed(1)}%. Prioritize cutting your biggest losers first to stop the bleeding.`

  return { rows, summary }
}

const URGENCY_COLOR = { high: '#f87171', medium: '#fbbf24', low: 'var(--g)', 'manually tracked': '#a78bfa' }
const URGENCY_BG    = { high: '#f8717115', medium: '#fbbf2415', low: 'rgba(var(--g-rgb),0.08)', 'manually tracked': '#a78bfa15' }

const fmtLvl = (p) => (p == null ? '—' : '$' + (p >= 1 ? Math.round(p).toLocaleString() : +(+p).toPrecision(4)))
const TREND_META = {
  uptrend:   { label: '↗ Uptrend',   color: 'var(--g-ink)', fontWeight: 700 },
  downtrend: { label: '↘ Downtrend', color: '#f87171' },
  sideways:  { label: '→ Sideways',  color: '#fbbf24' },
}

// Compact read-out of the technical posture behind each holding's plan.
function TAStrip({ ta }) {
  const trend = TREND_META[ta.trend] || TREND_META.sideways
  const rsiColor = ta.rsiState === 'overbought' ? '#f87171' : ta.rsiState === 'oversold' ? 'var(--g)' : 'var(--text-muted)'
  const macdColor = ta.macd ? (ta.macd.hist > 0 ? 'var(--g)' : '#f87171') : 'var(--text-muted)'
  const chip = (children, color) => (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:'0.25rem',
      background:'var(--surface-1)', border:`1px solid ${color}30`, color,
      borderRadius:6, padding:'0.12rem 0.45rem', fontSize:'0.7rem', fontWeight:600,
      whiteSpace:'nowrap',
    }}>{children}</span>
  )
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', margin:'0 0 0.5rem' }}>
      {chip(trend.label, trend.color)}
      {ta.rsi != null && chip(<>RSI {ta.rsi.toFixed(0)}{ta.rsiState !== 'neutral' ? ` · ${ta.rsiState}` : ''}</>, rsiColor)}
      {ta.macd && chip(`MACD ${ta.macd.hist > 0 ? '+' : ''}${ta.macd.cross ? ta.macd.cross : (ta.macd.hist > 0 ? 'bull' : 'bear')}`, macdColor)}
      {ta.nearestSupport != null && chip(`S ${fmtLvl(ta.nearestSupport)}`, 'var(--g)')}
      {ta.nearestResistance != null && chip(`R ${fmtLvl(ta.nearestResistance)}`, '#f87171')}
    </div>
  )
}

// Turns a plan row into sized, actionable levels: how much to sell at each
// price and what it brings in, whether it is already one of your targets,
// how your own targets sit against the mapped resistance, and how many of
// the sell signals agree. Everything here is computed from the row itself,
// the holding and your saved targets: nothing is guessed.
export function smartRow(row, plan = []) {
  const cur = row.price
  const plannedQty = plan.reduce((s, tg) => s + (tg.quantity == null ? row.amount : Math.min(tg.quantity, row.amount)), 0)
  const left = Math.max(0, (row.amount || 0) - plannedQty)
  const near = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / b <= 0.03
  const levels = (row.targets || []).map((tg) => {
    const pct = Number((/Sell (\d+)%/.exec(tg.label) || [])[1]) || null
    const kind = /stop/i.test(tg.label) ? 'stop' : pct ? 'sell' : /^Add|DCA/i.test(tg.label) ? 'buy' : 'info'
    const price = tg.price != null ? Number(tg.price) : null
    const qty = kind === 'sell' && pct ? (row.amount || 0) * pct / 100 : null
    const r = Number((/R(\d)/.exec(tg.label) || [])[1]) || null
    const mine = price ? plan.find(x => near(Number(x.price), price)) : null
    return {
      ...tg, kind, pct, price, qty, r,
      proceeds: qty != null && price ? qty * price : null,
      // A target has to sit above today's price to be one.
      addable: kind === 'sell' && price > 0 && cur > 0 && price > cur * 1.005 && !mine,
      mine: !!mine,
      // A stop already above today's price has been broken: say so instead
      // of offering an alarm that would ring at once.
      broken: kind === 'stop' && price > 0 && cur > 0 && price >= cur,
    }
  })
  const res = levels.filter(l => l.r && l.price).sort((a, b) => a.price - b.price)
  const yours = plan.slice().sort((a, b) => a.price - b.price).map(tg => {
    const p = Number(tg.price)
    let where = 'free'
    if (res.length) {
      const hit = res.find(l => near(l.price, p))
      if (hit) where = `R${hit.r}`
      else if (p > res[res.length - 1].price * 1.03) where = 'above'
      else if (p < res[0].price) where = 'below'
      else where = 'between'
    }
    return { price: p, quantity: tg.quantity, where }
  })
  const ta = row.ta
  const signals = ta ? [
    ['rsi', ta.rsiState === 'overbought'],
    ['bb', !!(ta.bb && ta.bb.pctB > 1)],
    ['macd', !!(ta.macd && ta.macd.hist < 0)],
    ['trend', ta.trend === 'downtrend'],
  ] : null
  const sells = levels.filter(l => l.kind === 'sell' && l.proceeds)
  return {
    levels, left, yours, signals,
    sellCount: signals ? signals.filter(([, on]) => on).length : null,
    planQty: sells.reduce((s, l) => s + l.qty, 0),
    planValue: sells.reduce((s, l) => s + l.proceeds, 0),
  }
}

const money = (v) => '$' + (v >= 1000 ? Math.round(v).toLocaleString() : v >= 1 ? v.toFixed(2) : (+v.toPrecision(3)).toString())
const qtyFmt = (v) => (+v.toPrecision(6)).toLocaleString(undefined, { maximumFractionDigits: 6 })

export default function AISellPlan({ enriched = [], prices = {}, coinTargets = {}, onTargetsChange }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [technicals, setTechnicals] = useState({})
  const [loading, setLoading] = useState(false)
  const [confirmFor, setConfirmFor] = useState(null) // the asset whose "add all" is waiting for confirm
  const [busy, setBusy] = useState(false)
  const [stops, setStops] = useState(() => stopAlarmKeys())
  useEffect(() => {
    const on = () => setStops(stopAlarmKeys())
    window.addEventListener('wl-alerts-changed', on)
    return () => window.removeEventListener('wl-alerts-changed', on)
  }, [])

  const plan = useMemo(
    () => open ? generateSellPlan(enriched, prices, technicals) : null,
    [open, enriched, prices, technicals]
  )
  const smart = useMemo(() => {
    if (!plan) return null
    const rows = plan.rows.map(row => ({ row, s: smartRow(row, coinTargets[row.coinId]?.targets || []) }))
    const moves = rows.filter(({ row }) => row.urgency === 'high' || row.urgency === 'medium').slice(0, 3)
    const value = rows.reduce((s, { s: x }) => s + x.planValue, 0)
    return { rows, moves, value, assets: rows.filter(({ s: x }) => x.planValue > 0).length }
  }, [plan, coinTargets])

  async function generate() {
    if (!enriched.length || loading) return
    track('ai_sell_plan_generate')
    trackAI({ action: 'sell_plan_generate', planGenerated: true })
    setLoading(true)
    try {
      const ids = enriched.map(h => h.coin_id).filter(Boolean)
      const ta = await api.getBulkTechnicals(ids)
      setTechnicals(ta || {})
      trackAI({ action: 'sell_plan_technicals' })
    } catch {
      setTechnicals({})
    } finally {
      setLoading(false)
      setOpen(true)
    }
  }

  // Adds sell levels as targets, never more than what is not planned yet.
  async function addLevels(row, s, levels) {
    if (busy) return
    setBusy(true)
    try {
      let left = s.left
      let added = 0
      for (const l of levels) {
        const q = Math.min(l.qty, left)
        if (!(q > 0)) break
        await api.addCoinTarget(row.coinId, { price: l.price, quantity: +q.toPrecision(10) })
        left -= q
        added++
      }
      if (added) track('sell_plan_to_targets', { count: added })
      setConfirmFor(null)
      onTargetsChange?.()
    } finally { setBusy(false) }
  }

  function toggleStop(row, l) {
    const key = `${row.coinId}@${Number(l.price)}`
    const on = !stops.has(key)
    setStopAlarm({ coinId: row.coinId, symbol: row.sym, price: l.price }, on)
    setStops(stopAlarmKeys())
    track('sell_plan_stop_alarm', { on })
  }

  if (!enriched.length) return null

  return (
    <div className="glass-card sp2" style={{ marginTop: '1rem' }}>
      <div className="sp2-head">
        <div>
          <h3><Icon name="target" size={17} style={{ color: 'var(--g-ink)' }} />{t('spTitle')}</h3>
          <p className="muted">{t('spDesc')}</p>
        </div>
        {!open ? (
          <button type="button" className="sp2-go" onClick={generate} disabled={loading}>
            {loading
              ? <><Icon name="hourglass" size={14} />{t('spAnalyzing')}</>
              : <><Icon name="sparkles" size={14} />{t('spGenerate')}</>}
          </button>
        ) : (
          <button type="button" className="sp2-close" onClick={() => setOpen(false)}>✕ {t('spClose')}</button>
        )}
      </div>

      {open && plan && smart && (
        <div className="sp2-body">
          <div className="sp2-sum">
            {smart.value > 0 && (
              <div className="sp2-total"><b>{money(smart.value)}</b><span>{t('spIfLevelsFill')(smart.assets)}</span></div>
            )}
            <p>{plan.summary}</p>
            {smart.moves.length > 0 && (
              <div className="sp2-moves">
                <span className="sp2-eyebrow">{t('spTopMoves')}</span>
                <ol>
                  {smart.moves.map(({ row, s }) => {
                    const first = s.levels.find(l => l.kind === 'sell' && l.price) || s.levels.find(l => l.price)
                    return (
                      <li key={row.coinId}>
                        <b>{row.sym}</b> <span className={`sp2-act u-${row.urgency}`}>{row.action}</span>
                        {first && <span className="muted"> · {first.label} {first.price ? `@ ${money(first.price)}` : ''}</span>}
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </div>

          <div className="sp2-rows">
            {smart.rows.map(({ row, s }) => {
              const addable = s.levels.filter(l => l.addable)
              return (
                <section key={row.coinId || row.sym} className={`sp2-row u-${row.urgency.replace(' ', '-')}`}>
                  <div className="sp2-row-h">
                    <b>{row.sym}</b>
                    <span className={`sp2-act u-${row.urgency.replace(' ', '-')}`}>{row.action}</span>
                    <span className="sp2-pnl">
                      <b className={row.pnlPct >= 0 ? 'up' : 'down'}>{row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(1)}%</b>
                      <small className="muted">{t('spOfPortfolio')(row.weight.toFixed(1))}</small>
                    </span>
                  </div>

                  {row.ta && <TAStrip ta={row.ta} />}
                  {s.signals && (
                    <div className="sp2-signals" title={t('spSignalsHint')}>
                      <span className="sp2-dots" aria-hidden="true">
                        {s.signals.map(([k, on]) => <i key={k} className={on ? 'on' : ''} />)}
                      </span>
                      <span>{t('spSignals')(s.sellCount)}</span>
                    </div>
                  )}
                  <p className="sp2-reason">{row.reason}</p>

                  <ol className="sp2-levels">
                    {s.levels.map((l, i) => {
                      const stopOn = l.kind === 'stop' && stops.has(`${row.coinId}@${Number(l.price)}`)
                      return (
                        <li key={i} className={`sp2-lvl k-${l.kind}`}>
                          <span className="sp2-n">{i + 1}</span>
                          <span className="sp2-lvl-main">
                            <b>{l.label}{l.price ? <span className="muted"> @ {money(l.price)}</span> : null}</b>
                            <small className="muted">
                              {l.qty != null && l.price ? <>{t('spSellGet')(`${qtyFmt(l.qty)} ${row.sym}`)} <b className="up">{money(l.proceeds)}</b> · </> : null}
                              {l.broken ? <b className="down">{t('spBroken')}</b> : l.note}
                            </small>
                          </span>
                          {l.mine && <span className="sp2-tag">✓ {t('spInTargets')}</span>}
                          {l.addable && s.left > 0 && (
                            <button type="button" className="sp2-btn" disabled={busy} onClick={() => addLevels(row, s, [l])}>+ {t('spTarget')}</button>
                          )}
                          {l.kind === 'stop' && l.price > 0 && l.price < row.price && (
                            <button type="button" className={`sp2-btn${stopOn ? ' on' : ''}`} aria-pressed={stopOn} onClick={() => toggleStop(row, l)}>
                              {stopOn ? `✓ ${t('spAlarm')}` : `+ ${t('spAlarm')}`}
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ol>

                  {s.yours.length > 0 && (
                    <div className="sp2-yours">
                      <span className="sp2-eyebrow">{t('spYourTargets')}</span>
                      {s.yours.map((y, i) => (
                        <span key={i} className={`sp2-y w-${y.where.startsWith('R') ? 'r' : y.where}`}>
                          {money(y.price)} · {y.where.startsWith('R') ? t('spMatches')(y.where) : t(`spWhere_${y.where}`)}
                        </span>
                      ))}
                    </div>
                  )}

                  {s.planValue > 0 && (
                    <div className="sp2-foot">
                      <span>{t('spPlanFor')(`${qtyFmt(s.planQty)} ${row.sym}`)} <b className="up">{money(s.planValue)}</b></span>
                      {addable.length > 1 && s.left > 0 && (confirmFor === row.coinId ? (
                        <span className="sp2-confirm">
                          <button type="button" className="dvx-btn" onClick={() => setConfirmFor(null)}>{t('cancel')}</button>
                          <button type="button" className="dvx-btn dvx-btn-primary" disabled={busy} onClick={() => addLevels(row, s, addable)}>
                            {t('tgConfirmSave')(addable.length)}
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="sp2-btn" onClick={() => setConfirmFor(row.coinId)}>{t('spAddAll')(addable.length)}</button>
                      ))}
                    </div>
                  )}
                  {s.left <= 0 && addable.length > 0 && <small className="muted">{t('spFullyPlanned')}</small>}
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
