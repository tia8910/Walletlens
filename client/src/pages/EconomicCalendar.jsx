import { useEffect, useState } from 'react'
import { api } from '../api'
import { track } from '../analytics'

const CAL_FLAGS = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CNY: '🇨🇳',
  CAD: '🇨🇦', AUD: '🇦🇺', CHF: '🇨🇭', NZD: '🇳🇿',
}
const CAL_IMPACT = {
  high:    { c: '#ef4444', l: 'High'    },
  medium:  { c: '#f59e0b', l: 'Medium'  },
  low:     { c: '#eab308', l: 'Low'     },
  holiday: { c: '#64748b', l: 'Holiday' },
}

function timeAgo(d) {
  const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (sec < 60)    return sec + 's ago'
  if (sec < 3600)  return Math.floor(sec / 60) + 'm ago'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago'
  return Math.floor(sec / 86400) + 'd ago'
}

function calDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  const wd = d.toLocaleDateString(undefined, { weekday: 'long' })
  const md = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (diff === 0) return { tag: 'Today', main: `${wd}, ${md}`, today: true }
  if (diff === 1) return { tag: 'Tomorrow', main: `${wd}, ${md}`, today: false }
  return { tag: '', main: `${wd}, ${md}`, today: false }
}

export default function EconomicCalendar() {
  const [data, setData] = useState({ updated: '', events: [] })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { track('calendar_view'); load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await api.getEconomicCalendar()
      setData(res || { updated: '', events: [] })
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const FILTERS = [
    { k: 'all',    l: 'All'    },
    { k: 'high',   l: 'High'   },
    { k: 'medium', l: 'Medium' },
    { k: 'low',    l: 'Low'    },
  ]

  // Keep today's and upcoming events; drop what already passed.
  const todayStr = new Date().toISOString().slice(0, 10)
  const upcoming = (data.events || [])
    .filter(e => e.date >= todayStr)
    .filter(e => filter === 'all' ? true : e.impact === filter)

  // Group by day, preserving chronological order.
  const groups = []
  const byDate = {}
  for (const e of upcoming) {
    if (!byDate[e.date]) { byDate[e.date] = []; groups.push(e.date) }
    byDate[e.date].push(e)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Economic Calendar</h1>
          <p className="page-sub">Market-moving macro events — CPI, jobs, GDP & central-bank decisions.</p>
        </div>
        <button className="refresh-btn" onClick={load} disabled={loading}>
          {loading
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin 0.8s linear infinite'}}><path d="M21 12a9 9 0 1 1-4.219-7.617"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.86"/></svg>}
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="cal-filters">
        {FILTERS.map(f => (
          <button
            key={f.k}
            className={`cal-filter ${filter === f.k ? 'active' : ''}`}
            onClick={() => setFilter(f.k)}
          >
            {f.k !== 'all' && <span className="cal-dot" style={{ background: CAL_IMPACT[f.k]?.c }} />}
            {f.l}
          </button>
        ))}
      </div>

      {loading && <div className="card"><p className="muted">Loading calendar…</p></div>}

      {!loading && groups.length === 0 && (
        <div className="card"><p className="muted">No upcoming events for this filter.</p></div>
      )}

      {!loading && groups.map(date => {
        const dl = calDayLabel(date)
        return (
          <div key={date} className={`cal-day ${dl.today ? 'today' : ''}`}>
            <div className="cal-day-head">
              <span className="cal-day-main">{dl.main}</span>
              {dl.tag && <span className={`cal-day-tag ${dl.today ? 'now' : ''}`}>{dl.tag}</span>}
            </div>
            <div className="cal-rows">
              {byDate[date].map((e, i) => {
                const imp = CAL_IMPACT[e.impact] || CAL_IMPACT.low
                return (
                  <div key={i} className="cal-row">
                    <span className="cal-time">{e.time || 'All day'}</span>
                    <span className="cal-imp" style={{ background: imp.c }} title={imp.l} />
                    <div className="cal-title-wrap">
                      <span className="cal-flag">{CAL_FLAGS[e.country] || ''}</span>
                      <span className="cal-title">{e.title}</span>
                    </div>
                    <div className="cal-nums">
                      <div className="cal-num">
                        <span className="cal-num-lbl">Prev</span>
                        <span className="cal-num-val">{e.previous || '–'}</span>
                      </div>
                      <div className="cal-num">
                        <span className="cal-num-lbl">Fcst</span>
                        <span className="cal-num-val">{e.forecast || '–'}</span>
                      </div>
                      <div className="cal-num">
                        <span className="cal-num-lbl">Act</span>
                        <span className={`cal-num-val ${e.actual ? 'live' : ''}`}>{e.actual || '–'}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {!loading && data.updated && (
        <p className="cal-updated">Updated {timeAgo(data.updated)} · source: FairEconomy</p>
      )}
    </div>
  )
}
