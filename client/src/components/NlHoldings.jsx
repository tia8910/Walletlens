import { useState } from 'react'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import { AssetLogo, Spark, useSparks } from './HomeTop'

// Holdings in the new look, as the approved mockup draws them: one white card
// of rows (logo, name and amount, the week's line, value and the day's move).
//
// Nothing the old list did is lost; it is reached differently:
//   search, sort and direction    the round tools beside the title
//   category filter               the chips under it
//   break-even view               the scale tool; rows then show the price
//                                 to break even and how far away it is
//   Excel / PDF export            the tools
//   select and sum several        long-press → Select; a bar shows the sum
//   per-asset actions             long-press, as everywhere else in the app
const PREVIEW = 5

export default function NlHoldings({
  rows, total, cats, cat, setCat, search, setSearch, sort, setSort, dir, setDir,
  breakEven, setBreakEven, onExcel, onPdf, selected, onClearSelected, selectedStats, filteredStats,
  hidden, cv, marketSparks = {}, onAsset, bindRow, showAll, setShowAll, pricesFailed,
}) {
  const { t } = useLanguage()
  const [searching, setSearching] = useState(!!search)
  const filtered = !!search.trim() || cat !== 'all'
  const shown = showAll || filtered ? rows : rows.slice(0, PREVIEW)
  // The week's line: market.json's when the coin is in it, otherwise the
  // app's cached chart data, fetched only for rows without one.
  const fetched = useSparks(shown.filter(h => !(marketSparks[h.coin_id]?.length > 3)).map(h => h.coin_id))
  const mask = (s) => hidden ? '••••' : s
  const pctTxt = (v) => `${v >= 0 ? '+' : ''}${Number(v || 0).toFixed(2)}%`
  const tool = (on, label, icon, active) => (
    <button type="button" className={`nl-tool${active ? ' on' : ''}`} onClick={on} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
    </button>
  )

  return (
    <>
      <div className="nl-sec">
        <h3>{t('nlHoldings')}</h3>
        {rows.length > PREVIEW && !filtered && (
          <button type="button" onClick={() => setShowAll(v => !v)}>{showAll ? t('showLess') : t('nlAllCount')(total)}</button>
        )}
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
          {tool(() => setBreakEven(v => !v), t('dsBreakEven'), <><path d="M12 4v16M5 20h14" /><path d="M5 8h14M7 8l-3 6h6zM17 8l-3 6h6z" /></>, breakEven)}
          {tool(() => { track('holdings_export', { format: 'excel' }); onExcel() }, 'Excel', <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></>)}
          {tool(() => { track('holdings_export', { format: 'pdf' }); onPdf() }, 'PDF', <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>)}
        </div>

        {searching && (
          <input className="nl-search" autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('phSearchAssets')} />
        )}

        {cats.length > 1 && (
          <div className="nl-chips">
            {[{ cat: 'all', label: t('nlAllCount')(total) }, ...cats.map(c => ({ cat: c.cat, label: `${c.label} · ${c.assets.length}` }))].map(c => (
              <button key={c.cat} type="button" className={cat === c.cat ? 'on' : ''} onClick={() => setCat(c.cat)}>{c.label}</button>
            ))}
          </div>
        )}

        {(selectedStats || filteredStats) && (
          <div className={`nl-sum${selectedStats ? ' sel' : ''}`}>
            <span>{selectedStats ? t('nlSelected')(selected.size) : t('nlShowing')(rows.length)}</span>
            <b>{mask(cv((selectedStats || filteredStats).value))}</b>
            {!pricesFailed && (selectedStats || filteredStats).pnl !== 0 && (
              <em className={(selectedStats || filteredStats).pnl >= 0 ? 'up' : 'down'}>{pctTxt((selectedStats || filteredStats).pnlPct)}</em>
            )}
            {selectedStats && <button type="button" onClick={onClearSelected} aria-label={t('atClearSelection')}>✕</button>}
          </div>
        )}

        <div className="nl-list">
          {shown.map(h => {
            const isSel = selected.has(h.coin_id)
            const value = h.value > 0 ? h.value : h.total_invested
            const be = h.amount > 0 ? h.total_invested / h.amount : 0
            const beGap = h.price > 0 && be > 0 ? ((h.price - be) / be) * 100 : null
            const ch = Number(h.pct24h) || 0
            const sym = h.coin_symbol?.toUpperCase() || ''
            return (
              <button type="button" key={h.coin_id} className={`nl-row${isSel ? ' sel' : ''}`} onClick={() => onAsset(h)} {...bindRow(h)}>
                <span className="nl-row-logo">
                  <AssetLogo h={h} size={40} />
                  {isSel && <i aria-hidden="true">✓</i>}
                </span>
                <div className="nl-row-n">
                  <b>{h.coin_name || sym}</b>
                  {breakEven && be > 0 && beGap != null
                    ? <small>{t('dsBreakEvenAt')} {mask(cv(be))} <span className={beGap >= 0 ? 'up' : 'down'}>{beGap >= 0 ? '↑' : '↓'}{Math.abs(beGap).toFixed(1)}%</span></small>
                    : <small>{mask(`${Number(h.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${sym}`)}</small>}
                </div>
                <Spark values={marketSparks[h.coin_id]?.length > 3 ? marketSparks[h.coin_id] : fetched[h.coin_id]} w={64} h={26} className="nl-row-spark" />
                <div className="nl-row-v">
                  <b>{mask(cv(value))}</b>
                  {sort === 'pnl_pct' || sort === 'invested'
                    ? <small className={h.pnl >= 0 ? 'up' : 'down'}>{pctTxt(h.pnlPct)}</small>
                    : <small className={ch >= 0 ? 'up' : 'down'}>{pctTxt(ch)}</small>}
                </div>
              </button>
            )
          })}
          {shown.length === 0 && <p className="nl-empty">{t('dsNothingYet')}</p>}
        </div>
      </div>
    </>
  )
}
