import { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../LanguageContext'

// Candlestick chart with the on-device indicators from chartSignals.js:
// EMA lines, golden/death crosses, BUY/SELL tags, the latest signal's stop,
// entry and targets, volume, an RSI pane and a date axis. Plain SVG sized to
// its container, so labels stay crisp at any width. Colours come from CSS
// (.sc-*), so it follows the theme.
//
// Readability rules, each one a fix for something that made the old chart
// hard to read:
//   - Far-away targets no longer stretch the price scale. A level more than
//     ~35% of the visible range outside it is pinned to the edge with an
//     arrow and its price, so the candles keep the height.
//   - Every level tag carries its price, and tags and axis labels never
//     overlap: tags are spread apart, and an axis label under a tag is hidden.
//   - Cross and signal labels are placed so they do not cover each other.
//   - The live price has its own tag on the axis.

export const fmt = (v) => {
  const n = Number(v)
  if (!isFinite(n)) return '—'
  // Below 1, significant digits rather than fixed decimals: six decimals
  // turned 0.0000085 into 0.000009, a 6% error on an entry or a stop.
  if (Math.abs(n) < 1) return n.toLocaleString(undefined, { maximumSignificantDigits: 5 })
  const d = n >= 1000 ? 0 : 2
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
}
// Shorter, for tags on the narrow price axis.
const fmtTag = (v) => {
  const n = Number(v)
  if (!isFinite(n)) return '—'
  if (n >= 100000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return n.toLocaleString(undefined, { maximumSignificantDigits: 4 })
}

const CROSS_LABEL = { golden: 'Golden Cross', death: 'Death Cross', 'small-golden': 'Small GC', 'small-death': 'Small DC' }

/** Round tick step: 1, 2, 2.5 or 5 × a power of ten. */
export function niceStep(span, count = 4) {
  if (!(span > 0)) return 1
  const raw = span / count
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

/**
 * Which levels fit on the price scale. A level within `slack` of the candle
 * range widens the scale to show it; one further out is drawn pinned to the
 * edge instead, so one distant target cannot squash the candles.
 */
export function fitLevels(lo, hi, levels, slack = 0.35) {
  const r = hi - lo || Math.abs(hi) * 0.02 || 1
  let L = lo, H = hi
  const pinned = []
  for (const lv of levels) {
    if (lv.v > hi + r * slack) pinned.push({ ...lv, edge: 'top' })
    else if (lv.v < lo - r * slack) pinned.push({ ...lv, edge: 'bottom' })
    else { L = Math.min(L, lv.v); H = Math.max(H, lv.v) }
  }
  return { lo: L, hi: H, pinned }
}

/** Spread label centres apart so none are closer than `gap`, staying in [min, max]. */
export function spread(ys, gap, min, max) {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < order.length; k++) {
    if (order[k].y - order[k - 1].y < gap) order[k].y = order[k - 1].y + gap
  }
  const over = order.length ? order[order.length - 1].y - max : 0
  if (over > 0) {
    order[order.length - 1].y = max
    for (let k = order.length - 2; k >= 0; k--) {
      if (order[k + 1].y - order[k].y < gap) order[k].y = order[k + 1].y - gap
    }
  }
  for (const o of order) o.y = Math.max(min, o.y)
  const out = []
  order.forEach(o => { out[o.i] = o.y })
  return out
}

const toDate = (t) => {
  const d = new Date(typeof t === 'number' ? t : Date.parse(t))
  return isNaN(d.getTime()) ? null : d
}

export default function SignalChart({ candles, visible, calc, height = 260, closeOnly = false, ariaLabel }) {
  // Dates read in the app's language, not the phone's.
  const { lang } = useLanguage()
  const loc = lang || undefined
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
  const padR = 64, padT = 10
  const mainH = height
  const rsiOn = !!calc?.rsi?.some?.(v => v != null)
  const rsiH = rsiOn ? 58 : 0
  const dateH = 16
  const totalH = mainH + rsiH + dateH
  const last = calc?.last && calc.last.i >= from ? calc.last : null
  const sigOn = !!calc?.params?.signals?.on
  const hasVol = seg.some(c => c.v > 0)
  const volH = hasVol ? mainH * 0.12 : 0
  const mainBottom = mainH - 4

  const scale = useMemo(() => {
    if (!n) return null
    const vals = seg.flatMap(c => [c.h, c.l])
    const add = (arr) => arr?.slice(from).forEach(v => { if (v != null) vals.push(v) })
    if (calc?.params?.cross?.on) { add(calc.ema.fast); add(calc.ema.mid); add(calc.ema.slow) }
    let hi = Math.max(...vals), lo = Math.min(...vals)
    const levels = last && sigOn
      ? [{ label: 'SL', v: last.stop, cls: 'is-sl' }, ...last.targets.map((v, k) => ({ label: `TP${k + 1}`, v, cls: 'is-tp' })), { label: 'Entry', v: last.entry, cls: 'is-entry' }]
      : []
    const fit = fitLevels(lo, hi, levels)
    hi = fit.hi; lo = fit.lo
    const pad = (hi - lo) * 0.06 || hi * 0.02
    hi += pad; lo -= pad
    // Volume sits in the bottom strip; keep candles above it.
    const plotBottom = mainBottom - volH
    const y = v => padT + ((hi - v) / (hi - lo)) * (plotBottom - padT)
    return { hi, lo, y, levels, pinned: fit.pinned }
  }, [seg, calc, last, sigOn, from, n, mainBottom, volH])

  if (!n || !scale) return <div ref={boxRef} className="sc-empty">No chart data</div>

  const plotW = w - padR
  const cw = plotW / n
  const x = i => (i - from) * cw + cw / 2
  const { y, hi, lo } = scale
  const bodyW = Math.max(1, Math.min(cw * 0.7, 14))
  const linePath = (arr, yy = y) => {
    let d = ''
    for (let i = from; i < arr.length; i++) {
      if (arr[i] == null) continue
      d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yy(arr[i]).toFixed(1)
    }
    return d
  }

  // ── Price axis: round ticks, hidden where a tag sits ─────────────────────
  const step = niceStep(hi - lo)
  const ticks = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v)

  const lastC = seg[n - 1]
  const nowUp = lastC.c >= lastC.o
  const resolved = last?.outcome && !last.outcome.running && (last.outcome.status === 'stopped' || (last.outcome.status === 'tp' && last.outcome.hit === last.targets.length))
  const inLevels = scale.levels.filter(lv => !scale.pinned.some(p => p.label === lv.label))
  const plotTop = padT + 6, plotBot = mainBottom - volH - 6
  // Pinned levels sit at the edge they point past, and are spread together
  // with the rest so no tag ever covers another.
  const tagItems = [
    ...inLevels.map(lv => ({ ...lv, y: y(lv.v) })),
    ...scale.pinned.map(p => ({ ...p, y: p.edge === 'top' ? plotTop : plotBot, pin: p.edge })),
    { label: '', v: lastC.c, cls: nowUp ? 'is-now-up' : 'is-now-dn', y: y(lastC.c), now: true },
  ]
  const tagYs = spread(tagItems.map(t => t.y), 13, plotTop, plotBot)
  const tagged = tagItems.map((t, k) => ({ ...t, ty: tagYs[k] }))
  const nearTag = (yy) => tagged.some(t => Math.abs(t.ty - yy) < 10)

  // ── Label placement for crosses and signals ─────────────────────────────
  const boxes = []
  const place = (cx, cy, bw, bh, dir) => {
    let Y = cy
    for (let tries = 0; tries < 6; tries++) {
      const hit = boxes.some(b => Math.abs(b.x - cx) < (b.w + bw) / 2 + 2 && Math.abs(b.y - Y) < (b.h + bh) / 2 + 1)
      if (!hit) break
      Y += dir * (bh + 3)
    }
    Y = Math.max(padT + bh / 2, Math.min(mainBottom - volH - bh / 2, Y))
    boxes.push({ x: cx, y: Y, w: bw, h: bh })
    return Y
  }

  const sigs = sigOn ? calc.signals.filter(s => s.i >= from) : []
  const sigLabels = sigs.map(s => {
    const buy = s.side === 'buy', X = x(s.i)
    const anchor = buy ? y(candles[s.i].l) + 12 : y(candles[s.i].h) - 12
    const Y = place(X, anchor, 30, 12, buy ? 1 : -1)
    return { s, buy, X, Y }
  })
  const crossLabels = calc?.params?.cross?.on ? calc.crosses.filter(k => k.i >= from).map(k => {
    const big = k.kind === 'golden' || k.kind === 'death'
    const bad = k.kind.endsWith('death')
    const at = big ? calc.ema.mid[k.i] : calc.ema.fast[k.i]
    const label = CROSS_LABEL[k.kind]
    const lw = label.length * 4.6 + 10
    const X = Math.min(plotW - lw / 2, Math.max(lw / 2, x(k.i)))
    const Y = place(X, y(at) + (bad ? 16 : -16), lw, 13, bad ? 1 : -1)
    return { k, big, bad, at, label, lw, X, Y }
  }) : []

  // ── Dates along the bottom ──────────────────────────────────────────────
  const d0 = toDate(seg[0].t), d1 = toDate(lastC.t)
  const spanDays = d0 && d1 ? (d1 - d0) / 86400000 : 0
  const perCandleH = n > 1 ? (spanDays * 24) / (n - 1) : 24
  // Short enough that four fit across a phone: a time only when the whole
  // chart is about a day, otherwise the date.
  const dateFmt = (d) => spanDays <= 1.5
    ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false })
    : spanDays > 400
      ? d.toLocaleDateString(loc, { month: 'short', year: '2-digit' })
      : d.toLocaleDateString(loc, { day: 'numeric', month: 'short' })
  const dateTicks = d0 ? [0.1, 0.37, 0.63, 0.9].map(f => Math.round(f * (n - 1))) : []
  void perCandleH

  // ── Volume ──────────────────────────────────────────────────────────────
  const vMax = hasVol ? Math.max(...seg.map(c => c.v || 0)) || 1 : 1

  // ── RSI pane ────────────────────────────────────────────────────────────
  const rsiTop = mainH + 4, rsiBot = mainH + rsiH - 4
  const ry = v => rsiTop + ((100 - v) / 100) * (rsiBot - rsiTop)
  const rsiNow = rsiOn ? calc.rsi.at(-1) : null

  // ── Hover ───────────────────────────────────────────────────────────────
  const hoverIdx = hover != null ? Math.min(n - 1, Math.max(0, hover)) : null
  const hc = hoverIdx != null ? seg[hoverIdx] : null
  const hDate = hc ? toDate(hc.t) : null

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * w
    if (px > plotW) return setHover(null)
    setHover(Math.floor(px / cw))
  }

  return (
    <div ref={boxRef} className="sc-wrap">
      <div className="sc-readout" aria-live="polite">
        {hc
          ? closeOnly
            ? <>{hDate && <span>{dateFmt(hDate)}</span>}<span>Close <b>{fmt(hc.c)}</b></span></>
            : <>
                {hDate && <span>{dateFmt(hDate)}</span>}
                <span>O <b>{fmt(hc.o)}</b></span><span>H <b>{fmt(hc.h)}</b></span><span>L <b>{fmt(hc.l)}</b></span>
                <span>C <b className={hc.c >= hc.o ? 'sc-t-up' : 'sc-t-dn'}>{fmt(hc.c)}</b></span>
                <span className={hc.c >= hc.o ? 'sc-t-up' : 'sc-t-dn'}>{hc.o > 0 ? `${hc.c >= hc.o ? '+' : ''}${(((hc.c - hc.o) / hc.o) * 100).toFixed(2)}%` : ''}</span>
              </>
          : calc?.params?.cross?.on && (
            <>
              <span><i className="sc-key sc-k1" />EMA{calc.params.cross.fast} <b>{fmt(calc.ema.fast.at(-1))}</b></span>
              <span><i className="sc-key sc-k2" />EMA{calc.params.cross.mid} <b>{fmt(calc.ema.mid.at(-1))}</b></span>
              <span><i className="sc-key sc-k3" />EMA{calc.params.cross.slow} <b>{fmt(calc.ema.slow.at(-1))}</b></span>
            </>
          )}
      </div>
      <svg className="sc-svg" width="100%" viewBox={`0 0 ${w} ${totalH}`} role="img" aria-label={ariaLabel} direction="ltr" style={{ direction: 'ltr' }}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {/* grid and price axis */}
        {ticks.map((v, k) => (
          <g key={k}>
            <line className="sc-grid" x1="0" x2={plotW} y1={y(v)} y2={y(v)} />
            {!nearTag(y(v)) && <text className="sc-axis" x={w - 4} y={y(v) + 3} textAnchor="end">{fmtTag(v)}</text>}
          </g>
        ))}
        {dateTicks.map(i => <line key={`vg${i}`} className="sc-grid" x1={x(from + i)} x2={x(from + i)} y1={padT} y2={mainBottom} />)}

        {/* volume */}
        {hasVol && seg.map((c, j) => {
          const vh = ((c.v || 0) / vMax) * volH
          return <rect key={`v${j}`} className={`sc-vol ${c.c >= c.o ? 'is-up' : 'is-dn'}`} x={x(from + j) - bodyW / 2} y={mainBottom - vh} width={bodyW} height={vh} />
        })}

        {/* candles */}
        {seg.map((c, j) => {
          const up = c.c >= c.o, X = x(from + j)
          return (
            <g key={j} className={up ? 'sc-up' : 'sc-dn'}>
              <line x1={X} x2={X} y1={y(c.h)} y2={y(c.l)} />
              <rect x={X - bodyW / 2} y={y(Math.max(c.o, c.c))} width={bodyW} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} rx="0.6" />
            </g>
          )
        })}

        {/* EMAs and crosses */}
        {calc?.params?.cross?.on && (
          <>
            <path className="sc-ema sc-e3" d={linePath(calc.ema.slow)} />
            <path className="sc-ema sc-e2" d={linePath(calc.ema.mid)} />
            <path className="sc-ema sc-e1" d={linePath(calc.ema.fast)} />
            {crossLabels.map(({ k, big, bad, at, label, lw, X, Y }) => (
              <g key={`${k.kind}-${k.i}`} className={`sc-cross ${big ? 'is-big' : ''} ${bad ? 'is-bad' : ''}`}>
                <line className="sc-lead" x1={x(k.i)} x2={X} y1={y(at)} y2={Y} />
                <circle cx={x(k.i)} cy={y(at)} r="3" />
                <rect x={X - lw / 2} y={Y - 6.5} width={lw} height="13" rx="4" />
                <text x={X} y={Y + 2.5} textAnchor="middle">{label}</text>
              </g>
            ))}
          </>
        )}

        {/* signal levels */}
        {last && sigOn && tagged.filter(t => !t.now).map(t => (
          <g key={t.label} className={`sc-level ${t.cls}${t.pin ? ' is-pinned' : ''}${resolved ? ' is-done' : ''}`}>
            {!t.pin && <line x1={x(last.i)} x2={plotW} y1={y(t.v)} y2={y(t.v)} />}
            <rect x={plotW + 1} y={t.ty - 6} width={padR - 2} height="12" rx="3" />
            <text x={plotW + padR / 2} y={t.ty + 3} textAnchor="middle">
              {/* Label and price as separate runs with a real gap: at 7px a
                  space is a hairline, and "TP1 82,840" read as "TP182,840". */}
              <tspan className="sc-level-k">{t.pin ? (t.pin === 'top' ? '▲' : '▼') : ''}{t.label}</tspan>
              <tspan dx="3">{fmtTag(t.v)}</tspan>
            </text>
          </g>
        ))}

        {/* BUY / SELL tags */}
        {sigLabels.map(({ s, buy, X, Y }) => (
          <g key={`${s.side}-${s.i}`} className={`sc-sig ${buy ? 'is-buy' : 'is-sell'}${s.forming ? ' is-forming' : ''}${s !== last ? ' is-past' : ''}`}>
            <line className="sc-lead" x1={X} x2={X} y1={buy ? y(candles[s.i].l) : y(candles[s.i].h)} y2={buy ? Y - 6 : Y + 6} />
            <rect x={X - 15} y={Y - 6} width="30" height="12" rx="3" />
            <text x={X} y={Y + 3} textAnchor="middle">{buy ? 'BUY' : 'SELL'}{s.forming ? '?' : ''}</text>
          </g>
        ))}

        {/* live price */}
        <line className="sc-now" x1="0" x2={plotW} y1={y(lastC.c)} y2={y(lastC.c)} />
        {tagged.filter(t => t.now).map(t => (
          <g key="now" className={`sc-nowtag ${t.cls}`}>
            <rect x={plotW + 1} y={t.ty - 6.5} width={padR - 2} height="13" rx="3" />
            <text x={plotW + padR / 2} y={t.ty + 3} textAnchor="middle">{fmtTag(t.v)}</text>
          </g>
        ))}

        {/* RSI pane */}
        {rsiOn && (
          <g className="sc-rsi">
            <line className="sc-grid" x1="0" x2={plotW} y1={mainH} y2={mainH} />
            <rect className="sc-rsi-band" x="0" y={ry(70)} width={plotW} height={ry(30) - ry(70)} />
            <line className="sc-rsi-mid" x1="0" x2={plotW} y1={ry(50)} y2={ry(50)} />
            <path className="sc-rsi-line" d={linePath(calc.rsi, ry)} />
            <text className="sc-axis" x={w - 4} y={ry(70) + 3} textAnchor="end">70</text>
            <text className="sc-axis" x={w - 4} y={ry(30) + 3} textAnchor="end">30</text>
            <text className="sc-rsi-label" x="4" y={rsiTop + 8}>RSI {calc.params.signals.rsi} <tspan className={rsiNow >= 70 ? 'sc-t-dn' : rsiNow <= 30 ? 'sc-t-up' : ''}>{rsiNow != null ? rsiNow.toFixed(1) : ''}</tspan></text>
          </g>
        )}

        {/* dates */}
        {dateTicks.map(i => {
          const d = toDate(seg[i].t)
          return d ? <text key={`d${i}`} className="sc-axis sc-date" x={x(from + i)} y={totalH - 4} textAnchor="middle">{dateFmt(d)}</text> : null
        })}

        {/* crosshair */}
        {hoverIdx != null && (
          <g className="sc-hover">
            <line className="sc-cursor" x1={x(from + hoverIdx)} x2={x(from + hoverIdx)} y1={padT} y2={totalH - dateH} />
            <line className="sc-cursor" x1="0" x2={plotW} y1={y(hc.c)} y2={y(hc.c)} />
            <rect className="sc-hover-tag" x={plotW + 1} y={y(hc.c) - 6.5} width={padR - 2} height="13" rx="3" />
            <text className="sc-hover-text" x={plotW + padR / 2} y={y(hc.c) + 3} textAnchor="middle">{fmtTag(hc.c)}</text>
          </g>
        )}
      </svg>
    </div>
  )
}
