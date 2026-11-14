import { useEffect, useState } from 'react'

// recharts, loaded the first time a chart actually mounts.
//
// Dashboard used to import recharts statically, which made the `charts` chunk
// (~440 KB raw, ~117 KB gzip — the largest JS on the route) a hard dependency
// of the Dashboard chunk: it had to download and parse before Home could
// render a single row. But the default Home — the new look with holdings on
// the overview tab — and the empty portfolio draw no chart at all; the charts
// live in the insights view, the demo and the classic look. Most app opens
// paid for a library they never used.
//
// useRecharts() returns the real components once the module is in, and
// stand-ins until then. The stand-in ResponsiveContainer reserves the chart's
// box (so nothing shifts when it fills in) and is what triggers the load, so
// the module is fetched exactly when some chart is on screen — no guessing at
// which views have charts, and nothing to keep in sync when that changes.

let mod = null
let pending = null
const listeners = new Set()

export function loadRecharts() {
  if (mod) return Promise.resolve(mod)
  if (!pending) {
    pending = import('recharts').then(
      m => {
        mod = m
        for (const fn of listeners) fn(m)
        listeners.clear()
        return m
      },
      err => {
        // Offline or a stale deploy: let the next chart mount try again.
        pending = null
        throw err
      },
    )
  }
  return pending
}

function PendingContainer({ width = '100%', height }) {
  useEffect(() => { loadRecharts().catch(() => {}) }, [])
  return <div aria-hidden="true" style={{ width, height }} />
}

const Nothing = () => null

// Only ResponsiveContainer ever renders while loading — every chart sits inside
// one — so the rest only need to exist.
const STAND_INS = {
  ResponsiveContainer: PendingContainer,
  AreaChart: Nothing, Area: Nothing, BarChart: Nothing, Bar: Nothing,
  ComposedChart: Nothing, Line: Nothing, LineChart: Nothing,
  PieChart: Nothing, Pie: Nothing, Cell: Nothing, Tooltip: Nothing,
  XAxis: Nothing, YAxis: Nothing, CartesianGrid: Nothing, ReferenceLine: Nothing,
}

export function useRecharts() {
  const [m, setM] = useState(mod)
  useEffect(() => {
    if (m) return undefined
    if (mod) { setM(mod); return undefined }
    listeners.add(setM)
    return () => { listeners.delete(setM) }
  }, [m])
  return m || STAND_INS
}
