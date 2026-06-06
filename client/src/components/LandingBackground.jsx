import { useEffect, useRef } from 'react'

// "Living Net Worth" landing background — on-brand, premium, bold, mobile-fast.
// Layers (back → front):
//  1. Deep emerald→teal brand gradient base (NOT black) + soft radial glow
//  2. Aurora glow orbs slowly drifting (premium depth)
//  3. Two parallax "equity curve" lines that flow and trend upward, with a
//     luminous gradient area fill (your net worth growing)
//  4. A live pulse dot riding the front curve's leading edge
//  5. Floating gain labels (+$ / +%) that rise and fade
//  6. Readability vignette
// Respects prefers-reduced-motion and pauses when the tab is hidden.
export default function LandingBackground() {
  const canvasRef = useRef(null)
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, raf = 0, t = 0, mobile = false

    function resize() {
      w = window.innerWidth
      h = window.innerHeight
      mobile = w < 640
      canvas.width  = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width  = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // ── Brand emerald gradient base (no black) ──────────────────────────────
    function paintBase() {
      const g = ctx.createLinearGradient(0, 0, w * 0.4, h)
      g.addColorStop(0,   '#063a2b')
      g.addColorStop(0.5, '#042c25')
      g.addColorStop(1,   '#02211d')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      // Soft brand glow from upper area
      const rg = ctx.createRadialGradient(w * 0.5, h * 0.18, 0, w * 0.5, h * 0.18, h * 0.75)
      rg.addColorStop(0, 'rgba(16,185,129,0.22)')
      rg.addColorStop(1, 'rgba(16,185,129,0)')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, w, h)
    }

    // ── Aurora orbs ─────────────────────────────────────────────────────────
    const ORB_COLORS = [
      [74, 222, 128],   // green
      [34, 211, 238],   // cyan
      [16, 185, 129],   // emerald
      [163, 230, 53],   // lime
    ]
    let orbs = []
    function makeOrbs() {
      const count = mobile ? 3 : 5
      orbs = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.9,
        r: (mobile ? 160 : 260) + Math.random() * (mobile ? 120 : 220),
        c: ORB_COLORS[i % ORB_COLORS.length],
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.18,
        phase: Math.random() * Math.PI * 2,
      }))
    }
    function drawOrbs() {
      ctx.globalCompositeOperation = 'lighter'
      for (const o of orbs) {
        o.x += o.vx; o.y += o.vy; o.phase += 0.01
        if (o.x < -o.r) o.x = w + o.r; if (o.x > w + o.r) o.x = -o.r
        if (o.y < -o.r) o.y = h + o.r; if (o.y > h + o.r) o.y = -o.r
        const pulse = 0.18 + Math.sin(o.phase) * 0.06
        const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r)
        grad.addColorStop(0, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},${pulse})`)
        grad.addColorStop(1, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},0)`)
        ctx.fillStyle = grad
        ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2)
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    // ── Equity curves ───────────────────────────────────────────────────────
    // Smooth flowing wave with an overall upward trend (rises to the right).
    function curveY(x, time, layer) {
      const nx = x / w
      const trend = -nx * h * (layer === 0 ? 0.18 : 0.12)      // upward to the right
      const a1 = Math.sin(nx * 6 + time * (layer === 0 ? 1 : 0.6)) * (mobile ? 22 : 34)
      const a2 = Math.sin(nx * 13 - time * (layer === 0 ? 1.6 : 1)) * (mobile ? 10 : 16)
      const a3 = Math.sin(nx * 3 + time * 0.4) * (mobile ? 16 : 26)
      const base = layer === 0 ? h * 0.72 : h * 0.82
      return base + trend + a1 + a2 + a3
    }

    function drawCurve(layer, time) {
      const step = mobile ? 14 : 9
      const pts = []
      for (let x = 0; x <= w + step; x += step) pts.push([x, curveY(x, time, layer)])

      // Area fill
      const fill = ctx.createLinearGradient(0, h * 0.45, 0, h)
      const c = layer === 0 ? '74,222,128' : '34,211,238'
      fill.addColorStop(0, `rgba(${c},${layer === 0 ? 0.22 : 0.12})`)
      fill.addColorStop(1, `rgba(${c},0)`)
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (const [x, y] of pts) ctx.lineTo(x, y)
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()

      // Glowing stroke
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.strokeStyle = layer === 0 ? 'rgba(120,255,170,0.95)' : 'rgba(34,211,238,0.55)'
      ctx.lineWidth = layer === 0 ? (mobile ? 2.2 : 3) : 1.6
      ctx.shadowColor = layer === 0 ? '#4ade80' : '#22d3ee'
      ctx.shadowBlur = layer === 0 ? (mobile ? 10 : 18) : 8
      ctx.stroke()
      ctx.shadowBlur = 0

      return pts
    }

    // ── Floating gain labels ────────────────────────────────────────────────
    let labels = []
    function maybeSpawnLabel(frontPts, time) {
      const cap = mobile ? 4 : 7
      if (labels.length >= cap) return
      if (Math.random() > (mobile ? 0.018 : 0.03)) return
      const idx = Math.floor(Math.random() * frontPts.length)
      const [x, y] = frontPts[idx]
      const gold = Math.random() < 0.18
      const isPct = Math.random() < 0.5
      const text = isPct
        ? `+${(Math.random() * 9 + 0.4).toFixed(1)}%`
        : `+$${(Math.random() * 4800 + 120).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      labels.push({ x, y, text, alpha: 0, vy: 0.5 + Math.random() * 0.4, life: 0,
        color: gold ? '#ffd700' : '#aeffce' })
    }
    function drawLabels() {
      ctx.textAlign = 'center'
      ctx.font = `bold ${mobile ? 12 : 14}px "Plus Jakarta Sans", system-ui, sans-serif`
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i]
        l.life += 1
        l.y -= l.vy
        l.alpha = l.life < 20 ? l.life / 20 : Math.max(0, 1 - (l.life - 20) / 90)
        if (l.alpha <= 0) { labels.splice(i, 1); continue }
        ctx.globalAlpha = l.alpha
        ctx.fillStyle = l.color
        ctx.shadowColor = l.color
        ctx.shadowBlur = 8
        ctx.fillText(l.text, l.x, l.y)
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      }
    }

    // ── Vignette for text readability ───────────────────────────────────────
    function drawVignette() {
      const v = ctx.createRadialGradient(w / 2, h * 0.42, h * 0.25, w / 2, h * 0.42, h * 0.95)
      v.addColorStop(0, 'rgba(2,20,16,0)')
      v.addColorStop(1, 'rgba(2,16,13,0.6)')
      ctx.fillStyle = v
      ctx.fillRect(0, 0, w, h)
    }

    // ── Static render for reduced motion ────────────────────────────────────
    function renderStatic() {
      paintBase()
      drawOrbs()
      drawCurve(1, 0)
      drawCurve(0, 0)
      drawVignette()
    }

    // ── Main loop ────────────────────────────────────────────────────────────
    function draw() {
      t += 0.006
      paintBase()
      drawOrbs()
      drawCurve(1, t)
      const front = drawCurve(0, t)

      // Live pulse dot riding the front curve's leading edge
      const tip = front[front.length - 2] || front[front.length - 1]
      if (tip) {
        const pr = 4 + Math.sin(t * 6) * 1.5
        ctx.beginPath()
        ctx.arc(tip[0], tip[1], pr, 0, Math.PI * 2)
        ctx.fillStyle = '#eafff3'
        ctx.shadowColor = '#4ade80'
        ctx.shadowBlur = 16
        ctx.fill()
        ctx.shadowBlur = 0
      }

      maybeSpawnLabel(front, t)
      drawLabels()
      drawVignette()
      raf = requestAnimationFrame(draw)
    }

    resize()
    makeOrbs()
    if (reduceMotion) {
      renderStatic()
    } else {
      raf = requestAnimationFrame(draw)
    }

    function onResize() { resize(); makeOrbs(); if (reduceMotion) renderStatic() }
    function onVisibility() {
      if (reduceMotion) return
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
      else if (!raf) raf = requestAnimationFrame(draw)
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduceMotion])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
