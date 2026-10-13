import { useEffect, useState } from 'react'

// Defers the ~440 KB charts chunk until a chart actually renders, so the
// Dashboard's first paint no longer waits on it. `children` is a render prop
// receiving the recharts exports; until they arrive a box of the final height
// is shown so the layout does not jump.
let mod = null
let pending = null
function load() {
  return pending || (pending = import('recharts').then(m => (mod = m)))
}

export default function LazyRecharts({ height, children }) {
  const [R, setR] = useState(mod)
  useEffect(() => {
    if (R) return undefined
    let live = true
    load().then(m => { if (live) setR(m) }).catch(() => {})
    return () => { live = false }
  }, [R])
  return R ? children(R) : <div style={{ height }} aria-hidden="true" />
}
