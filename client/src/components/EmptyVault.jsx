// The empty Home: a portfolio that builds itself in front of the user.
//
// A ring in the middle is the net worth, at $0. On a loop the scene shows
// each way in, one after another:
//   shot   a broker screenshot slides in, a beam reads it, and each row flies
//          into the ring as a chip
//   voice  a sentence is spoken and typed, and becomes chips
//   tap    orbs that circle the ring are tapped and dive in
// As chips land the ring fills by asset and the figure counts up. The amounts
// are an example and say so. The orbs are real buttons: tapping one opens the
// add sheet for that asset, and the call to action below follows whichever
// method is playing.
//
// One timeline drives everything from a single clock, so a frame is a pure
// function of (scene, seconds). It pauses off screen and in a hidden tab, and
// with reduced motion it shows one finished frame and no movement.
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../LanguageContext'
import Icon from './Icon'
import './EmptyVault.css'
import { LOGO_PATHS } from './evLogos'
import { THEMES } from '../ThemeContext'

const LOOP = 9          // seconds per scene
const FLY = 1.0         // seconds a chip takes to reach the ring
const REST_U = 6        // a finished frame: used for the first paint and reduced motion
const CX = 198, CY = 160, R = 66
const CIRC = 2 * Math.PI * R
const ORBIT_X = 146, ORBIT_Y = 112

// bg is the disc, fg the mark on it, k how much of the disc the mark spans.
// Bitcoin's mark is itself the disc with the ₿ cut out, so it sits on white.
const ORBS = [
  { sym: 'BTC',  label: 'BTC',  c: '#f7931a', bg: '#ffffff', fg: '#f7931a', k: 1 },
  { sym: 'ETH',  label: 'ETH',  c: '#8b9cf7', bg: '#627eea', fg: '#ffffff', k: 0.62 },
  { sym: 'GOLD', label: 'Gold', c: '#e8b825', bg: '#2a220c', gold: true },
  { sym: 'NVDA', label: 'NVDA', c: '#76b900', bg: '#0b0b0b', fg: '#76b900', k: 0.7 },
  { sym: 'USDT', label: 'USDT', c: '#26a17b', bg: '#26a17b', fg: '#ffffff', k: 0.64 },
  { sym: 'AAPL', label: 'AAPL', c: '#cbd5e1', bg: '#1d1d1f', fg: '#ffffff', k: 0.56 },
]
const GOLD_BAR = THEMES.find(x => x.id === 'gold')?.logo

const SCENES = [
  { id: 'shot', icon: 'camera', launch: [2.5, 3.0, 3.5], items: [
    { sym: 'BTC', amt: '0.5', v: 41250, c: '#f7931a' },
    { sym: 'NVDA', amt: '20', v: 2760, c: '#76b900' },
    { sym: 'GOLD', amt: '2 oz', v: 5300, c: '#e8b825' } ] },
  { id: 'voice', icon: 'mic', launch: [2.5, 3.0, 3.5], items: [
    { sym: 'ETH', amt: '3', v: 7800, c: '#8b9cf7' },
    { sym: 'USDT', amt: '1,200', v: 1200, c: '#26a17b' },
    { sym: 'AAPL', amt: '10', v: 2300, c: '#cbd5e1' } ] },
  { id: 'tap', icon: 'plus', launch: [1.3, 2.2, 3.1], items: [
    { sym: 'BTC', amt: '0.1', v: 8250, c: '#f7931a', orb: 0 },
    { sym: 'GOLD', amt: '1 oz', v: 2650, c: '#e8b825', orb: 2 },
    { sym: 'AAPL', amt: '5', v: 1150, c: '#cbd5e1', orb: 5 } ] },
]
const VOICE_LINE = '3 ETH, 1200 USDT, 10 AAPL'
const VOICE_BREAK = VOICE_LINE.indexOf(' 10')  // the second line starts at "10 AAPL"

const clamp = x => Math.max(0, Math.min(1, x))
const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeOut = x => 1 - Math.pow(1 - x, 3)
const money = n => '$' + Math.round(n).toLocaleString('en-US')

export function orbPos(i, clock) {
  const a = i * (Math.PI / 3) + clock * 0.12
  const depth = (Math.sin(a) + 1) / 2
  return { x: CX + ORBIT_X * Math.cos(a), y: CY + ORBIT_Y * Math.sin(a), depth, s: 0.78 + 0.32 * depth }
}

// Where each scene's chips leave from, the moment they launch.
function sourceOf(scene, i, u, clock, cardX) {
  if (scene.id === 'shot') return { x: cardX + 90, y: [114, 142, 170][i] - 4 }
  if (scene.id === 'voice') return { x: cardX + 100, y: 150 }
  const it = scene.items[i]
  return orbPos(it.orb, clock - (u - scene.launch[i]))
}

/** Everything that moves, for one scene at u seconds into its loop. */
export function frame(scene, u, clock) {
  const total = scene.items.reduce((s, x) => s + x.v, 0)
  let f0 = 0
  const segs = scene.items.map((it, i) => {
    const f = it.v / total
    const seg = { f0, f, a: (-90 + (f0 + f / 2) * 360) * Math.PI / 180 }
    f0 += f
    return seg
  })
  const cardX = 6 - 150 * (1 - easeOut(clamp(u / 0.6)))
  const chips = scene.items.map((it, i) => {
    const L = scene.launch[i], A = L + FLY
    const S = sourceOf(scene, i, u, clock, cardX)
    const E = { x: CX + R * Math.cos(segs[i].a), y: CY + R * Math.sin(segs[i].a) }
    const C = { x: (S.x + E.x) / 2, y: Math.min(S.y, E.y) - 60 }
    const k = ease(clamp((u - L) / FLY))
    const m = 1 - k
    const P = { x: m * m * S.x + 2 * m * k * C.x + k * k * E.x, y: m * m * S.y + 2 * m * k * C.y + k * k * E.y }
    return {
      it, S, C, E, P, k,
      flying: u >= L && u < A,
      landed: u >= A,
      grow: easeOut(clamp((u - A) / 0.5)),
      burst: u >= A && u < A + 0.6 ? (u - A) / 0.6 : -1,
      count: easeOut(clamp((u - A) / 0.7)),
      seg: segs[i],
    }
  })
  return {
    cardX,
    chips,
    value: chips.reduce((s, c) => s + c.it.v * c.count, 0),
    beam: u >= 1 && u <= 2.6 ? clamp((u - 1) / 1.5) : -1,
    typed: VOICE_LINE.slice(0, Math.floor(VOICE_LINE.length * clamp((u - 1) / 1.4))),
    talking: u >= 0.8 && u <= 2.7,
    spark: clamp((u - 5) / 1),
    alpha: clamp(u / 0.4) * (1 - clamp((u - 8) / 0.8)),
  }
}

export default function EmptyVault({ onScreenshot, onVoice, onManual, onQuickAdd, quickAssets = [] }) {
  const { t } = useLanguage()
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [k, setK] = useState(0)
  const [u, setU] = useState(REST_U)
  const [clock, setClock] = useState(0)
  const rootRef = useRef(null)
  const clockRef = useRef({ k: 0, u: REST_U, last: 0, c: 0 })

  // One clock. It only advances while the stage is on screen and the tab is
  // visible, so a phone in a pocket is not animating a page nobody sees.
  useEffect(() => {
    if (reduce) return
    let raf = 0, onScreen = true
    const st = clockRef.current
    const tick = now => {
      if (!st.last) st.last = now
      const dt = Math.min(0.1, (now - st.last) / 1000)
      st.last = now
      st.c += dt
      if (!st.held) st.u += dt
      if (st.u >= LOOP) { st.u -= LOOP; st.k = (st.k + 1) % SCENES.length; setK(st.k) }
      setU(st.u); setClock(st.c)
      raf = requestAnimationFrame(tick)
    }
    const start = () => { if (!raf && onScreen && !document.hidden) { st.last = 0; raf = requestAnimationFrame(tick) } }
    const stop = () => { cancelAnimationFrame(raf); raf = 0 }
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; onScreen ? start() : stop() })
      : null
    if (io && rootRef.current) io.observe(rootRef.current)
    const vis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', vis)
    start()
    return () => { stop(); io?.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [reduce])

  const pick = i => {
    const st = clockRef.current
    st.k = i; st.u = reduce ? REST_U : 0; st.held = false
    setK(i); setU(st.u)
  }

  // The guided tour points at the "Add manually" button. Settle on the tap
  // scene and stop the loop there, so the button it points at stays put.
  useEffect(() => {
    const hold = () => {
      const st = clockRef.current
      st.k = 2; st.u = REST_U; st.held = true
      setK(2); setU(REST_U)
    }
    window.addEventListener('wl:add-asset-guide', hold)
    return () => window.removeEventListener('wl:add-asset-guide', hold)
  }, [])

  const scene = SCENES[k]
  const F = frame(scene, u, clock)
  const orbs = ORBS.map((o, i) => ({ ...o, i, ...orbPos(i, clock) }))
  const back = orbs.filter(o => o.depth < 0.5)
  const front = orbs.filter(o => o.depth >= 0.5)
  const prefillFor = label => quickAssets.find(a => a.label === label)?.prefill

  const tapOrb = o => {
    const prefill = prefillFor(o.label)
    if (prefill) onQuickAdd?.(prefill, o.label)
    else onManual?.()
  }

  const renderOrb = o => {
    // In the tap scene, a ripple marks the orb about to be tapped.
    const ix = scene.id === 'tap' ? scene.items.findIndex(it => it.orb === o.i) : -1
    const L = ix >= 0 ? scene.launch[ix] : 0
    const ripple = ix >= 0 && u >= L - 0.5 && u < L + 0.2 ? clamp((u - (L - 0.5)) / 0.7) : -1
    const r = 17 * o.s
    return (
      <g key={o.sym} className="ev-orb" transform={`translate(${o.x.toFixed(1)} ${o.y.toFixed(1)})`} role="button" tabIndex={0}
        aria-label={`${t('stManualTitle')}: ${o.label}`}
        onClick={() => tapOrb(o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapOrb(o) } }}
        style={{ opacity: 0.55 + 0.45 * o.depth }}>
        {ripple >= 0 && <circle r={r + 4 + 16 * ripple} fill="none" stroke={o.c} strokeWidth="2" opacity={0.8 * (1 - ripple)} />}
        <circle r={r + 6} fill={o.c} opacity="0.16" />
        <circle r={r} fill={o.bg} />
        {o.gold
          ? GOLD_BAR && <image href={GOLD_BAR} x={-r * 0.95} y={-r * 0.95} width={r * 1.9} height={r * 1.9} />
          : <path d={LOGO_PATHS[o.sym]} fill={o.fg} transform={`translate(${-r * o.k} ${-r * o.k}) scale(${(2 * r * o.k / 24).toFixed(4)})`} />}
        <circle r={r} fill="url(#ev-gloss)" />
        <circle r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
        <text y={r + 9 * o.s} textAnchor="middle" className="ev-orb-t" style={{ fontSize: `${6.8 * o.s}px` }}>{o.label}</text>
        <g transform={`translate(${r * 0.72} ${-r * 0.72})`}>
          <circle r={5.2 * o.s} fill="#fff" />
          <text y={2.4 * o.s} textAnchor="middle" className="ev-orb-plus" style={{ fontSize: `${8 * o.s}px` }}>+</text>
        </g>
      </g>
    )
  }

  const captions = { shot: t('evCapShot'), voice: t('evCapVoice'), tap: t('evCapTap') }
  const pills = { shot: t('evShot'), voice: t('evVoice'), tap: t('evTap') }
  const ctas = {
    shot:  { icon: 'camera', title: t('stShotTitle'),  sub: t('stShotSub'),  run: onScreenshot },
    voice: { icon: 'mic',    title: t('stVoiceTitle'), sub: t('stVoiceSub'), run: onVoice },
    tap:   { icon: 'plus',   title: t('stManualTitle'), sub: t('stManualSub'), run: onManual },
  }
  const cta = ctas[scene.id]
  const others = SCENES.filter(s => s.id !== scene.id)

  return (
    <section className="ev" ref={rootRef}>
      <div className="ev-stage">
        <div className="ev-head">
          <div className="ev-eyebrow">{t('stEyebrow')}</div>
          <h2 className="ev-title">{t('stTitle')}</h2>
          <p className="ev-sub">{t('evSub')}</p>
        </div>

        <svg className="ev-svg" viewBox="0 0 360 320" direction="ltr" aria-hidden="false" role="group" aria-label={t('stTitle')}>
          <defs>
            <radialGradient id="ev-gloss" cx="32%" cy="26%" r="70%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
            </radialGradient>
            <radialGradient id="ev-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgb(var(--g-rgb))" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(var(--g-rgb))" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ev-beam" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--g-rgb))" stopOpacity="0" />
              <stop offset="100%" stopColor="rgb(var(--g-rgb))" stopOpacity="0.45" />
            </linearGradient>
          </defs>

          <ellipse cx={CX} cy={CY} rx={ORBIT_X} ry={ORBIT_Y} className="ev-orbit" />
          {back.map(renderOrb)}

          {/* The ring: net worth */}
          <circle cx={CX} cy={CY} r={R + 34} fill="url(#ev-core)" />
          <circle cx={CX} cy={CY} r={R} className="ev-track" />
          <g opacity={F.alpha}>
            {F.chips.map((c, i) => c.grow > 0 && (
              <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={c.it.c} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${Math.max(0.01, c.seg.f * CIRC * c.grow - 6)} ${CIRC}`}
                transform={`rotate(${-90 + c.seg.f0 * 360 + 1.5} ${CX} ${CY})`} />
            ))}
            {F.chips.map((c, i) => c.burst >= 0 && (
              <circle key={`b${i}`} cx={CX} cy={CY} r={R + 22 * c.burst} fill="none" stroke={c.it.c} strokeWidth="2" opacity={0.7 * (1 - c.burst)} />
            ))}
          </g>
          <text x={CX} y={CY - 20} textAnchor="middle" className="ev-ring-k">{t('obPreviewLabel')}</text>
          <text x={CX} y={CY + 5} textAnchor="middle" className="ev-ring-v" opacity={u > 7 ? Math.max(0.25, F.alpha) : 1}>{money(u > 7 && F.alpha < 0.05 ? 0 : F.value)}</text>
          <path d={`M${CX - 34} ${CY + 30} L${CX - 22} ${CY + 24} L${CX - 12} ${CY + 27} L${CX - 2} ${CY + 18} L${CX + 10} ${CY + 21} L${CX + 22} ${CY + 12} L${CX + 34} ${CY + 14}`}
            pathLength="1" className="ev-spark" strokeDasharray="1" strokeDashoffset={1 - F.spark * F.alpha} />
          <text x={CX} y={CY + 47} textAnchor="middle" className="ev-ring-ex">{t('stExample')}</text>

          {front.map(renderOrb)}

          {/* The source of this scene */}
          <g opacity={F.alpha}>
            {scene.id === 'shot' && (
              <g transform={`translate(${F.cardX.toFixed(1)} 0)`}>
                <rect x="0" y="80" width="100" height="112" rx="12" className="ev-card" />
                <circle cx="12" cy="94" r="2.5" className="ev-card-dot" />
                <circle cx="20" cy="94" r="2.5" className="ev-card-dot" />
                <text x="30" y="97" className="ev-card-h">Positions</text>
                {scene.items.map((it, i) => {
                  const y = [114, 142, 170][i]
                  const gone = F.chips[i].k > 0
                  const lit = F.beam >= 0 && Math.abs((86 + 100 * F.beam) - (y - 4)) < 12
                  return (
                    <g key={it.sym} opacity={gone ? 0.35 : 1}>
                      {lit && <rect x="5" y={y - 14} width="90" height="20" rx="6" className="ev-row-lit" />}
                      <circle cx="16" cy={y - 4} r="4" fill={it.c} />
                      <text x="25" y={y} className="ev-row-s">{it.sym}</text>
                      <text x="92" y={y} textAnchor="end" className="ev-row-a">{gone ? '✓' : it.amt}</text>
                    </g>
                  )
                })}
                {F.beam >= 0 && <rect x="0" y={66 + 100 * F.beam} width="100" height="20" fill="url(#ev-beam)" />}
                {F.beam >= 0 && <line x1="4" x2="96" y1={86 + 100 * F.beam} y2={86 + 100 * F.beam} className="ev-beam-line" />}
              </g>
            )}
            {scene.id === 'voice' && (
              <g transform={`translate(${F.cardX.toFixed(1)} 0)`}>
                <rect x="0" y="100" width="108" height="88" rx="14" className="ev-card" />
                <circle cx="20" cy="124" r="12" className="ev-mic" />
                <path d="M20 117a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0v-4a3 3 0 0 1 3-3zM15 124a5 5 0 0 0 10 0M20 129v3" className="ev-mic-g" />
                {Array.from({ length: 12 }, (_, j) => {
                  const h = 3 + (F.talking ? 13 : 2) * Math.abs(Math.sin(clock * 8 + j * 0.9))
                  return <rect key={j} x={38 + j * 5.6} y={124 - h / 2} width="3" height={h} rx="1.5" className="ev-wave" />
                })}
                <text x="10" y="158" className="ev-voice-t">
                  <tspan x="10">{F.typed.slice(0, VOICE_BREAK)}</tspan>
                  <tspan x="10" dy="13">{F.typed.slice(VOICE_BREAK + 1)}</tspan>
                  <tspan className="ev-caret">{F.talking ? '|' : ''}</tspan>
                </text>
              </g>
            )}
          </g>


          {/* Chips in flight */}
          <g opacity={F.alpha}>
            {F.chips.map((c, i) => c.flying && (
              <g key={i}>
                <path d={`M${c.S.x} ${c.S.y} Q${c.C.x} ${c.C.y} ${c.E.x} ${c.E.y}`} pathLength="1" fill="none" stroke={c.it.c}
                  strokeWidth="1.5" strokeDasharray="1" strokeDashoffset={1 - c.k} opacity="0.45" />
                <g transform={`translate(${c.P.x.toFixed(1)} ${c.P.y.toFixed(1)}) scale(${(1 - 0.55 * c.k).toFixed(3)})`} opacity={c.k > 0.85 ? (1 - c.k) / 0.15 : 1}>
                  <rect x="-37" y="-11" width="74" height="22" rx="11" className="ev-chip" stroke={c.it.c} />
                  <circle cx="-26" cy="0" r="5" fill={c.it.c} />
                  <text x="-17" y="3.5" className="ev-chip-t">{c.it.sym} {c.it.amt}</text>
                </g>
              </g>
            ))}
          </g>
        </svg>

        <div className="ev-pills" role="tablist" aria-label={t('stTitle')}>
          {SCENES.map((s, i) => (
            <button key={s.id} type="button" role="tab" aria-selected={i === k} className={i === k ? 'on' : ''} onClick={() => pick(i)}>
              <Icon name={s.icon} size={14} />{pills[s.id]}
              <i style={{ transform: `scaleX(${i === k ? (reduce ? 1 : u / LOOP) : 0})` }} />
            </button>
          ))}
        </div>
        <p className="ev-cap" key={scene.id}>{captions[scene.id]}</p>
      </div>

      {/* data-tour="add-asset" is the guided tour's first target: whichever
          button adds by hand, the big one or the small one. */}
      <button type="button" className="ev-cta" onClick={() => cta.run?.()} data-tour={scene.id === 'tap' ? 'add-asset' : undefined}>
        <span className="ev-cta-ic"><Icon name={cta.icon} size={22} /></span>
        <span className="ev-cta-txt"><strong>{cta.title}</strong><small>{cta.sub}</small></span>
        <Icon name="arrow-right" size={20} className="ev-cta-arrow" />
      </button>
      <div className="ev-alt">
        {others.map(s => (
          <button key={s.id} type="button" onClick={() => ctas[s.id].run?.()} data-tour={s.id === 'tap' ? 'add-asset' : undefined}>
            <Icon name={ctas[s.id].icon} size={16} />{ctas[s.id].title}
          </button>
        ))}
      </div>
    </section>
  )
}
