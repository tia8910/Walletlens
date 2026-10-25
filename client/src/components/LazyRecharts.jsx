import { useEffect, useState } from 'react'

// recharts is ~440 KB. The dashboard's first paint doesn't need it (the charts sit
// below the header and totals), so it is fetched after mount instead of blocking
// the whole Dashboard chunk. Callers get the module as `R` via a render prop and
// the slot keeps its height meanwhile, so nothing shifts when the chart arrives.
let loaded = null

export default function LazyRecharts({ height, children }) {
  const [R, setR] = useState(loaded)
  useEffect(() => {
    if (R) return
    let live = true
    import('recharts').then(m => { loaded = m; if (live) setR(m) }).catch(() => {})
    return () => { live = false }
  }, [R])
  return R ? children(R) : <div style={{ height }} aria-hidden="true" />
}
