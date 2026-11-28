// The Dashboard's Recharts charts, in a module of their own so they load
// lazily. Dashboard.jsx imports these through React.lazy: recharts is the
// largest library the dashboard uses, and as a static import it held back the
// first render of the page until it had downloaded and parsed, even when no
// chart was going to be drawn (an empty portfolio draws none).
//
// The markup is unchanged from when it lived inline in Dashboard.jsx; values
// it used from the page's scope now arrive as props.
import {
  ResponsiveContainer, BarChart, Bar, ComposedChart, Area, Line,
  PieChart, Pie, Cell, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts'

// Candlestick shape — recharts has no native candle, so we draw the
// wick (high→low) and body (open↔close) from the [low, high] range bar.
const Candle = ({ x, y, width, height, payload }) => {
  if (!payload) return null
  const { open, close, high, low } = payload
  const color = close >= open ? 'var(--g)' : '#f87171'
  const span = high - low
  const pp = span > 0 ? height / span : 0
  const bodyY = span > 0 ? y + (high - Math.max(open, close)) * pp : y
  const bodyH = Math.max(3, span > 0 ? Math.abs(close - open) * pp : height)
  const cx = x + width / 2
  const bw = Math.min(Math.max(width * 0.82, 8), 26)
  return (
    <g>
      <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={color} strokeWidth={1.5} strokeOpacity={0.9} />
      <rect x={cx - bw / 2} y={bodyY} width={bw} height={bodyH} rx={1} fill={color} />
    </g>
  )
}

/** Portfolio performance: area, line or candlesticks, with the invested baseline. */
export function PerfChart({ chartType, candles, series, gradId, strokeColor, inv, invStop, cv, fmtTs }) {
  // O/H/L/C tooltip for the candlestick view.
  const candleTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{ background:'var(--bg4)', border:'1px solid var(--border)', borderRadius:10, padding:'0.5rem 0.75rem', boxShadow:'var(--shadow)', fontSize:'0.72rem' }}>
        <div style={{ color:'var(--text-muted)', fontWeight:600, marginBottom:'0.3rem' }}>{fmtTs(d.ts)}</div>
        <div style={{ display:'grid', gridTemplateColumns:'auto auto', gap:'0.1rem 0.7rem', fontWeight:700, color:'var(--text)' }}>
          <span style={{ color:'var(--text-sub)' }}>O</span><span>{cv(d.open)}</span>
          <span style={{ color:'var(--text-sub)' }}>H</span><span>{cv(d.high)}</span>
          <span style={{ color:'var(--text-sub)' }}>L</span><span>{cv(d.low)}</span>
          <span style={{ color:'var(--text-sub)' }}>C</span><span style={{ color: d.close >= d.open ? 'var(--g)' : '#f87171' }}>{cv(d.close)}</span>
        </div>
      </div>
    )
  }
  const isCandles = chartType === 'candles'
  // Candles get their own y-domain fitted to the candle high/low range
  // (with headroom) instead of being forced to include the far-away
  // invested baseline — otherwise a small intraday range collapses every
  // candle into a thin band at the top of the frame, all the same size.
  let candleDomain = ['auto', 'auto']
  if (isCandles && candles.length) {
    let lo = candles[0].low, hi = candles[0].high
    for (const c of candles) { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high }
    const span = hi - lo
    const pad = span > 0 ? span * 0.18 : (hi * 0.004 || 1)
    candleDomain = [lo - pad, hi + pad]
  }
  // Driven directly by the real series values (snapshots → transaction
  // replay → simulation), so the curve is accurate across all chart types.
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={isCandles ? candles : series} margin={{ left:0, right:0, top:8, bottom:0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.22}/>
            <stop offset="85%" stopColor={strokeColor} stopOpacity={0.02}/>
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0}/>
          </linearGradient>
          {invStop != null && (
            <linearGradient id="pg-split" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--g)" stopOpacity={0.26}/>
              <stop offset={invStop} stopColor="var(--g)" stopOpacity={0.03}/>
              <stop offset={invStop} stopColor="#f87171" stopOpacity={0.04}/>
              <stop offset="100%" stopColor="#f87171" stopOpacity={0.22}/>
            </linearGradient>
          )}
        </defs>
        <XAxis hide dataKey="i" />
        <YAxis hide domain={isCandles
          ? candleDomain
          : (inv > 0
            ? [dMin => Math.min(dMin, inv), dMax => Math.max(dMax, inv)]
            : ['auto', 'auto'])} />
        {isCandles ? (
          <Tooltip content={candleTip} cursor={{ stroke: 'var(--text-sub)', strokeWidth:1, strokeDasharray:'4 3', opacity:0.4 }} />
        ) : (
          <Tooltip
            contentStyle={{ background:'var(--bg4)', border:'1px solid var(--border)', borderRadius:10, padding:'0.5rem 0.85rem', boxShadow:'var(--shadow)' }}
            itemStyle={{ color:'var(--text)', fontWeight:700, fontSize:'0.9rem' }}
            labelStyle={{ color:'var(--text-muted)', fontWeight:600, fontSize:'0.72rem', marginBottom:'0.15rem' }}
            separator=""
            formatter={v => [cv(v), '']}
            labelFormatter={(_, payload) => fmtTs(payload?.[0]?.payload?.ts)}
            cursor={{ stroke: strokeColor, strokeWidth:1, strokeDasharray:'4 3', opacity:0.5 }}
          />
        )}
        {inv > 0 && (
          <ReferenceLine y={inv} stroke="var(--text-sub)" strokeDasharray="5 4" strokeOpacity={0.7}
            label={{ value: 'Invested', position: 'insideLeft', fill: 'var(--text-sub)', fontSize: 10, fontWeight: 700, dy: -7 }} />
        )}
        {chartType === 'area' && (
          <Area type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={2.25}
            fill={invStop != null ? 'url(#pg-split)' : `url(#${gradId})`} dot={false} activeDot={{ r:5, fill:strokeColor, stroke:'#0d1f14', strokeWidth:2 }}
            isAnimationActive={true} animationDuration={900} animationEasing="ease-out"/>
        )}
        {chartType === 'line' && (
          <Line type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={2.25}
            dot={false} activeDot={{ r:5, fill:strokeColor, stroke:'#0d1f14', strokeWidth:2 }}
            isAnimationActive={true} animationDuration={900} animationEasing="ease-out"/>
        )}
        {isCandles && (
          <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** P&L per asset, green above zero and red below. */
export function PnlBarChart({ data, tooltipStyle, cv, cvN }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ left:0, right:0, top:4, bottom:0 }}>
        <defs>
          <linearGradient id="dvxPnlPos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.98"/>
            <stop offset="100%" stopColor="#0f9d76" stopOpacity="0.85"/>
          </linearGradient>
          <linearGradient id="dvxPnlNeg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f98080" stopOpacity="0.95"/>
            <stop offset="100%" stopColor="#dc4646" stopOpacity="0.85"/>
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false}/>
        <XAxis dataKey="name" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
        <YAxis tick={{ fill:'var(--text-sub)', fontSize:10 }} axisLine={false} tickLine={false}
          tickFormatter={v => cvN(v)} width={50}/>
        <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" strokeWidth={1}/>
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color:'var(--text)', fontWeight:700 }} cursor={false}
          formatter={v => [<span key="v" style={{ color: v >= 0 ? 'var(--g)' : '#f87171', fontWeight:700 }}>{cv(v)}</span>, 'P&L']}/>
        <Bar dataKey="pnl" radius={[6,6,0,0]} isAnimationActive animationDuration={800} animationEasing="ease-out">
          {data.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? 'url(#dvxPnlPos)' : 'url(#dvxPnlNeg)'}/>
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Net worth by category, as a donut. */
export function AllocationPie({ data, colors, palette, tooltipStyle, cv }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" cx="50%" cy="50%"
          innerRadius="60%" outerRadius="85%" stroke="none" paddingAngle={2}>
          {data.map((d, i) => <Cell key={i} fill={colors[d.cat] || palette[i % palette.length]}/>)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} itemStyle={{ color:'var(--text)', fontWeight:700 }} labelStyle={{ color:'var(--text)', fontWeight:700 }} formatter={(v, n) => [cv(v), n]}/>
      </PieChart>
    </ResponsiveContainer>
  )
}
