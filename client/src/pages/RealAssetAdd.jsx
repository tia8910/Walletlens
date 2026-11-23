import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { realAssetsCopy } from '../realAssetsCopy'
import {
  KINDS, USES, DEFAULT_GROWTH, getRealAsset, saveRealAsset, kindFor, newAssetId,
} from '../realAssets'
import { KIND_UI, KindIcon, BackIcon, usd } from '../components/realAssetsUi'
import '../realAssets.css'

const YEAR = 365.25 * 86_400_000
const thisMonth = () => new Date().toISOString().slice(0, 7)
const n = (v) => { const x = Number(String(v ?? '').replace(/[, $]/g, '')); return Number.isFinite(x) ? x : 0 }

/**
 * Add a real asset (a flat, a car, a watch, a business, money owed), or edit
 * the details of one already held: /real-assets/new, /real-assets/new?id=other:…
 */
export default function RealAssetAdd() {
  const { lang } = useLanguage()
  const c = useMemo(() => realAssetsCopy(lang), [lang])
  const navigate = useNavigate()
  const location = useLocation()
  const editId = new URLSearchParams(location.search).get('id') || ''
  const editing = editId.startsWith('other:')

  const [holding, setHolding] = useState(null)
  const [f, setF] = useState(() => {
    const m = editing ? getRealAsset(editId) : null
    const kind = m?.kind && m.kind !== 'other' ? m.kind : (editing ? kindFor(editId, m) : 'home')
    return {
      kind, name: '', growth: String(m?.growth ?? DEFAULT_GROWTH[kind]),
      boughtFor: '', boughtAt: thisMonth(),
      use: m?.use || 'rent', city: m?.city || '', size: m?.size ? String(m.size) : '',
      rent: m?.rent ? String(m.rent) : '', loanLeft: m?.loanLeft ? String(m.loanLeft) : '', loanMonthly: m?.loanMonthly ? String(m.loanMonthly) : '',
      year: m?.year ? String(m.year) : '', km: m?.km ? String(m.km) : '', costs: m?.costs ? String(m.costs) : '',
      insuranceDue: m?.insuranceDue || '', dueDate: m?.dueDate || '',
      hasStart: !!m?.anchor,
    }
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e?.target ? e.target.value : e }))

  useEffect(() => {
    if (!editing) return
    api.getPortfolio().then(rows => {
      const h = (rows || []).find(r => r.coin_id === editId)
      setHolding(h || null)
      if (h) setF(s => ({ ...s, name: h.coin_name || h.coin_symbol || '' }))
    }).catch(() => {})
  }, [editing, editId])

  function pickKind(k) {
    // A new kind brings its own typical yearly change, unless the owner set one.
    setF(s => ({ ...s, kind: k, growth: String(s.growth === String(DEFAULT_GROWTH[s.kind]) ? DEFAULT_GROWTH[k] : s.growth) }))
  }

  // The live preview: today's estimate from what was paid, when, and the yearly change.
  const pv = useMemo(() => {
    const paid = n(f.boughtFor)
    if (!(paid > 0)) return null
    const at = Date.parse(`${f.boughtAt || thisMonth()}-01`)
    const years = Number.isFinite(at) ? Math.max(0, (Date.now() - at) / YEAR) : 0
    const g = n(f.growth) / 100
    const value = paid * Math.pow(1 + g, years)
    const rent = n(f.rent)
    return {
      value,
      mine: Math.max(0, value - n(f.loanLeft)),
      yieldPct: rent > 0 && value > 0 ? (rent * 12 / value) * 100 : null,
      next: value * g,
    }
  }, [f.boughtFor, f.boughtAt, f.growth, f.rent, f.loanLeft])

  const meta = () => ({
    kind: f.kind, growth: n(f.growth), use: f.use, city: f.city, size: n(f.size),
    rent: n(f.rent), loanLeft: n(f.loanLeft), loanMonthly: n(f.loanMonthly),
    year: n(f.year), km: n(f.km), costs: n(f.costs), insuranceDue: f.insuranceDue, dueDate: f.dueDate,
  })

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const paid = n(f.boughtFor)
    const at = Date.parse(`${f.boughtAt || thisMonth()}-01`)
    if (editing) {
      const prev = getRealAsset(editId)
      const amount = Number(holding?.amount) || 1
      const anchor = prev?.anchor || (paid > 0 && Number.isFinite(at) ? { price: paid / amount, at } : undefined)
      saveRealAsset(editId, { ...meta(), anchor })
      track('real_asset_edit', { kind: f.kind })
      navigate(`/asset/${encodeURIComponent(editId)}`, { replace: true })
      return
    }
    const name = f.name.trim()
    if (!name) { setErr(c('needName')); return }
    if (!(paid > 0)) { setErr(c('needPrice')); return }
    setBusy(true)
    try {
      const [wallets, rows] = await Promise.all([api.getWallets(), api.getPortfolio().catch(() => [])])
      const id = newAssetId(name, (rows || []).map(r => r.coin_id))
      await api.addTransaction({
        wallet_id: wallets?.[0]?.id ?? 1, type: 'buy', category: 'other',
        coin_id: id, coin_symbol: name.toUpperCase().slice(0, 12), coin_name: name.slice(0, 60),
        amount: 1, price_per_unit: paid, date: `${f.boughtAt || thisMonth()}-01`,
      })
      saveRealAsset(id, { ...meta(), anchor: { price: paid, at: Number.isFinite(at) ? at : Date.now() } })
      track('real_asset_add', { kind: f.kind })
      navigate(`/asset/${encodeURIComponent(id)}`, { replace: true })
    } catch {
      setErr(c('failed'))
      setBusy(false)
    }
  }

  const k = f.kind
  const money = (key, label) => (
    <label className="ra-label">{label}
      <input inputMode="decimal" value={f[key]} onChange={set(key)} placeholder="0" />
    </label>
  )

  return (
    <div className="page">
      <form className="ra" onSubmit={submit} noValidate>
        <div className="ra-head">
          <button type="button" className="ra-back" onClick={() => navigate(-1)} aria-label={c('cancel')}><BackIcon /></button>
          <div>
            <h2>{editing ? c('editTitle') : c('addTitle')}</h2>
            <small>{editing ? (holding?.coin_name || f.name) : c('addSub')}</small>
          </div>
        </div>

        <div className="ra-kinds" role="group" aria-label={c('use')}>
          {KINDS.map(id => (
            <button key={id} type="button" className={`ra-kind${k === id ? ' is-on' : ''}`} aria-pressed={k === id}
              style={{ '--c': KIND_UI[id].c }} onClick={() => pickKind(id)}>
              <span className="ra-kind-ic"><KindIcon kind={id} /></span>
              <b>{c(`k_${id}`)}</b>
            </button>
          ))}
        </div>

        <section className="ra-card">
          {!editing && (
            <label className="ra-label">{c('name')}
              <input value={f.name} onChange={set('name')} placeholder={c('namePh')} maxLength={60} />
            </label>
          )}

          {(!editing || !f.hasStart) && (
            <div className="ra-two">
              {money('boughtFor', c('boughtFor'))}
              <label className="ra-label">{c('boughtAt')}
                <input type="month" value={f.boughtAt} max={thisMonth()} onChange={set('boughtAt')} />
              </label>
            </div>
          )}

          {k === 'home' && (
            <>
              <div className="ra-two">
                <label className="ra-label">{c('city')}<input value={f.city} onChange={set('city')} maxLength={60} /></label>
                <label className="ra-label">{c('size')}<input inputMode="decimal" value={f.size} onChange={set('size')} /></label>
              </div>
              <div className="ra-label">{c('use')}
                <div className="ra-chips">
                  {USES.map(u => (
                    <button key={u} type="button" className={f.use === u ? 'is-on' : ''} aria-pressed={f.use === u} onClick={() => set('use')(u)}>{c(`u_${u}`)}</button>
                  ))}
                </div>
              </div>
              <div className="ra-two">
                {f.use === 'rent' && money('rent', c('rent'))}
                {money('loanLeft', c('loanLeft'))}
                {money('loanMonthly', c('loanMonthly'))}
              </div>
            </>
          )}

          {k === 'car' && (
            <>
              <div className="ra-two">
                <label className="ra-label">{c('year')}<input inputMode="numeric" value={f.year} onChange={set('year')} placeholder="2022" /></label>
                <label className="ra-label">{c('km')}<input inputMode="numeric" value={f.km} onChange={set('km')} /></label>
                {money('costs', c('costs'))}
                {money('loanLeft', c('loanLeft'))}
              </div>
            </>
          )}

          {k === 'biz' && <div className="ra-two">{money('rent', c('income'))}{money('loanLeft', c('loanLeft'))}</div>}

          {k === 'owed' && (
            <label className="ra-label">{c('dueDate')}<input type="date" value={f.dueDate} onChange={set('dueDate')} /></label>
          )}

          {(k === 'home' || k === 'car' || k === 'gem' || k === 'art') && (
            <label className="ra-label">{c('insuranceDue')}<input type="date" value={f.insuranceDue} onChange={set('insuranceDue')} /></label>
          )}

          <label className="ra-label">{c('growth')}
            <input inputMode="decimal" value={f.growth} onChange={set('growth')} />
          </label>
          <small className="ra-muted">{c('growthHint')}</small>
        </section>

        {pv && (
          <section className="ra-hero" aria-live="polite">
            <span className="ra-hero-k">{c('preview')}</span>
            <div className="ra-trio">
              <div><b>{usd(pv.value)}</b><small>{c('pvValue')}</small></div>
              {n(f.loanLeft) > 0
                ? <div><b>{usd(pv.mine)}</b><small>{c('pvMine')}</small></div>
                : <div><b>{pv.next >= 0 ? '+' : ''}{usd(pv.next)}</b><small>{c('pvNext')}</small></div>}
              {pv.yieldPct != null && <div><b>{pv.yieldPct.toFixed(1)}%</b><small>{c('pvYield')}</small></div>}
            </div>
            <small>{c('pvNote')}</small>
          </section>
        )}

        {err && <p className="ra-error" role="alert">{err}</p>}
        <button type="submit" className="ra-cta" disabled={busy}>{busy ? c('saving') : editing ? c('save') : c('add')}</button>
      </form>
    </div>
  )
}
