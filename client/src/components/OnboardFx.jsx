import { useEffect, useRef } from 'react'

// The living background of the native onboarding: one particle field whose
// behaviour changes with the slide, so moving through the flow feels like one
// continuous scene rather than four screens.
//
//   gather  streams of light pour into the lens (welcome: "all in one place")
//   swirl   particles orbit in the chosen colour (personalise)
//   scan    particles lock to a grid a beam sweeps over (security)
//   rise    embers lift and speed up (all set); `burst` throws them outward
//
// Plain canvas, no library. Stops when the tab is hidden and draws a single
// still frame under prefers-reduced-motion.

const N = 110

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return [34, 197, 94]
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export default function OnboardFx({ mode = 'gather', color = '#22c55e', color2 = '#86efac', burst = 0, shift = 0 }) {
  const ref = useRef(null)
  const state = useRef({ mode, color, color2, burst: 0, shift: 0, parts: [], w: 0, h: 0, t: 0 })

  useEffect(() => { state.current.mode = mode }, [mode])
  useEffect(() => { state.current.color = color; state.current.color2 = color2 }, [color, color2])
  useEffect(() => { state.current.shift = shift }, [shift])
  useEffect(() => {
    if (!burst) return
    const st = state.current
    const cx = st.w / 2, cy = st.h * 0.3
    st.parts.forEach(p => {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9
      p.x = cx; p.y = cy; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.life = 1
    })
    st.burst = 40
  }, [burst])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const st = state.current
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      st.w = cv.clientWidth; st.h = cv.clientHeight
      cv.width = st.w * dpr; cv.height = st.h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const spawn = (p, edge = true) => {
      if (edge) {
        const side = Math.floor(Math.random() * 4)
        p.x = side === 0 ? -10 : side === 1 ? st.w + 10 : Math.random() * st.w
        p.y = side === 2 ? -10 : side === 3 ? st.h + 10 : Math.random() * st.h
      } else { p.x = Math.random() * st.w; p.y = Math.random() * st.h }
      p.vx = 0; p.vy = 0
      p.r = 0.6 + Math.random() * 1.8
      p.orbit = 40 + Math.random() * Math.min(st.w, st.h) * 0.45
      p.ang = Math.random() * Math.PI * 2
      p.spd = (0.004 + Math.random() * 0.012) * (Math.random() < 0.5 ? 1 : -1)
      p.gx = Math.floor(Math.random() * 9); p.gy = Math.floor(Math.random() * 14)
      p.life = 1; p.tone = Math.random()
    }
    if (!st.parts.length) st.parts = Array.from({ length: N }, () => { const p = {}; spawn(p, false); return p })

    let raf = 0
    const frame = () => {
      st.t += 1
      const { w, h, mode: m } = st
      const [r1, g1, b1] = hexToRgb(st.color), [r2, g2, b2] = hexToRgb(st.color2)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2 + st.shift * 0.15, cy = m === 'warp' ? h * 0.5 : h * 0.34
      ctx.globalCompositeOperation = 'lighter'

      // the scan beam (security)
      if (m === 'scan') {
        const by = (st.t * 2.2) % (h * 0.9)
        const g = ctx.createLinearGradient(0, by - 40, 0, by + 4)
        g.addColorStop(0, `rgba(${r1},${g1},${b1},0)`); g.addColorStop(1, `rgba(${r1},${g1},${b1},0.18)`)
        ctx.fillStyle = g; ctx.fillRect(0, by - 40, w, 44)
      }

      for (const p of st.parts) {
        if (st.burst > 0) {
          p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96
        } else if (m === 'gather') {
          const dx = cx - p.x, dy = cy - p.y, d = Math.hypot(dx, dy) || 1
          // spiral in: pull towards the lens plus a tangential twist
          p.vx = p.vx * 0.92 + (dx / d) * 0.55 + (-dy / d) * 0.35
          p.vy = p.vy * 0.92 + (dy / d) * 0.55 + (dx / d) * 0.35
          p.x += p.vx; p.y += p.vy
          if (d < 26) spawn(p, true)
        } else if (m === 'swirl') {
          p.ang += p.spd
          const tx = cx + Math.cos(p.ang) * p.orbit, ty = cy + Math.sin(p.ang) * p.orbit * 0.62
          p.x += (tx - p.x) * 0.06; p.y += (ty - p.y) * 0.06
        } else if (m === 'scan') {
          const tx = w * (0.08 + p.gx * 0.105), ty = h * (0.05 + p.gy * 0.065)
          p.x += (tx - p.x) * 0.07; p.y += (ty - p.y) * 0.07
        } else if (m === 'drift') {
          // slow bokeh, the calm behind the language wheel
          p.x += Math.cos(p.ang + st.t * 0.002) * 0.25; p.y -= 0.18 + p.r * 0.05
          if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w }
        } else if (m === 'warp') {
          // hyperspace: everything streaks out from the centre, faster and faster
          const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy) || 1
          const sp = 2 + d * 0.06
          p.vx = (dx / d) * sp; p.vy = (dy / d) * sp
          p.x += p.vx; p.y += p.vy
          if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) { p.x = cx + (Math.random() - 0.5) * 30; p.y = cy + (Math.random() - 0.5) * 30 }
        } else { // rise
          p.vy = Math.max(-4.5, (p.vy || 0) - 0.03 - p.r * 0.01)
          p.x += Math.sin((st.t + p.ang * 50) * 0.02) * 0.4; p.y += p.vy
          if (p.y < -10) { spawn(p, false); p.y = h + 10; p.vy = -0.5 }
        }
        let alpha = m === 'scan'
          ? 0.25 + 0.55 * Math.max(0, 1 - Math.abs(p.y - (st.t * 2.2) % (h * 0.9)) / 60)
          : 0.35 + 0.45 * p.tone
        if (st.burst > 0) alpha = Math.min(1, st.burst / 25)
        const r = p.tone > 0.5 ? r1 : r2, g = p.tone > 0.5 ? g1 : g2, b = p.tone > 0.5 ? b1 : b2
        ctx.beginPath()
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.arc(p.x, p.y, p.r * (m === 'scan' ? 1.2 : 1), 0, Math.PI * 2)
        ctx.fill()
        // light trails on the fast modes
        if ((m === 'gather' || m === 'warp' || st.burst > 0) && (Math.abs(p.vx) + Math.abs(p.vy) > 1.2)) {
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.45})`
          ctx.lineWidth = p.r * 0.9
          const k = m === 'warp' ? 7 : 4
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k); ctx.stroke()
        }
      }
      if (st.burst > 0) st.burst -= 1
      ctx.globalCompositeOperation = 'source-over'
      if (!reduce) raf = requestAnimationFrame(frame)
    }
    frame()

    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) raf = requestAnimationFrame(frame) }
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVis)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  return <canvas ref={ref} className="obx-canvas" aria-hidden="true" />
}
