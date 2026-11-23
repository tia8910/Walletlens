import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../LanguageContext'
import { realAssetsCopy } from '../realAssetsCopy'
import { categorizeAsset } from '../data/assets'
import { isStablecoin } from '../stablecoins'
import { loadRealAssets, cashLadder, loansOn, monthlyIncome, todoList } from '../realAssets'
import { usd } from './realAssetsUi'
import '../realAssets.css'

const GROUP_COLOR = { markets: '#10b981', real: '#a78bfa', other: '#f472b6', cash: '#94a3b8' }

/**
 * Home: everything owned, markets and real assets together. Net worth after
 * what is still owed, how fast it would turn into cash, the income it brings,
 * and the jobs worth doing. Shown once the portfolio holds a real asset.
 */
export default function RealAssetsCard({ rows, hidden = false, money = usd }) {
  const { lang } = useLanguage()
  const c = useMemo(() => realAssetsCopy(lang), [lang])
  const navigate = useNavigate()

  const data = useMemo(() => {
    const list = (rows || []).filter(h => (Number(h.value) || 0) > 0)
    if (!list.some(h => String(h.coin_id || '').startsWith('other:'))) return null
    const all = loadRealAssets()
    const groups = { markets: 0, real: 0, other: 0, cash: 0 }
    for (const h of list) {
      const cat = categorizeAsset(h)
      const g = cat === 'realestate' ? 'real' : cat === 'other' ? 'other' : (cat === 'cash' || isStablecoin(h.coin_id, h.coin_symbol)) ? 'cash' : 'markets'
      groups[g] += Number(h.value) || 0
    }
    const total = Object.values(groups).reduce((a, b) => a + b, 0)
    const loans = loansOn(list, all)
    const ladder = cashLadder(list, all)
    return {
      total, groups, net: total - loans, loans, ladder,
      todayPct: total > 0 ? Math.round((ladder.today / total) * 100) : 0,
      income: monthlyIncome(list, all),
      todo: todoList(list, all).slice(0, 4),
    }
  }, [rows])

  if (!data) return null
  const show = (v) => (hidden ? '••••' : money(v))
  const pct = (v) => (data.total > 0 ? (v / data.total) * 100 : 0)

  return (
    <section className="ra" style={{ margin: '12px 0' }}>
      <div className="ra-card">
        <div className="ra-row"><b style={{ color: 'var(--text)', fontSize: '0.95rem' }}>{c('cardTitle')}</b>{data.loans > 0 && <span>{c('afterLoans')}</span>}</div>
        <span style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-.02em' }}>{show(data.net)}</span>
        <div className="ra-split" aria-hidden="true">
          {['markets', 'real', 'other', 'cash'].map(g => data.groups[g] > 0 && <span key={g} style={{ width: `${pct(data.groups[g])}%`, background: GROUP_COLOR[g] }} />)}
        </div>
        <div className="ra-legend-grid">
          {['markets', 'real', 'other', 'cash'].filter(g => data.groups[g] > 0).map(g => (
            <span key={g}><i style={{ width: 10, height: 10, borderRadius: 3, background: GROUP_COLOR[g], flex: 'none' }} />{c(`g_${g}`)}<b>{show(data.groups[g])}</b></span>
          ))}
        </div>
      </div>

      <div className="ra-hero">
        <span className="ra-hero-k">{c('ladderTitle')}</span>
        {[
          { k: 'l_today', v: data.ladder.today, col: '#34d399' },
          { k: 'l_weeks', v: data.ladder.weeks, col: '#f472b6' },
          { k: 'l_months', v: data.ladder.months, col: '#a78bfa' },
        ].filter(r => r.v > 0).map(r => (
          <div key={r.k} className="ra-ladder">
            <div className="ra-eq-legend"><span>{c(r.k)}</span><b style={{ color: '#fff' }}>{show(r.v)}</b></div>
            <div className="ra-ladder-bar"><span style={{ width: `${pct(r.v)}%`, background: r.col }} /></div>
          </div>
        ))}
        {data.todayPct < 70 && <small>{c('ladderNote')(data.todayPct)}</small>}
      </div>

      {data.income > 0 && (
        <div className="ra-card">
          <div className="ra-row"><b style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{c('incomeTitle')}</b><b>{show(data.income)} {c('perMonth')}</b></div>
        </div>
      )}

      {data.todo.length > 0 && (
        <div className="ra-card">
          <b className="ra-card-title">{c('todoTitle')}</b>
          <div className="ra-list">
            {data.todo.map(t => (
              <button key={`${t.id}-${t.what}`} type="button" className="ra-li" onClick={() => navigate(`/asset/${encodeURIComponent(t.id)}`)}>
                <span>{t.what === 'value' ? c('todo_value')(t.name) : t.what === 'insurance' ? c('todo_insurance')(t.name) : t.what === 'owedLate' ? c('todo_owedLate')(t.name) : c('todo_owedDue')(t.name)}</span>
                <b className="is-warn">{t.what === 'value' ? c('monthsOld')(t.months) : t.what === 'owedLate' ? c('daysLate')(t.days) : c('inDays')(t.days)}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      <button type="button" className="ra-ghost" onClick={() => navigate('/real-assets/new')}>{c('addReal')}</button>
    </section>
  )
}
