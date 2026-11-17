import { useEffect, useState } from 'react'

// recharts, loaded off the Dashboard's critical path.
//
// Dashboard used to import recharts statically, which made the 440 KB
// (~117 KB gzipped) charts chunk a hard dependency of the Dashboard chunk:
// the home screen could not render a single number — balance, holdings,
// prices — until the whole charting library had downloaded, parsed and
// evaluated, even though every chart on it sits below the balance.
//
// Now the library loads in parallel with the first render. Each chart reserves
// its exact height with an empty box until the module arrives, so nothing
// shifts when it does, and the chart then renders from the same JSX as before
// through a render prop: <LazyCharts height={180}>{R => <R.AreaChart …/>}</LazyCharts>.
//
// The recharts components must come from the module itself (not lazy() wrappers
// per component): recharts identifies its children by component type, and a
// wrapper would hide a <Bar> or <XAxis> from the chart that contains it.

let mod = null
let pending = null

export function loadCharts() {
  if (mod) return Promise.resolve(mod)
  if (!pending) {
    pending = import('../chartKit').then(
      (m) => (mod = m),
      (err) => { pending = null; throw err }, // let the next mount retry
    )
  }
  return pending
}

export default function LazyCharts({ height, children }) {
  const [R, setR] = useState(mod)
  useEffect(() => {
    if (R) return
    let live = true
    loadCharts().then((m) => { if (live) setR(m) }, () => { /* offline / stale deploy: keep the placeholder */ })
    return () => { live = false }
  }, [R])
  if (!R) return <div style={{ width: '100%', height }} aria-hidden="true" />
  return children(R)
}
