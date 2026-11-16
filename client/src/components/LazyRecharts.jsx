import { lazy, Suspense } from 'react'

// recharts (with d3) is ~440 KB minified / ~117 KB gzipped. A static import
// put all of it on the Dashboard's critical path: the page could not render a
// single number until the charts chunk had downloaded and evaluated — even for
// an empty portfolio, which draws no chart at all.
//
// Recharts inspects its children by component type, so its primitives cannot
// be lazy-wrapped one by one. Instead the whole chart subtree is a render
// prop that receives the loaded module:
//
//   <LazyRecharts height={180}>
//     {({ ResponsiveContainer, AreaChart, Area }) => <ResponsiveContainer>…}
//   </LazyRecharts>
//
// The fallback reserves the chart's height, so nothing shifts when it lands.
const Charts = lazy(() => import('recharts').then(m => ({
  default: function RechartsRenderProp({ render }) { return render(m) },
})))

/** Start fetching the charts chunk early (idle time), without rendering anything. */
export const preloadRecharts = () => import('recharts').catch(() => {})

export default function LazyRecharts({ height, children }) {
  return (
    <Suspense fallback={<div aria-hidden="true" style={{ width: '100%', height }} />}>
      <Charts render={children} />
    </Suspense>
  )
}
