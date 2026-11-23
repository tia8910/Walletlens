import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { realAssetsCopy } from '../realAssetsCopy'
import {
  getRealAsset, saveRealAsset, kindFor, summarize, projection, valueByYear, notesFor,
} from '../realAssets'
import { KindIcon, usd, usdShort } from './realAssetsUi'
import '../realAssets.css'

const DAY = 86_400_000

function inGuardianPlan(sym) {
  try {
    const cfg = JSON.parse(localStorage.getItem('wl_guardian') || 'null')
    if (!cfg?.active) return undefined
    return (cfg.plan || []).some(r => String(r.sym || '').toUpperCase() === sym)
  } catch { return undefined }
}

const NOTE_ICON = {
  warn: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  good: 'm4 15 5-5 4 4 7-7',
  info: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z',
}

/**
 * The real asset part of an asset page (other: ids): what it is worth now and
 * why, what is really yours, what it earns, where it is heading, and what to do.
 */
export default function RealAssetPanel({ coinId, holding, unitPrice, name, symbol, onChanged }) {
  const { lang } = useLanguage()
  const c = useMemo(() => realAssetsCopy(lang), [lang])
  const navigate = useNavigate()
  const [meta, setMeta] = useState(() => getRealAsset(coinId))
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const [saved, setSaved] = useState(false)

  const kind = kindFor(coinId, meta, name || '')
  const m = meta ? { ...meta, kind } : null
  const sum = summarize(m || { kind, growth: 0 }, holding, unitPrice)
  const sym = String(symbol || '').toUpperCase()
  const notes = m ? notesFor(m, sum, { inPlan: inGuardianPlan(sym) }) : []
  const editLink = `/real-assets/new?id=${encodeURIComponent(coinId)}`

  function saveValue(e) {
    e.preventDefault()
    const total = Number(String(val).replace(/[, $]/g, ''))
    const amount = Number(holding?.amount) || 1
    if (!(total > 0)) return
    const unit = total / amount
    api.setManualPrice(coinId, unit)
    const next = saveRealAsset(coinId, { ...(meta || { kind }), kind, anchor: { price: unit, at: Date.now() } })
    setMeta(next)
    setEditing(false); setVal(''); setSaved(true)
    track('real_asset_value', { kind })
    onChanged?.()
  }

  if (!m) {
    return (
      <section className="ra-card" style={{ marginBottom: 12 }}>
        <div className="ra-head">
          <span className="ra-kind-ic" style={{ '--c': '#f472b6' }}><KindIcon kind={kind} /></span>
          <div><b>{c('describe')}</b><small>{c('describeSub')}</small></div>
        </div>
        <button type="button" className="ra-cta" onClick={() => navigate(editLink)}>{c('editDetails')}</button>
      </section>
    )
  }

  const isCar = kind === 'car' || sum.growth < 0
  const years = isCar ? valueByYear(m) : []
  const yMax = years.reduce((a, y) => Math.max(a, y.value), 0) || 1
  const proj = !isCar ? projection(sum.value, sum.growth, 5) : []
  const pMax = proj.length ? Math.max(...proj) : 1
  const upcoming = []
  if (m.insuranceDue) {
    const d = Math.ceil((new Date(m.insuranceDue).getTime() - Date.now()) / DAY)
    if (d >= 0) upcoming.push({ k: c('insuranceRow'), v: c('inDays')(d), warn: d <= 30 })
  }
  if (m.dueDate) {
    const d = Math.ceil((new Date(m.dueDate).getTime() - Date.now()) / DAY)
    upcoming.push({ k: c('dueRow'), v: d >= 0 ? c('inDays')(d) : c('daysLate')(-d), warn: d < 7 })
  }

  return (
    <div className="ra" style={{ marginBottom: 12 }}>
      <section className="ra-hero">
        <div className="ra-hero-row">
          <span className="ra-hero-k">{c('worthToday')}{sum.estimated ? ` · ${c('estimated')}` : ''}</span>
          {sum.gainPct != null && <span className={`ra-pill${sum.gainPct < 0 ? ' is-down' : ''}`}>{c('since')(sum.gainPct)}</span>}
        </div>
        <span className="ra-hero-v">{usd(sum.value)}</span>
        {sum.estimated && <small>{c('likely')(usd(sum.low), usd(sum.high))}</small>}
        {sum.loan > 0 && (
          <>
            <div className="ra-eq" aria-hidden="true">
              <span style={{ width: `${sum.equityPct}%` }} />
              <span style={{ width: `${100 - sum.equityPct}%` }} />
            </div>
            <div className="ra-eq-legend">
              <span><b style={{ color: '#6ee7b7' }}>{usd(sum.equity)}</b> {c('mine')}</span>
              <span><b style={{ color: '#fbbf24' }}>{usd(sum.loan)}</b> {c('loanShort')}</span>
            </div>
          </>
        )}
      </section>

      <div className="ra-tiles">
        {sum.yieldPct != null && (
          <div className="ra-tile"><small>{c('t_yield')}</small><b>{sum.yieldPct.toFixed(1)}%</b><small>{c('t_yieldSub')(usd(sum.rent * 12))}</small></div>
        )}
        {sum.rent > 0 && (
          <div className="ra-tile"><small>{c('t_cash')}</small><b className={sum.netMonthly < 0 ? 'is-down' : ''}>{usd(sum.netMonthly)}</b><small>{c('t_cashSub')}</small></div>
        )}
        {sum.rent <= 0 && sum.value > 0 && sum.growth !== 0 && (
          <div className="ra-tile"><small>{c('t_next')}</small><b className={sum.nextYear < 0 ? 'is-down' : ''}>{sum.nextYear >= 0 ? '+' : ''}{usd(sum.nextYear)}</b><small>{c('t_nextSub')(usd(Math.round(Math.abs(sum.nextYear) / 12)))}</small></div>
        )}
        {sum.costs > 0 && sum.rent <= 0 && (
          <div className="ra-tile"><small>{c('t_costs')}</small><b>{usd(sum.costs)}</b><small>{c('t_costsSub')}</small></div>
        )}
        <div className="ra-tile"><small>{c('t_sell')}</small><b>{c('sellTime')(sum.sellDays)}</b><small>{c('t_sellSub')}</small></div>
      </div>

      {isCar && years.length > 1 && (
        <section className="ra-card">
          <small className="ra-muted">{c('boughtLine')(usd(m.anchor.price * (Number(holding?.amount) || 1)), sum.growth)}</small>
          <div className="ra-bars" role="img" aria-label={`${c('past')}, ${c('expected')}`}>
            {years.map(y => (
              <div key={y.year}>
                <span className={y.past ? 'is-past' : 'is-future'} style={{ height: `${Math.round(10 + (y.value / yMax) * 70)}px` }} />
                <small>'{String(y.year).slice(2)}</small>
              </div>
            ))}
          </div>
          <div className="ra-legend">
            <span><i style={{ background: 'var(--text)' }} />{c('past')}</span>
            <span><i style={{ background: '#93c5fd' }} />{c('expected')}</span>
          </div>
        </section>
      )}

      {!isCar && sum.value > 0 && (
        <section className="ra-card">
          <div className="ra-row"><b style={{ color: 'var(--text)' }}>{c('inYears')(5)}</b><span>{c('atRate')(sum.growth)}</span></div>
          <div className="ra-bars" aria-hidden="true">
            {proj.map((v, i) => (
              <div key={i}><span className={i === 0 ? 'is-now' : ''} style={{ height: `${Math.round(16 + (v / pMax) * 64)}px`, opacity: i === 0 ? 1 : 0.45 + i * 0.1 }} /></div>
            ))}
          </div>
          <div className="ra-row">
            <span>{c('now')} {usdShort(sum.value)}</span>
            <span><b>{usdShort(proj[proj.length - 1])}</b>{sum.rent > 0 ? ` ${c('plusRent')(usdShort(sum.rent * 12 * 5))}` : ''}</span>
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <section className="ra-card">
          <b className="ra-card-title">{c('notesTitle')}</b>
          <div className="ra-notes">
            {notes.map(nt => {
              const arg = nt.months ?? nt.days ?? nt.age ?? nt.times ?? nt.pct
              const [title, body] = c(`n_${nt.id}`)(arg)
              return (
                <div key={nt.id} className={`ra-note is-${nt.tone}`}>
                  <span className="ra-note-ic" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d={NOTE_ICON[nt.tone]} /></svg>
                  </span>
                  <span><b>{title}</b> {body}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="ra-card">
          <b className="ra-card-title">{c('comingUp')}</b>
          <div className="ra-list">
            {upcoming.map(u => <div key={u.k} className="ra-li" style={{ cursor: 'default' }}><span>{u.k}</span><b className={u.warn ? 'is-warn' : ''}>{u.v}</b></div>)}
          </div>
        </section>
      )}

      {editing ? (
        <form className="ra-card" onSubmit={saveValue}>
          <label className="ra-label">{c('newValue')}
            <input inputMode="decimal" autoFocus value={val} onChange={e => setVal(e.target.value)} placeholder={String(Math.round(sum.value))} />
          </label>
          <div className="ra-actions">
            <button type="button" className="ra-ghost" onClick={() => setEditing(false)}>{c('cancel')}</button>
            <button type="submit" className="ra-cta">{c('save')}</button>
          </div>
        </form>
      ) : (
        <div className="ra-actions">
          <button type="button" className="ra-ghost" onClick={() => navigate(editLink)}>{c('editDetails')}</button>
          <button type="button" className="ra-cta" onClick={() => { setEditing(true); setSaved(false) }}>{isCar ? c('gotOffer') : c('updateValue')}</button>
        </div>
      )}
      {saved && <p className="ra-muted" role="status">{c('valueSaved')}</p>}
    </div>
  )
}
