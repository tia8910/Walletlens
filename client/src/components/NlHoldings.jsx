import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import { AssetLogo, Spark } from './HomeTop'
import { api } from '../api'
import { daySeries, hasDayLine } from '../daySpark'

// The amount under the ticker, short enough to stay on one line: fewer
// decimals as the number grows (the full amount is in the tooltip and on the
// asset page).
export function fmtAmt(n) {
  const v = Math.abs(Number(n) || 0)
  const d = v >= 100 ? 2 : v >= 1 ? 4 : 6
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d })
}

/**
 * The last 24 hours per holding, a few at a time so a long list does not
 * hit the price sources all at once. Rows keep their previous line while a
 * refresh is in flight.
 */
function useDaySparks(rows) {
  const key = rows.map(h => h.coin_id).join(',')
  const [map, setMap] = useState({})
  useEffect(() => {
    let alive = true
    const queue = rows.filter(hasDayLine)
    const work = async () => {
      while (alive && queue.length) {
        const h = queue.shift()
        try {
          const v = await api.getDaySpark(h.coin_id, h.coin_symbol, h.price)
          if (alive && v?.length > 3) setMap(m => ({ ...m, [h.coin_id]: v }))
        } catch { /* no line beats a wrong one */ }
      }
    }
    for (let i = 0; i < 3; i++) work()
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return map
}

// Holdings in the new look, as the approved mockup draws them: one white card
// of rows (logo, name and amount, the week's line, value and the day's move).
//
// Nothing the old list did is lost; it is reached differently:
//   search, sort and direction    the round tools beside the title
//   category filter               the chips under it
//   break-even view               the scale tool; rows then show the price
//                                 to break even and how far away it is
//   Excel / PDF export            the tools
//   select, sum and filter        the tick tool turns tapping into checking;
//                                 "Selected" shows only the checked ones and
//                                 the bar sums them (long-press → Select too)
//   per-asset actions             the ⋮ on each row (target, vision,
//                                 technicals, magic score, risk scan, buy,
//                                 sell), and long-press for the full menu
//   sub-filters (Stable, L1…)     chips under a chosen category

export default function NlHoldings({
  rows, total, cats, cat, setCat, search, setSearch, sort, setSort, dir, setDir,
  breakEven, setBreakEven, onExcel, onPdf, selected, onClearSelected, selectedStats, filteredStats,
  hidden, cv, px = cv, marketSparks = {}, onAsset, bindRow, showAll, setShowAll, pricesFailed,
  badges = null, badge = 'all', setBadge = () => {}, actionsFor = () => [], onToggleSelect = () => {}, onAlert = null,
}) {
  const { t } = useLanguage()
  const [searching, setSearching] = useState(!!search)
  const [openRow, setOpenRow] = useState(null)
  const [picking, setPicking] = useState(false)
  const [onlySel, setOnlySel] = useState(false)
  const selOn = onlySel && selected.size > 0
  const filtered = !!search.trim() || cat !== 'all' || badge !== 'all' || selOn
  const base = selOn ? rows.filter(h => selected.has(h.coin_id)) : rows
  // Every holding, always. A five-row preview under an "All (9)" chip that
  // was already selected read as assets gone missing.
  const shown = base
  // The day's line, matching the day's change printed beside it.
  const daySparks = useDaySparks(shown)
  const mask = (s) => hidden ? '••••' : s
  const pctTxt = (v) => `${v >= 0 ? '+' : ''}${Number(v || 0).toFixed(2)}%`
  const tool = (on, label, icon, active) => (
    <button type="button" className={`nl-tool${active ? ' on' : ''}`} onClick={on} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
    </button>
  )

  const renderRow = (h) => {
            const isSel = selected.has(h.coin_id)
            const value = h.value > 0 ? h.value : h.total_invested
            const be = h.amount > 0 ? h.total_invested / h.amount : 0
            const beGap = h.price > 0 && be > 0 ? ((h.price - be) / be) * 100 : null
            const ch = Number(h.pct24h) || 0
            const sym = h.coin_symbol?.toUpperCase() || ''
            const showsDay = !(sort === 'pnl_pct' || sort === 'invested')
            return (
              <div key={h.coin_id} className="nl-hrow">
              {/* The row and its actions button sit side by side: a button
                  inside a role="button" row is a control within a control,
                  which screen readers cannot reach. */}
              <div className="nl-hline">
              <div role="button" tabIndex={0} aria-pressed={picking ? isSel : undefined} className={`nl-row${isSel ? ' sel' : ''}${picking ? ' picking' : ''}`}
                onClick={() => (picking ? onToggleSelect(h) : onAsset(h))}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picking ? onToggleSelect(h) : onAsset(h) } }} {...bindRow(h)}>
                {picking && <span className={`nl-check${isSel ? ' on' : ''}`} aria-hidden="true">{isSel ? '✓' : ''}</span>}
                <span className="nl-row-logo">
                  <AssetLogo h={h} size={40} />
                  {isSel && !picking && <i aria-hidden="true">✓</i>}
                </span>
                <div className="nl-row-n">
                  <b title={h.coin_name || sym}>{sym || h.coin_name}</b>
                  {breakEven && be > 0 && beGap != null
                    ? <small>{t('dsBreakEvenAt')} {mask(cv(be))} <span className={beGap >= 0 ? 'up' : 'down'}>{beGap >= 0 ? '↑' : '↓'}{Math.abs(beGap).toFixed(1)}%</span></small>
                    : <small className="nl-row-amt" title={`${Number(h.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 8 })} ${sym}`}>{mask(fmtAmt(h.amount))}</small>}
                </div>
                <div className="nl-row-mid">
                  <Spark values={hasDayLine(h) ? daySeries(daySparks[h.coin_id], h.price, marketSparks[h.coin_id]) : null} w={64} h={26} className="nl-row-spark"
                    up={showsDay ? ch >= 0 : undefined} />
                  {h.price > 0 && <small className="nl-row-px">{px(h.price)}</small>}
                </div>
                <div className="nl-row-v">
                  <b>{mask(cv(value))}</b>
                  {!showsDay
                    ? <small className={h.pnl >= 0 ? 'up' : 'down'}>{pctTxt(h.pnlPct)}</small>
                    : <small className={ch >= 0 ? 'up' : 'down'}>{pctTxt(ch)}</small>}
                </div>
              </div>
                {onAlert && !picking && (
                  <button type="button" className="nl-row-more nl-row-alert" aria-label={`${t('paSetPriceAlert')}: ${sym}`} title={t('paSetPriceAlert')}
                    onClick={e => { e.stopPropagation(); track('holding_alert_click'); onAlert(h) }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" /><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" /></svg>
                  </button>
                )}
                <button type="button" className={`nl-row-more${openRow === h.coin_id ? ' on' : ''}`} aria-label={t('atAssetActions')} aria-expanded={openRow === h.coin_id}
                  onClick={e => { e.stopPropagation(); setOpenRow(r => r === h.coin_id ? null : h.coin_id) }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
                </button>
              </div>
              {openRow === h.coin_id && (
                <div className="nl-row-actions">
                  {actionsFor(h).map(a => (
                    <button key={a.label} type="button" className={a.tone ? `nl-act-${a.tone}` : ''} onClick={() => { setOpenRow(null); a.onClick() }}>
                      <Icon name={a.icon} size={14} />{a.label}
                    </button>
                  ))}
                </div>
              )}
              </div>
            )
          }

  // With every holding showing, the list is split by category, each under
  // a header with its count, value and share, in the order of the chips.
  // The chosen sort still applies inside each group. A header folds its
  // group. Searching, a chosen chip or the selection shows one flat list.
  const [folded, setFolded] = useState(() => new Set())
  const toggleFold = (c) => setFolded(f => { const n = new Set(f); if (n.has(c)) n.delete(c); else n.add(c); return n })
  const groups = useMemo(() => {
    if (filtered || cats.length < 2) return null
    const catOf = {}
    for (const c of cats) for (const a of c.assets || []) catOf[a.coin_id] = c.cat
    if (shown.some(h => !catOf[h.coin_id])) return null
    const out = cats.map(c => ({ ...c, rows: shown.filter(h => catOf[h.coin_id] === c.cat) })).filter(g => g.rows.length)
    // Sorted by value, the biggest class leads, as the biggest holding does.
    if (sort === 'value') out.sort((a, b) => (dir === 'asc' ? 1 : -1) * ((a.value || 0) - (b.value || 0)))
    return out
  }, [filtered, cats, shown, sort, dir])

  return (
    <>
      <div className="nl-sec">
        <h3>{t('nlHoldings')}</h3>
      </div>

      <div className="nl-card nl-hold">
        <div className="nl-hold-tools">
          {tool(() => setSearching(v => { if (v) setSearch(''); return !v }), t('phSearchAssets'), <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>, searching)}
          <label className="nl-sort">
            <select value={sort} onChange={e => setSort(e.target.value)} aria-label={t('nlSort')}>
              <option value="value">{t('adValue')}</option>
              <option value="pnl_pct">P&L %</option>
              <option value="pct24h">24 h</option>
              <option value="invested">{t('invested')}</option>
              <option value="name">{t('vsName')}</option>
            </select>
          </label>
          {tool(() => setDir(d => d === 'desc' ? 'asc' : 'desc'), dir === 'desc' ? 'Descending' : 'Ascending',
            dir === 'desc' ? <path d="M12 5v14m-6-6 6 6 6-6" /> : <path d="M12 19V5m-6 6 6-6 6 6" />)}
          <span className="nl-tools-gap" />
          {tool(() => setPicking(v => !v), t('nlSelect'), <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>, picking)}
          {tool(() => setBreakEven(v => !v), t('dsBreakEven'), <><path d="M12 4v16M5 20h14" /><path d="M5 8h14M7 8l-3 6h6zM17 8l-3 6h6z" /></>, breakEven)}
          {tool(() => { track('holdings_export', { format: 'excel' }); onExcel() }, 'Excel', <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></>)}
          {tool(() => { track('holdings_export', { format: 'pdf' }); onPdf() }, 'PDF', <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>)}
        </div>

        {searching && (
          <input className="nl-search" autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('phSearchAssets')} />
        )}

        {(cats.length > 1 || selected.size > 0) && (
          <div className="nl-chips">
            {selected.size > 0 && (
              <button type="button" className={`nl-chip-sel${selOn ? ' on' : ''}`} onClick={() => setOnlySel(v => !v)}>✓ {t('nlSelected')(selected.size)}</button>
            )}
            {cats.length > 1 && [{ cat: 'all', label: t('nlAllCount')(total) }, ...cats.map(c => ({ cat: c.cat, label: `${c.label} · ${c.assets.length}` }))].map(c => (
              <button key={c.cat} type="button" className={cat === c.cat && !selOn ? 'on' : ''} onClick={() => { setOnlySel(false); setCat(c.cat) }}>{c.label}</button>
            ))}
          </div>
        )}

        {badges && (
          <div className="nl-chips nl-subchips">
            {['all', ...badges].map(b => (
              <button key={b} type="button" className={badge === b ? 'on' : ''} onClick={() => setBadge(b)}>{b === 'all' ? t('nlAllPrices') : b}</button>
            ))}
          </div>
        )}

        {(selectedStats || filteredStats) && (
          <div className={`nl-sum${selectedStats ? ' sel' : ''}`}>
            <span>{selectedStats ? t('nlSelected')(selected.size) : t('nlShowing')(base.length)}</span>
            <b>{mask(cv((selectedStats || filteredStats).value))}</b>
            {!pricesFailed && (selectedStats || filteredStats).pnl !== 0 && (
              <em className={(selectedStats || filteredStats).pnl >= 0 ? 'up' : 'down'}>{pctTxt((selectedStats || filteredStats).pnlPct)}</em>
            )}
            {selectedStats && <button type="button" onClick={onClearSelected} aria-label={t('atClearSelection')}>✕</button>}
          </div>
        )}

        <div className="nl-list">
          {groups ? groups.map(g => {
            const open = !folded.has(g.cat)
            return (
              <section key={g.cat} className="nl-group" aria-label={g.label}>
                <button type="button" className="nl-ghead" aria-expanded={open} onClick={() => toggleFold(g.cat)}>
                  <i className="nl-ghead-dot" style={{ background: g.color || 'var(--g)' }} aria-hidden="true" />
                  <b>{g.label}</b>
                  <span className="nl-ghead-n">{g.rows.length}</span>
                  <span className="nl-ghead-v">
                    {mask(cv(g.value))}
                    {/* Today's move for the whole group, coloured like the rows, then its share. */}
                    {g.dayPct != null && !pricesFailed && <em className={g.dayPct >= 0 ? 'up' : 'down'}>{pctTxt(g.dayPct)}</em>}
                    <small>{Math.round(g.pct)}%</small>
                  </span>
                  <svg className={`nl-ghead-chev${open ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                {open && g.rows.map(renderRow)}
              </section>
            )
          }) : shown.map(renderRow)}
          {shown.length === 0 && <p className="nl-empty">{t('dsNothingYet')}</p>}
        </div>
      </div>
    </>
  )
}
