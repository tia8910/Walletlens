import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../LanguageContext'
import { api } from '../api'
import { track } from '../analytics'
import { categorizeAsset } from '../data/assets'
import { setTargetAlarm, targetAlarmKeys } from '../targetAlarms'
import CoinLogo from './CoinLogo'
import TargetRealityCheck from './TargetRealityCheck'

const fmt = n => { const v = Number(n); return isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00' }
const money = (v) => `$${fmt(v)}`
const fmtQty = (n) => (!n && n !== 0 ? '0' : n.toFixed(4).replace(/\.?0+$/, '') || '0')

// One asset's sell targets as a grid of tiles, used on the Targets tab and
// on the asset page. Tap a tile to open it; tap + Target for the two-tap
// form, where each price lines up a New tile and Confirm and save stores them.
//
// `h` is the holding: { coin_id, coin_symbol, coin_name, coin_image, amount, price }.
// `editing`/`onEditingChange` let the Targets tab open the form from outside.
export default function TargetCard({ h, plan = [], onChange, editing: editingProp, onEditingChange, showHead = true, linkToAsset = true }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [editingLocal, setEditingLocal] = useState(false)
  const editing = editingProp ?? editingLocal
  const setEditing = (on) => { setEditingLocal(on); onEditingChange?.(on) }
  const [drafts, setDrafts] = useState([]) // [{ key, p, q }] lined up, not saved yet
  const [pick, setPick] = useState(null) // the open tile's target id
  const [form, setForm] = useState({ amt: 1 })
  const [saving, setSaving] = useState(false)
  const [alarmKeys, setAlarmKeys] = useState(() => targetAlarmKeys())
  useEffect(() => {
    const on = () => setAlarmKeys(targetAlarmKeys())
    window.addEventListener('wl-alerts-changed', on)
    return () => window.removeEventListener('wl-alerts-changed', on)
  }, [])
  useEffect(() => { if (!editing) setDrafts([]) }, [editing])

  const sym = h.coin_symbol?.toUpperCase()
  const cur = h.price || 0
  const items = plan.map(tg => {
    const sellQty = tg.quantity == null ? h.amount : Math.min(tg.quantity, h.amount)
    return {
      tg, sellQty,
      proceeds: sellQty * tg.price,
      sellPct: h.amount > 0 ? (sellQty / h.amount) * 100 : 0,
      progress: cur > 0 && tg.price > 0 ? Math.min((cur / tg.price) * 100, 100) : 0,
      reached: cur > 0 && cur >= tg.price,
      away: cur > 0 ? ((tg.price - cur) / cur) * 100 : Infinity,
    }
  }).sort((a, b) => a.tg.price - b.tg.price)
  const plannedQty = items.reduce((s, x) => s + x.sellQty, 0)
  const plannedPct = h.amount > 0 ? Math.min(100, (plannedQty / h.amount) * 100) : 0
  const left = Math.max(0, h.amount - plannedQty)
  const roomLeft = left > h.amount * 0.005
  const sum = items.reduce((s, x) => s + x.proceeds, 0) + drafts.reduce((s, d) => s + d.p * d.q, 0)
  const open = items.find(x => String(x.tg.id) === String(pick))
  const openIdx = open ? items.indexOf(open) : -1

  async function save() {
    const list = drafts.filter(d => d.p > 0 && d.q > 0 && !(cur > 0 && d.p <= cur))
    if (!list.length || saving) return
    setSaving(true)
    try {
      for (const d of list) await api.addCoinTarget(h.coin_id, { price: d.p, quantity: d.q })
      track('goal_set', { coin_id: h.coin_id, count: list.length })
      setDrafts([])
      setForm(f => ({ amt: f.amt ?? 1 }))
      setEditing(false)
      onChange?.()
    } finally { setSaving(false) }
  }

  async function remove(id) {
    setPick(null)
    await api.removeCoinTargetItem(h.coin_id, id)
    track('target_deleted', { coin_id: h.coin_id })
    onChange?.()
  }

  function toggleAlarm(x) {
    const on = !alarmKeys.has(`${h.coin_id}@${Number(x.tg.price)}`)
    setTargetAlarm({ coinId: h.coin_id, symbol: h.coin_symbol, price: x.tg.price }, on)
    setAlarmKeys(targetAlarmKeys())
    track('target_alarm', { on })
  }

  function startAdd() {
    setPick(null)
    setEditing(true)
    track('target_add_open', { planned: plan.length > 0 })
  }

  function renderForm() {
    const set = (patch) => setForm(f => ({ ...f, ...patch }))
    const available = Math.max(0, left - drafts.reduce((s, d) => s + d.q, 0))
    const amt = form.amt ?? 1
    const addQty = amt === 'qty' ? Math.max(0, Math.min(parseFloat(form.qty) || 0, available)) : available * amt
    const nice = (v) => Number(v.toPrecision(v >= 1 ? 4 : 3))
    const chips = cur > 0 ? [1.5, 2, 3, 5, 8].map(m => ({ m, p: nice(cur * m) })) : []
    const myPrice = parseFloat(form.price)
    const priceTooLow = myPrice > 0 && cur > 0 && myPrice <= cur
    const canAdd = addQty > 0
    const lineUp = (p) => {
      if (!canAdd || !(p > 0) || (cur > 0 && p <= cur)) return
      setDrafts(prev => [...prev, { key: `${Date.now()}-${Math.random()}`, p, q: addQty }])
      set({ price: '', qty: '', custom: false })
    }
    return (
      <div className="tg5-form">
        {available > h.amount * 0.005 ? (
          <>
            <div className="tg5-step">
              <span className="tg5-lbl">{t('tgStepAmount')(`${parseFloat(available.toFixed(6)).toLocaleString()} ${sym}`)}</span>
              <div className="tg5-chips">
                {[[0.25, '25%'], [0.5, '50%'], [1, t('tgAllLeft')], ['qty', t('stQuantity')]].map(([k, label]) => (
                  <button key={k} type="button" className={`tg5-chip${amt === k ? ' on' : ''}`} aria-pressed={amt === k} onClick={() => set({ amt: k })}>{label}</button>
                ))}
              </div>
              {amt === 'qty' && (
                <div className="tg5-inline">
                  <input type="number" min="0" step="any" inputMode="decimal" className="tg5-input"
                    placeholder={`0 – ${parseFloat(available.toFixed(6))}`} value={form.qty || ''}
                    onChange={e => set({ qty: e.target.value })} aria-label={t('stQuantity')} />
                  <button type="button" className="tg5-chip" onClick={() => set({ qty: String(parseFloat(available.toFixed(8))) })}>{t('stMax')}</button>
                </div>
              )}
              <small className="tg5-hint">{t('stSellQty')(parseFloat(addQty.toFixed(6)), sym)}</small>
            </div>

            <div className="tg5-step">
              <span className="tg5-lbl">{t('tgStepPrice')}</span>
              <div className="tg5-chips">
                {chips.map(c => (
                  <button key={c.m} type="button" className="tg5-chip tg5-price" disabled={!canAdd}
                    onClick={() => lineUp(c.p)} aria-label={t('tgAddAt')(money(c.p))}>
                    <b>{c.m}x</b><small>{money(c.p)}</small>
                  </button>
                ))}
                <button type="button" className={`tg5-chip tg5-price${form.custom ? ' on' : ''}`} aria-pressed={!!form.custom} onClick={() => set({ custom: !form.custom })}>
                  <b>{t('tgMyPrice')}</b><small>$</small>
                </button>
              </div>
              {form.custom && (
                <>
                  <div className="tg5-inline">
                    <input type="number" min="0" step="any" inputMode="decimal" autoFocus
                      className={`tg5-input${priceTooLow ? ' bad' : ''}`} placeholder={t('stEgPrice')}
                      value={form.price || ''} onChange={e => set({ price: e.target.value })} aria-label={t('dsTargetPriceUsd')} />
                    <button type="button" className="dvx-btn" disabled={!(myPrice > 0) || priceTooLow || !canAdd} onClick={() => lineUp(myPrice)}>
                      {t('tgAdd')}
                    </button>
                  </div>
                  {priceTooLow && <small className="tg5-err">{t('stTooLow')(money(cur))}</small>}
                  {myPrice > cur && (
                    <>
                      <small className="tg5-hint">{t('stSellQty')(parseFloat(addQty.toFixed(6)), sym)}{t('stProceedsPart')(money(addQty * myPrice))}</small>
                      <TargetRealityCheck coinId={h.coin_id} coinSymbol={h.coin_symbol} coinName={h.coin_name}
                        currentPrice={cur} targetPrice={myPrice} assetClass={categorizeAsset(h)} />
                    </>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <p className="tg3-note">{t('tgFullyPlanned')}</p>
        )}

        <div className="tg6-confirm">
          <button type="button" className="dvx-btn" onClick={() => setEditing(false)}>{t('cancel')}</button>
          <button type="button" className="dvx-btn dvx-btn-primary" disabled={!drafts.length || saving} onClick={save}>
            {drafts.length ? t('tgConfirmSave')(drafts.length) : t('tgLineUpFirst')}
          </button>
        </div>
      </div>
    )
  }

  const tiles = [...items.map((x, k) => ({ x, k, p: x.tg.price })), ...drafts.map(d => ({ d, p: d.p }))].sort((u, v) => u.p - v.p)

  return (
    <section className={`tg6-card${editing ? ' is-editing' : ''}`} aria-label={sym}>
      {showHead && (
        <div className="tg4-head">
          <button type="button" className="tg4-asset" disabled={!linkToAsset}
            onClick={() => linkToAsset && navigate(`/asset/${encodeURIComponent(h.coin_id)}`)}>
            <CoinLogo coinId={h.coin_id} symbol={h.coin_symbol} image={h.coin_image} size={38} className="dvx-holding-icon" />
            <span className="tg4-asset-n">
              <b>{sym}</b>
              <small>{t('tgNow')} {cur > 0 ? money(cur) : '-'} · {t('stHeld')(Number(h.amount).toLocaleString(undefined, { maximumFractionDigits: 6 }))}</small>
            </span>
          </button>
          <span className="tg4-sum"><small>{t('tgIfAllHit')}</small><b>{money(sum)}</b></span>
        </div>
      )}

      <div className="tg6-grid">
        {tiles.map(({ x, k, d }) => {
          if (d) return (
            <button key={d.key} type="button" className="tg6-tile is-new" title={t('tgTapToRemove')}
              aria-label={`${t('tgNew')} ${money(d.p)}. ${t('tgTapToRemove')}`}
              onClick={() => setDrafts(prev => prev.filter(y => y.key !== d.key))}>
              <em>{t('tgNew')} ✕</em>
              <b>{money(d.p)}</b>
              <span className="tg6-away">{cur > 0 ? `+${(((d.p - cur) / cur) * 100).toFixed(0)}%` : ''}</span>
              <small>{money(d.p * d.q)}</small>
            </button>
          )
          const on = String(pick) === String(x.tg.id)
          return (
            <button key={x.tg.id} type="button" aria-pressed={on} aria-label={t('tgAt')(sym, money(x.tg.price))}
              className={`tg6-tile${on ? ' on' : ''}${x.reached ? ' is-hit' : ''}`}
              style={{ '--heat': (0.1 + (x.progress / 100) * 0.5).toFixed(2) }}
              onClick={() => setPick(on ? null : x.tg.id)}>
              <em>T{k + 1}</em>
              <b>{money(x.tg.price)}</b>
              <span className="tg6-away">{x.reached ? `✓ ${t('tgReached')}` : `+${x.away.toFixed(0)}%`}</span>
              <small>{money(x.proceeds)}</small>
            </button>
          )
        })}
        {!editing && roomLeft && (
          <button type="button" className="tg6-tile is-add" onClick={startAdd}>
            <b>+</b><small>{t('stAddTarget').replace(/^\+\s*/, '')}</small>
          </button>
        )}
      </div>

      {open && !editing && (
        <div className="tg6-detail">
          <div className="tg6-detail-h">
            <b>{sym} · T{openIdx + 1} · {money(open.tg.price)}</b>
            {!open.reached && (
              <TargetRealityCheck compact coinId={h.coin_id} coinSymbol={h.coin_symbol} coinName={h.coin_name}
                currentPrice={cur} targetPrice={open.tg.price} assetClass={categorizeAsset(h)} />
            )}
          </div>
          <div className="tg2-plan-bar"><i style={{ width: `${open.progress}%` }} /></div>
          <div className="tg6-stats">
            <span><small>{t('tgSellL')}</small><b>{open.tg.quantity == null ? t('tgAll') : fmtQty(open.sellQty)} {sym} ({open.sellPct.toFixed(0)}%)</b></span>
            <span><small>{t('tgGetL')}</small><b className="tg2-up">{money(open.proceeds)}</b></span>
            <span><small>{t('tgAwayL')}</small><b>{open.reached ? `✓ ${t('tgReached')}` : `+${open.away.toFixed(1)}%`}</b></span>
          </div>
          <div className="tg6-actions">
            {!open.reached && (() => {
              const alarmOn = alarmKeys.has(`${h.coin_id}@${Number(open.tg.price)}`)
              return (
                <button type="button" className={`tg6-act${alarmOn ? ' on' : ''}`} aria-pressed={alarmOn} onClick={() => toggleAlarm(open)}>
                  {alarmOn ? `✓ ${t('tgAlarm')}` : `+ ${t('tgAlarm')}`}
                </button>
              )
            })()}
            <button type="button" className="tg6-act is-del" onClick={() => remove(open.tg.id)}>{t('atRemoveTarget')}</button>
          </div>
        </div>
      )}

      {editing ? renderForm() : (
        <div className="tg4-foot">
          <div className="tg2-plan-bar"><i style={{ width: `${plannedPct}%` }} /></div>
          <div className="tg4-foot-row">
            <span>{t('tgPlanned')(plannedPct.toFixed(0), parseFloat(left.toFixed(6)), sym)}</span>
            {!roomLeft && <span className="tg2-full">{t('tgFullyPlanned')}</span>}
          </div>
        </div>
      )}
    </section>
  )
}
