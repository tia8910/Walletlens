import { useEffect, useMemo, useRef, useState } from 'react'

// Candlestick chart with the on-device indicators from chartSignals.js:
// EMA lines, golden/death crosses, BUY/SELL tags and the latest signal's
// stop, entry and targets. Plain SVG sized to its container, so labels stay
// crisp at any width. Colours come from CSS (.sc-*), so it follows the theme.

const fmt = (v) => {
  const n = Number(v)
  if (!isFinite(n)) return '—'
  const d = n >= 1000 ? 0 : n >= 1 ? 2 : n >= 0.01 ? 4 : 6
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
}

const CROSS_LABEL = { golden: 'Golden Cross', death: 'Death Cross', 'small-golden': 'Small GC', 'small-death': 'Small DC' }

export default function SignalChart({ candles, visible, calc, height = 260, closeOnly = false, ariaLabel }) {
  const boxRef = useRef(null)
  const [w, setW] = useState(340)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setW(Math.max(240, Math.round(el.clientWidth)))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const from = Math.max(0, (candles?.length || 0) - (visible || candles?.length || 0))
  const seg = useMemo(() => (candles || []).slice(from), [candles, from])
  const n = seg.length
  const padR = 50, padT = 8, padB = 10
  const h = height
  const last = calc?.last && calc.last.i >= from ? calc.last : null

  const scale = useMemo(() => {
    if (!n) return null
    const vals = seg.flatMap(c => [c.h, c.l])
    const add = (arr) => arr?.slice(from).forEach(v => { if (v != null) vals.push(v) })
    if (calc?.params?.cross?.on) { add(calc.ema.fast); add(calc.ema.mid); add(calc.ema.slow) }
    if (last) vals.push(last.stop, ...last.targets)
    let hi = Math.max(...vals), lo = Math.min(...vals)
    const pad = (hi - lo) * 0.06 || hi * 0.02
    hi += pad; lo -= pad
    return { hi, lo, y: v => padT + ((hi - v) / (hi - lo)) * (h - padT - padB) }
  }, [seg, calc, last, from, n, h])

  if (!n || !scale) return <div ref={boxRef} className="sc-empty">No chart data</div>

  const cw = (w - padR) / n
  const x = i => (i - from) * cw + cw / 2
  const { y, hi, lo } = scale
  const bodyW = Math.max(1, cw * 0.62)
  const linePath = (arr) => {
    let d = ''
    for (let i = from; i < arr.length; i++) {
      if (arr[i] == null) continue
      d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(arr[i]).toFixed(1)
    }
    return d
  }
  const ticks = [0, 1, 2, 3, 4].map(k => lo + ((hi - lo) * k) / 4)
  const hoverIdx = hover != null ? Math.min(n - 1, Math.max(0, hover)) : null
  const hc = hoverIdx != null ? seg[hoverIdx] : null

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * w
    setHover(Math.floor(px / cw))
  }

  return (
    <div ref={boxRef} className="sc-wrap">
      <div className="sc-readout" aria-live="polite">
        {hc
          ? closeOnly
            ? <span>Close <b>{fmt(hc.c)}</b></span>
            : <><span>O <b>{fmt(hc.o)}</b></span><span>H <b>{fmt(hc.h)}</b></span><span>L <b>{fmt(hc.l)}</b></span><span>C <b className={hc.c >= hc.o ? 'sc-t-up' : 'sc-t-dn'}>{fmt(hc.c)}</b></span></>
          : calc?.params?.cross?.on && (
            <>
              <span><i className="sc-key sc-k1" />EMA{calc.params.cross.fast} <b>{fmt(calc.ema.fast.at(-1))}</b></span>
              <span><i className="sc-key sc-k2" />EMA{calc.params.cross.mid} <b>{fmt(calc.ema.mid.at(-1))}</b></span>
              <span><i className="sc-key sc-k3" />EMA{calc.params.cross.slow} <b>{fmt(calc.ema.slow.at(-1))}</b></span>
            </>
          )}
      </div>
      <svg className="sc-svg" width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((v, k) => (
          <g key={k}>
            <line className="sc-grid" x1="0" x2={w - padR} y1={y(v)} y2={y(v)} />
            <text className="sc-axis" x={w - 4} y={y(v) + 3} textAnchor="end">{fmt(v)}</text>
          </g>
        ))}

        {seg.map((c, j) => {
          const up = c.c >= c.o, X = x(from + j)
          return (
            <g key={j} className={up ? 'sc-up' : 'sc-dn'}>
              <line x1={X} x2={X} y1={y(c.h)} y2={y(c.l)} />
              <rect x={X - bodyW / 2} y={y(Math.max(c.o, c.c))} width={bodyW} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} rx="0.6" />
            </g>
          )
        })}

        {calc?.params?.cross?.on && (
          <>
            <path className="sc-ema sc-e3" d={linePath(calc.ema.slow)} />
            <path className="sc-ema sc-e2" d={linePath(calc.ema.mid)} />
            <path className="sc-ema sc-e1" d={linePath(calc.ema.fast)} />
            {calc.crosses.filter(k => k.i >= from).map(k => {
              const big = k.kind === 'golden' || k.kind === 'death'
              const bad = k.kind.endsWith('death')
              const at = big ? calc.ema.mid[k.i] : calc.ema.fast[k.i]
              const label = CROSS_LABEL[k.kind]
              const lw = label.length * 4.9 + 10
              const X = Math.min(w - padR - lw / 2, Math.max(lw / 2, x(k.i)))
              const Y = y(at) - (big ? 22 : 16)
              return (
                <g key={`${k.kind}-${k.i}`} className={`sc-cross ${big ? 'is-big' : ''} ${bad ? 'is-bad' : ''}`}>
                  <circle cx={x(k.i)} cy={y(at)} r="3" />
                  <rect x={X - lw / 2} y={Y - 7} width={lw} height="13" rx="4" />
                  <text x={X} y={Y + 2.5} textAnchor="middle">{label}</text>
                </g>
              )
            })}
          </>
        )}

        {calc?.params?.signals?.on && calc.signals.filter(s => s.i >= from).map(s => {
          const buy = s.side === 'buy', X = x(s.i)
          const Y = buy ? y(candles[s.i].l) + 13 : y(candles[s.i].h) - 13
          return (
            <g key={`${s.side}-${s.i}`} className={`sc-sig ${buy ? 'is-buy' : 'is-sell'}`}>
              <path d={buy ? `M${X} ${Y - 9} l-4 5 h8z` : `M${X} ${Y + 9} l-4 -5 h8z`} />
              <rect x={X - 14} y={buy ? Y - 4 : Y - 8} width="28" height="12" rx="3" />
              <text x={X} y={buy ? Y + 5 : Y + 1} textAnchor="middle">{buy ? 'BUY' : 'SELL'}</text>
            </g>
          )
        })}

        {last && calc?.params?.signals?.on && (
          [['SL', last.stop, 'is-sl'], ...last.targets.map((v, k) => [`TP${k + 1}`, v, 'is-tp']), ['Entry', last.entry, 'is-entry']]
            .filter(([, v]) => v > lo && v < hi)
            .map(([label, v, cls]) => (
              <g key={label} className={`sc-level ${cls}`}>
                <line x1={x(last.i)} x2={w - padR} y1={y(v)} y2={y(v)} />
                <rect x={w - padR + 1} y={y(v) - 6} width={padR - 2} height="12" rx="3" />
                <text x={w - padR / 2} y={y(v) + 3} textAnchor="middle">{label}</text>
              </g>
            ))
        )}

        <line className="sc-now" x1="0" x2={w - padR} y1={y(seg[n - 1].c)} y2={y(seg[n - 1].c)} />
        {hoverIdx != null && <line className="sc-cursor" x1={x(from + hoverIdx)} x2={x(from + hoverIdx)} y1={padT} y2={h - padB} />}
      </svg>
    </div>
  )
}
